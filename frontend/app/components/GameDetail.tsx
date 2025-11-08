'use client';

import { useEffect, useState } from 'react';
import { NFLGame } from '@/types/nfl';
import { Play, ScoringPlay } from '@/types/playbyplay';

interface GameDetailProps {
  game: NFLGame;
  onClose: () => void;
}

export default function GameDetail({ game, onClose }: GameDetailProps) {
  const [plays, setPlays] = useState<Play[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [currentScore, setCurrentScore] = useState<{ away: number; home: number }>({ away: 0, home: 0 });

  const fetchPlayByPlay = async () => {
    try {
      setError(null);
      const url = `/api/nfl/playbyplay/${game.Season}/${game.Week}/${game.HomeTeam}`;
      console.log('Fetching play-by-play from:', url);
      
      const response = await fetch(url);

      const responseText = await response.text();
      console.log('Play-by-play response status:', response.status);
      console.log('Play-by-play response text (first 500 chars):', responseText.substring(0, 500));
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }
        console.error('Play-by-play API error:', response.status, errorData);
        throw new Error(errorData.error || `Failed to fetch play-by-play data (${response.status})`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse play-by-play response:', parseError);
        throw new Error('Invalid response format from server');
      }
      
      // Check if data is an array
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', typeof data, data);
        // If it's an error object, throw with the error message
        if (data && typeof data === 'object' && 'error' in data) {
          throw new Error(data.error as string);
        }
        throw new Error('Invalid play-by-play data format - expected array');
      }
      
      // Handle empty array
      if (data.length === 0) {
        setPlays([]);
        return;
      }
      
      // Sort plays by sequence (chronological order)
      const sortedPlays = (data as Play[]).sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
      setPlays(sortedPlays);
      
      // Find the latest scoring play to get current score
      const scoringPlays = sortedPlays
        .filter(play => play.ScoringPlay)
        .map(play => play.ScoringPlay!);
      
      if (scoringPlays.length > 0) {
        const latestScoringPlay = scoringPlays[scoringPlays.length - 1];
        setCurrentScore({
          away: latestScoringPlay.AwayScore,
          home: latestScoringPlay.HomeScore,
        });
      }
      
      // Check if game is live (in progress)
      setIsLive(game.Status !== 'Final' && game.Status !== 'F/OT' && game.Status !== 'Scheduled' && game.Status !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayByPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.Season, game.Week, game.HomeTeam]);

  // Poll for live updates every 10 seconds if game is live
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      fetchPlayByPlay();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const formatTime = (minutes: number, seconds: number) => {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getPlayDescription = (play: Play) => {
    // Prefer scoring play description if available
    if (play.ScoringPlay?.PlayDescription) {
      return play.ScoringPlay.PlayDescription;
    }
    
    // If description exists and isn't "Scrambled", use it
    if (play.Description && play.Description !== 'Scrambled') {
      return play.Description;
    }
    
    // Fallback to play type with context
    const typeMap: Record<string, string> = {
      'PassCompleted': 'Pass complete',
      'PassIncomplete': 'Pass incomplete',
      'Rush': 'Rush',
      'FieldGoal': 'Field goal',
      'Touchdown': 'Touchdown',
      'Punt': 'Punt',
      'Kickoff': 'Kickoff',
      'Timeout': 'Timeout',
      'Penalty': 'Penalty',
      'Period': 'End of period',
    };
    
    const typeDescription = typeMap[play.Type] || play.Type;
    
    if (play.YardsGained !== 0) {
      const yardsText = play.YardsGained > 0 
        ? `+${play.YardsGained} yards`
        : `${play.YardsGained} yards`;
      return `${typeDescription} - ${yardsText}`;
    }
    
    return typeDescription || 'Play';
  };

  const getDownAndDistance = (play: Play) => {
    if (play.Down === 0) return null;
    const downNames = ['', '1st', '2nd', '3rd', '4th'];
    return `${downNames[play.Down]} & ${play.Distance}`;
  };

  // Auto-scroll to bottom for live games when new plays arrive
  useEffect(() => {
    if (isLive && plays.length > 0) {
      const playsContainer = document.getElementById('plays-container');
      if (playsContainer) {
        playsContainer.scrollTop = playsContainer.scrollHeight;
      }
    }
  }, [plays.length, isLive]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-black dark:text-zinc-50">
              {game.AwayTeam} @ {game.HomeTeam}
            </h2>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-2xl"
            >
              ×
            </button>
          </div>
          
          {/* Score */}
          <div className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-semibold text-black dark:text-zinc-50">
                  {game.AwayTeam}
                </span>
                <span className="ml-2 text-2xl font-bold text-black dark:text-zinc-50">
                  {currentScore.away}
                </span>
              </div>
              <span className="text-zinc-400">-</span>
              <div>
                <span className="font-semibold text-black dark:text-zinc-50">
                  {game.HomeTeam}
                </span>
                <span className="ml-2 text-2xl font-bold text-black dark:text-zinc-50">
                  {currentScore.home}
                </span>
              </div>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {plays.length > 0 && (
                <span>
                  {plays[plays.length - 1].QuarterName}
                  {` - ${formatTime(plays[plays.length - 1].TimeRemainingMinutes, plays[plays.length - 1].TimeRemainingSeconds)}`}
                </span>
              )}
              {isLive && (
                <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded text-xs font-medium">
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div id="plays-container" className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12 text-zinc-600 dark:text-zinc-400">
              Loading play-by-play...
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <div className="text-red-600 dark:text-red-400 text-lg font-medium mb-2">
                {error}
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                Play-by-play data may not be available yet for this game.
              </div>
            </div>
          )}

          {!loading && !error && plays.length === 0 && (
            <div className="text-center py-12 text-zinc-600 dark:text-zinc-400">
              No play-by-play data available yet
            </div>
          )}

          {!loading && !error && plays.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4">
                Play-by-Play
              </h3>
              <div className="space-y-3">
                {plays.map((play) => (
                  <div
                    key={play.PlayID}
                    className={`p-4 rounded-lg border ${
                      play.IsScoringPlay
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            {play.QuarterName}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            {formatTime(play.TimeRemainingMinutes, play.TimeRemainingSeconds)}
                          </span>
                          {getDownAndDistance(play) && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-500">
                              {getDownAndDistance(play)}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            {play.Team} {play.YardLineTerritory} {play.YardLine}
                          </span>
                          {play.IsScoringPlay && (
                            <span className="text-xs px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded font-medium">
                              SCORING PLAY
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-black dark:text-zinc-50">
                          {getPlayDescription(play)}
                        </p>
                        {play.ScoringPlay && (
                          <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {game.AwayTeam} {play.ScoringPlay.AwayScore} - {play.ScoringPlay.HomeScore} {game.HomeTeam}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

