import { useEffect, useState, type ReactNode } from "react";
import { useAlertStore, type AlertRule } from "@/stores/useAlertStore";
import { timeAgo } from "@/lib/utils";

const CONDITION_LABELS: Record<string, string> = {
  category:    "Event Category",
  severity:    "Severity Level",
  keyword:     "Keyword Match",
  source:      "Data Source",
  region_bbox: "Geographic Region",
  composite:   "Composite Rule",
};

const CONDITION_CARDS: { type: string; label: string; icon: string; desc: string }[] = [
  { type: "severity",    label: "Severity Level",    icon: "⚠", desc: "Alert when events exceed a severity threshold" },
  { type: "category",    label: "Event Category",    icon: "◈", desc: "Alert on events in specific categories (military, cyber, etc.)" },
  { type: "keyword",     label: "Keyword Match",     icon: "🔍", desc: "Alert when event titles or bodies contain specific keywords" },
  { type: "source",      label: "Data Source",        icon: "◉", desc: "Alert on events from specific data feeds" },
  { type: "region_bbox", label: "Geographic Region",  icon: "⬡", desc: "Alert on events within a geographic bounding box" },
  { type: "composite",   label: "Composite Rule",     icon: "⊕", desc: "Combine multiple conditions with AND/OR logic" },
];

const SEVERITY_OPTIONS = ["info", "low", "medium", "high", "critical"];
const CATEGORY_OPTIONS = ["environment", "military", "aviation", "maritime", "cyber", "finance", "geopolitical", "humanitarian", "nuclear", "space", "social", "energy"];
const DELIVERY_OPTIONS = [
  { key: "in_app", label: "In-App Notifications", icon: "⚑", desc: "Receive alerts in the notification center" },
  { key: "email", label: "Email Alerts", icon: "✉", desc: "Send alert summaries to your email address" },
  { key: "webhook", label: "Webhook", icon: "⟐", desc: "POST alert payloads to an external URL" },
];

