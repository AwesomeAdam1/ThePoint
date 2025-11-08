export interface NFLGame {
  GameID: number;
  GlobalGameID: number;
  ScoreID: number;
  GameKey: string;
  Season: number;
  SeasonType: number;
  Status: string;
  Canceled: boolean;
  Date: string;
  Day: string;
  DateTime: string;
  DateTimeUTC: string;
  AwayTeam: string;
  HomeTeam: string;
  GlobalAwayTeamID: number;
  GlobalHomeTeamID: number;
  AwayTeamID: number;
  HomeTeamID: number;
  StadiumID: number;
  Closed: boolean | null;
  LastUpdated: string | null;
  IsClosed: boolean | null;
  Week: number;
}

