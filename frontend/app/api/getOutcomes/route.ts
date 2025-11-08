import { NextResponse } from "next/server";

type ScenarioRequest = {
  possession_team: string;
  opponent_team: string;
  quarter: number;
  down: number;
  yards_to_go: number;
  yard_line: number;
  score_differential: number;
  game_seconds_remaining: number;
};

type ScenarioResponse = ScenarioRequest & {
  scenario_name: string;
};

type OutcomeResponse = {
  scenario_name: string;
  winProb: number;
  error?: string;
};

const BASE_PAYLOAD: ScenarioRequest = {
  possession_team: "Team A",
  opponent_team: "Team B",
  quarter: 4,
  down: 4,
  yards_to_go: 10,
  yard_line: 28,
  score_differential: -2,
  game_seconds_remaining: 30,
};

const mapScenarioToOutcomePayload = (scenario: ScenarioResponse) => ({
  qtr: scenario.quarter,
  down: Number.isFinite(scenario.down) ? scenario.down : Number(scenario.down),
  ydstogo: scenario.yards_to_go,
  yardline_100: scenario.yard_line,
  score_differential: scenario.score_differential,
  game_seconds_remaining: scenario.game_seconds_remaining,
});

export async function GET() {
  try {
    const initialResponse = await fetch(
      "http://localhost:8001/generate-scenarios",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(BASE_PAYLOAD),
        cache: "no-store",
      }
    );

    if (!initialResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch scenarios from port 8001" },
        { status: initialResponse.status }
      );
    }

    const initialPayload = (await initialResponse.json()) as {
      scenarios?: ScenarioResponse[];
    };

    const scenarios = initialPayload?.scenarios;

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      return NextResponse.json(
        { error: "Unexpected response format from port 8001" },
        { status: 502 }
      );
    }

    console.log("scenarios", scenarios);

    const outcomes = await Promise.all(
      scenarios.map(async (scenario) => {
        const payload = mapScenarioToOutcomePayload(scenario);

        try {
          const response = await fetch("http://localhost:8000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
          });

          if (!response.ok) {
            return {
              scenario_name: scenario.scenario_name,
              error: `Failed to fetch outcome from port 8001 (status ${response.status})`,
              winProb: NaN,
            } satisfies OutcomeResponse;
          }

          const data = await response.json();
          const originalPossessionWinProbability =
            scenario.possession_team == BASE_PAYLOAD.possession_team
              ? data.possession_team_win_probability
              : 1 - data.possession_team_win_probability;
          return {
            scenario_name: scenario.scenario_name,
            winProb: originalPossessionWinProbability,
          } satisfies OutcomeResponse;
        } catch (error) {
          return {
            scenario_name: scenario.scenario_name,
            error:
              error instanceof Error
                ? error.message
                : "Unknown error fetching outcome from port 8000",
            winProb: NaN,
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
