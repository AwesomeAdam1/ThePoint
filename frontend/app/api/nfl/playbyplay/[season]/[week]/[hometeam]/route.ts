import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ season: string; week: string; hometeam: string }> }
) {
  const { season, week, hometeam } = await params;
  const apiKey = process.env.SPORTSDATA_API_KEY!;
  const apiUrl = `https://api.sportsdata.io/v3/nfl/pbp/json/PlayByPlay/${season}/${week}/${hometeam}?key=${apiKey}`;

  const elapsedParam = request.nextUrl.searchParams.get("elapsed");
  const elapsedSeconds = elapsedParam ? parseInt(elapsedParam, 10) : null;


  const startParam = request.nextUrl.searchParams.get("start");
  const startSeconds = startParam ? parseInt(startParam, 10) : 0;
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok || !data?.Plays || !Array.isArray(data.Plays)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 500 });
    }

    const plays = data.Plays.sort((a: any, b: any) => a.Sequence - b.Sequence);

    // If elapsed parameter is provided, filter the plays
    let visiblePlays = plays;
    if (elapsedSeconds !== null) {
      const firstPlay = plays[0];
      const gameStartMs = Date.parse(firstPlay.PlayTime);
      const startTime = gameStartMs + startSeconds * 1000;
      const simulatedNow = gameStartMs + elapsedSeconds * 1000;

      visiblePlays = plays.filter((p: any) => {
        const t = Date.parse(p.PlayTime);
        return !isNaN(t) && t >= startTime && t <= simulatedNow;
      });
    }

    // Compute current score
    const scoringPlays = visiblePlays.filter((p: any) => p.IsScoringPlay);
    let homeScore = 0, awayScore = 0;
    if (scoringPlays.length > 0) {
      const latest = scoringPlays[scoringPlays.length - 1].ScoringPlay;
      homeScore = latest?.HomeScore ?? 0;
      awayScore = latest?.AwayScore ?? 0;
    }

    // Return full data or partial data based on mode
    if (elapsedSeconds !== null) {
      return NextResponse.json({
        mode: "live-simulated",
        currentScore: { home: homeScore, away: awayScore },
        visiblePlays,
        totalPlays: plays.length,
      });
    } else {
      return NextResponse.json({
        mode: "full",
        plays,
      });
    }
  } catch (error) {
    console.error("Play-by-play API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
