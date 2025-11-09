import { NextRequest, NextResponse } from "next/server";

import type { Play } from "@/types/playbyplay";

type GameState = {
  possession_team: string;
  opponent_team: string;
  quarter: number;
  down: number;
  yards_to_go: number;
  yard_line: number;
  score_differential: number;
  game_seconds_remaining: number;
};

type ScenarioResponse = GameState & {
  scenario_name: string;
};

type OutcomeResponse = {
  scenario_name: string;
  winProb: number;
  probShift: number;
  error?: string;
};

type PlayByPlayResponse = {
  mode: "live-simulated" | "full";
  currentScore?: {
    home: number;
    away: number;
  };
  visiblePlays?: Play[];
  plays?: Play[];
  totalPlays?: number;
};

type StartIntervalBody =
  | number
  | {
      start?: number;
      startInterval?: number;
      startingInterval?: number;
    };

const PLACEHOLDER_SEASON = "2024";
const PLACEHOLDER_WEEK = "10";
const PLACEHOLDER_HOME_TEAM = "den";
const START_WINDOW_SECONDS = 100;

const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "http://localhost:3001";

const GENERATE_SCENARIOS_URL =
  process.env.GENERATE_SCENARIOS_URL ??
  "http://localhost:8001/generate-scenarios";

const PREDICT_OUTCOME_URL =
  process.env.PREDICT_OUTCOME_URL ?? "http://localhost:8000/predict";

const ensureFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

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

const computeGameSecondsRemaining = (
  quarter: number,
  minutesRemaining: number,
  secondsRemaining: number
) => {
  const sanitizedQuarter = Number.isFinite(quarter) ? Math.max(1, quarter) : 4;
  const sanitizedMinutes = ensureFiniteNumber(minutesRemaining, 0);
  const sanitizedSeconds = ensureFiniteNumber(secondsRemaining, 0);
  const remainingThisQuarter = Math.max(
    0,
    sanitizedMinutes * 60 + sanitizedSeconds
  );

  if (sanitizedQuarter >= 4) {
    return remainingThisQuarter;
  }

  const quartersRemaining = Math.max(0, 4 - sanitizedQuarter);
  const secondsPerQuarter = 15 * 60;

  return remainingThisQuarter + quartersRemaining * secondsPerQuarter;
};

const deriveGameStateFromPlay = (
  play: Play,
  homeTeam: string,
  score: { home: number; away: number }
): GameState => {
  const normalizedHomeTeam = homeTeam.toUpperCase();
  const possessionTeam = play.Team ?? normalizedHomeTeam;
  const opponentTeam =
    play.Opponent ??
    (possessionTeam === normalizedHomeTeam ? "AWAY" : normalizedHomeTeam);

  const quarterFromName = Number.parseInt(play.QuarterName, 10);
  const quarter = Number.isFinite(quarterFromName)
    ? quarterFromName
    : Math.max(1, Math.min(4, ensureFiniteNumber(play.QuarterID, 4)));

  const down = Math.max(1, ensureFiniteNumber(play.Down, 1));
  const yardsToGo = Math.max(0, ensureFiniteNumber(play.Distance, 0));
  const yardLine = Math.max(
    0,
    Number.isFinite(play.YardsToEndZone)
      ? play.YardsToEndZone
      : ensureFiniteNumber(play.YardLine, 0)
  );

  const possessionIsHome = possessionTeam.toUpperCase() === normalizedHomeTeam;

  const possessionScore = possessionIsHome
    ? ensureFiniteNumber(score.home, 0)
    : ensureFiniteNumber(score.away, 0);
  const opponentScore = possessionIsHome
    ? ensureFiniteNumber(score.away, 0)
    : ensureFiniteNumber(score.home, 0);

  return {
    possession_team: possessionTeam,
    opponent_team: opponentTeam,
    quarter,
    down,
    yards_to_go: yardsToGo,
    yard_line: yardLine,
    score_differential: -2,
    game_seconds_remaining: computeGameSecondsRemaining(
      quarter,
      ensureFiniteNumber(play.TimeRemainingMinutes, 0),
      ensureFiniteNumber(play.TimeRemainingSeconds, 0)
    ),
  };
};

const mapScenarioToOutcomePayload = (scenario: ScenarioResponse) => ({
  qtr: scenario.quarter,
  down: Number.isFinite(scenario.down) ? scenario.down : Number(scenario.down),
  ydstogo: scenario.yards_to_go,
  yardline_100: scenario.yard_line,
  score_differential: scenario.score_differential,
  game_seconds_remaining: scenario.game_seconds_remaining,
});

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
      scenarios?: ScenarioResponse[];
    };

    const scenarios = scenarioPayload?.scenarios;

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return NextResponse.json(
        { error: "Scenario generator returned no scenarios" },
        { status: 502 }
      );
    }

    const outcomes = await Promise.all(
      scenarios.map(async (scenario) => {
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
            } satisfies OutcomeResponse;
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
          } satisfies OutcomeResponse;
        } catch (error) {
          return {
            scenario_name: scenario.scenario_name,
            error:
              error instanceof Error
                ? error.message
                : "Unknown error fetching outcome from port 8000",
            winProb: Number.NaN,
            probShift: Number.NaN,
          } satisfies OutcomeResponse;
        }
      })
    );

    return NextResponse.json(outcomes);
  } catch (error) {
    console.error("Error handling getOutcomes request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
