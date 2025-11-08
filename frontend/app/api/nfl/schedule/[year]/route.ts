import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year } = await params;
  const apiKey = process.env.SPORTSDATA_API_KEY || '098888bbc17b4e9282b6b71060aa4b65';

  try {
    const response = await fetch(
      `https://api.sportsdata.io/v3/nfl/scores/json/SchedulesBasic/${year}?key=${apiKey}`
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch schedule data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching NFL schedule:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

