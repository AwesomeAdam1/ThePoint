"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const START_ENDPOINT = "/api/getOutcomes";
const START_INTERVAL_SECONDS = 9890;

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface Outcome {
  scenario: string;
  win_probability: number;
}

interface Prediction {
  scenario: string;
  betAmount: number;
  timestamp: string;
  winProbability: number;
  result?: "win" | "loss";
  pointsChange?: number;
}

interface ApiResponse {
  message?: string;
  previousOutcome?: string;
  outcomes: Outcome[];
}

export default function DemoPage() {
  const videoUrl = useMemo(() => "/demo-vid1.mp4", []);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scheduledRequestsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // New state for predictions
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<string>("");
  const [points, setPoints] = useState<number>(1000);
  const [currentPrediction, setCurrentPrediction] = useState<Prediction | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<Prediction[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) {
      return;
    }

    const playPromise = videoRef.current.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        setErrorMessage(
          "Unable to start video playback automatically. Press play to continue."
        );
        setLogs((prev) => [
          ...prev,
          `[${timestamp()}] Video autoplay blocked: ${String(error)}`,
        ]);
      });
    }
  }, [videoSrc]);

  const appendLog = useCallback((entry: string) => {
    setLogs((prev) => [...prev, `[${timestamp()}] ${entry}`]);
  }, []);

  const clearScheduledRequests = useCallback(() => {
    scheduledRequestsRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    scheduledRequestsRef.current = [];
  }, []);

  const verifyPrediction = useCallback((actualOutcome: string) => {
    if (!currentPrediction) return;

    const isCorrect = currentPrediction.scenario === actualOutcome;
    const pointsChange = isCorrect
      ? Math.round(currentPrediction.betAmount * currentPrediction.winProbability)
      : -currentPrediction.betAmount;

    const updatedPrediction: Prediction = {
      ...currentPrediction,
      result: isCorrect ? "win" : "loss",
      pointsChange,
    };

    setPredictionHistory((prev) => [...prev, updatedPrediction]);
    setPoints((prev) => prev + pointsChange);

    const message = isCorrect
      ? `✓ Correct! +${pointsChange} points`
      : `✗ Wrong. -${Math.abs(pointsChange)} points`;
    
    setFeedbackMessage(message);
    appendLog(`${message} (Actual: ${actualOutcome})`);

    setTimeout(() => setFeedbackMessage(null), 3000);
  }, [currentPrediction, appendLog]);

  const sendStartRequest = useCallback(
    async (
      options?: { label?: string; suppressErrorMessage?: boolean },
      time: number
    ) => {
      const { label, suppressErrorMessage } = options ?? {};
      const controller = new AbortController();

      try {
        appendLog(`Sending demo request${label ? ` (${label})` : ""}…`);

        const response = await fetch(START_ENDPOINT, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ start: START_INTERVAL_SECONDS + time }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            errorText || `Request failed with status ${response.status}`
          );
        }

        const payload: ApiResponse = await response.json();
        
        appendLog(
          payload.message
            ? `${payload.message}${label ? ` (${label})` : ""}`
            : `Demo endpoint responded successfully${
                label ? ` (${label})` : ""
              }.`
        );

        // Verify previous prediction if exists
        if (payload.previousOutcome) {
          verifyPrediction(payload.previousOutcome);
        }

        // Update outcomes for new prediction
        if (payload.outcomes && payload.outcomes.length > 0) {
          setOutcomes(payload.outcomes);
          setSelectedOutcome(null);
          setBetAmount("");
          setCurrentPrediction(null);
          appendLog(`New outcomes available: ${payload.outcomes.length} options`);
        }

        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        appendLog(
          `Failed to send demo request${label ? ` (${label})` : ""}: ${message}`
        );
        if (!suppressErrorMessage) {
          setErrorMessage(
            "Something went wrong while starting the demo. Please try again."
          );
        }
        return false;
      } finally {
        controller.abort();
      }
    },
    [appendLog, verifyPrediction]
  );

  const scheduleFollowUpRequest = useCallback(
    (delayMs: number, label: string) => {
      const timeoutId = setTimeout(() => {
        scheduledRequestsRef.current = scheduledRequestsRef.current.filter(
          (existingId) => existingId !== timeoutId
        );
        void sendStartRequest(
          { label, suppressErrorMessage: true },
          delayMs / 1000
        );
      }, delayMs);

      scheduledRequestsRef.current.push(timeoutId);
    },
    [sendStartRequest]
  );

  useEffect(() => {
    return () => {
      clearScheduledRequests();
    };
  }, [clearScheduledRequests]);

  const handleStart = useCallback(async () => {
    if (isStarting) {
      return;
    }

    clearScheduledRequests();
    setIsStarting(true);
    setErrorMessage(null);
    appendLog("Starting demo…");
    setVideoSrc(videoUrl);

    const wasSuccessful = await sendStartRequest({}, 0);
    if (wasSuccessful) {
      appendLog("Follow-up demo requests scheduled.");
      scheduleFollowUpRequest(10_000, "T+10s");
      scheduleFollowUpRequest(20_000, "T+20s");
    }

    setIsStarting(false);
  }, [
    appendLog,
    clearScheduledRequests,
    isStarting,
    scheduleFollowUpRequest,
    sendStartRequest,
    videoUrl,
  ]);

  const handleSubmitPrediction = useCallback(() => {
    if (!selectedOutcome || !betAmount) return;

    const bet = parseInt(betAmount, 10);
    if (isNaN(bet) || bet <= 0 || bet > points) {
      setErrorMessage("Invalid bet amount");
      return;
    }

    const outcome = outcomes.find((o) => o.scenario === selectedOutcome);
    if (!outcome) return;

    const prediction: Prediction = {
      scenario: selectedOutcome,
      betAmount: bet,
      timestamp: timestamp(),
      winProbability: outcome.win_probability,
    };

    setCurrentPrediction(prediction);
    appendLog(`Prediction submitted: ${selectedOutcome} (Bet: ${bet} pts)`);
    setErrorMessage(null);
  }, [selectedOutcome, betAmount, points, outcomes, appendLog]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10">
        {/* Points Display */}
        <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-6 py-4 shadow-lg">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Football Prediction Game</h1>
            <p className="text-sm text-zinc-500">Make predictions and earn points!</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-zinc-500">Your Points</div>
            <div className="text-3xl font-bold text-zinc-900">{points}</div>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Video Section */}
          <section className="flex-1">
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 bg-black shadow-lg">
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="h-full w-full object-cover"
                  controls
                  muted
                  playsInline
                />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-300">
                  Video feed will appear here.
                </div>
              )}
            </div>

            {/* Outcomes Section */}
            {outcomes.length > 0 && (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900">
                  Predict the Next Play
                </h3>
                
                {feedbackMessage && (
                  <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
                    feedbackMessage.includes('✓') 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {feedbackMessage}
                  </div>
                )}

                <div className="mb-4 grid grid-cols-2 gap-3">
                  {outcomes.map((outcome) => (
                    <button
                      key={outcome.scenario}
                      onClick={() => setSelectedOutcome(outcome.scenario)}
                      disabled={currentPrediction !== null}
                      className={`rounded-lg border-2 px-4 py-3 text-left transition ${
                        selectedOutcome === outcome.scenario
                          ? "border-blue-500 bg-blue-50"
                          : "border-zinc-200 bg-white hover:border-zinc-300"
                      } ${
                        currentPrediction !== null
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer"
                      }`}
                    >
                      <div className="font-medium text-zinc-900">
                        {outcome.scenario}
                      </div>
                      <div className="text-sm text-zinc-500">
                        Win prob: {(outcome.win_probability * 100).toFixed(0)}%
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder="Bet amount"
                    disabled={currentPrediction !== null}
                    min="1"
                    max={points}
                    className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                  <button
                    onClick={handleSubmitPrediction}
                    disabled={!selectedOutcome || !betAmount || currentPrediction !== null}
                    className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  >
                    Submit Prediction
                  </button>
                </div>

                {currentPrediction && (
                  <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    ⏳ Prediction locked: <strong>{currentPrediction.scenario}</strong> (Bet: {currentPrediction.betAmount} pts)
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Logs Section */}
          <aside className="flex w-full max-w-md flex-1 flex-col rounded-2xl border border-zinc-200 bg-white shadow-lg">
            <div className="border-b border-zinc-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-zinc-900">Activity Log</h2>
              <p className="text-sm text-zinc-500">
                Track predictions and API requests
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {logs.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Logs will appear once you start the demo.
                </p>
              ) : (
                <ul className="space-y-2 text-sm text-zinc-800">
                  {logs.map((logEntry, index) => (
                    <li
                      key={`log-${index}`}
                      className="rounded-md bg-zinc-100 px-3 py-2"
                    >
                      {logEntry}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {errorMessage && (
              <div className="border-t border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600">
                {errorMessage}
              </div>
            )}

            <div className="border-t border-zinc-200 px-6 py-5">
              <button
                type="button"
                onClick={handleStart}
                disabled={isStarting}
                className="w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {isStarting ? "Starting…" : "Start Demo"}
              </button>
            </div>
          </aside>
        </div>

        {/* Prediction History */}
        {predictionHistory.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">
              Prediction History
            </h3>
            <div className="space-y-2">
              {predictionHistory.map((pred, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                    pred.result === "win"
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-zinc-900">
                      {pred.scenario}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {pred.timestamp} · Bet: {pred.betAmount} pts
                    </div>
                  </div>
                  <div
                    className={`text-lg font-bold ${
                      pred.result === "win" ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {pred.pointsChange && pred.pointsChange > 0 ? "+" : ""}
                    {pred.pointsChange} pts
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}