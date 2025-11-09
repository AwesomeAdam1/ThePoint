import type { Play } from "@/types/playbyplay";

export type GameState = {
  possession_team: string;
  opponent_team: string;
  quarter: number;
  down: number;
  yards_to_go: number;
  yard_line: number;
  score_differential: number;
  game_seconds_remaining: number;
};

export type ScenarioState = GameState & {
  scenario_name: string;
};

export type OutcomeResponse = {
  scenario_name: string;
  winProb: number;
  probShift: number;
  error?: string;
  isCorrect: boolean;
  scenario?: ScenarioState;
};

export type PlayByPlayResponse = {
  mode: "live-simulated" | "full";
  currentScore?: {
    home: number;
    away: number;
  };
  visiblePlays?: Play[];
  plays?: Play[];
  totalPlays?: number;
};

export const PLACEHOLDER_SEASON = "2024";
export const PLACEHOLDER_WEEK = "10";
export const PLACEHOLDER_HOME_TEAM = "den";
export const START_WINDOW_SECONDS = 100;

export const ensureFiniteNumber = (value: unknown, fallback = 0): number => {
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

export const computeGameSecondsRemaining = (
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

export const deriveGameStateFromPlay = (
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
    score_differential: possessionScore - opponentScore,
    game_seconds_remaining: computeGameSecondsRemaining(
      quarter,
      ensureFiniteNumber(play.TimeRemainingMinutes, 0),
      ensureFiniteNumber(play.TimeRemainingSeconds, 0)
    ),
  };
};

export const calculateScoreFromPlays = (
  plays: Play[],
  homeTeam: string,
  upToPlayIndex: number,
  initialScore?: { home: number; away: number }
): { home: number; away: number } => {
  let homeScore = initialScore?.home ?? 0;
  let awayScore = initialScore?.away ?? 0;
  const normalizedHomeTeam = homeTeam.toUpperCase();

  for (let i = 0; i <= upToPlayIndex && i < plays.length; i++) {
    const play = plays[i];
    if (play.ScoringPlay) {
      const scoringPlay = play.ScoringPlay;
      homeScore = ensureFiniteNumber(scoringPlay.HomeScore, homeScore);
      awayScore = ensureFiniteNumber(scoringPlay.AwayScore, awayScore);
    } else if (play.Score) {
      const score = play.Score;
      if (Number.isFinite(score.HomeScore)) {
        homeScore = ensureFiniteNumber(score.HomeScore, homeScore);
      }
      if (Number.isFinite(score.AwayScore)) {
        awayScore = ensureFiniteNumber(score.AwayScore, awayScore);
      }
    }

    if (play.Team && play.Team.toUpperCase() === normalizedHomeTeam) {
      homeScore = ensureFiniteNumber(homeScore, 0);
    }
    if (play.Opponent && play.Opponent.toUpperCase() === normalizedHomeTeam) {
      awayScore = ensureFiniteNumber(awayScore, 0);
    }
  }

  return { home: homeScore, away: awayScore };
};

export type ScenarioComparisonTolerance = {
  yardLine?: number;
  yardsToGo?: number;
  gameSeconds?: number;
  scoreDifferential?: number;
};

export const compareScenarioWithGameState = (
  scenario: ScenarioState,
  actualGameState: GameState,
  tolerance: ScenarioComparisonTolerance = {}
): boolean => {
  const yardLineTolerance = tolerance.yardLine ?? 5;
  const yardsToGoTolerance = tolerance.yardsToGo ?? 2;
  const gameSecondsTolerance = tolerance.gameSeconds ?? 10;
  const scoreDifferentialTolerance = tolerance.scoreDifferential ?? 1;

  if (
    scenario.possession_team.toUpperCase() !==
    actualGameState.possession_team.toUpperCase()
  ) {
    return false;
  }

  if (scenario.quarter !== actualGameState.quarter) {
    return false;
  }

  if (scenario.down !== actualGameState.down) {
    return false;
  }

  if (
    Math.abs(scenario.yards_to_go - actualGameState.yards_to_go) >
    yardsToGoTolerance
  ) {
    return false;
  }

  if (
    Math.abs(scenario.yard_line - actualGameState.yard_line) > yardLineTolerance
  ) {
    return false;
  }

  if (
    Math.abs(
      scenario.game_seconds_remaining - actualGameState.game_seconds_remaining
    ) > gameSecondsTolerance
  ) {
    return false;
  }

  if (
    Math.abs(scenario.score_differential - actualGameState.score_differential) >
    scoreDifferentialTolerance
  ) {
    return false;
  }

  return true;
};

export const mapScenarioToOutcomePayload = (scenario: ScenarioState) => ({
  qtr: scenario.quarter,
  down: Number.isFinite(scenario.down) ? scenario.down : Number(scenario.down),
  ydstogo: scenario.yards_to_go,
  yardline_100: scenario.yard_line,
  score_differential: scenario.score_differential,
  game_seconds_remaining: scenario.game_seconds_remaining,
});
