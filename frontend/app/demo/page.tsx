"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FALLBACK_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const START_ENDPOINT = "/api/demo/start";

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function DemoPage() {
  const videoUrl = useMemo(
    () => process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? FALLBACK_VIDEO_URL,
    []
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoSrc, setVideoSrc] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!videoSrc || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = 0;
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

  const handleStart = useCallback(async () => {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setErrorMessage(null);
    appendLog("Starting demo…");
    setVideoSrc(videoUrl);

    const controller = new AbortController();

    try {
      const response = await fetch(START_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          errorText || `Request failed with status ${response.status}`
        );
      }

      const payload = await response.json();
      appendLog(payload.message ?? "Demo endpoint responded successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      appendLog(`Failed to start demo: ${message}`);
      setErrorMessage(
        "Something went wrong while starting the demo. Please try again."
      );
    } finally {
      controller.abort();
      setIsStarting(false);
    }
  }, [appendLog, isStarting, videoUrl]);

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
