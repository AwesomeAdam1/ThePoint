import { NextRequest, NextResponse } from "next/server";

import {
  PLACEHOLDER_HOME_TEAM,
  PLACEHOLDER_SEASON,
  PLACEHOLDER_WEEK,
  START_WINDOW_SECONDS,
  type PlayByPlayResponse,
  type ScenarioState,
} from "@/lib/gameState";
import { GoogleGenerativeAI } from "@google/generative-ai";

type ValidateOutcomeRequest = {
  startIntervalSeconds: number;
  scenarioName: string;
  scenarioDetails?: ScenarioState;
};

type GeminiValidationResult = {
  isMatch: boolean;
  confidence?: number;
  notes?: string;
  differences?: string[];
};

const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "http://localhost:3000";

const GEMINI_MODEL =
  process.env.GEMINI_VALIDATION_MODEL ?? "gemini-2.0-flash-001";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const geminiClient = GEMINI_API_KEY
  ? new GoogleGenerativeAI(GEMINI_API_KEY)
  : null;
const validationModel = geminiClient
  ? geminiClient.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction:
        "You are a football analyst validating whether a predicted scenario matched the actual play description. Return only JSON with fields `isMatch` (boolean), optional `confidence` (0-1 float), `notes` (string summary under 200 chars), and optional `differences` (array of short strings describing any mismatch). Do not overly focus on semantic alignment between the scenario name and the actual play description",
    })
  : null;

const generationConfig = {
  temperature: 0.2,
  responseMimeType: "application/json",
};

const parseRequestBody = async (
  request: NextRequest
): Promise<ValidateOutcomeRequest> => {
  const body = (await request.json()) as Partial<ValidateOutcomeRequest>;

  if (
    typeof body.startIntervalSeconds !== "number" ||
    !Number.isFinite(body.startIntervalSeconds)
  ) {
    throw new Error(
      "Request body must include a numeric `startIntervalSeconds` field."
    );
  }

  if (!body.scenarioName || typeof body.scenarioName !== "string") {
    throw new Error("Request body must include `scenarioName`.");
  }

  return {
    startIntervalSeconds: body.startIntervalSeconds,
    scenarioName: body.scenarioName,
    scenarioDetails: body.scenarioDetails,
  };
};

const fetchActualPlayDescription = async (
  startInterval: number
): Promise<{
  description: string;
  playIndex: number;
  playByPlay: PlayByPlayResponse;
}> => {
  const elapsedInterval = startInterval + START_WINDOW_SECONDS;

  const playByPlayUrl = new URL(
    `/api/nfl/playbyplay/${PLACEHOLDER_SEASON}/${PLACEHOLDER_WEEK}/${PLACEHOLDER_HOME_TEAM}`,
    INTERNAL_API_BASE_URL
  );
  playByPlayUrl.searchParams.set("start", String(startInterval + 10));
  playByPlayUrl.searchParams.set("elapsed", String(elapsedInterval + 100));

  const playByPlayResponse = await fetch(playByPlayUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: startInterval }),
    cache: "no-store",
  });

  if (!playByPlayResponse.ok) {
    throw new Error(
      `Failed to fetch play-by-play data (status ${playByPlayResponse.status})`
    );
  }

  const playByPlayPayload =
    (await playByPlayResponse.json()) as PlayByPlayResponse;
  const visiblePlays =
    Array.isArray(playByPlayPayload.visiblePlays) &&
    playByPlayPayload.visiblePlays.length > 0
      ? playByPlayPayload.visiblePlays
      : Array.isArray(playByPlayPayload.plays)
      ? playByPlayPayload.plays
      : [];

  console.log(visiblePlays);

  if (visiblePlays.length < 2) {
    throw new Error(
      "Insufficient play data to validate the selected scenario."
    );
  }

  const candidatePlays = visiblePlays.slice(1);

  let chosenIndex = -1;
  let chosenDescription: string | null = null;

  for (let idx = 0; idx < candidatePlays.length; idx++) {
    const play = candidatePlays[idx];
    const scoringDescription = play.ScoringPlay?.PlayDescription?.trim();
    if (scoringDescription) {
      chosenIndex = idx + 1;
      chosenDescription = scoringDescription;
      break;
    }
    const fallback = play.Description?.trim();
    if (fallback && !chosenDescription) {
      chosenIndex = idx + 1;
      chosenDescription = fallback;
    }
  }

  if (!chosenDescription || chosenIndex < 1) {
    throw new Error(
      "Unable to identify a follow-up play description for validation."
    );
  }

  return {
    description: chosenDescription,
    playIndex: chosenIndex,
    playByPlay: playByPlayPayload,
  };
};

const runGeminiValidation = async (params: {
  scenarioName: string;
  scenarioDetails?: ScenarioState;
  actualPlayDescription: string;
}): Promise<GeminiValidationResult | null> => {
  if (!validationModel) {
    throw new Error(
      "Gemini validation model is not configured. Set GOOGLE_API_KEY to enable validation."
    );
  }

  const { scenarioName, scenarioDetails, actualPlayDescription } = params;
  console.log("[validateOutcome] Scenario name:", scenarioName);
  console.log(
    "[validateOutcome] Scenario details:",
    scenarioDetails ? JSON.stringify(scenarioDetails, null, 2) : null
  );
  console.log(
    "[validateOutcome] Actual play description:",
    actualPlayDescription
  );

  const prompt = [
    "Evaluate whether the user's predicted football scenario name matched the actual next play description.",
    `Scenario Name: ${scenarioName}`,
    scenarioDetails
      ? `Scenario Details:\n${JSON.stringify(scenarioDetails, null, 2)}`
      : "Scenario Details: not provided",
    `Actual Play Description: ${actualPlayDescription}`,
    "Does the scenario description reasonably describe the actual play? Respond with JSON containing: isMatch (boolean), optional confidence (0-1), notes (short string), optional differences (array of short strings). Focus on semantic alignment between the scenario wording and the play description.",
  ].join("\n\n");

  try {
    const response = await validationModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig,
    });

    const responseText = response.response?.text();
    const responseMetadata = response.response as unknown as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const geminiThought =
      responseMetadata?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text ?? "")
        .join("\n") ?? "";

    console.log("[validateOutcome] Gemini thought & reasoning:", geminiThought);

    if (!responseText) {
      return null;
    }

    const parsed = JSON.parse(responseText) as GeminiValidationResult;
    if (typeof parsed.isMatch !== "boolean") {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Gemini validation failed:", error);
    return null;
  }
};

export async function POST(request: NextRequest) {
  try {
    const { startIntervalSeconds, scenarioName, scenarioDetails } =
      await parseRequestBody(request);

    const {
      description: actualPlayDescription,
      playIndex,
      playByPlay: playByPlayPayload,
    } = await fetchActualPlayDescription(startIntervalSeconds);

    const geminiResult = await runGeminiValidation({
      scenarioName,
      scenarioDetails,
      actualPlayDescription,
    });

    if (!geminiResult) {
      throw new Error("Gemini did not return a validation result.");
    }

    return NextResponse.json({
      startIntervalSeconds,
      scenarioName,
      scenarioDetails,
      actualPlayDescription,
      geminiResult,
      playIndex,
      playByPlaySummary: {
        mode: playByPlayPayload.mode,
        totalPlays: playByPlayPayload.totalPlays,
      },
    });
  } catch (error) {
    console.error("Error handling validateOutcome request:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Internal server error during validation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
