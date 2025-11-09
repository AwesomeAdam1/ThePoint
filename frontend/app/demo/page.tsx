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
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

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

  // Auto-scroll logs to bottom when new logs are added
  useEffect(() => {
    if (logsContainerRef.current && logs.length > 0) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-zinc-50 text-zinc-900">
      <div className="mx-auto flex h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row overflow-hidden">
        <section className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-6">
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-300 bg-gradient-to-br from-zinc-900 to-black shadow-xl ring-1 ring-zinc-200">
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
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                      <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-400">Video feed will appear here</p>
                  </div>
                </div>
              )}
            </div>

            {scenarios.length > 0 && (
              <div className="space-y-5">
                <div className="border-b border-zinc-200 pb-4">
                  <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">
                    Scenario Outcomes
                  </h2>
                  <p className="text-sm text-zinc-600 mt-1.5">
                    {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''} available • Select one to validate
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                          return "border-green-500/50 bg-gradient-to-br from-green-50 to-green-100/50 shadow-green-100/50";
                        case "invalid":
                          return "border-red-400/50 bg-gradient-to-br from-red-50 to-red-100/50 shadow-red-100/50";
                        case "pending":
                          return "border-blue-400/50 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-blue-100/50 animate-pulse";
                        case "error":
                          return "border-amber-400/50 bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-amber-100/50";
                        default:
                          return "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md";
                      }
                    })();

                    return (
                      <button
                        key={`scenario-${index}`}
                        type="button"
                        onClick={() => handleScenarioSelection(index)}
                        disabled={isDisabled}
                        className={`group flex flex-col gap-4 rounded-xl border-2 p-5 text-left shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${statusClasses} ${
                          isSelected ? "ring-2 ring-blue-500 shadow-lg scale-[1.02]" : ""
                        } ${isDisabled ? "cursor-not-allowed opacity-60" : "hover:shadow-lg hover:scale-[1.01]"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2.5 mb-3">
                              <div className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700 shrink-0 mt-0.5 ring-1 ring-zinc-200">
                                #{index + 1}
                              </div>
                              <h3 className="text-base font-semibold text-zinc-900 break-words leading-snug">
                                {scenario.scenario_name}
                              </h3>
                            </div>
                            {validationStatus === "idle" && (
                              <p className="text-xs text-zinc-500 mt-1.5 font-medium">
                                Click to validate
                              </p>
                            )}
                          </div>
                        </div>

                        {scenario.error ? (
                          <div className="text-sm text-red-600 break-words">
                            Error: {scenario.error}
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3">
                              <div className="flex items-baseline gap-3 flex-wrap">
                                <span
                                  className={`text-3xl font-extrabold tracking-tight ${
                                    scenario.probShift !== undefined &&
                                    !isNaN(scenario.probShift)
                                      ? scenario.probShift >= 0
                                        ? "text-green-600"
                                        : "text-red-600"
                                      : "text-zinc-400"
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
                                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                                  Probability
                                </span>
                              </div>
                              {scenario.probShift !== undefined &&
                                !isNaN(scenario.probShift) && (
                                  <div className="relative h-3 overflow-hidden rounded-full bg-zinc-200/60 ring-1 ring-zinc-300/50">
                                    <div className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-zinc-400/40" />
                                    {scenario.probShift >= 0 && (
                                      <div
                                        className="absolute left-1/2 h-full rounded-r-full bg-gradient-to-r from-green-500 to-green-600 transition-all shadow-sm"
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
                                        className="absolute right-1/2 h-full rounded-l-full bg-gradient-to-l from-red-500 to-red-600 transition-all shadow-sm"
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

                            {(validationStatus !== "idle" || scenario.actualPlayDescription) && (
                              <div className="space-y-2.5 pt-3 border-t border-zinc-200/80">
                                {validationStatus === "pending" && (
                                  <div className="inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                                    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Validating…
                                  </div>
                                )}
                                {validationStatus === "validated" && (
                                  <div className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    Matches actual event
                                  </div>
                                )}
                                {validationStatus === "invalid" && (
                                  <div className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                    Did not match
                                  </div>
                                )}
                                {validationStatus === "error" &&
                                  validationErrorMessage && (
                                    <div className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                      </svg>
                                      {validationErrorMessage}
                                    </div>
                                  )}
                                {(typeof validationConfidence === "number" ||
                                  validationNotes) && (
                                  <div className="text-xs text-zinc-700 space-y-1.5 pt-1">
                                    {typeof validationConfidence === "number" && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-zinc-600">Confidence:</span>
                                        <span className="font-bold text-zinc-900">
                                          {(validationConfidence * 100).toFixed(0)}%
                                        </span>
                                      </div>
                                    )}
                                    {validationNotes && (
                                      <p className="text-zinc-600 break-words leading-relaxed">
                                        {validationNotes}
                                      </p>
                                    )}
                                  </div>
                                )}
                                {validationStatus !== "pending" &&
                                  scenario.actualPlayDescription && (
                                    <div className="rounded-md bg-zinc-50 px-3 py-2 border border-zinc-200">
                                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                                        Actual Play
                                      </p>
                                      <p className="text-xs text-zinc-700 break-words leading-relaxed">
                                        {scenario.actualPlayDescription}
                                      </p>
                                    </div>
                                  )}
                              </div>
                            )}
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

        <aside className="flex w-full max-w-md flex-col rounded-2xl border border-zinc-300 bg-white shadow-xl ring-1 ring-zinc-200/50 h-full max-h-full overflow-hidden">
          <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-6 py-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-900 p-2">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 tracking-tight">API Logs</h2>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Real-time activity log
                </p>
              </div>
            </div>
          </div>

          <div 
            ref={logsContainerRef}
            className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth min-h-0 bg-zinc-50/30"
          >
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="rounded-full bg-zinc-100 p-3 mb-3">
                  <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-500">
                  No logs yet
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Start the demo to see activity
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {logs.map((logEntry, index) => (
                  <li
                    key={`log-${index}`}
                    className="rounded-lg bg-white border border-zinc-200 px-3.5 py-2.5 break-words shadow-sm hover:shadow transition-shadow text-xs font-mono text-zinc-700 leading-relaxed"
                  >
                    {logEntry}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {errorMessage ? (
            <div className="border-t border-red-200 bg-gradient-to-r from-red-50 to-red-100/50 px-6 py-4">
              <div className="flex items-start gap-2">
                <svg className="h-5 w-5 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium text-red-700 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          ) : null}

          <div className="border-t border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-6 py-5">
            <button
              type="button"
              onClick={handleStart}
              disabled={isStarting}
              className="w-full rounded-xl bg-gradient-to-r from-zinc-900 to-zinc-800 px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-zinc-800 hover:to-zinc-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:from-zinc-400 disabled:to-zinc-400 disabled:hover:scale-100 disabled:shadow-md flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Demo
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
