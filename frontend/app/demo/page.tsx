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

type ScenarioOutcome = {
  scenario_name: string;
  winProb: number;
  probShift?: number;
  error?: string;
  isCorrect?: boolean;
};

export default function DemoPage() {
  const videoUrl = useMemo(() => "/demo-vid1.mp4", []);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioOutcome[]>([]);
  const scheduledRequestsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const sendStartRequest = useCallback(
    async (
      options?: { label?: string; suppressErrorMessage?: boolean; time?: number }
    ) => {
      const { label, suppressErrorMessage, time = 0 } = options ?? {};
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

        const payload = await response.json();
        
        // Check if payload is an array of scenario outcomes
        if (Array.isArray(payload) && payload.length > 0) {
          // Store all scenarios
          setScenarios(payload);
          appendLog(
            `Received ${payload.length} scenario${payload.length > 1 ? "s" : ""}${label ? ` (${label})` : ""}`
          );
        } else if (payload.message) {
          appendLog(
            `${payload.message}${label ? ` (${label})` : ""}`
          );
        } else {
          appendLog(
            `Demo endpoint responded successfully${
              label ? ` (${label})` : ""
            }.`
          );
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
    [appendLog]
  );

  const scheduleFollowUpRequest = useCallback(
    (delayMs: number, label: string) => {
      const timeoutId = setTimeout(() => {
        scheduledRequestsRef.current = scheduledRequestsRef.current.filter(
          (existingId) => existingId !== timeoutId
        );
        void sendStartRequest({
          label,
          suppressErrorMessage: true,
          time: delayMs / 1000,
        });
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
    setScenarios([]);
    appendLog("Starting demo…");
    setVideoSrc(videoUrl);

    //const wasSuccessful = await sendStartRequest({ time: 0 });
    if (false) {
      appendLog("Follow-up demo requests scheduled.");
    }

    scheduleFollowUpRequest(10_000, "T+10s");
    scheduleFollowUpRequest(20_000, "T+20s");
    setIsStarting(false);
  }, [
    appendLog,
    clearScheduledRequests,
    isStarting,
    scheduleFollowUpRequest,
    sendStartRequest,
    videoUrl,
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10 lg:flex-row">
        <section className="flex-1">
          <div className="space-y-6">
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

            {scenarios.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-zinc-900">
                  Scenario Outcomes ({scenarios.length})
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scenarios.map((scenario, index) => (
                    <div
                      key={`scenario-${index}`}
                      className={`rounded-xl border p-6 shadow-md transition-shadow hover:shadow-lg ${
                        scenario.isCorrect
                          ? "border-green-500 bg-green-50"
                          : "border-zinc-200 bg-white"
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-zinc-900">
                          {scenario.scenario_name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {scenario.isCorrect && (
                            <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-medium text-white">
                              ✓ Correct
                            </span>
                          )}
                          <div
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              scenario.isCorrect
                                ? "bg-green-100 text-green-700"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            #{index + 1}
                          </div>
                        </div>
                      </div>
                      {scenario.error ? (
                        <div className="text-sm text-red-600">
                          Error: {scenario.error}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-3xl font-bold ${
                                scenario.probShift !== undefined &&
                                !isNaN(scenario.probShift)
                                  ? scenario.probShift >= 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                  : "text-zinc-900"
                              }`}
                            >
                              {scenario.probShift === undefined ||
                              isNaN(scenario.probShift)
                                ? "N/A"
                                : scenario.probShift >= 0
                                ? `+${(scenario.probShift * 100).toFixed(1)}%`
                                : `${(scenario.probShift * 100).toFixed(1)}%`}
                            </span>
                            <span className="text-sm text-zinc-500">
                              Probability Change
                            </span>
                          </div>
                          {scenario.probShift !== undefined &&
                            !isNaN(scenario.probShift) && (
                              <div className="relative h-3 overflow-hidden rounded-full bg-zinc-200">
                                {/* Center line indicator */}
                                <div className="absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-zinc-400" />
                                {/* Positive change (green bar going right) */}
                                {scenario.probShift >= 0 && (
                                  <div
                                    className="absolute left-1/2 h-full rounded-r-full bg-green-500 transition-all"
                                    style={{
                                      width: `${Math.min(
                                        (scenario.probShift * 100) / 0.5,
                                        100
                                      )}%`,
                                    }}
                                  />
                                )}
                                {/* Negative change (red bar going left) */}
                                {scenario.probShift < 0 && (
                                  <div
                                    className="absolute right-1/2 h-full rounded-l-full bg-red-500 transition-all"
                                    style={{
                                      width: `${Math.min(
                                        (Math.abs(scenario.probShift) * 100) /
                                          0.5,
                                        100
                                      )}%`,
                                    }}
                                  />
                                )}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="flex w-full max-w-md flex-1 flex-col rounded-2xl border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-zinc-900">API Logs</h2>
            <p className="text-sm text-zinc-500">
              Track demo requests in real time.
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

          {errorMessage ? (
            <div className="border-t border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600">
              {errorMessage}
            </div>
          ) : null}

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
    </div>
  );
}