export function AlertRulesPage() {
  const { rules, fetchRules } = useAlertStore();
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Alert Rules</h1>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Configure alert rules to get notified when events match your criteria
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: "7px 16px", borderRadius: 4, background: "var(--green-primary)",
              color: "var(--bg-app)", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
            }}
          >
            + New Rule
          </button>
        </div>

        {showCreateForm && (
          <AlertWizard onClose={() => { setShowCreateForm(false); fetchRules(); }} />
        )}

        {rules.length === 0 ? (
          <div style={{
            padding: 48, textAlign: "center",
            background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 6,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚑</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>No alert rules yet</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Create a rule to receive notifications when events match your criteria</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {rules.map((rule) => <RuleCard key={rule.id} rule={rule} onRefresh={fetchRules} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({ rule, onRefresh }: { rule: AlertRule; onRefresh: () => void }) {
  const toggle = async () => {
    await fetch(`/api/v1/alerts/rules/${rule.id}/toggle`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
    });
    onRefresh();
  };

  const del = async () => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await fetch(`/api/v1/alerts/rules/${rule.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
    });
    onRefresh();
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
      background: "var(--bg-panel)",
    }}>
      <div
        style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
          background: rule.is_active ? "var(--green-primary)" : "var(--border)" }}
        onClick={toggle}
        title={rule.is_active ? "Active — click to disable" : "Disabled — click to enable"}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{rule.name}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-card)", padding: "1px 6px", borderRadius: 3 }}>
            {CONDITION_LABELS[rule.condition_type] ?? rule.condition_type}
          </span>
        </div>
        {rule.description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{rule.description}</div>
        )}
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          Triggered {rule.trigger_count}× ·{" "}
          {rule.last_triggered ? `Last: ${timeAgo(rule.last_triggered)}` : "Never triggered"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {rule.delivery_channels.map((ch) => (
            <span key={ch} style={{ fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, background: "var(--bg-card)", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {ch}
            </span>
          ))}
        </div>
        <button onClick={del} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }} title="Delete">✕</button>
      </div>
    </div>
  );
}

// ── 6-Step Alert Creation Wizard ──────────────────────────────────────────

const STEP_LABELS = ["Name", "Condition", "Parameters", "Delivery", "Configure", "Review"];

function AlertWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditionType, setConditionType] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [regionBbox, setRegionBbox] = useState({ minLat: "", maxLat: "", minLng: "", maxLng: "" });
  const [channels, setChannels] = useState<Set<string>>(new Set(["in_app"]));
  const [emailTo, setEmailTo] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const toggleChannel = (ch: string) => {
    setChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  };

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return conditionType.length > 0;
      case 2: return conditionType === "region_bbox"
        ? [regionBbox.minLat, regionBbox.maxLat, regionBbox.minLng, regionBbox.maxLng].every((v) => v.trim().length > 0)
        : paramValue.trim().length > 0;
      case 3: return channels.size > 0;
      case 4: return (!channels.has("email") || emailTo.trim().length > 0) && (!channels.has("webhook") || webhookUrl.trim().length > 0);
      case 5: return true;
      default: return false;
    }
  };

  const buildConditionParams = (): Record<string, unknown> => {
    if (conditionType === "region_bbox") {
      return {
        min_lat: parseFloat(regionBbox.minLat),
        max_lat: parseFloat(regionBbox.maxLat),
        min_lng: parseFloat(regionBbox.minLng),
        max_lng: parseFloat(regionBbox.maxLng),
      };
    }
    return { value: paramValue };
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/v1/alerts/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          condition_type: conditionType,
          condition_params: buildConditionParams(),
          delivery_channels: [...channels],
          email_to: channels.has("email") ? emailTo.trim() : undefined,
          webhook_url: channels.has("webhook") ? webhookUrl.trim() : undefined,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      onClose();
    } catch (e) {
      setError(`Failed to save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      marginBottom: 20, background: "var(--bg-panel)",
      border: "1px solid var(--green-primary)", borderRadius: 6, overflow: "hidden",
    }}>
      {/* Step indicator */}
      <div style={{ display: "flex", padding: "12px 20px", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              background: i < step ? "var(--green-primary)" : i === step ? "var(--green-primary)" : "var(--bg-card)",
              color: i <= step ? "var(--bg-app)" : "var(--text-muted)",
              border: i === step ? "2px solid var(--green-primary)" : "1px solid var(--border)",
            }}>
              {i < step ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === step ? "var(--text-primary)" : "var(--text-muted)", fontWeight: i === step ? 600 : 400 }}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? "var(--green-primary)" : "var(--border)", margin: "0 4px" }} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ padding: 20, minHeight: 160 }}>
        {step === 0 && <StepName name={name} setName={setName} description={description} setDescription={setDescription} />}
        {step === 1 && <StepConditionType conditionType={conditionType} setConditionType={setConditionType} />}
        {step === 2 && <StepParameters conditionType={conditionType} paramValue={paramValue} setParamValue={setParamValue} regionBbox={regionBbox} setRegionBbox={setRegionBbox} />}
        {step === 3 && <StepDelivery channels={channels} toggleChannel={toggleChannel} />}
        {step === 4 && <StepConfig channels={channels} emailTo={emailTo} setEmailTo={setEmailTo} webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl} />}
        {step === 5 && <StepReview name={name} description={description} conditionType={conditionType} paramValue={paramValue} regionBbox={regionBbox} channels={channels} emailTo={emailTo} webhookUrl={webhookUrl} />}
      </div>

      {/* Navigation */}
      {error && <div style={{ padding: "0 20px 8px", fontSize: 11, color: "var(--red-critical)" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
          style={{ padding: "6px 16px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}
        >
          {step === 0 ? "Cancel" : "← Back"}
        </button>
        {step < 5 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            style={{
              padding: "6px 16px", borderRadius: 4, border: "none", cursor: canAdvance() ? "pointer" : "default",
              background: canAdvance() ? "var(--green-primary)" : "var(--bg-card)",
              color: canAdvance() ? "var(--bg-app)" : "var(--text-muted)",
              fontSize: 12, fontWeight: 700,
            }}
          >
            Next →
          </button>
        ) : (
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: "6px 16px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            {saving ? "Creating…" : "Create Rule"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Wizard Steps ──────────────────────────────────────────────────────────

function StepName({ name, setName, description, setDescription }: {
  name: string; setName: (v: string) => void; description: string; setDescription: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Name your alert rule</div>
      <Field label="Rule Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Critical Earthquake Alert" autoFocus
          style={inputStyle} />
      </Field>
      <Field label="Description (optional)">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of what this rule monitors"
          style={inputStyle} />
      </Field>
    </div>
  );
}

function StepConditionType({ conditionType, setConditionType }: {
  conditionType: string; setConditionType: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Choose a condition type</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {CONDITION_CARDS.map((c) => (
          <button
            key={c.type}
            onClick={() => setConditionType(c.type)}
            style={{
              padding: "12px 10px", borderRadius: 6, cursor: "pointer", textAlign: "left",
              background: conditionType === c.type ? "rgba(0,230,118,.08)" : "var(--bg-card)",
              border: `1.5px solid ${conditionType === c.type ? "var(--green-primary)" : "var(--border)"}`,
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: conditionType === c.type ? "var(--green-primary)" : "var(--text-primary)" }}>{c.label}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.4 }}>{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepParameters({ conditionType, paramValue, setParamValue, regionBbox, setRegionBbox }: {
  conditionType: string; paramValue: string; setParamValue: (v: string) => void;
  regionBbox: { minLat: string; maxLat: string; minLng: string; maxLng: string };
  setRegionBbox: (v: typeof regionBbox) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
        Configure {CONDITION_LABELS[conditionType]} parameters
      </div>

      {conditionType === "severity" && (
        <Field label="Minimum Severity">
          <div style={{ display: "flex", gap: 6 }}>
            {SEVERITY_OPTIONS.map((s) => (
              <button key={s} onClick={() => setParamValue(s)} style={{
                ...chipStyle, background: paramValue === s ? "var(--green-primary)" : "var(--bg-card)",
                color: paramValue === s ? "var(--bg-app)" : "var(--text-secondary)",
                borderColor: paramValue === s ? "var(--green-primary)" : "var(--border)",
              }}>
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}

      {conditionType === "category" && (
        <Field label="Event Category">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CATEGORY_OPTIONS.map((c) => (
              <button key={c} onClick={() => setParamValue(c)} style={{
                ...chipStyle, background: paramValue === c ? "var(--green-primary)" : "var(--bg-card)",
                color: paramValue === c ? "var(--bg-app)" : "var(--text-secondary)",
                borderColor: paramValue === c ? "var(--green-primary)" : "var(--border)",
              }}>
                {c}
              </button>
            ))}
          </div>
        </Field>
      )}

      {conditionType === "keyword" && (
        <Field label="Keyword or Phrase">
          <input value={paramValue} onChange={(e) => setParamValue(e.target.value)}
            placeholder='e.g. "nuclear test" or "cyber attack"' autoFocus style={inputStyle} />
        </Field>
      )}

      {conditionType === "source" && (
        <Field label="Source ID">
          <input value={paramValue} onChange={(e) => setParamValue(e.target.value)}
            placeholder="e.g. usgs_earthquakes, gdelt, acled" autoFocus style={inputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            Enter the source_id of the data feed you want to monitor
          </div>
        </Field>
      )}

      {conditionType === "region_bbox" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Min Latitude">
            <input value={regionBbox.minLat} onChange={(e) => setRegionBbox({ ...regionBbox, minLat: e.target.value })} placeholder="-90" style={inputStyle} />
          </Field>
          <Field label="Max Latitude">
            <input value={regionBbox.maxLat} onChange={(e) => setRegionBbox({ ...regionBbox, maxLat: e.target.value })} placeholder="90" style={inputStyle} />
          </Field>
          <Field label="Min Longitude">
            <input value={regionBbox.minLng} onChange={(e) => setRegionBbox({ ...regionBbox, minLng: e.target.value })} placeholder="-180" style={inputStyle} />
          </Field>
          <Field label="Max Longitude">
            <input value={regionBbox.maxLng} onChange={(e) => setRegionBbox({ ...regionBbox, maxLng: e.target.value })} placeholder="180" style={inputStyle} />
          </Field>
        </div>
      )}

      {conditionType === "composite" && (
        <Field label="Composite Rule Expression">
          <input value={paramValue} onChange={(e) => setParamValue(e.target.value)}
            placeholder='e.g. severity:critical AND category:military' autoFocus style={inputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            Combine conditions with AND / OR operators
          </div>
        </Field>
      )}
    </div>
  );
}

function StepDelivery({ channels, toggleChannel }: {
  channels: Set<string>; toggleChannel: (ch: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
        How should we notify you?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DELIVERY_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => toggleChannel(opt.key)}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              borderRadius: 6, cursor: "pointer", textAlign: "left",
              background: channels.has(opt.key) ? "rgba(0,230,118,.08)" : "var(--bg-card)",
              border: `1.5px solid ${channels.has(opt.key) ? "var(--green-primary)" : "var(--border)"}`,
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
              background: channels.has(opt.key) ? "var(--green-primary)" : "transparent",
              border: channels.has(opt.key) ? "none" : "1.5px solid var(--border)",
              color: "var(--bg-app)", fontSize: 11, fontWeight: 700,
            }}>
              {channels.has(opt.key) && "✓"}
            </div>
            <div style={{ fontSize: 20, flexShrink: 0 }}>{opt.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: channels.has(opt.key) ? "var(--green-primary)" : "var(--text-primary)" }}>{opt.label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{opt.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepConfig({ channels, emailTo, setEmailTo, webhookUrl, setWebhookUrl }: {
  channels: Set<string>; emailTo: string; setEmailTo: (v: string) => void;
  webhookUrl: string; setWebhookUrl: (v: string) => void;
}) {
  const needsConfig = channels.has("email") || channels.has("webhook");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Configure delivery channels</div>
      {!needsConfig && (
        <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          In-app notifications require no extra configuration. Click "Next" to review.
        </div>
      )}
      {channels.has("email") && (
        <Field label="Email Address">
          <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="alerts@example.com" type="email" autoFocus
            style={inputStyle} />
        </Field>
      )}
      {channels.has("webhook") && (
        <Field label="Webhook URL">
          <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://hooks.example.com/alerts" type="url"
            style={inputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            Alert payloads will be sent as POST requests with JSON body
          </div>
        </Field>
      )}
    </div>
  );
}

function StepReview({ name, description, conditionType, paramValue, regionBbox, channels, emailTo, webhookUrl }: {
  name: string; description: string; conditionType: string; paramValue: string;
  regionBbox: { minLat: string; maxLat: string; minLng: string; maxLng: string };
  channels: Set<string>; emailTo: string; webhookUrl: string;
}) {
  const condValue = conditionType === "region_bbox"
    ? `[${regionBbox.minLat}, ${regionBbox.minLng}] → [${regionBbox.maxLat}, ${regionBbox.maxLng}]`
    : paramValue;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>Review your alert rule</div>
      <div style={{ background: "var(--bg-card)", borderRadius: 6, padding: 16, display: "flex", flexDirection: "column", gap: 10, border: "1px solid var(--border)" }}>
        <ReviewRow label="Name" value={name} />
        {description && <ReviewRow label="Description" value={description} />}
        <ReviewRow label="Condition" value={`${CONDITION_LABELS[conditionType]}: ${condValue}`} />
        <ReviewRow label="Delivery" value={[...channels].join(", ")} />
        {channels.has("email") && <ReviewRow label="Email" value={emailTo} />}
        {channels.has("webhook") && <ReviewRow label="Webhook" value={webhookUrl} />}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none",
};

const chipStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
  cursor: "pointer", border: "1px solid", textTransform: "capitalize",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
