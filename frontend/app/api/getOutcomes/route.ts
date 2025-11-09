import { NextRequest, NextResponse } from "next/server";

import {
  calculateScoreFromPlays,
  compareScenarioWithGameState,
  deriveGameStateFromPlay,
  mapScenarioToOutcomePayload,
  PLACEHOLDER_HOME_TEAM,
  PLACEHOLDER_SEASON,
  PLACEHOLDER_WEEK,
  START_WINDOW_SECONDS,
  type OutcomeResponse,
  type PlayByPlayResponse,
  type ScenarioState,
} from "@/lib/gameState";

type StartIntervalBody =
  | number
  | {
      start?: number;
      startInterval?: number;
      startingInterval?: number;
    };

const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "http://localhost:3000";

const GENERATE_SCENARIOS_URL =
  process.env.GENERATE_SCENARIOS_URL ??
  "http://localhost:8001/generate-scenarios";

const PREDICT_OUTCOME_URL =
  process.env.PREDICT_OUTCOME_URL ?? "http://localhost:8000/predict";

const extractStartInterval = (body: StartIntervalBody): number | null => {
  if (typeof body === "number" && Number.isFinite(body)) {
    return body;
  }

  if (body && typeof body === "object") {
    if (typeof body.start === "number" && Number.isFinite(body.start)) {
      return body.start;
    }

    if (
      typeof body.startInterval === "number" &&
      Number.isFinite(body.startInterval)
    ) {
      return body.startInterval;
    }

    if (
      typeof body.startingInterval === "number" &&
      Number.isFinite(body.startingInterval)
    ) {
      return body.startingInterval;
    }
  }

  return null;
};

export async function POST(request: NextRequest) {
  try {
    let startInterval: number | null = null;
    try {
      const rawBody = (await request.json()) as StartIntervalBody;
      startInterval = extractStartInterval(rawBody);
    } catch {
      startInterval = null;
    }
    if (startInterval === null) {
      return NextResponse.json(
        { error: "Request body must include a starting interval number" },
        { status: 400 }
      );
    }

    const elapsedInterval = startInterval + START_WINDOW_SECONDS;

    const playByPlayUrl = new URL(
      `/api/nfl/playbyplay/${PLACEHOLDER_SEASON}/${PLACEHOLDER_WEEK}/${PLACEHOLDER_HOME_TEAM}`,
      INTERNAL_API_BASE_URL
    );
    playByPlayUrl.searchParams.set("start", String(startInterval));
    playByPlayUrl.searchParams.set("elapsed", String(elapsedInterval));
    console.log(playByPlayUrl.toString());
    const playByPlayResponse = await fetch(playByPlayUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: startInterval }),
      cache: "no-store",
    });

    if (!playByPlayResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch play-by-play data" },
        { status: playByPlayResponse.status }
      );
    }

    const playByPlayPayload =
      (await playByPlayResponse.json()) as PlayByPlayResponse;
    const visiblePlays =
      Array.isArray(playByPlayPayload.visiblePlays) &&
      playByPlayPayload.visiblePlays.length > 0
        ? playByPlayPayload.visiblePlays
        : Array.isArray(playByPlayPayload.plays)
        ? playByPlayPayload.plays
        : [];
    if (visiblePlays.length === 0) {
      return NextResponse.json(
        { error: "No play data returned for the requested interval" },
        { status: 502 }
      );
    }

    const firstPlay = visiblePlays[0];

    const gameState = deriveGameStateFromPlay(
      firstPlay,
      PLACEHOLDER_HOME_TEAM,
      playByPlayPayload.currentScore ?? { home: 0, away: 0 }
    );

    console.log(gameState);
    const baseProb = await (
      await fetch(PREDICT_OUTCOME_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mapScenarioToOutcomePayload({
            ...gameState,
            scenario_name: "Base Prob",
          })
        ),
      })
    ).json();

    const scenarioResponse = await fetch(GENERATE_SCENARIOS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gameState),
      cache: "no-store",
    });

    if (!scenarioResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch scenarios from scenario generator" },
        { status: scenarioResponse.status }
      );
    }

    const scenarioPayload = (await scenarioResponse.json()) as {
      scenarios?: ScenarioState[];
    };

    const scenarios = scenarioPayload?.scenarios;

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return NextResponse.json(
        { error: "Scenario generator returned no scenarios" },
        { status: 502 }
      );
    }

    const outcomes: OutcomeResponse[] = await Promise.all(
      scenarios.map(async (scenario): Promise<OutcomeResponse> => {
        const payload = mapScenarioToOutcomePayload(scenario);

        try {
          const response = await fetch(PREDICT_OUTCOME_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
          });

          if (!response.ok) {
            return {
              scenario_name: scenario.scenario_name,
              error: `Failed to fetch outcome from port 8000 (status ${response.status})`,
              winProb: Number.NaN,
              probShift: Number.NaN,
              scenario,
              isCorrect: false,
            };
          }

          const data = await response.json();
          const originalPossessionWinProbability =
            scenario.possession_team === gameState.possession_team
              ? data.possession_team_win_probability
              : 1 - data.possession_team_win_probability;
          return {
            scenario_name: scenario.scenario_name,
            winProb: originalPossessionWinProbability,
            probShift:
              originalPossessionWinProbability -
              baseProb.possession_team_win_probability,
            scenario,
            isCorrect: false,
          };
        } catch (error) {
          return {
            scenario_name: scenario.scenario_name,
            error:
              error instanceof Error
                ? error.message
                : "Unknown error fetching outcome from port 8000",
            winProb: Number.NaN,
            probShift: Number.NaN,
            scenario,
            isCorrect: false,
          };
        }
      })
    );

    // Compare scenarios with actual play-by-play data
    // Look at plays after the first play to see which scenario matches
    const initialScore = playByPlayPayload.currentScore ?? { home: 0, away: 0 };
    let correctScenarioIndex: number | null = null;
    if (visiblePlays.length > 1) {
      // Try to match scenarios with subsequent plays
      for (
        let playIndex = 1;
        playIndex < Math.min(visiblePlays.length, 5);
        playIndex++
      ) {
        const play = visiblePlays[playIndex];
        const score = calculateScoreFromPlays(
          visiblePlays,
          PLACEHOLDER_HOME_TEAM,
          playIndex,
          initialScore
        );
        const actualGameState = deriveGameStateFromPlay(
          play,
          PLACEHOLDER_HOME_TEAM,
          score
        );

        // Check each scenario to see if it matches this play
        for (
          let scenarioIndex = 0;
          scenarioIndex < outcomes.length;
          scenarioIndex++
        ) {
          const outcome = outcomes[scenarioIndex];
          if (outcome.scenario && !outcome.isCorrect) {
            const isMatch = compareScenarioWithGameState(
              outcome.scenario,
              actualGameState
            );
            if (isMatch) {
              correctScenarioIndex = scenarioIndex;
              outcomes[scenarioIndex] = {
                ...outcome,
                isCorrect: true as boolean,
              };
              break;
            }
          }
        }

        // If we found a match, stop looking
        if (correctScenarioIndex !== null) {
          break;
        }
      }
    }

    return NextResponse.json({
      outcomes,
      originalGameState: gameState,
      startIntervalSeconds: startInterval,
    });
  } catch (error) {
    console.error("Error handling getOutcomes request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
