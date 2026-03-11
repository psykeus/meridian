import { useState } from "react";
import { useNavigate } from "react-router-dom";

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to Meridian",
    subtitle: "Global situational awareness & collaborative intelligence",
    content: "You're joining the only open-source OSINT platform built for teams. Let's get you set up in under 2 minutes.",
    icon: "🌍",
  },
  {
    id: "dashboard",
    title: "Your Intelligence Dashboard",
    subtitle: "See everything happening across the globe",
    content: "The dashboard shows 22 live intelligence panels — from conflict events to cyber threats, aviation, maritime, financial markets, and space. Drag panels to rearrange. Click any panel to expand.",
    icon: "📊",
  },
  {
    id: "map",
    title: "The Live Map",
    subtitle: "64 data layers, always visible",
    content: "The map is the center of Meridian. Toggle 64 layers across 8 categories. Click events for details in the context drawer — the map never gets covered. Switch to 3D Globe mode for a different perspective.",
    icon: "🗺️",
  },
  {
    id: "alerts",
    title: "Alert Rules",
    subtitle: "Get notified the moment something changes",
    content: "Set up alert rules for any event type, region, severity, or keyword. Get notified in-app, by email, or via Slack/Discord webhook. The alert engine runs 24/7 against all 44 live data feeds.",
    icon: "🔔",
  },
  {
    id: "plan_mode",
    title: "Plan Mode",
    subtitle: "The only free OSINT platform with real-time team collaboration",
    content: "Create a Plan Room to collaborate with your team in real time. Share the map, annotate events, build a shared timeline, assign tasks, and monitor watch list entities together — all synced live.",
    icon: "🤝",
  },
  {
    id: "ai",
    title: "AI Intelligence Layer",
    subtitle: "Every panel has built-in AI analysis",
    content: "Every panel has an AI summary card. The AI Analyst chat lets you query any data. Get a personalized daily brief, generate SitRep reports, detect anomalies, and get threat escalation predictions.",
    icon: "🤖",
  },
  {
    id: "ready",
    title: "You're ready",
    subtitle: "Everything is live and waiting for you",
    content: "Your dashboard is pre-populated with live global data. Start by exploring the map, or open a panel to dig into a specific intelligence domain. Welcome to Meridian.",
    icon: "✅",
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem("meridian_onboarded", "1");
      navigate("/");
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("meridian_onboarded", "1");
    navigate("/");
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-app)", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "Inter, sans-serif",
    }}>
      <div style={{ width: 520, padding: 0 }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: "var(--border)", borderRadius: 2, marginBottom: 40, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "var(--green-primary)", transition: "width 0.3s ease", borderRadius: 2 }} />
        </div>

        {/* Step card */}
        <div style={{
          background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 16,
          padding: "48px 40px", textAlign: "center",
        }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>{current.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green-primary)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
            Step {step + 1} of {STEPS.length}
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>{current.title}</h2>
          <div style={{ fontSize: 14, color: "var(--green-primary)", marginBottom: 20 }}>{current.subtitle}</div>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, margin: "0 0 40px" }}>
            {current.content}
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{
                padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "var(--bg-card)", color: "var(--text-muted)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}>
                Back
              </button>
            )}
            <button onClick={handleNext} style={{
              padding: "10px 32px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: "var(--green-primary)", color: "var(--bg-app)",
              border: "none", cursor: "pointer", flex: 1, maxWidth: 240,
            }}>
              {isLast ? "Enter Meridian →" : "Next →"}
            </button>
          </div>

          {!isLast && (
            <button onClick={handleSkip} style={{
              marginTop: 16, fontSize: 11, color: "var(--text-muted)", background: "none",
              border: "none", cursor: "pointer", textDecoration: "underline",
            }}>
              Skip onboarding
            </button>
          )}
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 20 : 8, height: 8, borderRadius: 4,
              background: i === step ? "var(--green-primary)" : i < step ? "rgba(0,230,118,0.4)" : "var(--border)",
              border: "none", cursor: "pointer", padding: 0, transition: "all 0.2s",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
