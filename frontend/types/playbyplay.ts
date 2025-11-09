export interface ScoringPlay {
  GameKey: string;
  SeasonType: number;
  ScoringPlayID: number;
  Season: number;
  Week: number;
  AwayTeam: string;
  HomeTeam: string;
  Date: string;
  Sequence: number;
  Team: string;
  Quarter: string;
  TimeRemaining: string;
  PlayDescription: string;
  AwayScore: number;
  HomeScore: number;
  ScoreID: number;
}

export interface Play {
  PlayID: number;
  QuarterID: number;
  QuarterName: string;
  Sequence: number;
  TimeRemainingMinutes: number;
  TimeRemainingSeconds: number;
  PlayTime: string;
  Updated: string;
  Created: string;
  Team: string;
  Opponent: string;
  Down: number;
  Distance: number;
  YardLine: number;
  YardLineTerritory: string;
  YardsToEndZone: number;
  Type: string;
  YardsGained: number;
  Description: string;
  IsScoringPlay: boolean;
  ScoringPlay: ScoringPlay | null;
  PlayStats: unknown[];
  Score?: {
    HomeScore?: number;
    AwayScore?: number;
  } | null;
}

// The API returns an array of plays directly
export type PlayByPlayResponse = Play[];

