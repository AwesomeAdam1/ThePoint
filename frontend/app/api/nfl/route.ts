import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://api.sportsdata.io/v3/nfl';
const API_KEY = process.env.SPORTSDATA_API_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Missing endpoint parameter' },
      { status: 400 }
    );
  }

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  try {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': API_KEY },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `API request failed: ${response.status}`, details: errorText, endpoint },
        { status: response.status }
      );
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch data from API', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

