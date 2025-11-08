'use client';

import { useState } from 'react';
import { fetchSchedulesByWeek } from '@/lib/sportsdata';
import PlayByPlay from './components/PlayByPlay';
import PlayByPlayByTeam from './components/PlayByPlayByTeam';

interface Game {
  GameID: number;
  Season: number;
  Week: number;
  SeasonType: number;
  Status: string;
  DateTime: string;
  AwayTeam: string;
  HomeTeam: string;
  AwayTeamID: number;
  HomeTeamID: number;
  StadiumID: number;
  Channel: string;
  PointSpread: number;
  OverUnder: number;
  AwayTeamScore: number | null;
  HomeTeamScore: number | null;
  Updated: string;
  Quarter: string | null;
  TimeRemaining: string | null;
  Possession: string | null;
  Down: number | null;
  Distance: number | null;
  YardLine: number | null;
  YardLineTerritory: string | null;
  RedZone: boolean | null;
  AwayTeamTimeoutsRemaining: number | null;
  HomeTeamTimeoutsRemaining: number | null;
  GlobalGameID: number;
  GlobalAwayTeamID: number;
  GlobalHomeTeamID: number;
  IsClosed: boolean;
  GameEndDateTime: string | null;
  LastUpdated: string;
}

export default function Home() {
  const [season, setSeason] = useState(2024);
  const [week, setWeek] = useState(1);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'game' | 'team'>('game');
  const [selectedTeam, setSelectedTeam] = useState<string>('');

  const loadGames = async () => {
    setLoading(true);
    setError(null);
    setSelectedGame(null);
    try {
      const data = await fetchSchedulesByWeek(season, week);
      setGames(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black py-8 px-4 sm:px-8">
      <main className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black dark:text-zinc-50 mb-2">
            NFL Play-by-Play Data
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            View detailed play-by-play data from the SportsData.io NFL API
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
            View Mode
          </h2>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setViewMode('game');
                setSelectedGame(null);
                setSelectedTeam('');
              }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'game'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              By Game
            </button>
            <button
              onClick={() => {
                setViewMode('team');
                setSelectedGame(null);
                setSelectedTeam('');
              }}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'team'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              By Team
            </button>
          </div>
        </div>

        {/* Team Selection Form (for Team view) */}
        {viewMode === 'team' && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Select Team
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Season
                </label>
                <input
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || 2024)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-zinc-50 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  min="2020"
                  max="2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Week
                </label>
                <input
                  type="number"
                  value={week}
                  onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-zinc-50 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  min="1"
                  max="18"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Team (e.g., KC, BUF, SF)
                </label>
                <input
                  type="text"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value.toUpperCase())}
                  placeholder="Team abbreviation"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-zinc-50 focus:ring-2 focus:ring-green-500 focus:border-transparent uppercase"
                  maxLength={3}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    if (selectedTeam) {
                      setSelectedGame(null);
                    }
                  }}
                  disabled={!selectedTeam}
                  className="w-full px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  View Team Plays
                </button>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Enter a team abbreviation (e.g., KC for Kansas City Chiefs, BUF for Buffalo Bills) to view all plays for that team in the selected week.
            </p>
          </div>
        )}

        {/* Game Selection Form (for Game view) */}
        {viewMode === 'game' && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Select Game
            </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Season
              </label>
              <input
                type="number"
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value) || 2024)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-zinc-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="2020"
                max="2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Week
              </label>
              <input
                type="number"
                value={week}
                onChange={(e) => setWeek(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-black dark:text-zinc-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="1"
                max="18"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadGames}
                disabled={loading}
                className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? 'Loading...' : 'Load Games'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded">
              <p className="font-semibold">Error:</p>
              <p>{error}</p>
            </div>
          )}
          </div>
        )}

        {/* Games List */}
        {viewMode === 'game' && games.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Available Games ({games.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map((game) => (
                <button
                  key={game.GameID}
                  onClick={() => setSelectedGame(game)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedGame?.GameID === game.GameID
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold text-lg text-black dark:text-zinc-50 mb-2">
                    {game.AwayTeam} @ {game.HomeTeam}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>
                      {new Date(game.DateTime).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    {game.Status && <p>Status: {game.Status}</p>}
                    {game.AwayTeamScore !== null && game.HomeTeamScore !== null && (
                      <p className="font-semibold text-black dark:text-zinc-50">
                        Score: {game.AwayTeamScore} - {game.HomeTeamScore}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Play-by-Play Display by Game */}
        {viewMode === 'game' && selectedGame && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Play-by-Play Data
            </h2>
            <PlayByPlay
              season={selectedGame.Season}
              week={selectedGame.Week}
              awayTeam={selectedGame.AwayTeam}
              homeTeam={selectedGame.HomeTeam}
              gameId={selectedGame.GameID}
            />
          </div>
        )}

        {/* Play-by-Play Display by Team */}
        {viewMode === 'team' && selectedTeam && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
              Play-by-Play Data by Team
            </h2>
            <PlayByPlayByTeam
              season={season}
              week={week}
              team={selectedTeam}
            />
          </div>
        )}

        {viewMode === 'game' && games.length === 0 && !loading && !error && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Select a season and week, then click "Load Games" to view available games.
            </p>
          </div>
        )}

        {viewMode === 'team' && !selectedTeam && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Enter a team abbreviation above to view their play-by-play data.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
