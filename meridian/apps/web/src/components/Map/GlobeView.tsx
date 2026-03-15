import { useEffect, useRef, useState } from "react";

interface GlobeEvent {
  lat: number;
  lng: number;
  title: string;
  severity: string;
  category: string;
}

interface Props {
  events?: GlobeEvent[];
  onClose: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#f44336",
  high: "#ff9800",
  medium: "#ffeb3b",
  low: "#4caf50",
};

export function GlobeView({ events = [], onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let globe: any = null;

    const initGlobe = async () => {
      if (!containerRef.current) return;
      try {
        const GlobeGL = await import("globe.gl").then((m) => m.default || m);

        const points = events.map((e) => ({
          lat: e.lat,
          lng: e.lng,
          size: 0.5,
          color: SEVERITY_COLOR[e.severity] || "#00e676",
          label: e.title,
          category: e.category,
        }));

        globe = (GlobeGL as any)(containerRef.current)
          .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
          .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
          .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")
          .pointsData(points)
          .pointAltitude(0.01)
          .pointRadius("size")
          .pointColor("color")
          .pointLabel("label")
          .width(containerRef.current.offsetWidth)
          .height(containerRef.current.offsetHeight);

        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.3;

        globeRef.current = globe;
        setLoaded(true);
      } catch (e) {
        setError("globe.gl package not installed. Run: npm install globe.gl in apps/web");
      }
    };

    initGlobe();

    const handleResize = () => {
      if (globeRef.current && containerRef.current) {
        globeRef.current.width(containerRef.current.offsetWidth);
        globeRef.current.height(containerRef.current.offsetHeight);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (globeRef.current) {
        try { globeRef.current._destructor?.(); } catch {}
      }
    };
  }, [events]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 500,
      display: "flex", flexDirection: "column",
    }}>
      {/* Controls */}
      <div style={{
        position: "absolute", top: 16, right: 16, zIndex: 501,
        display: "flex", gap: 8,
      }}>
        <div style={{ background: "rgba(10,14,26,0.8)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "var(--text-muted)" }}>
          {events.length} events · Drag to rotate · Scroll to zoom
        </div>
        <button onClick={onClose} style={{
          padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: "rgba(10,14,26,0.8)", border: "1px solid var(--border)",
          color: "var(--text-primary)", cursor: "pointer",
        }}>
          ✕ Exit Globe
        </button>
      </div>

      {/* Globe label */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 501 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(10,14,26,0.8)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-primary)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>MERIDIAN 3D GLOBE</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 501, background: "rgba(10,14,26,0.8)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>Severity</div>
        {Object.entries(SEVERITY_COLOR).map(([sev, color]) => (
          <div key={sev} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "capitalize" }}>{sev}</span>
          </div>
        ))}
      </div>

      {/* Globe container */}
      <div ref={containerRef} style={{ flex: 1 }} />

      {/* Loading / Error states */}
      {!loaded && !error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Initializing 3D Globe…
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>🌍</div>
          <div style={{ color: "var(--orange-warning)", fontSize: 14, fontWeight: 600 }}>Globe.GL not available</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, maxWidth: 400, textAlign: "center" }}>{error}</div>
          <code style={{ fontSize: 11, background: "var(--bg-panel)", border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 6, color: "var(--green-primary)" }}>
            npm install globe.gl
          </code>
          <button onClick={onClose} style={{ marginTop: 8, padding: "8px 20px", borderRadius: 6, fontSize: 12, background: "var(--bg-panel)", border: "1px solid var(--border)", color: "var(--text-primary)", cursor: "pointer" }}>
            Back to Map
          </button>
        </div>
      )}
    </div>
  );
}
