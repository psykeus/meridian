import { useCallback, useEffect, useRef, useState } from "react";
import { useReplayStore, DENSITY_BINS, SPEEDS } from "@/stores/useReplayStore";
import { MapRecorder } from "@/lib/mapRecorder";

const PRESETS = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ff5252",
  high: "#ff9800",
  medium: "#ffeb3b",
  low: "#448aff",
  info: "#607d8b",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function formatTime(ms: number): string {
  const d = new Date(ms);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${mo}-${day} ${h}:${m}`;
}

function formatCursor(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function TimelineBar() {
  const mode = useReplayStore((s) => s.mode);
  const startTime = useReplayStore((s) => s.startTime);
  const endTime = useReplayStore((s) => s.endTime);
  const isLoading = useReplayStore((s) => s.isLoading);
  const playbackState = useReplayStore((s) => s.playbackState);
  const cursorTime = useReplayStore((s) => s.cursorTime);
  const speed = useReplayStore((s) => s.speed);
  const densityBuckets = useReplayStore((s) => s.densityBuckets);
  const densitySeverities = useReplayStore((s) => s.densitySeverities);
  const selectedEventIds = useReplayStore((s) => s.selectedEventIds);
  const selectionMode = useReplayStore((s) => s.selectionMode);
  const mapInstance = useReplayStore((s) => s.mapInstance);

  const fetchReplay = useReplayStore((s) => s.fetchReplay);
  const setLive = useReplayStore((s) => s.setLive);
  const setGibsDate = useReplayStore((s) => s.setGibsDate);
  const play = useReplayStore((s) => s.play);
  const pause = useReplayStore((s) => s.pause);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBack = useReplayStore((s) => s.stepBack);
  const setCursorTime = useReplayStore((s) => s.setCursorTime);
  const setSpeed = useReplayStore((s) => s.setSpeed);
  const setSelectionMode = useReplayStore((s) => s.setSelectionMode);
  const clearSelection = useReplayStore((s) => s.clearSelection);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);
  const recorderRef = useRef<MapRecorder | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recorderExt, setRecorderExt] = useState("webm");

  // Custom date range state
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Save-to-plan dropdown
  const [showSavePlan, setShowSavePlan] = useState(false);
  const [planRooms, setPlanRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [savingPlan, setSavingPlan] = useState(false);

  const isReplay = mode === "replay";
  const startMs = startTime?.getTime() ?? 0;
  const endMs = endTime?.getTime() ?? 0;
  const range = endMs - startMs;

  // ── Preset handlers ──────────────────────────────────────────────────
  const handleLive = () => {
    setLive();
    setShowCustom(false);
    setRecordingBlob(null);
  };

  const handlePreset = (hours: number) => {
    setShowCustom(false);
    setRecordingBlob(null);
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3600000);
    const mid = new Date((start.getTime() + now.getTime()) / 2);
    setGibsDate(mid.toISOString().slice(0, 10));
    fetchReplay(start, now);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    setRecordingBlob(null);
    const s = new Date(customStart);
    const e = new Date(customEnd);
    const mid = new Date((s.getTime() + e.getTime()) / 2);
    setGibsDate(mid.toISOString().slice(0, 10));
    fetchReplay(s, e);
  };

  // ── Cursor position from mouse on canvas ─────────────────────────────
  const cursorFromMouse = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !range) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return startMs + pct * range;
    },
    [startMs, range],
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      draggingRef.current = true;
      const t = cursorFromMouse(e.clientX);
      if (t != null) setCursorTime(t);
    },
    [cursorFromMouse, setCursorTime],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingRef.current) return;
      const t = cursorFromMouse(e.clientX);
      if (t != null) setCursorTime(t);
    },
    [cursorFromMouse, setCursorTime],
  );

  const handleCanvasMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── Draw density histogram + cursor on canvas ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (!densityBuckets.length || !range) return;

    const maxCount = Math.max(1, ...densityBuckets);
    const barW = w / DENSITY_BINS;

    // Draw stacked bars
    for (let i = 0; i < DENSITY_BINS; i++) {
      const total = densityBuckets[i];
      if (!total) continue;
      const x = i * barW;
      const barH = (total / maxCount) * (h - 4);
      const sevs = densitySeverities[i] || {};

      let yOff = h;
      for (const sev of SEVERITY_ORDER) {
        const count = sevs[sev] || 0;
        if (!count) continue;
        const segH = (count / total) * barH;
        yOff -= segH;
        ctx.fillStyle = SEVERITY_COLORS[sev] || "#607d8b";
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, yOff, barW - 0.5, segH);
      }
    }
    ctx.globalAlpha = 1;

    // Draw cursor line
    if (cursorTime != null && range > 0) {
      const pct = (cursorTime - startMs) / range;
      const cx = pct * w;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();

      // Triangle handle at top
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx - 5, -1);
      ctx.lineTo(cx + 5, -1);
      ctx.closePath();
      ctx.fill();
    }
  }, [densityBuckets, densitySeverities, cursorTime, startMs, range]);

  // ── Recording flow ───────────────────────────────────────────────────
  const handleRecord = useCallback(async () => {
    if (!mapInstance || !startTime || !endTime) return;

    const canvas = mapInstance.getCanvas();
    const recorder = new MapRecorder(canvas, 30);
    recorderRef.current = recorder;
    setRecorderExt(recorder.extension);
    setRecordingBlob(null);

    // Rewind and start
    setCursorTime(startTime.getTime());
    recorder.start();
    useReplayStore.setState({ playbackState: "recording" });

    // The playback loop advances cursorTime; we hook into the store subscription
    // to draw frames and detect end.
    const unsub = useReplayStore.subscribe((state, prev) => {
      if (state.cursorTime !== prev.cursorTime && state.playbackState === "recording") {
        mapInstance.triggerRepaint();
        requestAnimationFrame(() => {
          if (state.cursorTime != null) {
            recorder.drawFrame(formatCursor(state.cursorTime));
          }
        });
      }

      // Detect playback ended (recording → paused)
      if (prev.playbackState === "recording" && state.playbackState === "paused") {
        recorder.stop().then((blob) => {
          setRecordingBlob(blob);
          recorderRef.current = null;
        });
        unsub();
      }
    });

    // Start the RAF playback loop
    // Small delay to let the first frame render
    requestAnimationFrame(() => {
      // Re-use the play logic but keep state as "recording"
      const s = useReplayStore.getState();
      if (s.playbackState === "recording") {
        // Manually trigger the playback loop start
        // The store's play() would set state to "playing", but we want "recording"
        // so we directly start the loop
        const _startLoop = () => {
          let lastFrame = performance.now();
          const tick = (now: number) => {
            const st = useReplayStore.getState();
            if (st.playbackState !== "recording") return;
            const delta = now - lastFrame;
            lastFrame = now;
            const newCursor = (st.cursorTime ?? 0) + delta * st.speed;
            const eMs = endTime.getTime();
            if (newCursor >= eMs) {
              useReplayStore.setState({ cursorTime: eMs, playbackState: "paused" });
              return;
            }
            useReplayStore.setState({ cursorTime: newCursor });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        _startLoop();
      }
    });
  }, [mapInstance, startTime, endTime, setCursorTime]);

  const handleDownload = useCallback(() => {
    if (!recordingBlob) return;
    const url = URL.createObjectURL(recordingBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-replay-${new Date().toISOString().slice(0, 19)}.${recorderExt}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordingBlob, recorderExt]);

  // ── Save to Plan ─────────────────────────────────────────────────────
  const handleOpenSavePlan = useCallback(async () => {
    setShowSavePlan(true);
    try {
      const token = localStorage.getItem("access_token") ?? "";
      const res = await fetch("/api/v1/plan-rooms", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const rooms = await res.json();
        setPlanRooms(Array.isArray(rooms) ? rooms : []);
      }
    } catch { /* ignore */ }
  }, []);

  const handleSaveToPlan = useCallback(async (roomId: string) => {
    setSavingPlan(true);
    const token = localStorage.getItem("access_token") ?? "";
    const events = useReplayStore.getState().replayEvents;
    const ids = useReplayStore.getState().selectedEventIds;
    const selected = events.filter((e) => ids.has(e.id));

    let saved = 0;
    for (const event of selected) {
      try {
        const res = await fetch(`/api/v1/plan-rooms/${roomId}/timeline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: event.title,
            body: event.body ?? "",
            source_label: event.source_id,
            entry_time: event.event_time,
          }),
        });
        if (res.ok) saved++;
      } catch { /* continue */ }
    }

    setSavingPlan(false);
    setShowSavePlan(false);
    if (saved > 0) {
      clearSelection();
      setSelectionMode(false);
    }
  }, [clearSelection, setSelectionMode]);

  // ── Time axis labels ─────────────────────────────────────────────────
  const timeLabels = (() => {
    if (!range) return [];
    const labels: Array<{ pct: number; text: string }> = [];
    const count = 6;
    for (let i = 0; i <= count; i++) {
      const ms = startMs + (range / count) * i;
      labels.push({ pct: (i / count) * 100, text: formatTime(ms) });
    }
    return labels;
  })();

  // ── Button styles ────────────────────────────────────────────────────
  const btnBase: React.CSSProperties = {
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--text-muted)",
    lineHeight: "16px",
  };
  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "rgba(0,230,118,0.15)",
    color: "var(--green-primary)",
    borderColor: "var(--green-primary)",
  };
  const playBtnStyle: React.CSSProperties = {
    ...btnBase,
    padding: "2px 6px",
    fontSize: 12,
    minWidth: 24,
    textAlign: "center",
  };

  const isLive = mode === "live";
  const isPlaying = playbackState === "playing";
  const isRecording = playbackState === "recording";
  const selCount = selectedEventIds.size;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        background: "var(--bg-panel)",
        borderTop: "1px solid var(--border)",
        userSelect: "none",
      }}
    >
      {/* Row 1: Controls */}
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 10px",
          borderBottom: isReplay ? "1px solid var(--border)" : "none",
        }}
      >
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isLive ? "var(--green-primary)" : "var(--orange-warning)",
              animation: isLive ? "pulse-live 1.5s infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: isLive ? "var(--green-primary)" : "var(--orange-warning)",
            }}
          >
            {isLive ? "LIVE" : "REPLAY"}
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: "var(--border)" }} />

        {/* Live button */}
        <button onClick={handleLive} style={isLive ? btnActive : btnBase}>
          Live
        </button>

        {/* Presets */}
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => handlePreset(p.hours)} style={btnBase}>
            {p.label}
          </button>
        ))}

        <button
          onClick={() => setShowCustom((v) => !v)}
          style={showCustom ? btnActive : btnBase}
        >
          Custom
        </button>

        {showCustom && (
          <>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{
                fontSize: 10,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-primary)",
                padding: "1px 4px",
              }}
            />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>→</span>
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{
                fontSize: 10,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-primary)",
                padding: "1px 4px",
              }}
            />
            <button
              onClick={handleCustomApply}
              style={{
                ...btnBase,
                background: "var(--green-primary)",
                color: "var(--bg-app)",
                borderColor: "var(--green-primary)",
                fontWeight: 700,
              }}
            >
              Apply
            </button>
          </>
        )}

        {isReplay && (
          <>
            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* Playback controls */}
            <button onClick={stepBack} style={playBtnStyle} title="Step back">
              ⏮
            </button>
            <button
              onClick={isPlaying || isRecording ? pause : play}
              style={{
                ...playBtnStyle,
                background:
                  isPlaying
                    ? "rgba(255,152,0,0.2)"
                    : isRecording
                      ? "rgba(255,82,82,0.2)"
                      : "var(--bg-card)",
                color:
                  isPlaying
                    ? "var(--orange-warning)"
                    : isRecording
                      ? "var(--red-critical)"
                      : "var(--text-muted)",
              }}
            >
              {isPlaying || isRecording ? "⏸" : "▶"}
            </button>
            <button onClick={stepForward} style={playBtnStyle} title="Step forward">
              ⏭
            </button>

            {/* Speed dropdown */}
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{
                fontSize: 10,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-muted)",
                padding: "1px 4px",
              }}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>

            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* Record */}
            {!isRecording && !recordingBlob && (
              <button
                onClick={handleRecord}
                style={{
                  ...btnBase,
                  color: "var(--red-critical)",
                  borderColor: "rgba(255,82,82,0.4)",
                }}
                title="Record replay to video"
              >
                REC
              </button>
            )}
            {isRecording && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--red-critical)",
                  animation: "pulse-live 1s infinite",
                }}
              >
                REC
              </span>
            )}
            {recordingBlob && (
              <button
                onClick={handleDownload}
                style={{
                  ...btnBase,
                  background: "rgba(0,230,118,0.15)",
                  color: "var(--green-primary)",
                  borderColor: "var(--green-primary)",
                }}
              >
                Download .{recorderExt}
              </button>
            )}

            <div style={{ width: 1, height: 16, background: "var(--border)" }} />

            {/* Selection mode */}
            <button
              onClick={() => {
                const next = !selectionMode;
                setSelectionMode(next);
                if (!next) clearSelection();
              }}
              style={selectionMode ? btnActive : btnBase}
            >
              SEL{selCount > 0 ? ` (${selCount})` : ""}
            </button>

            {selCount > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={handleOpenSavePlan}
                  style={{
                    ...btnBase,
                    background: "rgba(0,230,118,0.15)",
                    color: "var(--green-primary)",
                    borderColor: "var(--green-primary)",
                  }}
                >
                  Save to Plan
                </button>
                {showSavePlan && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 28,
                      left: 0,
                      width: 200,
                      background: "var(--bg-panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      boxShadow: "0 -4px 16px rgba(0,0,0,0.5)",
                      maxHeight: 180,
                      overflowY: "auto",
                      zIndex: 300,
                    }}
                  >
                    {planRooms.length === 0 ? (
                      <div
                        style={{
                          padding: 10,
                          fontSize: 11,
                          color: "var(--text-muted)",
                          textAlign: "center",
                        }}
                      >
                        No plan rooms available
                      </div>
                    ) : (
                      planRooms.map((room) => (
                        <button
                          key={room.id}
                          onClick={() => handleSaveToPlan(room.id)}
                          disabled={savingPlan}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "6px 10px",
                            fontSize: 11,
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {room.name}
                        </button>
                      ))
                    )}
                    <button
                      onClick={() => setShowSavePlan(false)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "4px 10px",
                        fontSize: 10,
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Cursor time display */}
            <div style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>
              {cursorTime != null ? formatCursor(cursorTime) : "--:--:--"}
            </div>
          </>
        )}

        {isLoading && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
            Loading...
          </span>
        )}
      </div>

      {/* Row 2: Density histogram (only in replay mode) */}
      {isReplay && (
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          style={{
            display: "block",
            width: "100%",
            height: 32,
            cursor: "crosshair",
          }}
        />
      )}

      {/* Row 3: Time axis labels (only in replay mode) */}
      {isReplay && (
        <div
          style={{
            height: 20,
            position: "relative",
            padding: "0 10px",
          }}
        >
          {timeLabels.map((lbl, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${lbl.pct}%`,
                transform: "translateX(-50%)",
                fontSize: 9,
                fontFamily: "monospace",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {lbl.text}
            </span>
          ))}
        </div>
      )}

      {/* Recording notice */}
      {isRecording && (
        <div
          style={{
            padding: "2px 10px",
            fontSize: 9,
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border)",
          }}
        >
          Recording captures map tiles and cluster markers. DOM markers may not appear.
        </div>
      )}
    </div>
  );
}
