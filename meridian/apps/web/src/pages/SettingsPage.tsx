import { useEffect, useState, useMemo, useCallback } from "react";
import { DATA_SOURCES } from "@/config/dataSources";
import type { DataSourceConfig } from "@/config/dataSources";
import { LAYER_GROUPS } from "@/config/layers";
import type { LayerGroup } from "@/config/layers";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { apiFetch } from "@/lib/api";

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

interface FeedHealthEntry {
  name: string;
  status: string;
  last_success: string | null;
  last_error: string | null;
  fetch_count: number;
  error_count: number;
  avg_latency_ms: number | null;
  refresh_interval?: number;
}

// authHeaders is now provided by apiFetch automatically

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"tokens" | "orgs" | "sources" | "ai">("sources");
  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenScope, setTokenScope] = useState("read");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/tokens", {})
      .then((r) => r.ok ? r.json() : [])
      .then(setTokens)
      .catch(() => {});
  }, []);

  const createToken = async () => {
    if (!tokenName.trim()) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/v1/tokens", {
        method: "POST",
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
    await fetch(`/api/v1/tokens/${id}`, { method: "DELETE" });
    setTokens((p) => p.filter((t) => t.id !== id));
  };

  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Settings</h1>
      </div>

      <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
        <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "12px 0" }}>
          {(["sources", "ai", "tokens", "orgs"] as const).map((tab) => {
            const label = tab === "tokens" ? "API Tokens" : tab === "orgs" ? "Organization" : tab === "ai" ? "AI Models" : "Data Sources";
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 20px",
                background: activeTab === tab ? "var(--bg-hover)" : "none", border: "none",
                borderLeft: activeTab === tab ? "2px solid var(--green-primary)" : "2px solid transparent",
                color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 13, cursor: "pointer",
              }}>{label}</button>
            );
          })}
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

          {activeTab === "ai" && <AIModelsTab />}

          {activeTab === "orgs" && (
            <OrgSettings />
          )}
        </div>
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};

const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  gemini: "AIza...",
};

