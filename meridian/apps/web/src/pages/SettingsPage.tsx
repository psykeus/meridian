import { useEffect, useState } from "react";

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
  const [activeTab, setActiveTab] = useState<"tokens" | "billing" | "orgs">("tokens");
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
          {(["tokens", "billing", "orgs"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 20px",
              background: activeTab === tab ? "var(--bg-hover)" : "none", border: "none",
              borderLeft: activeTab === tab ? "2px solid var(--green-primary)" : "2px solid transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: 13, cursor: "pointer", textTransform: "capitalize",
            }}>{tab === "tokens" ? "API Tokens" : tab === "billing" ? "Billing" : "Organization"}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
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
      if (r.ok) { setOrgs((p) => [...p, await r.json()]); setName(""); setSlug(""); }
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
