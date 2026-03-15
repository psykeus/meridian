import { useState, useEffect, useRef, useCallback } from "react";
import { useArticleStore } from "@/stores/useArticleStore";

/**
 * Build the iframe src URL.
 *
 * Strategy:
 * 1. Always route through the server-side proxy (`/api/v1/proxy/article`)
 *    which strips CSP frame-ancestors / X-Frame-Options and injects a
 *    cookie-consent auto-dismiss script.
 * 2. For non-English articles, wrap in Google Translate first, then proxy
 *    the translated page.
 */
function buildSrc(url: string, translate: boolean, lang: string | null): string {
  const target = translate
    ? `https://translate.google.com/translate?sl=${lang ?? "auto"}&tl=en&u=${encodeURIComponent(url)}`
    : url;
  return `/api/v1/proxy/article?url=${encodeURIComponent(target)}`;
}

export function ArticleViewer() {
  const isOpen = useArticleStore((s) => s.isOpen);
  const url = useArticleStore((s) => s.url);
  const title = useArticleStore((s) => s.title);
  const language = useArticleStore((s) => s.language);
  const close = useArticleStore((s) => s.close);

  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useTranslate, setUseTranslate] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const isNonEnglish = language != null && language !== "en";

  // Reset state when URL changes
  useEffect(() => {
    if (isOpen && url) {
      setLoadError(false);
      setLoading(true);
      setUseTranslate(isNonEnglish);
    }
  }, [isOpen, url, isNonEnglish]);

  const iframeSrc = url ? buildSrc(url, useTranslate, language) : null;

  // Timeout fallback — if still loading after 12s, show error
  useEffect(() => {
    if (!isOpen || !url || loadError) return;
    timerRef.current = setTimeout(() => {
      if (loading) {
        setLoadError(true);
        setLoading(false);
      }
    }, 12000);
    return () => clearTimeout(timerRef.current);
  }, [isOpen, url, loading, loadError]);

  const handleLoad = useCallback(() => {
    clearTimeout(timerRef.current);
    try {
      const iframe = iframeRef.current;
      if (iframe) {
        const doc = iframe.contentDocument;
        if (doc && (doc.URL === "about:blank" || doc.URL.startsWith("chrome-error"))) {
          setLoadError(true);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Cross-origin — can't inspect, but it loaded
    }
    setLoading(false);
  }, []);

  const handleError = useCallback(() => {
    clearTimeout(timerRef.current);
    setLoading(false);
    setLoadError(true);
  }, []);

  if (!isOpen || !url) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div style={{
        width: "min(90vw, 1100px)", height: "min(88vh, 900px)",
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        borderRadius: 10, display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 16px 64px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>📰</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {title}
            </div>
            <div style={{
              fontSize: 10, color: "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {url}
            </div>
          </div>
          {isNonEnglish && (
            <button
              onClick={() => { setUseTranslate((v) => !v); setLoading(true); setLoadError(false); }}
              title={useTranslate ? "Show original" : "Translate to English"}
              style={{
                padding: "4px 10px", fontSize: 10, fontWeight: 700,
                background: useTranslate ? "rgba(0,230,118,0.12)" : "var(--bg-card)",
                border: `1px solid ${useTranslate ? "var(--green-primary)" : "var(--border)"}`,
                borderRadius: 4, cursor: "pointer", flexShrink: 0,
                color: useTranslate ? "var(--green-primary)" : "var(--text-secondary)",
              }}
            >
              {useTranslate ? "EN" : language?.toUpperCase()}
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 4, color: "var(--text-secondary)",
              textDecoration: "none", flexShrink: 0,
            }}
          >
            Open in tab ↗
          </a>
          <button
            onClick={close}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 18, padding: "4px 8px",
              lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {loading && !loadError && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "var(--bg-app)", zIndex: 1,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 24, height: 24, border: "2px solid var(--border)",
                  borderTop: "2px solid var(--green-primary)",
                  borderRadius: "50%", margin: "0 auto 10px",
                  animation: "spin 0.8s linear infinite",
                }} />
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading article...</div>
              </div>
            </div>
          )}

          {loadError ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 12, padding: 32,
            }}>
              <span style={{ fontSize: 32, opacity: 0.5 }}>🔒</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                This site cannot be embedded
              </div>
              <div style={{
                fontSize: 12, color: "var(--text-muted)", textAlign: "center",
                maxWidth: 400, lineHeight: 1.5,
              }}>
                The source website could not be loaded. You can open it directly in a new tab instead.
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "8px 20px", fontSize: 12, fontWeight: 700,
                  background: "var(--green-primary)", color: "#000",
                  borderRadius: 5, textDecoration: "none",
                }}
              >
                Open in new tab ↗
              </a>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={iframeSrc ?? undefined}
              style={{
                width: "100%", height: "100%", border: "none",
                background: "#fff",
              }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              referrerPolicy="no-referrer"
              onLoad={handleLoad}
              onError={handleError}
              title={title ?? "Article"}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
