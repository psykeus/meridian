import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onReplay: (startTime: Date, endTime: Date) => void;
  onLive: () => void;
}

const MAX_DAYS = 180;
const PRESETS = [
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "90d", hours: 2160 },
];

export function TimeScrubber({ onReplay, onLive }: Props) {
  const [isLive, setIsLive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [startHoursBack, setStartHoursBack] = useState(24);
  const [windowHours, setWindowHours] = useState(1);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toISO = (d: Date) => d.toISOString().slice(0, 16);

  const now = new Date();

  const getStartEnd = useCallback((): [Date, Date] => {
    if (showCustom && customStart && customEnd) {
      return [new Date(customStart), new Date(customEnd)];
    }
    const start = new Date(now.getTime() - (startHoursBack + currentOffset) * 3600000);
    const end = new Date(start.getTime() + windowHours * 3600000);
    return [start, end];
  }, [startHoursBack, windowHours, currentOffset, customStart, customEnd, showCustom]);

  const triggerReplay = useCallback(() => {
    const [start, end] = getStartEnd();
    onReplay(start, end);
  }, [getStartEnd, onReplay]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentOffset((prev) => {
          const next = prev - windowHours * 0.1 * speed;
          if (prev <= 0) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
        triggerReplay();
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, windowHours, triggerReplay]);

  const handleLive = () => {
    setIsLive(true);
    setIsPlaying(false);
    setCurrentOffset(0);
    onLive();
  };

  const handlePreset = (hours: number) => {
    setIsLive(false);
    setIsPlaying(false);
    setShowCustom(false);
    setStartHoursBack(hours);
    setCurrentOffset(0);
    const start = new Date(now.getTime() - hours * 3600000);
    const end = now;
    onReplay(start, end);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    setIsLive(false);
    setIsPlaying(false);
    onReplay(new Date(customStart), new Date(customEnd));
  };

  const [start, end] = getStartEnd();

  return (
    <div style={{
      position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: "var(--bg-panel)", border: "1px solid var(--border)",
      borderRadius: 8, padding: "8px 14px", display: "flex", alignItems: "center",
      gap: 10, zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      userSelect: "none", backdropFilter: "blur(8px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: isLive ? "var(--green-primary)" : "var(--orange-warning)", animation: isLive ? "pulse 1.5s infinite" : "none" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: isLive ? "var(--green-primary)" : "var(--orange-warning)", textTransform: "uppercase" }}>
          {isLive ? "LIVE" : "REPLAY"}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: "var(--border)" }} />

      <button onClick={handleLive} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: isLive ? "var(--green-primary)" : "var(--bg-card)", color: isLive ? "var(--bg-app)" : "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer" }}>
        Live
      </button>

      {PRESETS.map((p) => (
        <button key={p.label} onClick={() => handlePreset(p.hours)} style={{
          padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
          background: !isLive && startHoursBack === p.hours && !showCustom ? "rgba(0,230,118,0.15)" : "var(--bg-card)",
          color: !isLive && startHoursBack === p.hours && !showCustom ? "var(--green-primary)" : "var(--text-muted)",
          border: `1px solid ${!isLive && startHoursBack === p.hours && !showCustom ? "var(--green-primary)" : "var(--border)"}`,
          cursor: "pointer",
        }}>{p.label}</button>
      ))}

      <button onClick={() => setShowCustom((v) => !v)} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, background: showCustom ? "rgba(0,230,118,0.15)" : "var(--bg-card)", color: showCustom ? "var(--green-primary)" : "var(--text-muted)", border: `1px solid ${showCustom ? "var(--green-primary)" : "var(--border)"}`, cursor: "pointer" }}>
        Custom
      </button>

      {showCustom && (
        <>
          <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
            style={{ fontSize: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "3px 6px" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>→</span>
          <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
            style={{ fontSize: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", padding: "3px 6px" }} />
          <button onClick={handleCustomApply} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer" }}>
            Apply
          </button>
        </>
      )}

      {!isLive && (
        <>
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          <button onClick={() => setIsPlaying((v) => !v)} style={{ padding: "3px 10px", borderRadius: 4, fontSize: 11, background: isPlaying ? "var(--orange-warning)" : "var(--bg-card)", color: isPlaying ? "var(--bg-app)" : "var(--text-muted)", border: `1px solid ${isPlaying ? "var(--orange-warning)" : "var(--border)"}`, cursor: "pointer" }}>
            {isPlaying ? "⏸" : "▶"}
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ fontSize: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", padding: "3px 5px" }}>
            {[0.5, 1, 2, 5, 10].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "monospace" }}>
            {start.toISOString().slice(0, 16).replace("T", " ")}
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
