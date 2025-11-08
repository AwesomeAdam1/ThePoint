import { NextRequest, NextResponse } from "next/server";

const DEMO_LATENCY_MS = 300;

export async function POST(_request: NextRequest) {
  await new Promise((resolve) => setTimeout(resolve, DEMO_LATENCY_MS));

  return NextResponse.json({
    status: "ok",
    message: "Demo stream initialization request sent.",
    latencyMs: DEMO_LATENCY_MS,
    timestamp: new Date().toISOString(),
  });
}

export function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed. Use POST to start the demo.",
    },
    {
      status: 405,
    }
  );
}
