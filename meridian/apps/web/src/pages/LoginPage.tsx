import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type Mode = "login" | "register" | "totp";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Store temp credentials when TOTP is required
  const pendingCredentials = useRef<{ email: string; password: string } | null>(null);
  const totpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "totp") totpInputRef.current?.focus();
  }, [mode]);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      const resp = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((e: { msg: string }) => e.msg).join(", ") : "Login failed.");
        return;
      }
      if (data.requires_2fa) {
        pendingCredentials.current = { email, password };
        setMode("totp");
        return;
      }
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate("/");
    } catch { setError("Network error. Is the server running?"); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const body: Record<string, string> = { email, password };
      if (fullName.trim()) body.full_name = fullName.trim();
      const resp = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((e: { msg: string }) => e.msg).join(", ") : "Registration failed.");
        return;
      }
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate("/");
    } catch { setError("Network error. Is the server running?"); }
    finally { setLoading(false); }
  };

  const handleTotp = async () => {
    setError("");
    if (totpCode.length !== 6) { setError("Enter a 6-digit code."); return; }
    if (!pendingCredentials.current) { setMode("login"); return; }
    setLoading(true);
    try {
      const resp = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pendingCredentials.current, totp_code: totpCode }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.detail || "Invalid code."); return; }
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      navigate("/");
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") handleLogin();
    else if (mode === "register") handleRegister();
    else handleTotp();
  };

  const switchMode = (to: "login" | "register") => {
    setMode(to);
    setError("");
    setTotpCode("");
    pendingCredentials.current = null;
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "10px 14px", color: "var(--text-primary)", fontSize: 13, width: "100%",
    outline: "none", boxSizing: "border-box",
  };

  const btnPrimary: React.CSSProperties = {
    width: "100%", padding: "11px 0", borderRadius: 8, fontSize: 13, fontWeight: 700,
    background: "var(--green-primary)", color: "var(--bg-app)", border: "none",
    cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
  };

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-app)", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        width: 480, background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "48px 40px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 32 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green-primary)", boxShadow: "0 0 8px var(--green-primary)" }} />
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.15em", color: "var(--green-primary)" }}>MERIDIAN</span>
        </div>

        {/* Tab toggle (hidden during TOTP) */}
        {mode !== "totp" && (
          <div style={{
            display: "flex", background: "var(--bg-card)", borderRadius: 8, padding: 3,
            gap: 2, marginBottom: 28,
          }}>
            {(["login", "register"] as const).map((m) => (
              <button key={m} onClick={() => switchMode(m)} style={{
                flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: "none", cursor: "pointer",
                background: mode === m ? "var(--green-primary)" : "transparent",
                color: mode === m ? "var(--bg-app)" : "var(--text-muted)",
              }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        )}

        {/* TOTP header */}
        {mode === "totp" && (
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Two-Factor Authentication</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Enter the 6-digit code from your authenticator app.</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <input
              type="text" placeholder="Full name (optional)" value={fullName}
              onChange={(e) => setFullName(e.target.value)} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--green-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          )}
          {mode !== "totp" && (
            <>
              <input
                type="email" placeholder="Email address" value={email} required
                onChange={(e) => setEmail(e.target.value)} style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "var(--green-primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <input
                type="password" placeholder="Password" value={password} required
                onChange={(e) => setPassword(e.target.value)} style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "var(--green-primary)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </>
          )}
          {mode === "totp" && (
            <input
              ref={totpInputRef} type="text" inputMode="numeric" maxLength={6}
              placeholder="000000" value={totpCode} autoComplete="one-time-code"
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ ...inputStyle, textAlign: "center", fontSize: 24, letterSpacing: 12, fontWeight: 700 }}
              onFocus={(e) => (e.target.style.borderColor = "var(--green-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          )}

          {error && (
            <div style={{ color: "var(--red-critical)", fontSize: 12, marginTop: -4 }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={btnPrimary}>
            {loading ? "..." : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Verify"}
          </button>
        </form>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", cursor: "default" }}>
              Forgot password?
            </span>
          </div>
        )}

        {mode === "totp" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { switchMode("login"); setTotpCode(""); }} style={{
              fontSize: 12, color: "var(--text-muted)", background: "none", border: "none",
              cursor: "pointer", textDecoration: "underline",
            }}>
              ← Back to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
