'use client';

import { useEffect, useState } from 'react';
import { NFLGame } from '@/types/nfl';
import GameDetail from './GameDetail';

interface NFLScheduleProps {
  year?: number;
}

export default function NFLSchedule({ year = 2024 }: NFLScheduleProps) {
  const [games, setGames] = useState<NFLGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedGame, setSelectedGame] = useState<NFLGame | null>(null);

  useEffect(() => {
    async function fetchSchedule() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/nfl/schedule/${year}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch schedule');
        }
        
        const data: NFLGame[] = await response.json();
        setGames(data);
        
        // Set the first available week as default
        if (data.length > 0) {
          const weeks: number[] = [...new Set(data.map((game: NFLGame) => game.Week))].sort((a, b) => a - b);
          setSelectedWeek(weeks[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchSchedule();
  }, [year]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Get status badge color
  const getStatusColor = (status: string | null) => {
    if (!status) {
      return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
    }
    if (status === 'Final' || status === 'F/OT') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
    if (status.includes('Q') || status.includes('Half')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
    if (status === 'Scheduled' || status === 'InProgress') {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    }
    return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
  };

  // Check if game has play-by-play data available
  const hasPlayByPlay = (game: NFLGame) => {
    if (!game.Status) return false;
    // Show play-by-play for Final, F/OT, or in-progress games
    // Also allow clicking on scheduled games (might have data if game started)
    return (
      game.Status === 'Final' ||
      game.Status === 'F/OT' ||
      game.Status.includes('Q') ||
      game.Status.includes('Half') ||
      game.Status === 'InProgress' ||
      game.Status === 'Scheduled'
    );
  };

  const handleGameClick = (game: NFLGame) => {
    if (hasPlayByPlay(game)) {
      setSelectedGame(game);
    }
  };

  // Group games by week
  const gamesByWeek = games.reduce((acc, game) => {
    if (!acc[game.Week]) {
      acc[game.Week] = [];
    }
    acc[game.Week].push(game);
    return acc;
  }, {} as Record<number, NFLGame[]>);

  const weeks = Object.keys(gamesByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-zinc-600 dark:text-zinc-400">Loading schedule...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-black dark:text-zinc-50 mb-2">
          {year} NFL Schedule
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {games.length} games scheduled
        </p>
      </div>

      {/* Week selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {weeks.map((week) => (
          <button
            key={week}
            onClick={() => setSelectedWeek(week)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedWeek === week
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            Week {week}
          </button>
        ))}
      </div>

      {/* Games grid */}
      {selectedWeek && gamesByWeek[selectedWeek] && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-4">
            Week {selectedWeek} Games
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gamesByWeek[selectedWeek]
              .sort((a, b) => new Date(a.DateTime).getTime() - new Date(b.DateTime).getTime())
              .map((game) => (
                <div
                  key={game.GameID}
                  onClick={() => handleGameClick(game)}
                  className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 shadow-sm transition-shadow ${
                    hasPlayByPlay(game)
                      ? 'cursor-pointer hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700'
                      : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(game.Status)}`}>
                      {game.Status || 'TBD'}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDate(game.DateTime)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-lg text-black dark:text-zinc-50">
                        {game.AwayTeam}
                      </span>
                      <span className="text-zinc-400">@</span>
                      <span className="font-semibold text-lg text-black dark:text-zinc-50">
                        {game.HomeTeam}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        Season: {game.Season} • Game {game.GameID}
                      </div>
                      {hasPlayByPlay(game) && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                          Click to view plays →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {selectedWeek && (!gamesByWeek[selectedWeek] || gamesByWeek[selectedWeek].length === 0) && (
        <div className="text-center py-12 text-zinc-600 dark:text-zinc-400">
          No games found for Week {selectedWeek}
        </div>
      )}

      {/* Game Detail Modal */}
      {selectedGame && (
        <GameDetail
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </div>
  );
}

