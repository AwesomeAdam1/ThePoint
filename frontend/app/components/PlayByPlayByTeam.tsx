'use client';

import { fetchPlayByPlayByTeam } from '@/lib/sportsdata';
import { useState } from 'react';

interface Play {
  PlayID: number;
  GameID: number;
  Quarter: string;
  TimeRemaining: string;
  Down: number;
  Distance: number;
  YardLine: number;
  YardLineTerritory: string;
  YardsToEndZone: number;
  Description: string;
  PlayType: string;
  IsIncomplete: boolean;
  IsTouchdown: boolean;
  IsInterception: boolean;
  IsFumble: boolean;
  IsSafety: boolean;
  IsPenalty: boolean;
  IsChallenge: boolean;
  IsChallengeReversed: boolean;
  ChallengedPlayID: number;
  AwayTeamScore: number;
  HomeTeamScore: number;
  OffenseTeam: string;
  DefenseTeam: string;
  PlayStatus: string;
  Season: number;
  SeasonType: number;
  Week: number;
  Date: string;
  Updated: string;
}

interface PlayByPlayByTeamProps {
  season: number;
  week: number;
  team: string;
}

export default function PlayByPlayByTeam({ season, week, team }: PlayByPlayByTeamProps) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlayByPlay = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlayByPlayByTeam(season, week, team);
      setPlays(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load play-by-play data');
      setPlays([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={loadPlayByPlay}
        disabled={loading}
        className="mb-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Loading...' : `Load Play-by-Play: ${team} (Week ${week})`}
      </button>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded">
          <p className="font-semibold">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {plays.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-black dark:text-zinc-50">
            {team} Play-by-Play Data ({plays.length} plays)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Quarter
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Down & Distance
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Offense/Defense
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {plays.map((play) => (
                  <tr key={play.PlayID} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {play.Quarter}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {play.TimeRemaining}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {play.Down > 0 && play.Distance > 0
                        ? `${play.Down} & ${play.Distance}`
                        : play.PlayType}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      <div className="max-w-md">
                        <p className="font-medium">{play.Description}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {play.IsTouchdown && (
                            <span className="inline-block px-2 py-0.5 text-xs bg-yellow-200 dark:bg-yellow-800 rounded">
                              TOUCHDOWN
                            </span>
                          )}
                          {play.IsInterception && (
                            <span className="inline-block px-2 py-0.5 text-xs bg-red-200 dark:bg-red-800 rounded">
                              INTERCEPTION
                            </span>
                          )}
                          {play.IsFumble && (
                            <span className="inline-block px-2 py-0.5 text-xs bg-orange-200 dark:bg-orange-800 rounded">
                              FUMBLE
                            </span>
                          )}
                          {play.IsPenalty && (
                            <span className="inline-block px-2 py-0.5 text-xs bg-purple-200 dark:bg-purple-800 rounded">
                              PENALTY
                            </span>
                          )}
                          {play.IsSafety && (
                            <span className="inline-block px-2 py-0.5 text-xs bg-blue-200 dark:bg-blue-800 rounded">
                              SAFETY
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      <div className="flex flex-col">
                        <span className={play.OffenseTeam === team ? 'font-bold text-green-600 dark:text-green-400' : ''}>
                          Off: {play.OffenseTeam}
                        </span>
                        <span className={play.DefenseTeam === team ? 'font-bold text-red-600 dark:text-red-400' : ''}>
                          Def: {play.DefenseTeam}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      <div className="flex flex-col">
                        <span className="font-semibold">Away: {play.AwayTeamScore}</span>
                        <span className="font-semibold">Home: {play.HomeTeamScore}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && plays.length === 0 && !error && (
        <p className="text-gray-500 dark:text-gray-400">
          Click the button above to load play-by-play data for {team}.
        </p>
      )}
    </div>
  );
}

