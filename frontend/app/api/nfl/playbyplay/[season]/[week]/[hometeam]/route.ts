import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ season: string; week: string; hometeam: string }> }
) {
  const { season, week, hometeam } = await params;
  const apiKey = process.env.SPORTSDATA_API_KEY || '098888bbc17b4e9282b6b71060aa4b65';

  console.log('Play-by-play API request:', { season, week, hometeam });

  try {
    const apiUrl = `https://api.sportsdata.io/v3/nfl/pbp/json/PlayByPlay/${season}/${week}/${hometeam}?key=${apiKey}`;
    console.log('Fetching from SportsDataIO:', apiUrl);
    
    const response = await fetch(apiUrl);

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      const text = await response.text();
      console.error('Failed to parse JSON response:', text);
      return NextResponse.json(
        { error: 'Invalid response from API' },
        { status: 500 }
      );
    }

    if (!response.ok) {
      console.error('API error:', response.status, data);
      // Check if it's a 404 (game not found or no play-by-play data)
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Play-by-play data not available for this game yet' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: data.message || data.error || `Failed to fetch play-by-play data (${response.status})` },
        { status: response.status }
      );
    }

    // The API returns an object with Plays, Score, and Quarters properties
    // Extract the Plays array from the response
    let playsArray: unknown[] = [];
    
    if (Array.isArray(data)) {
      // If it's already an array (shouldn't happen but handle it)
      playsArray = data;
    } else if (data && typeof data === 'object' && 'Plays' in data) {
      // Extract Plays array from the response object
      const plays = (data as { Plays?: unknown[] }).Plays;
      if (Array.isArray(plays)) {
        playsArray = plays;
      } else {
        console.error('Plays property is not an array:', typeof plays, plays);
        return NextResponse.json(
          { error: 'Invalid data format from API - Plays is not an array' },
          { status: 500 }
        );
      }
    } else {
      console.error('API returned unexpected data format:', typeof data, data);
      return NextResponse.json(
        { error: 'Invalid data format from API' },
        { status: 500 }
      );
    }

    // Return the plays array (even if empty)
    return NextResponse.json(playsArray);
  } catch (error) {
    console.error('Error fetching play-by-play:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

