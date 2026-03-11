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
          <CreateRuleForm onClose={() => { setShowCreateForm(false); fetchRules(); }} />
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

function CreateRuleForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [conditionType, setConditionType] = useState("severity");
  const [paramValue, setParamValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
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
          condition_type: conditionType,
          condition_params: { value: paramValue },
          delivery_channels: ["in_app"],
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
      marginBottom: 20, padding: 20, background: "var(--bg-panel)",
      border: "1px solid var(--green-primary)", borderRadius: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Create Alert Rule</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Rule Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Critical Earthquake Alert"
            style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none" }} />
        </Field>
        <Field label="Condition Type">
          <select value={conditionType} onChange={(e) => setConditionType(e.target.value)}
            style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none" }}>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Value">
          <input value={paramValue} onChange={(e) => setParamValue(e.target.value)}
            placeholder={conditionType === "severity" ? "e.g. critical" : conditionType === "category" ? "e.g. military" : "Enter value…"}
            style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, padding: "6px 10px", outline: "none" }} />
        </Field>
        {error && <div style={{ fontSize: 11, color: "var(--red-critical)" }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving}
            style={{ padding: "6px 16px", borderRadius: 4, background: "var(--green-primary)", color: "var(--bg-app)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            {saving ? "Saving…" : "Create Rule"}
          </button>
          <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 4, background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
