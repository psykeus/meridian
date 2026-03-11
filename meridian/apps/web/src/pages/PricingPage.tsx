import { useState } from "react";
import { useNavigate } from "react-router-dom";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    desc: "For individual researchers and analysts",
    features: [
      "Live dashboard with all 22 panels",
      "44 data feed sources",
      "64 map layers",
      "AI Analyst chat",
      "Daily Intelligence Brief",
      "Alert rules (up to 5)",
      "7-day event history",
    ],
    cta: "Get Started Free",
    highlight: false,
  },
  {
    id: "analyst",
    name: "Analyst",
    price: 29,
    desc: "For professional intelligence analysts",
    features: [
      "Everything in Free",
      "180-day historical replay",
      "CSV data export",
      "API access (read-only)",
      "Personalized daily brief",
      "Alert rules (unlimited)",
      "Priority feed refresh rates",
      "SitRep PDF export",
    ],
    cta: "Start Analyst Trial",
    highlight: false,
  },
  {
    id: "team_starter",
    name: "Team Starter",
    price: 99,
    desc: "For small teams up to 5 users",
    features: [
      "Everything in Analyst",
      "Plan Mode — 3 rooms",
      "Real-time collaboration",
      "Shared annotations & timeline",
      "Task board (Kanban)",
      "Shared watch list & intel board",
      "Briefing Mode",
      "GeoJSON / KML / JSON exports",
      "Read-only share links",
      "5 seats included",
    ],
    cta: "Start Team Trial",
    highlight: true,
  },
  {
    id: "team_pro",
    name: "Team Pro",
    price: 299,
    desc: "For enterprise operations teams",
    features: [
      "Everything in Team Starter",
      "Plan Mode — unlimited rooms",
      "Unlimited seats",
      "Organization + RBAC",
      "API tokens (read/write)",
      "Full audit log",
      "Google OAuth SSO",
      "Priority support",
      "Custom deck design",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

export function PricingPage() {
  const navigate = useNavigate();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const getPrice = (price: number) => {
    if (price === 0) return "Free";
    const p = billing === "annual" ? Math.round(price * 0.8) : price;
    return `$${p}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif" }}>
      {/* Nav */}
      <div style={{ background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green-primary)" }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>Meridian</span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a href="/status" style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}>Status</a>
          <button onClick={() => navigate("/")} style={{ padding: "6px 16px", borderRadius: 6, fontSize: 13, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Open Platform
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "64px 24px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green-primary)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>
            Pricing
          </div>
          <h1 style={{ fontSize: 48, fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1 }}>
            See everything.<br />Plan together.<br />
            <span style={{ color: "var(--green-primary)" }}>Act decisively.</span>
          </h1>
          <p style={{ fontSize: 16, color: "var(--text-muted)", maxWidth: 500, margin: "0 auto 32px" }}>
            The only free OSINT platform with native real-time team collaboration. 
            Start free, scale with your team.
          </p>

          {/* Billing toggle */}
          <div style={{ display: "inline-flex", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8, padding: 4, gap: 4 }}>
            {(["monthly", "annual"] as const).map((b) => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: billing === b ? "var(--green-primary)" : "transparent",
                color: billing === b ? "var(--bg-app)" : "var(--text-muted)",
                border: "none", cursor: "pointer",
              }}>
                {b === "monthly" ? "Monthly" : "Annual (save 20%)"}
              </button>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 64 }}>
          {PLANS.map((plan) => (
            <div key={plan.id} style={{
              background: plan.highlight ? "rgba(0,230,118,0.05)" : "var(--bg-panel)",
              border: `1px solid ${plan.highlight ? "var(--green-primary)" : "var(--border)"}`,
              borderRadius: 12, padding: 24, position: "relative",
            }}>
              {plan.highlight && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--green-primary)", color: "var(--bg-app)", fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20, textTransform: "uppercase" }}>
                  Most Popular
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 16 }}>{plan.desc}</div>
              <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>
                {getPrice(plan.price)}
                {plan.price > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-muted)" }}>/mo</span>}
              </div>
              {billing === "annual" && plan.price > 0 && (
                <div style={{ fontSize: 10, color: "var(--green-primary)", marginBottom: 16 }}>Billed annually</div>
              )}
              <button style={{
                width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 20,
                background: plan.highlight ? "var(--green-primary)" : "var(--bg-card)",
                color: plan.highlight ? "var(--bg-app)" : "var(--text-primary)",
                border: `1px solid ${plan.highlight ? "var(--green-primary)" : "var(--border)"}`,
                cursor: "pointer",
              }} onClick={() => navigate(plan.id === "free" ? "/" : "/settings")}>
                {plan.cta}
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12 }}>
                    <span style={{ color: "var(--green-primary)", flexShrink: 0 }}>✓</span>
                    <span style={{ color: "var(--text-secondary)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Feature comparison note */}
        <div style={{ textAlign: "center", padding: "32px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Open Source & Transparent</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 600, margin: "0 auto" }}>
            Meridian is built entirely on free, open-source data and technology. 
            The core platform is free forever. Paid tiers fund development and unlock advanced collaboration and enterprise features.
            All 150+ data sources are publicly accessible with zero proprietary data contracts.
          </div>
        </div>
      </div>
    </div>
  );
}
