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

export default function DemoPage() {
  const videoUrl = useMemo(() => "/demo-vid1.mp4", []);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

        const payload = await response.json();
        appendLog(
          payload.message
            ? `${payload.message}${label ? ` (${label})` : ""}`
            : `Demo endpoint responded successfully${
                label ? ` (${label})` : ""
              }.`
        );

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

    /*const wasSuccessful = await sendStartRequest();
    if (wasSuccessful) {
      appendLog("Follow-up demo requests scheduled.");
    }*/

    scheduleFollowUpRequest(10_000, "T+10s");
    scheduleFollowUpRequest(20_000, "T+20s");
    setIsStarting(false);
  }, [
    appendLog,
    clearScheduledRequests,
    isStarting,
    scheduleFollowUpRequest,
    videoUrl,
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-10 lg:flex-row">
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
