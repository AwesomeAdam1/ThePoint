/**
 * Fetches NFL data from the SportsData API via Next.js API route
 * @param endpoint - The API endpoint path (e.g., '/scores/json/SchedulesBasic/2024')
 */
export async function fetchNFL(endpoint: string) {
  const response = await fetch(`/api/nfl?endpoint=${encodeURIComponent(endpoint)}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
    const details = errorData.details || errorData.endpoint || '';
    throw new Error(details ? `${errorMessage}. ${details}` : errorMessage);
  }

  return response.json();
}

/**
 * Fetches play-by-play data for a specific game
 */
export async function fetchPlayByPlay(
  season: number,
  week: number,
  awayTeam: string,
  homeTeam: string,
  gameId?: number
) {
  const endpoint = gameId
    ? `/scores/json/PlayByPlay/${gameId}`
    : `/pbp/json/PlayByPlay/${season}REG/${week}/${homeTeam}`;
  return fetchNFL(endpoint);
}

/**
 * Fetches all schedules for a specific season
 */
export async function fetchSchedules(season: number) {
  return fetchNFL(`/scores/json/SchedulesBasic/${season}`);
}

/**
 * Fetches schedules for a specific season and week
 */
export async function fetchSchedulesByWeek(season: number, week: number) {
  const allSchedules = await fetchSchedules(season);
  return Array.isArray(allSchedules) 
    ? allSchedules.filter((game: any) => game.Week === week)
    : [];
}

/**
 * Fetches play-by-play data for a specific team
 */
export async function fetchPlayByPlayByTeam(
  season: string | number,
  week: number,
  team: string
) {
  const seasonFormatted = typeof season === 'number' ? `${season}REG` : season;
  return fetchNFL(`/pbp/json/PlayByPlay/${seasonFormatted}/${week}/${team}`);
}