function AIModelsTab() {
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [currentConfig, setCurrentConfig] = useState<{
    model: string;
    providers: Record<string, { configured: boolean; key_preview: string | null }>;
  } | null>(null);
  const [defaultModel, setDefaultModel] = useState("");
  const [changingDefault, setChangingDefault] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchAvailableModels = useCallback(() => {
    setLoadingModels(true);
    apiFetch("/ai/config/models", {})
      .then((r) => r.ok ? r.json() : {})
      .then((data) => setAvailableModels(data))
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, []);

  const refreshConfig = useCallback(() => {
    apiFetch("/ai/config", {})
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        // Adapt new response shape (user_providers + global_fallback) to existing UI state
        const providers: Record<string, { configured: boolean; key_preview: string | null }> = {};
        const userProvs = data.user_providers ?? [];
        for (const prov of ["openai", "anthropic", "gemini"]) {
          const userKey = userProvs.find((p: { provider: string }) => p.provider === prov);
          const globalFallback = data.global_fallback?.[prov];
          providers[prov] = {
            configured: !!userKey || !!globalFallback?.configured,
            key_preview: userKey?.key_preview ?? globalFallback?.key_preview ?? null,
          };
        }
        setCurrentConfig({ model: data.model, providers });
        if (data?.model) setDefaultModel(data.model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshConfig(); fetchAvailableModels(); }, [refreshConfig, fetchAvailableModels]);

  const validateKey = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setValidationError(null);
    setModels([]);
    setValidated(false);
    setSelectedModel("");
    try {
      const r = await apiFetch("/ai/config/validate-key", {
        method: "POST",
                body: JSON.stringify({ provider, api_key: apiKey.trim() }),
      });
      const data = await r.json();
      if (data.valid) {
        setModels(data.models ?? []);
        setValidated(true);
        if (data.models?.length) setSelectedModel(data.models[0]);
      } else {
        setValidationError(data.error ?? "Validation failed");
      }
    } catch {
      setValidationError("Connection failed");
    } finally {
      setValidating(false);
    }
  };

  const saveConfig = async () => {
    if (!selectedModel) return;
    setSaving(true);
    setSaveSuccess(null);
    try {
      // Save per-user AI key via credential store + AI service
      const r = await apiFetch("/ai/config/save", {
        method: "POST",
                body: JSON.stringify({ provider, api_key: apiKey.trim(), model: selectedModel }),
      });
      if (r.ok) {
        setSaveSuccess("saved");
        setApiKey("");
        refreshConfig();
        setTimeout(() => setSaveSuccess(null), 4000);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (prov: string) => {
    setRemovingKey(prov);
    try {
      await apiFetch(`/api/v1/credentials/ai/${prov}`, {
        method: "DELETE",
      });
      refreshConfig();
    } finally {
      setRemovingKey(null);
    }
  };

  const changeDefaultModel = async (model: string) => {
    if (!model || model === defaultModel) return;
    setChangingDefault(true);
    try {
      // Determine provider from model name
      let prov = "openai";
      if (model.startsWith("claude") || model.startsWith("anthropic")) prov = "anthropic";
      else if (model.startsWith("gemini")) prov = "gemini";

      const r = await apiFetch("/ai/config/save", {
        method: "POST",
                body: JSON.stringify({ provider: prov, api_key: "", model }),
      });
      if (r.ok) {
        setDefaultModel(model);
        refreshConfig();
      }
    } finally {
      setChangingDefault(false);
    }
  };

  const resetForm = () => {
    setApiKey("");
    setModels([]);
    setSelectedModel("");
    setValidated(false);
    setValidationError(null);
  };

  const configuredProviders = currentConfig
    ? Object.entries(currentConfig.providers).filter(([, info]) => info.configured)
    : [];

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>AI Model Configuration</h2>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
        Connect an AI provider to enable the AI Analyst, daily briefs, anomaly detection, and risk scoring.
      </p>

      {/* ── Connected Providers ────────────────────────────────────────── */}
      {currentConfig && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 10 }}>CONNECTED PROVIDERS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(currentConfig.providers).map(([prov, info]) => (
              <div key={prov} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                background: "var(--bg-card)", border: `1px solid ${info.configured ? "rgba(0,230,118,0.25)" : "var(--border)"}`,
                borderRadius: 6,
              }}>
                {/* Status indicator */}
                <span style={{
                  width: 9, height: 9, borderRadius: "50%", flexShrink: 0,
                  background: info.configured ? "var(--green-primary)" : "var(--text-muted)",
                  boxShadow: info.configured ? "0 0 6px var(--green-primary)" : "none",
                  animation: info.configured ? "pulse 2s ease-in-out infinite" : "none",
                }} />
                {/* Provider name */}
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", minWidth: 100 }}>
                  {PROVIDER_LABELS[prov] ?? prov}
                </span>
                {/* Status label */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 3,
                  background: info.configured ? "rgba(0,230,118,0.1)" : "rgba(136,153,170,0.1)",
                  color: info.configured ? "var(--green-primary)" : "var(--text-muted)",
                }}>
                  {info.configured ? "CONNECTED" : "NOT CONFIGURED"}
                </span>
                {/* Key preview */}
                {info.key_preview && (
                  <code style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-app)", padding: "2px 6px", borderRadius: 3, marginLeft: 4 }}>
                    {info.key_preview}
                  </code>
                )}
                {/* Saved badge */}
                {info.configured && (
                  <span style={{ fontSize: 10, color: "var(--green-primary)", fontWeight: 600, marginLeft: "auto" }}>
                    Key Saved
                  </span>
                )}
                {/* Remove button */}
                {info.configured && (
                  <button
                    onClick={() => removeKey(prov)}
                    disabled={removingKey === prov}
                    style={{
                      background: "none", border: "1px solid rgba(255,82,82,0.3)", borderRadius: 4,
                      color: "#ff5252", fontSize: 10, padding: "2px 8px", cursor: "pointer",
                      opacity: removingKey === prov ? 0.5 : 1, marginLeft: info.configured ? 0 : "auto",
                    }}
                  >
                    {removingKey === prov ? "..." : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Default Model ──────────────────────────────────────────────── */}
      {currentConfig && configuredProviders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 8 }}>DEFAULT MODEL</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
              style={{
                flex: 1, maxWidth: 360, background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "8px 12px", outline: "none",
                fontFamily: "var(--font-mono, monospace)",
              }}
            />
            {defaultModel !== currentConfig.model && (
              <button
                onClick={() => changeDefaultModel(defaultModel)}
                disabled={changingDefault || !defaultModel.trim()}
                style={{
                  padding: "8px 16px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", background: "var(--green-primary)", color: "var(--bg-app)",
                  opacity: changingDefault ? 0.5 : 1,
                }}
              >
                {changingDefault ? "Switching..." : "Set Default"}
              </button>
            )}
            {defaultModel === currentConfig.model && (
              <span style={{
                fontSize: 10, padding: "4px 10px", borderRadius: 3,
                background: "rgba(0,230,118,0.1)", color: "var(--green-primary)", fontWeight: 700,
              }}>ACTIVE</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Select from the list below or type any model ID supported by your connected provider.
          </p>
        </div>
      )}

      {/* ── Available Models ───────────────────────────────────────────── */}
      {configuredProviders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em" }}>AVAILABLE MODELS</div>
            {loadingModels && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Loading...</span>}
            <button
              onClick={fetchAvailableModels}
              disabled={loadingModels}
              style={{
                marginLeft: "auto", background: "none", border: "1px solid var(--border)", borderRadius: 4,
                color: "var(--text-muted)", fontSize: 10, padding: "2px 8px", cursor: "pointer",
                opacity: loadingModels ? 0.5 : 1,
              }}
            >
              Refresh
            </button>
          </div>
          {Object.entries(availableModels).map(([prov, modelList]) => (
            <div key={prov} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                {PROVIDER_LABELS[prov] ?? prov} ({modelList.length})
              </div>
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 4,
                maxHeight: 120, overflowY: "auto", padding: 4,
              }}>
                {modelList.map((m) => {
                  const isActive = currentConfig?.model === m || currentConfig?.model === `gemini/${m}`;
                  return (
                    <button
                      key={m}
                      onClick={() => {
                        setDefaultModel(m);
                        changeDefaultModel(m);
                      }}
                      style={{
                        padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        fontFamily: "var(--font-mono, monospace)",
                        border: isActive ? "1px solid var(--green-primary)" : "1px solid var(--border)",
                        background: isActive ? "rgba(0,230,118,0.1)" : "var(--bg-card)",
                        color: isActive ? "var(--green-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {Object.keys(availableModels).length === 0 && !loadingModels && (
            <p style={{ fontSize: 11, color: "var(--text-muted)" }}>No models loaded yet. Click Refresh to fetch available models.</p>
          )}
        </div>
      )}

      {/* ── Add / Update Provider ──────────────────────────────────────── */}
      <div style={{
        padding: "16px", background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 6, marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 12 }}>
          {configuredProviders.length > 0 ? "ADD OR UPDATE PROVIDER" : "CONNECT A PROVIDER"}
        </div>

        {/* Provider selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(["openai", "anthropic", "gemini"] as const).map((p) => {
              const isConfigured = currentConfig?.providers[p]?.configured;
              return (
                <button
                  key={p}
                  onClick={() => { setProvider(p); resetForm(); }}
                  style={{
                    padding: "8px 20px", borderRadius: 6, cursor: "pointer",
                    border: provider === p ? "1px solid var(--green-primary)" : "1px solid var(--border)",
                    background: provider === p ? "rgba(0,230,118,0.08)" : "transparent",
                    color: provider === p ? "var(--green-primary)" : "var(--text-muted)",
                    fontSize: 12, fontWeight: 600, position: "relative",
                  }}
                >
                  {PROVIDER_LABELS[p]}
                  {isConfigured && (
                    <span style={{
                      position: "absolute", top: -3, right: -3,
                      width: 7, height: 7, borderRadius: "50%",
                      background: "var(--green-primary)", border: "1px solid var(--bg-card)",
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* API key input */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>API KEY</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setValidated(false); setModels([]); setValidationError(null); }}
              placeholder={PROVIDER_PLACEHOLDERS[provider] ?? "Enter API key..."}
              style={{
                flex: 1, background: "var(--bg-app)", border: `1px solid ${validated ? "var(--green-primary)" : validationError ? "#ff5252" : "var(--border)"}`,
                borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "8px 12px", outline: "none",
              }}
            />
            <button
              onClick={validateKey}
              disabled={validating || !apiKey.trim()}
              style={{
                padding: "8px 20px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: validated ? "rgba(0,230,118,0.15)" : "var(--green-primary)",
                color: validated ? "var(--green-primary)" : "var(--bg-app)",
                opacity: validating || !apiKey.trim() ? 0.5 : 1,
              }}
            >
              {validating ? "Testing..." : validated ? "Connected" : "Test Connection"}
            </button>
          </div>
          {validationError && (
            <div style={{ fontSize: 11, color: "#ff5252", marginTop: 6 }}>{validationError}</div>
          )}
          {validated && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "var(--green-primary)",
                boxShadow: "0 0 4px var(--green-primary)", animation: "pulse 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 11, color: "var(--green-primary)", fontWeight: 600 }}>
                Live connection verified — {models.length} model{models.length !== 1 ? "s" : ""} available
              </span>
            </div>
          )}
        </div>

        {/* Model selector — only visible after validation */}
        {validated && models.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>SELECT DEFAULT MODEL</div>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: "100%", maxWidth: 400, background: "var(--bg-app)", border: "1px solid var(--border)",
                borderRadius: 4, color: "var(--text-primary)", fontSize: 13, padding: "8px 12px", outline: "none",
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}

        {/* Save button */}
        {validated && selectedModel && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={saveConfig}
              disabled={saving}
              style={{
                padding: "9px 28px", borderRadius: 5, background: "var(--green-primary)", color: "var(--bg-app)",
                border: "none", fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save & Set as Default"}
            </button>
            {saveSuccess === "saved" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", background: "var(--green-primary)",
                  boxShadow: "0 0 4px var(--green-primary)",
                }} />
                <span style={{ fontSize: 12, color: "var(--green-primary)", fontWeight: 600 }}>
                  Key saved & model updated
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AI Insights Configuration ─────────────────────────────────── */}
      <InsightConfigSection />

      {/* ── System Prompts Section ──────────────────────────────────────── */}
      <PromptConfigsSection />
    </div>
  );
}

// ── AI Insights Configuration ────────────────────────────────────────────────

const INSIGHT_TYPES = [
  { key: "volume_spike", label: "Volume Spikes", icon: "📊", description: "Detects statistical anomalies in event volume per category using Z-score analysis against 30-day baselines" },
  { key: "vessel_clustering", label: "Vessel Clustering", icon: "⚓", description: "Identifies unusual concentrations of maritime vessels in geographic grid cells" },
  { key: "quake_near_nuclear", label: "Earthquake Near Nuclear", icon: "☢", description: "Monitors seismic activity near nuclear facilities worldwide (M4.5+, within 250km)" },
  { key: "osint_cluster", label: "OSINT Clusters", icon: "🔗", description: "Detects when 3+ independent sources report activity in the same region within 30 minutes" },
  { key: "commodity_conflict_correlation", label: "Commodity-Conflict Correlation", icon: "◈", description: "Identifies temporal correlations between commodity market events and high-severity conflict events" },
  { key: "bgp_advisory_concurrent", label: "BGP + Advisory Concurrent", icon: "⚡", description: "Flags concurrent BGP routing anomalies and cyber security advisories suggesting coordinated attacks" },
] as const;

function InsightConfigSection() {
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("meridian:insight_types");
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set(INSIGHT_TYPES.map((t) => t.key));
  });

  const [maxInsights, setMaxInsights] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("meridian:insight_max");
      if (raw) return parseInt(raw, 10);
    } catch { /* ignore */ }
    return 8;
  });

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("meridian:insight_types", JSON.stringify([...next]));
      return next;
    });
  };

  const handleMaxChange = (val: number) => {
    const clamped = Math.max(1, Math.min(20, val));
    setMaxInsights(clamped);
    localStorage.setItem("meridian:insight_max", String(clamped));
  };

  const enableAll = () => {
    const all = new Set(INSIGHT_TYPES.map((t) => t.key));
    setEnabledTypes(all);
    localStorage.setItem("meridian:insight_types", JSON.stringify([...all]));
  };

  const disableAll = () => {
    setEnabledTypes(new Set());
    localStorage.setItem("meridian:insight_types", JSON.stringify([]));
  };

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>AI Insight Notifications</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={enableAll} style={{ fontSize: 10, color: "var(--green-primary)", background: "none", border: "none", cursor: "pointer" }}>Enable All</button>
          <button onClick={disableAll} style={{ fontSize: 10, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>Disable All</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        Control which anomaly detection types appear in your notification feed. Each type runs automatically every 30 minutes.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {INSIGHT_TYPES.map(({ key, label, icon, description }) => {
          const isEnabled = enabledTypes.has(key);
          return (
            <div key={key} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 6,
              background: isEnabled ? "var(--bg-card)" : "transparent",
              opacity: isEnabled ? 1 : 0.5,
              transition: "opacity 150ms, background 150ms",
            }}>
              {/* Toggle switch */}
              <button
                onClick={() => toggleType(key)}
                style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
                  background: isEnabled ? "var(--green-primary)" : "var(--border)",
                  border: "none", cursor: "pointer", position: "relative",
                  transition: "background 200ms",
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 2,
                  left: isEnabled ? 18 : 2,
                  transition: "left 200ms",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }} />
              </button>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Max insights shown */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Max insights shown:</label>
        <input
          type="number"
          min={1}
          max={20}
          value={maxInsights}
          onChange={(e) => handleMaxChange(parseInt(e.target.value, 10))}
          style={{
            width: 60, background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "4px 8px",
            outline: "none", textAlign: "center",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          (1-20, controls how many insights appear in the notification dropdown)
        </span>
      </div>

      <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(187,134,252,0.06)", borderRadius: 6, border: "1px solid rgba(187,134,252,0.15)" }}>
        <span style={{ fontSize: 11, color: "#bb86fc" }}>
          Tip: Customize the AI analysis prompt for insights in the "AI Insight Analysis" entry under System Prompts below.
        </span>
      </div>
    </div>
  );
}

interface PromptConfigItem {
  key: string;
  label: string;
  description: string;
  system_prompt: string;
  temperature: number;
  model_override: string | null;
  is_default: boolean;
}

function PromptConfigsSection() {
  const [configs, setConfigs] = useState<PromptConfigItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, { prompt: string; model: string; temp: number }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/v1/prompt-configs", {})
      .then((r) => r.ok ? r.json() : [])
      .then((data: PromptConfigItem[]) => {
        setConfigs(data);
        const initial: Record<string, { prompt: string; model: string; temp: number }> = {};
        data.forEach((c) => { initial[c.key] = { prompt: c.system_prompt, model: c.model_override || "", temp: c.temperature }; });
        setEditState(initial);
      })
      .catch(() => {});
  }, []);

  const savePrompt = async (key: string) => {
    const edit = editState[key];
    if (!edit) return;
    setSaving(key);
    try {
      const r = await fetch(`/api/v1/prompt-configs/${key}`, {
        method: "PUT",
                body: JSON.stringify({
          system_prompt: edit.prompt,
          model_override: edit.model || null,
          temperature: edit.temp,
        }),
      });
      if (r.ok) {
        const updated = await r.json();
        setConfigs((prev) => prev.map((c) => c.key === key ? updated : c));
      }
    } finally { setSaving(null); }
  };

  const resetPrompt = async (key: string) => {
    setSaving(key);
    try {
      await apiFetch(`/api/v1/prompt-configs/${key}`, { method: "DELETE" });
      // Re-fetch to get defaults
      const r = await apiFetch("/api/v1/prompt-configs", {});
      if (r.ok) {
        const data = await r.json();
        setConfigs(data);
        const updated: Record<string, { prompt: string; model: string; temp: number }> = {};
        data.forEach((c: PromptConfigItem) => { updated[c.key] = { prompt: c.system_prompt, model: c.model_override || "", temp: c.temperature }; });
        setEditState(updated);
      }
    } finally { setSaving(null); }
  };

  if (configs.length === 0) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>System Prompts</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        Customize the system prompt and model for each AI interaction area.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {configs.map((config) => {
          const isExpanded = expanded === config.key;
          const edit = editState[config.key];

          return (
            <div key={config.key} style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <button
                onClick={() => setExpanded(isExpanded ? null : config.key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", background: isExpanded ? "var(--bg-hover)" : "var(--bg-card)",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                  background: config.is_default ? "var(--green-primary)" : "#ffaa00",
                  boxShadow: `0 0 4px ${config.is_default ? "var(--green-primary)" : "#ffaa00"}`,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{config.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{config.description}</div>
                </div>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{isExpanded ? "▾" : "▸"}</span>
              </button>

              {isExpanded && edit && (
                <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-app)" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 4 }}>SYSTEM PROMPT</div>
                    <textarea
                      value={edit.prompt}
                      onChange={(e) => setEditState((prev) => ({ ...prev, [config.key]: { ...edit, prompt: e.target.value } }))}
                      rows={8}
                      style={{
                        width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
                        borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "8px 10px",
                        outline: "none", resize: "vertical", fontFamily: "monospace", boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", marginBottom: 4 }}>MODEL OVERRIDE</div>
                    <input
                      value={edit.model}
                      onChange={(e) => setEditState((prev) => ({ ...prev, [config.key]: { ...edit, model: e.target.value } }))}
                      placeholder="Default (use global model)"
                      style={{
                        width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
                        borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => savePrompt(config.key)}
                      disabled={saving === config.key}
                      style={{
                        padding: "6px 18px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)",
                        border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        opacity: saving === config.key ? 0.6 : 1,
                      }}
                    >
                      {saving === config.key ? "Saving..." : "Save"}
                    </button>
                    {!config.is_default && (
                      <button
                        onClick={() => resetPrompt(config.key)}
                        disabled={saving === config.key}
                        style={{
                          padding: "6px 14px", borderRadius: 4, background: "var(--bg-card)",
                          border: "1px solid var(--border)", color: "var(--text-muted)",
                          fontSize: 12, cursor: "pointer",
                        }}
                      >
                        Reset to Default
                      </button>
                    )}
                    <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {config.is_default ? "Using default" : "Customized"}
                    </span>
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

function OrgSettings() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/v1/orgs", {})
      .then((r) => r.ok ? r.json() : [])
      .then(setOrgs)
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    try {
      const r = await apiFetch("/api/v1/orgs", { method: "POST", body: JSON.stringify({ name: name.trim(), slug: slug.trim() }) });
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
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Data Sources Tab ─────────────────────────────────────────────────────────

const GROUP_ORDER: LayerGroup[] = [
  "satellite_imagery", "environment", "security", "aviation", "maritime",
  "military", "humanitarian", "cyber", "space", "energy", "infrastructure",
];

const GROUP_COLOR: Record<string, string> = {
  satellite_imagery: "#4fc3f7",
  environment: "#66bb6a",
  security: "#ff5252",
  aviation: "#29b6f6",
  maritime: "#448aff",
  military: "#546e7a",
  humanitarian: "#ff8a65",
  cyber: "#ff6d00",
  space: "#00e676",
  energy: "#ffd740",
  infrastructure: "#78909c",
};

const RENDER_MODE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  points:  { label: "LIVE",   bg: "rgba(0,230,118,0.12)", color: "var(--green-primary)" },
  geojson: { label: "STATIC", bg: "rgba(79,195,247,0.12)", color: "#4fc3f7" },
  tiles:   { label: "TILES",  bg: "rgba(255,215,64,0.12)",  color: "#ffd740" },
};

function formatRefresh(sec: number): string {
  if (sec === 0) return "Static";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function DataSourcesTab() {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Credential state
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("meridian_source_keys") ?? "{}"); }
    catch { return {}; }
  });
  const [configuredKeys, setConfiguredKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, "saved" | "error">>({});

  // Feed health from API
  const [feedHealth, setFeedHealth] = useState<Record<string, FeedHealthEntry>>({});

  // Layer state from store
  const activeLayers = useLayoutStore((s) => s.activeLayers);
  const layerOpacity = useLayoutStore((s) => s.layerOpacity);
  const toggleLayer = useLayoutStore((s) => s.toggleLayer);
  const setLayerOpacity = useLayoutStore((s) => s.setLayerOpacity);

  useEffect(() => {
    apiFetch("/api/v1/credentials")
      .then((r) => r.ok ? r.json() : { configured: [] })
      .then((d) => setConfiguredKeys(new Set(d.configured ?? [])))
      .catch(() => {});

    apiFetch("/api/v1/feeds/health", {})
      .then((r) => r.ok ? r.json() : {})
      .then(setFeedHealth)
      .catch(() => {});
  }, []);

  const saveCredentials = useCallback(async (ds: DataSourceConfig) => {
    const payload: Record<string, string> = {};
    for (const v of ds.envVars) {
      const val = inputValues[v.key] ?? "";
      if (val) payload[v.key] = val;
    }
    if (!Object.keys(payload).length) return;
    setSaving(ds.id);
    try {
      const r = await apiFetch("/api/v1/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const saved = Object.keys(payload);
        setConfiguredKeys((prev) => new Set([...prev, ...saved]));
        setSaveStatus((p) => ({ ...p, [ds.id]: "saved" }));
        localStorage.setItem("meridian_source_keys", JSON.stringify(inputValues));
        setTimeout(() => setSaveStatus((p) => { const n = { ...p }; delete n[ds.id]; return n; }), 2500);
      } else {
        setSaveStatus((p) => ({ ...p, [ds.id]: "error" }));
      }
    } catch {
      setSaveStatus((p) => ({ ...p, [ds.id]: "error" }));
    } finally {
      setSaving(null);
    }
  }, [inputValues]);

  // Filter and group
  const filtered = useMemo(() => {
    let list = DATA_SOURCES;
    if (groupFilter !== "all") list = list.filter((ds) => ds.group === groupFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((ds) =>
        ds.name.toLowerCase().includes(q) ||
        ds.description.toLowerCase().includes(q) ||
        ds.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [groupFilter, searchText]);

  const groupedSources = useMemo(() => {
    const map = new Map<string, DataSourceConfig[]>();
    for (const ds of filtered) {
      const arr = map.get(ds.group) ?? [];
      arr.push(ds);
      map.set(ds.group, arr);
    }
    return map;
  }, [filtered]);

  const activeCount = DATA_SOURCES.filter((ds) => activeLayers.has(ds.id)).length;
  const credConfigured = DATA_SOURCES.filter((ds) =>
    ds.envVars.length === 0 || ds.envVars.every((v) => configuredKeys.has(v.key))
  ).length;

  // Helper: get feed health for a data source by checking its sourceIds
  const getHealth = (ds: DataSourceConfig): FeedHealthEntry | null => {
    for (const sid of ds.sourceIds) {
      if (feedHealth[sid]) return feedHealth[sid];
    }
    return null;
  };

  return (
    <div>
      {/* Header stats */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Data Sources & Layers</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Manage all {DATA_SOURCES.length} data sources. Toggle layers, adjust opacity, and configure API credentials.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 11, flexShrink: 0 }}>
          <span style={{ color: "var(--green-primary)" }}>{activeCount} enabled</span>
          <span style={{ color: "var(--text-muted)" }}>{credConfigured} configured</span>
          <span style={{ color: "var(--text-muted)" }}>{DATA_SOURCES.length} total</span>
        </div>
      </div>

      {/* Search + group filter */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search layers…"
          style={{
            width: 220, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6,
            color: "var(--text-primary)", fontSize: 12, padding: "6px 12px", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          <button onClick={() => setGroupFilter("all")} style={{
            padding: "3px 10px", borderRadius: 12, border: "1px solid var(--border)",
            background: groupFilter === "all" ? "var(--green-primary)" : "var(--bg-card)",
            color: groupFilter === "all" ? "#000" : "var(--text-muted)",
            fontSize: 10, fontWeight: 600, cursor: "pointer",
          }}>All</button>
          {GROUP_ORDER.map((g) => (
            <button key={g} onClick={() => setGroupFilter(g)} style={{
              padding: "3px 10px", borderRadius: 12, border: "1px solid var(--border)",
              background: groupFilter === g ? (GROUP_COLOR[g] ?? "var(--green-primary)") : "var(--bg-card)",
              color: groupFilter === g ? "#000" : "var(--text-muted)",
              fontSize: 10, fontWeight: 600, cursor: "pointer",
            }}>{LAYER_GROUPS[g].icon} {LAYER_GROUPS[g].label}</button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {groupFilter !== "all" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => { filtered.forEach((ds) => { if (!activeLayers.has(ds.id)) toggleLayer(ds.id); }); }}
            style={{ padding: "4px 12px", borderRadius: 4, background: "rgba(0,230,118,0.1)", color: "var(--green-primary)", border: "1px solid rgba(0,230,118,0.3)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
            Enable All in Group
          </button>
          <button
            onClick={() => { filtered.forEach((ds) => { if (activeLayers.has(ds.id)) toggleLayer(ds.id); }); }}
            style={{ padding: "4px 12px", borderRadius: 4, background: "rgba(255,82,82,0.1)", color: "#ff5252", border: "1px solid rgba(255,82,82,0.3)", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
            Disable All in Group
          </button>
        </div>
      )}

      {/* Grouped layer list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {GROUP_ORDER.filter((g) => groupedSources.has(g)).map((group) => {
          const sources = groupedSources.get(group)!;
          const gInfo = LAYER_GROUPS[group];
          const gColor = GROUP_COLOR[group] ?? "var(--text-muted)";

          return (
            <div key={group}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{gInfo.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: gColor }}>{gInfo.label}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({sources.length})</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sources.map((ds) => {
                  const isActive = activeLayers.has(ds.id);
                  const isOpen = expanded === ds.id;
                  const opacity = layerOpacity[ds.id] ?? 1;
                  const health = getHealth(ds);
                  const credConfigOk = ds.envVars.length === 0 || ds.envVars.every((v) => configuredKeys.has(v.key));
                  const modeBadge = RENDER_MODE_BADGE[ds.renderMode];

                  return (
                    <div key={ds.id} style={{
                      border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                      borderLeft: `3px solid ${isActive ? gColor : "var(--border)"}`,
                      opacity: isActive ? 1 : 0.7,
                    }}>
                      {/* Row header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg-card)" }}>
                        {/* Toggle switch */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLayer(ds.id); }}
                          style={{
                            width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
                            background: isActive ? "var(--green-primary)" : "var(--bg-app)",
                            position: "relative", flexShrink: 0, transition: "background 0.2s",
                          }}
                          title={isActive ? "Disable layer" : "Enable layer"}
                        >
                          <div style={{
                            width: 14, height: 14, borderRadius: "50%",
                            background: isActive ? "#fff" : "var(--text-muted)",
                            position: "absolute", top: 2, left: isActive ? 18 : 2,
                            transition: "left 0.2s",
                          }} />
                        </button>

                        {/* Icon + name */}
                        <span style={{ fontSize: 16 }}>{ds.icon}</span>
                        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : ds.id)}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ds.name}</span>
                            {/* Render mode badge */}
                            <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: modeBadge.bg, color: modeBadge.color, fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>
                              {modeBadge.label}
                            </span>
                            {/* Free badge */}
                            {ds.free && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: "rgba(0,230,118,0.1)", color: "var(--green-primary)", fontWeight: 600, flexShrink: 0 }}>FREE</span>}
                            {/* Needs setup */}
                            {!credConfigOk && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: "rgba(255,170,0,0.1)", color: "#ffaa00", fontWeight: 600, flexShrink: 0 }}>KEY</span>}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {ds.description.slice(0, 70)}{ds.description.length > 70 ? "…" : ""}
                          </div>
                        </div>

                        {/* Opacity slider */}
                        {isActive && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }} title={`Opacity: ${Math.round(opacity * 100)}%`}>
                            <span style={{ fontSize: 9, color: "var(--text-muted)", width: 26, textAlign: "right" }}>{Math.round(opacity * 100)}%</span>
                            <input
                              type="range" min={0} max={1} step={0.05} value={opacity}
                              onChange={(e) => setLayerOpacity(ds.id, parseFloat(e.target.value))}
                              style={{ width: 60, height: 3, accentColor: gColor, cursor: "pointer" }}
                            />
                          </div>
                        )}

                        {/* Health status dot */}
                        {health && (
                          <span
                            title={health.status === "healthy" ? `Healthy — ${health.fetch_count} fetches` : `${health.status}: ${health.last_error?.slice(0, 60) ?? "unknown"}`}
                            style={{
                              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                              background: health.status === "healthy" ? "var(--green-primary)" : health.status === "error" ? "#ff5252" : "#ffaa00",
                              boxShadow: health.status === "healthy" ? "0 0 4px var(--green-primary)" : "none",
                            }}
                          />
                        )}

                        {/* Refresh rate */}
                        <span style={{ fontSize: 9, color: "var(--text-muted)", flexShrink: 0, width: 32, textAlign: "right" }}>
                          {formatRefresh(ds.refreshSec)}
                        </span>

                        {/* Zoom range */}
                        {(ds.minZoom > 0 || ds.maxZoom < 24) && (
                          <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 4, background: "var(--bg-app)", color: "var(--text-muted)", border: "1px solid var(--border)", flexShrink: 0 }}>
                            z{ds.minZoom}–{ds.maxZoom}
                          </span>
                        )}

                        {/* Expand arrow */}
                        <span
                          onClick={() => setExpanded(isOpen ? null : ds.id)}
                          style={{ fontSize: 10, color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* Expanded detail panel */}
                      {isOpen && (
                        <div style={{ padding: "12px 16px", background: "var(--bg-panel)", borderTop: "1px solid var(--border)" }}>
                          <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 10, marginTop: 0 }}>{ds.description}</p>

                          {/* Meta info row */}
                          <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>TYPE</div>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ds.renderMode === "geojson" ? "Static GeoJSON" : ds.renderMode === "tiles" ? "Raster Tile Overlay" : "Live Feed Worker"}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>REFRESH</div>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ds.refreshSec === 0 ? "Static (loaded once)" : `Every ${formatRefresh(ds.refreshSec)}`}</span>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>ZOOM</div>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ds.minZoom}–{ds.maxZoom}</span>
                            </div>
                            {health && (
                              <div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>LATENCY</div>
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{health.avg_latency_ms != null ? `${Math.round(health.avg_latency_ms)}ms` : "—"}</span>
                              </div>
                            )}
                            {health && (
                              <div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>FETCHES</div>
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{health.fetch_count} ok / {health.error_count} err</span>
                              </div>
                            )}
                          </div>

                          {/* Data points */}
                          {ds.dataPoints.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>DATA FIELDS</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {ds.dataPoints.map((pt) => (
                                  <span key={pt} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{pt}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Opacity control (large) */}
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>OPACITY</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="range" min={0} max={1} step={0.05} value={opacity}
                                onChange={(e) => setLayerOpacity(ds.id, parseFloat(e.target.value))}
                                style={{ width: 200, height: 4, accentColor: gColor, cursor: "pointer" }}
                              />
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", width: 36 }}>{Math.round(opacity * 100)}%</span>
                            </div>
                          </div>

                          {/* Health error */}
                          {health?.last_error && (
                            <div style={{ marginBottom: 10, padding: "6px 10px", background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 4 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "#ff5252", marginBottom: 2 }}>LAST ERROR</div>
                              <div style={{ fontSize: 10, color: "var(--text-secondary)", wordBreak: "break-all" }}>{health.last_error.slice(0, 200)}</div>
                            </div>
                          )}

                          {/* Poll frequency (configurable interval) */}
                          {ds.configurableInterval && (
                            <PollFrequencyControl ds={ds} health={health} />
                          )}

                          {/* Credentials */}
                          {ds.envVars.length > 0 && (
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 6 }}>API CREDENTIALS</div>
                              {ds.envVars.map((v) => (
                                <div key={v.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                  <code style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-card)", padding: "2px 6px", borderRadius: 3, width: 200, flexShrink: 0 }}>{v.key}</code>
                                  <input
                                    type={v.secret ? "password" : "text"}
                                    placeholder={configuredKeys.has(v.key) ? "••••••••" : `Enter ${v.label}…`}
                                    value={inputValues[v.key] ?? ""}
                                    onChange={(e) => setInputValues((p) => ({ ...p, [v.key]: e.target.value }))}
                                    style={{ flex: 1, background: "var(--bg-app)", border: `1px solid ${configuredKeys.has(v.key) ? "var(--green-primary)" : "var(--border)"}`, borderRadius: 4,
                                      color: "var(--text-primary)", fontSize: 11, padding: "4px 8px", outline: "none" }}
                                  />
                                </div>
                              ))}
                              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                <button onClick={() => saveCredentials(ds)} disabled={saving === ds.id}
                                  style={{ padding: "5px 14px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)",
                                    fontSize: 11, fontWeight: 700, border: "none", cursor: saving === ds.id ? "wait" : "pointer", opacity: saving === ds.id ? 0.7 : 1 }}>
                                  {saving === ds.id ? "Saving…" : "Save Credentials"}
                                </button>
                                {saveStatus[ds.id] === "saved" && <span style={{ fontSize: 11, color: "var(--green-primary)" }}>Saved</span>}
                                {saveStatus[ds.id] === "error" && <span style={{ fontSize: 11, color: "#ff5252" }}>Failed</span>}
                              </div>
                            </div>
                          )}

                          {/* Links */}
                          <div style={{ display: "flex", gap: 8 }}>
                            {ds.signupUrl && (
                              <a href={ds.signupUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: "4px 12px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 10, textDecoration: "none", border: "1px solid var(--border)" }}>
                                {ds.envVars.length === 0 ? "API Docs" : "Get API Key"} →
                              </a>
                            )}
                            {ds.docsUrl && (
                              <a href={ds.docsUrl} target="_blank" rel="noopener noreferrer"
                                style={{ padding: "4px 12px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-muted)", fontSize: 10, textDecoration: "none", border: "1px solid var(--border)" }}>
                                Docs →
                              </a>
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
        })}
      </div>
    </div>
  );
}


function PollFrequencyControl({ ds, health }: { ds: DataSourceConfig; health: FeedHealthEntry | null }) {
  const cfg = ds.configurableInterval!;
  const currentInterval = health?.refresh_interval ?? ds.refreshSec;
  const [selected, setSelected] = useState(currentInterval);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  const save = async (value: number) => {
    setSelected(value);
    setSaving(true);
    setStatus(null);
    try {
      const sourceId = ds.sourceIds[0];
      if (!sourceId) return;
      const r = await fetch(`/api/v1/feeds/${sourceId}/config`, {
        method: "PUT",
                body: JSON.stringify({ refresh_interval: value }),
      });
      setStatus(r.ok ? "saved" : "error");
      if (r.ok) setTimeout(() => setStatus(null), 2500);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 6 }}>
        API POLL FREQUENCY
        <span style={{ fontWeight: 400, marginLeft: 6, color: "var(--text-muted)" }}>
          (affects API cost)
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {cfg.presets.map((p) => (
          <button
            key={p.value}
            onClick={() => save(p.value)}
            disabled={saving}
            style={{
              padding: "4px 10px", borderRadius: 4, cursor: saving ? "wait" : "pointer",
              fontSize: 10, fontWeight: selected === p.value ? 700 : 500,
              background: selected === p.value ? "var(--green-primary)" : "var(--bg-card)",
              color: selected === p.value ? "#000" : "var(--text-secondary)",
              border: `1px solid ${selected === p.value ? "var(--green-primary)" : "var(--border)"}`,
              transition: "all 150ms",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        Current: every {selected >= 3600 ? `${selected / 3600}hr` : `${selected / 60}min`}
        {status === "saved" && <span style={{ color: "var(--green-primary)", fontWeight: 600 }}>Saved</span>}
        {status === "error" && <span style={{ color: "#ff5252", fontWeight: 600 }}>Failed</span>}
      </div>
    </div>
  );
}
