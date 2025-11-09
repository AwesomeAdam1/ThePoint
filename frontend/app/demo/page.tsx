"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ScenarioState } from "@/lib/gameState";

const START_ENDPOINT = "/api/getOutcomes";
const START_INTERVAL_SECONDS = 9890;
const VALIDATION_DELAY_MS = 10_000;
const OUTCOME_REQUEST_DELAY_MS = 10_000;

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type ScenarioValidation =
  | {
      status: "idle";
    }
  | {
      status: "pending";
    }
  | {
      status: "validated";
      isMatch: true;
      confidence?: number | null;
      notes?: string;
      differences?: string[];
    }
  | {
      status: "invalid";
      isMatch: false;
      confidence?: number | null;
      notes?: string;
      differences?: string[];
    }
  | {
      status: "error";
      message: string;
    };

type ScenarioOutcome = {
  scenario_name: string;
  winProb: number;
  probShift?: number;
  error?: string;
  isCorrect?: boolean;
  scenario?: ScenarioState;
  actualPlayDescription?: string;
  validation?: ScenarioValidation;
};

export default function DemoPage() {
  const videoUrl = useMemo(() => "/demo-vid1.mp4", []);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioOutcome[]>([]);
  const [startIntervalSeconds, setStartIntervalSeconds] = useState<
    number | null
  >(null);
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState<
    number | null
  >(null);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const startRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastOutcomesRequestedAtRef = useRef<number | null>(null);

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
    if (startRequestTimeoutRef.current) {
      clearTimeout(startRequestTimeoutRef.current);
      startRequestTimeoutRef.current = null;
    }
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
      validationTimeoutRef.current = null;
    }
  }, []);

  const sendStartRequest = useCallback(
    async (options?: {
      label?: string;
      suppressErrorMessage?: boolean;
      time?: number;
    }) => {
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

        const payload = (await response.json()) as
          | ScenarioOutcome[]
          | {
              outcomes?: ScenarioOutcome[];
              startIntervalSeconds?: number;
              message?: string;
            };

        const extractedOutcomes = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.outcomes)
          ? payload.outcomes
          : [];

        if (Array.isArray(extractedOutcomes) && extractedOutcomes.length > 0) {
          lastOutcomesRequestedAtRef.current = Date.now();
          if (validationTimeoutRef.current) {
            clearTimeout(validationTimeoutRef.current);
            validationTimeoutRef.current = null;
          }

          setSelectedScenarioIndex(null);
          setScenarios(
            extractedOutcomes.map((scenario) => ({
              ...scenario,
              validation: { status: "idle" } as ScenarioValidation,
              actualPlayDescription: undefined,
              isCorrect: undefined,
            }))
          );

          const reportedStart = Array.isArray(payload)
            ? undefined
            : payload.startIntervalSeconds;
          setStartIntervalSeconds(
            typeof reportedStart === "number" && Number.isFinite(reportedStart)
              ? reportedStart
              : START_INTERVAL_SECONDS + time
          );
          if (!Array.isArray(payload) && payload.message) {
            appendLog(`${payload.message}${label ? ` (${label})` : ""}`);
          }

          appendLog(
            `Received ${extractedOutcomes.length} scenario${
              extractedOutcomes.length > 1 ? "s" : ""
            }${label ? ` (${label})` : ""}`
          );
        } else if (!Array.isArray(payload) && payload.message) {
          appendLog(`${payload.message}${label ? ` (${label})` : ""}`);
        } else {
          appendLog(
            `Demo endpoint responded successfully${label ? ` (${label})` : ""}.`
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
    setStartIntervalSeconds(null);
    setSelectedScenarioIndex(null);
    lastOutcomesRequestedAtRef.current = null;
    appendLog("Starting demo…");
    setVideoSrc(videoUrl);

    appendLog(
      `Scheduling initial scenario fetch in ${
        OUTCOME_REQUEST_DELAY_MS / 1000
      } seconds…`
    );

    startRequestTimeoutRef.current = setTimeout(() => {
      startRequestTimeoutRef.current = null;
      void (async () => {
        appendLog("Fetching scenarios…");
        const wasSuccessful = await sendStartRequest({
          time: OUTCOME_REQUEST_DELAY_MS / 1000,
        });
        if (wasSuccessful) {
          appendLog("Scenarios loaded. Select an outcome to validate.");
        }
        setIsStarting(false);
      })();
    }, OUTCOME_REQUEST_DELAY_MS);
  }, [
    appendLog,
    clearScheduledRequests,
    isStarting,
    sendStartRequest,
    videoUrl,
  ]);

  const handleScenarioSelection = useCallback(
    (index: number) => {
      const target = scenarios[index];
      if (!target) {
        appendLog("Selected scenario index is out of range.");
        return;
      }

      if (target.error) {
        appendLog(
          `Cannot validate "${target.scenario_name}" because it returned an error.`
        );
        setErrorMessage(
          `Cannot validate "${target.scenario_name}" because it returned an error.`
        );
        return;
      }

      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }

      setErrorMessage(null);
      setSelectedScenarioIndex(index);
      setScenarios((prev) =>
        prev.map((scenario, idx) =>
          idx === index
            ? {
                ...scenario,
                isCorrect: undefined,
                validation: { status: "pending" },
                actualPlayDescription: undefined,
              }
            : scenario.validation?.status === "pending"
            ? { ...scenario, validation: { status: "idle" } }
            : scenario
        )
      );

      appendLog(
        `Scenario "${target.scenario_name}" selected. Validation will run once the 10-second window has elapsed.`
      );
    },
    [appendLog, scenarios]
  );

  const validateSelectedScenario = useCallback(async () => {
    if (selectedScenarioIndex === null) {
      return;
    }

    const selected = scenarios[selectedScenarioIndex];
    if (!selected) {
      appendLog("Unable to validate scenario: selection not found.");
      return;
    }

    if (startIntervalSeconds === null) {
      appendLog(
        `Unable to validate scenario "${selected.scenario_name}" because the start interval is unavailable.`
      );
      setScenarios((prev) =>
        prev.map((scenario, idx) =>
          idx === selectedScenarioIndex
            ? {
                ...scenario,
                validation: {
                  status: "error",
                  message: "Start interval unavailable for validation.",
                },
              }
            : scenario
        )
      );
      return;
    }

    appendLog(`Validating scenario "${selected.scenario_name}"…`);

    try {
      const scenarioDetails = selected.scenario;

      const response = await fetch("/api/validateOutcome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startIntervalSeconds,
          scenarioName: selected.scenario_name,
          scenarioDetails,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          (data && typeof data.error === "string"
            ? data.error
            : "Validation request failed") as string
        );
      }

      const geminiResult = data?.geminiResult;
      if (!geminiResult || typeof geminiResult.isMatch !== "boolean") {
        throw new Error("Validation result missing or malformed.");
      }

      const isMatch = geminiResult.isMatch;

      setScenarios((prev) =>
        prev.map((scenario, idx) =>
          idx === selectedScenarioIndex
            ? {
                ...scenario,
                isCorrect: isMatch,
                actualPlayDescription: data?.actualPlayDescription,
                validation: isMatch
                  ? {
                      status: "validated",
                      isMatch: true,
                      confidence:
                        typeof geminiResult?.confidence === "number"
                          ? geminiResult.confidence
                          : null,
                      notes:
                        typeof geminiResult?.notes === "string"
                          ? geminiResult.notes
                          : undefined,
                      differences: Array.isArray(geminiResult?.differences)
                        ? geminiResult.differences
                        : undefined,
                    }
                  : {
                      status: "invalid",
                      isMatch: false,
                      confidence:
                        typeof geminiResult?.confidence === "number"
                          ? geminiResult.confidence
                          : null,
                      notes:
                        typeof geminiResult?.notes === "string"
                          ? geminiResult.notes
                          : undefined,
                      differences: Array.isArray(geminiResult?.differences)
                        ? geminiResult.differences
                        : undefined,
                    },
              }
            : scenario
        )
      );

      appendLog(
        `Scenario "${selected.scenario_name}" ${
          isMatch ? "matches" : "does not match"
        } the actual event.`
      );
      if (data?.actualPlayDescription) {
        appendLog(
          `Actual play description: "${String(data.actualPlayDescription)}"`
        );
      }
      if (
        Array.isArray(geminiResult?.differences) &&
        geminiResult.differences.length > 0
      ) {
        appendLog(
          `Gemini noted differences: ${geminiResult.differences.join("; ")}`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Validation failed.";
      setScenarios((prev) =>
        prev.map((scenario, idx) =>
          idx === selectedScenarioIndex
            ? {
                ...scenario,
                validation: {
                  status: "error",
                  message,
                },
              }
            : scenario
        )
      );
      appendLog(
        `Validation failed for "${selected.scenario_name}": ${message}`
      );
    } finally {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }
      setSelectedScenarioIndex(null);
      clearScheduledRequests();
    }
  }, [
    appendLog,
    clearScheduledRequests,
    scenarios,
    selectedScenarioIndex,
    startIntervalSeconds,
  ]);

  useEffect(() => {
    if (selectedScenarioIndex === null) {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }
      return;
    }

    const requestedAt = lastOutcomesRequestedAtRef.current;
    if (!requestedAt) {
      return;
    }

    const elapsed = Date.now() - requestedAt;
    const delay = Math.max(VALIDATION_DELAY_MS - elapsed, 0);

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      void validateSelectedScenario();
    }, delay);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }
    };
  }, [selectedScenarioIndex, validateSelectedScenario]);

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
                  {scenarios.map((scenario, index) => {
                    const validation = scenario.validation;
                    const validationStatus = validation?.status ?? "idle";
                    const validationConfidence =
                      validation &&
                      (validation.status === "validated" ||
                        validation.status === "invalid")
                        ? validation.confidence ?? null
                        : null;
                    const validationNotes =
                      validation &&
                      (validation.status === "validated" ||
                        validation.status === "invalid")
                        ? validation.notes
                        : undefined;
                    const validationErrorMessage =
                      validation?.status === "error"
                        ? validation.message
                        : undefined;

                    const isSelected = selectedScenarioIndex === index;
                    const isDisabled = Boolean(scenario.error);

                    const statusClasses = (() => {
                      switch (validationStatus) {
                        case "validated":
                          return "border-green-500 bg-green-50";
                        case "invalid":
                          return "border-red-400 bg-red-50";
                        case "pending":
                          return "border-blue-400 bg-blue-50";
                        case "error":
                          return "border-amber-400 bg-amber-50";
                        default:
                          return "border-zinc-200 bg-white";
                      }
                    })();

                    return (
                      <button
                        key={`scenario-${index}`}
                        type="button"
                        onClick={() => handleScenarioSelection(index)}
                        disabled={isDisabled}
                        className={`flex flex-col gap-4 rounded-xl border p-6 text-left shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:shadow-lg ${statusClasses} ${
                          isSelected ? "ring-2 ring-blue-400" : ""
                        } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-zinc-900">
                              {scenario.scenario_name}
                            </h3>
                            <p className="text-xs text-zinc-500">
                              Click to validate this outcome
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                              #{index + 1}
                            </div>
                          </div>
                        </div>

                        {scenario.error ? (
                          <div className="text-sm text-red-600">
                            Error: {scenario.error}
                          </div>
                        ) : (
                          <>
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
                                    ? `+${(scenario.probShift * 100).toFixed(
                                        1
                                      )}%`
                                    : `${(scenario.probShift * 100).toFixed(
                                        1
                                      )}%`}
                                </span>
                                <span className="text-sm text-zinc-500">
                                  Probability Change
                                </span>
                              </div>
                              {scenario.probShift !== undefined &&
                                !isNaN(scenario.probShift) && (
                                  <div className="relative h-3 overflow-hidden rounded-full bg-zinc-200">
                                    <div className="absolute left-1/2 h-full w-0.5 -translate-x-1/2 bg-zinc-400" />
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
                                    {scenario.probShift < 0 && (
                                      <div
                                        className="absolute right-1/2 h-full rounded-l-full bg-red-500 transition-all"
                                        style={{
                                          width: `${Math.min(
                                            (Math.abs(scenario.probShift) *
                                              100) /
                                              0.5,
                                            100
                                          )}%`,
                                        }}
                                      />
                                    )}
                                  </div>
                                )}
                            </div>

                            <div className="space-y-1 text-sm">
                              {validationStatus === "pending" && (
                                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                                  Validating…
                                </span>
                              )}
                              {validationStatus === "validated" && (
                                <span className="inline-flex items-center rounded-full bg-green-500 px-2.5 py-1 text-xs font-medium text-white">
                                  ✓ Matches actual event
                                </span>
                              )}
                              {validationStatus === "invalid" && (
                                <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-1 text-xs font-medium text-white">
                                  ✕ Did not match
                                </span>
                              )}
                              {validationStatus === "error" &&
                                validationErrorMessage && (
                                  <span className="inline-flex items-center rounded-full bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800">
                                    {validationErrorMessage}
                                  </span>
                                )}
                              {(typeof validationConfidence === "number" ||
                                validationNotes) && (
                                <div className="text-xs text-zinc-600">
                                  {typeof validationConfidence === "number"
                                    ? `Gemini confidence: ${(
                                        validationConfidence * 100
                                      ).toFixed(0)}%`
                                    : null}
                                  {validationNotes ? (
                                    <p className="mt-1">
                                      Notes: {validationNotes}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                              {validationStatus !== "pending" &&
                                scenario.actualPlayDescription && (
                                  <p className="text-xs text-zinc-500">
                                    Actual play:{" "}
                                    {scenario.actualPlayDescription}
                                  </p>
                                )}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
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
