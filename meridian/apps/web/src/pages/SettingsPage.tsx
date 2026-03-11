import { useEffect, useState } from "react";
import { DATA_SOURCES, type DataSourceConfig } from "@/config/dataSources";

interface APIToken {
  id: number;
  name: string;
  token_prefix: string;
  scope: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
});

const TIERS = [
  { id: "analyst",      label: "Analyst",      price: "$9/mo",  features: ["All panels", "AI Analyst", "Email alerts", "API access"] },
  { id: "team_starter", label: "Team Starter",  price: "$29/mo", features: ["Everything in Analyst", "5 Plan Rooms", "10 members", "Exports"] },
  { id: "team_pro",     label: "Team Pro",      price: "$79/mo", features: ["Everything in Team Starter", "Unlimited rooms", "25 members", "Priority support"] },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"tokens" | "billing" | "orgs" | "sources">("sources");
  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenScope, setTokenScope] = useState("read");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/v1/tokens", { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setTokens)
      .catch(() => {});
  }, []);

  const createToken = async () => {
    if (!tokenName.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/v1/tokens", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: tokenName.trim(), scope: tokenScope }),
      });
      if (r.ok) {
        const data = await r.json();
        setNewToken(data.raw_token);
        setTokens((p) => [data, ...p]);
        setTokenName("");
      }
    } finally { setLoading(false); }
  };

  const revokeToken = async (id: number) => {
    await fetch(`/api/v1/tokens/${id}`, { method: "DELETE", headers: authHeaders() });
    setTokens((p) => p.filter((t) => t.id !== id));
  };

  const handleUpgrade = async (tier: string) => {
    const r = await fetch(`/api/v1/billing/checkout?tier=${tier}`, { method: "POST", headers: authHeaders() });
    if (r.ok) {
      const { checkout_url } = await r.json();
      window.location.href = checkout_url;
    }
  };

  const handlePortal = async () => {
    const r = await fetch("/api/v1/billing/portal", { method: "POST", headers: authHeaders() });
    if (r.ok) {
      const { portal_url } = await r.json();
      window.location.href = portal_url;
    }
  };

  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Settings</h1>
      </div>

      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
        <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "12px 0" }}>
          {(["sources", "tokens", "billing", "orgs"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 20px",
              background: activeTab === tab ? "var(--bg-hover)" : "none", border: "none",
              borderLeft: activeTab === tab ? "2px solid var(--green-primary)" : "2px solid transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 13, cursor: "pointer", textTransform: "capitalize",
            }}>{tab === "tokens" ? "API Tokens" : tab === "billing" ? "Billing" : tab === "orgs" ? "Organization" : "Data Sources"}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          {activeTab === "sources" && <DataSourcesTab />}

          {activeTab === "tokens" && (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>API Tokens</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
                Create scoped tokens for programmatic access. Tokens are prefixed with <code style={{ background: "var(--bg-card)", padding: "1px 4px", borderRadius: 3 }}>mid_</code>
              </p>

              {newToken && (
                <div style={{ padding: "12px 16px", background: "rgba(0,230,118,0.08)", border: "1px solid var(--green-primary)", borderRadius: 6, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green-primary)", marginBottom: 6 }}>Token created — copy it now, it won't be shown again</div>
                  <code style={{ fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all" }}>{newToken}</code>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => navigator.clipboard.writeText(newToken)}
                      style={{ padding: "4px 12px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 11, cursor: "pointer" }}>
                      Copy
                    </button>
                    <button onClick={() => setNewToken(null)}
                      style={{ padding: "4px 12px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 11, cursor: "pointer" }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Token name…"
                  style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "7px 12px", outline: "none" }} />
                <select value={tokenScope} onChange={(e) => setTokenScope(e.target.value)}
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "7px 10px" }}>
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                </select>
                <button onClick={createToken} disabled={loading || !tokenName.trim()}
                  style={{ padding: "7px 16px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {loading ? "…" : "Create"}
                </button>
              </div>

              <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                {tokens.length === 0 ? (
                  <div style={{ padding: "24px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No tokens yet</div>
                ) : tokens.map((token, i) => (
                  <div key={token.id} style={{ padding: "12px 16px", borderBottom: i < tokens.length - 1 ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{token.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        <code style={{ background: "var(--bg-card)", padding: "1px 4px", borderRadius: 3 }}>{token.token_prefix}…</code>
                        {" · "}{token.scope} access
                        {token.last_used_at && ` · Last used ${new Date(token.last_used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: token.scope === "write" ? "rgba(255,170,0,0.12)" : "rgba(0,230,118,0.1)", color: token.scope === "write" ? "var(--orange-warning)" : "var(--green-primary)", border: "1px solid currentColor" }}>
                      {token.scope}
                    </span>
                    <button onClick={() => revokeToken(token.id)}
                      style={{ padding: "4px 10px", borderRadius: 4, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--red-critical)", fontSize: 11, cursor: "pointer" }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Billing & Plans</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Upgrade to unlock team collaboration, exports, and API access.</p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                {TIERS.map((tier) => (
                  <div key={tier.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{tier.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green-primary)", marginTop: 4 }}>{tier.price}</div>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, listStyle: "none" }}>
                      {tier.features.map((f) => (
                        <li key={f} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, paddingLeft: 0 }}>
                          <span style={{ color: "var(--green-primary)", marginRight: 6 }}>✓</span>{f}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => handleUpgrade(tier.id)}
                      style={{ marginTop: "auto", padding: "8px 0", borderRadius: 5, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Upgrade
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={handlePortal}
                style={{ padding: "8px 20px", borderRadius: 5, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 13, cursor: "pointer" }}>
                Manage Subscription / Invoices →
              </button>
            </div>
          )}

          {activeTab === "orgs" && (
            <OrgSettings />
          )}
        </div>
      </div>
    </div>
  );
}

function OrgSettings() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/v1/orgs", { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setOrgs)
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/v1/orgs", { method: "POST", headers: authHeaders(), body: JSON.stringify({ name: name.trim(), slug: slug.trim() }) });
      if (r.ok) { const org = await r.json(); setOrgs((p) => [...p, org]); setName(""); setSlug(""); }
    } finally { setCreating(false); }
  };

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Organization</h2>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Create or manage your team workspace.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Org name…"
          style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "7px 12px", outline: "none" }} />
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="slug"
          style={{ width: 140, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "7px 12px", outline: "none" }} />
        <button onClick={create} disabled={creating || !name.trim() || !slug.trim()}
          style={{ padding: "7px 16px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {creating ? "…" : "Create"}
        </button>
      </div>

      {orgs.length === 0 ? (
        <div style={{ padding: "24px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>No organizations yet</div>
      ) : orgs.map((org) => (
        <div key={org.id} style={{ padding: "16px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{org.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            <code style={{ background: "var(--bg-card)", padding: "1px 4px", borderRadius: 3 }}>{org.slug}</code>
            {" · "}{org.tier} · {org.subscription_status}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Data Sources Tab ─────────────────────────────────────────────────────────

const CAT_ORDER = ["Aviation", "Maritime", "Security", "Environment", "Humanitarian", "Space", "Cyber", "Energy", "Finance"] as const;
const CAT_COLOR: Record<string, string> = {
  Aviation: "#29b6f6", Maritime: "#448aff", Security: "#ff5252",
  Environment: "#66bb6a", Humanitarian: "#ff8a65", Space: "#00e676",
  Cyber: "#ff6d00", Energy: "#ffd740", Finance: "#ab47bc",
};

function DataSourcesTab() {
  const [filter, setFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("meridian_source_keys") ?? "{}"); }
    catch { return {}; }
  });

  const categories = ["All", ...CAT_ORDER];
  const filtered = DATA_SOURCES.filter((ds) => filter === "All" || ds.category === filter);
  const configured = DATA_SOURCES.filter((ds) =>
    ds.envVars.length === 0 || ds.envVars.every((v) => savedKeys[v.key])
  ).length;

  const saveKey = (varKey: string, value: string) => {
    const next = { ...savedKeys, [varKey]: value };
    setSavedKeys(next);
    localStorage.setItem("meridian_source_keys", JSON.stringify(next));
  };

  const envSnippet = (ds: DataSourceConfig) =>
    ds.envVars.map((v) => `${v.key}=${savedKeys[v.key] ?? "your_key_here"}`).join("\n");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Data Sources</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            {configured} of {DATA_SOURCES.length} sources configured. Keys are stored locally and added to your <code style={{ background: "var(--bg-card)", padding: "1px 4px", borderRadius: 3 }}>.env</code> file for the backend workers.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--green-primary)" }}>✓ {configured} active</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>· {DATA_SOURCES.length - configured} need setup</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            padding: "3px 10px", borderRadius: 12, border: "1px solid var(--border)",
            background: filter === cat ? (CAT_COLOR[cat] ?? "var(--green-primary)") : "var(--bg-card)",
            color: filter === cat ? "#000" : "var(--text-muted)",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{cat}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((ds) => {
          const isConfigured = ds.envVars.length === 0 || ds.envVars.every((v) => savedKeys[v.key]);
          const isOpen = expanded === ds.id;
          return (
            <div key={ds.id} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
              borderLeft: `3px solid ${CAT_COLOR[ds.category] ?? "var(--border)"}` }}>
              <button onClick={() => setExpanded(isOpen ? null : ds.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: "var(--bg-card)", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 18 }}>{ds.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{ds.name}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8,
                      background: `${CAT_COLOR[ds.category]}22`, color: CAT_COLOR[ds.category] ?? "var(--text-muted)",
                      border: `1px solid ${CAT_COLOR[ds.category]}44`, fontWeight: 600 }}>{ds.category}</span>
                    {ds.free && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "rgba(0,230,118,0.1)", color: "var(--green-primary)", border: "1px solid rgba(0,230,118,0.3)" }}>FREE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{ds.description.slice(0, 80)}…</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: isConfigured ? "var(--green-primary)" : "var(--border)",
                    boxShadow: isConfigured ? "0 0 6px var(--green-primary)" : "none" }} />
                  <span style={{ fontSize: 10, color: isConfigured ? "var(--green-primary)" : "var(--text-muted)" }}>
                    {isConfigured ? "Active" : ds.envVars.length === 0 ? "Active" : "Setup needed"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "16px", background: "var(--bg-panel)", borderTop: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>{ds.description}</p>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>DATA FIELDS AVAILABLE</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {ds.dataPoints.map((pt) => (
                        <span key={pt} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{pt}</span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 6 }}>REFRESH RATE</div>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Every {ds.refreshSec < 60 ? `${ds.refreshSec}s` : ds.refreshSec < 3600 ? `${ds.refreshSec / 60}m` : `${ds.refreshSec / 3600}h`}
                    </span>
                  </div>

                  {ds.envVars.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 8 }}>API CREDENTIALS</div>
                      {ds.envVars.map((v) => (
                        <div key={v.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                          <code style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-card)", padding: "2px 6px", borderRadius: 3, width: 200, flexShrink: 0 }}>{v.key}</code>
                          <input
                            type={v.secret ? "password" : "text"}
                            placeholder={`Enter ${v.label}…`}
                            value={savedKeys[v.key] ?? ""}
                            onChange={(e) => saveKey(v.key, e.target.value)}
                            style={{ flex: 1, background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 4,
                              color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none" }}
                          />
                        </div>
                      ))}

                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>Copy to <code style={{ background: "var(--bg-card)", padding: "1px 4px", borderRadius: 3 }}>apps/api/.env</code>:</div>
                        <div style={{ position: "relative" }}>
                          <pre style={{ fontSize: 10, background: "var(--bg-app)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 10px", margin: 0, color: "var(--green-primary)", overflowX: "auto" }}>{envSnippet(ds)}</pre>
                          <button onClick={() => navigator.clipboard.writeText(envSnippet(ds))}
                            style={{ position: "absolute", top: 6, right: 6, padding: "2px 8px", borderRadius: 3,
                              background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 9, cursor: "pointer" }}>Copy</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={ds.signupUrl} target="_blank" rel="noopener noreferrer"
                      style={{ padding: "5px 14px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                      {ds.envVars.length === 0 ? "View API Docs →" : "Get API Key →"}
                    </a>
                    {ds.docsUrl && (
                      <a href={ds.docsUrl} target="_blank" rel="noopener noreferrer"
                        style={{ padding: "5px 14px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 11, textDecoration: "none", border: "1px solid var(--border)" }}>Docs →</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
