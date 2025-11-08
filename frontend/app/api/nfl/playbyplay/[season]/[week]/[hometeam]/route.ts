import { NextRequest, NextResponse } from "next/server";

import type { Play } from "@/types/playbyplay";

const DEFAULT_WINDOW_SECONDS = 10;

const parseNumeric = (value: string | null): number | null => {
  if (value == null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractStartFromBody = (body: unknown): number | null => {
  if (typeof body === "number" && Number.isFinite(body)) {
    return body;
  }

  if (body && typeof body === "object") {
    if (
      "start" in body &&
      typeof (body as { start?: unknown }).start === "number"
    ) {
      return (body as { start: number }).start;
    }

    if (
      "startingInterval" in body &&
      typeof (body as { startingInterval?: unknown }).startingInterval ===
        "number"
    ) {
      return (body as { startingInterval: number }).startingInterval;
    }
  }

  return null;
};

export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ season: string; week: string; hometeam: string }> }
) {
  const { season, week, hometeam } = await params;
  const apiKey = process.env.SPORTSDATA_API_KEY!;
  const apiUrl = `https://api.sportsdata.io/v3/nfl/pbp/json/PlayByPlayFinal/${season}/${week}/${hometeam}?key=${apiKey}`;

  let bodyStartSeconds: number | null = null;
  try {
    const rawBody = await request.json();
    bodyStartSeconds = extractStartFromBody(rawBody);
  } catch {
    // If there is no body or parsing fails, we treat it as absent.
    bodyStartSeconds = null;
  }

  const queryStart = parseNumeric(request.nextUrl.searchParams.get("start"));
  const queryElapsed = parseNumeric(
    request.nextUrl.searchParams.get("elapsed")
  );

  const startSeconds = bodyStartSeconds ?? queryStart;
  const hasWindow = startSeconds != null;
  const elapsedSeconds =
    queryElapsed ?? (hasWindow ? startSeconds + DEFAULT_WINDOW_SECONDS : null);

  try {
    const response = await fetch(apiUrl, { cache: "no-store" });
    const data = (await response.json()) as { Plays?: Play[] };

    if (!response.ok || !data?.Plays || !Array.isArray(data.Plays)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 500 });
    }

    const plays = [...data.Plays].sort((a, b) => a.Sequence - b.Sequence);

    // If elapsed parameter is provided, filter the plays
    let visiblePlays = plays;
    if (hasWindow && elapsedSeconds !== null && startSeconds != null) {
      const firstPlay = plays[0];
      const gameStartMs = Date.parse(firstPlay.PlayTime);
      const startTime = gameStartMs + startSeconds * 1000;
      const simulatedNow = gameStartMs + elapsedSeconds * 1000;

      visiblePlays = plays.filter((play) => {
        const timestamp = Date.parse(play.PlayTime);
        return (
          Number.isFinite(timestamp) &&
          timestamp >= startTime &&
          timestamp <= simulatedNow
        );
      });
    }

    // Compute current score
    const scoringPlays = visiblePlays.filter((play) => play.IsScoringPlay);
    let homeScore = 0,
      awayScore = 0;
    if (scoringPlays.length > 0) {
      const latest = scoringPlays[scoringPlays.length - 1].ScoringPlay;
      homeScore = latest?.HomeScore ?? 0;
      awayScore = latest?.AwayScore ?? 0;
    }

    // Return full data or partial data based on mode
    if (hasWindow && elapsedSeconds !== null) {
      return NextResponse.json({
        mode: "live-simulated",
        currentScore: { home: homeScore, away: awayScore },
        window: { start: startSeconds, end: elapsedSeconds },
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
