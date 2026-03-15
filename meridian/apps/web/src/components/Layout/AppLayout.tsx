import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { ContextDrawer } from "@/components/Panel/ContextDrawer";
import { InsightDetailDrawer } from "@/components/Panel/InsightDetailDrawer";
import { NewsFeedDrawer } from "@/components/Panel/NewsFeedDrawer";
import { ArticleViewer } from "@/components/Panel/ArticleViewer";
import { useEventStore } from "@/stores/useEventStore";
import { useInsightStore } from "@/stores/useInsightStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { usePlanStore } from "@/stores/usePlanStore";
import { useNewsFeedStore } from "@/stores/useNewsFeedStore";
import { useArticleStore } from "@/stores/useArticleStore";
import { LiveTicker } from "@/components/LiveTicker";

export function AppLayout() {
  const closeDrawer = useEventStore((s) => s.closeDrawer);
  const toggleLayerPanel = useLayoutStore((s) => s.toggleLayerPanel);
  const tickerPosition = useLayoutStore((s) => s.tickerPosition);
  const navigate = useNavigate();

  // ── Global keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "Escape":
          if (useArticleStore.getState().isOpen) {
            useArticleStore.getState().close();
          } else if (useNewsFeedStore.getState().isOpen) {
            useNewsFeedStore.getState().close();
          } else if (useInsightStore.getState().selectedInsight) {
            useInsightStore.getState().closeInsight();
          } else if (useLayoutStore.getState().maximizedPanel) {
            useLayoutStore.getState().setMaximizedPanel(null);
          } else if (usePlanStore.getState().drawingMode) {
            usePlanStore.getState().setDrawingMode(null);
          } else {
            closeDrawer();
          }
          break;
        case "m":
        case "M":
          navigate("/");
          break;
        case "p":
        case "P":
          navigate("/plan");
          break;
        case "a":
        case "A":
          navigate("/alerts");
          break;
        case "n":
        case "N":
          // Toggle notification center — dispatch custom event
          document.dispatchEvent(new CustomEvent("meridian:toggle-notifications"));
          break;
        case "l":
        case "L":
          toggleLayerPanel();
          break;
        case "w":
        case "W":
          navigate("/watch");
          break;
        case "f":
        case "F":
          navigate("/feeds");
          break;
        case "g":
        case "G":
          useNewsFeedStore.getState().toggle();
          break;
        case "/": {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search places"]');
          if (searchInput) searchInput.focus();
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeDrawer, toggleLayerPanel, navigate]);

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", background: "var(--bg-app)", overflow: "hidden" }}
    >
      <TopNav />
      {tickerPosition === "top" && <LiveTicker />}
      <div className="flex flex-1 overflow-hidden relative">
        <SideNav />
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
        <ContextDrawer />
        <InsightDetailDrawer />
        <NewsFeedDrawer />
      </div>
      <ArticleViewer />
      {tickerPosition === "bottom" && <LiveTicker />}
      <MobileBottomNav />
    </div>
  );
}

function SideNav() {
  return (
    <nav
      className="side-nav flex flex-col items-center gap-1 py-3 flex-shrink-0"
      style={{ width: 48, borderRight: "1px solid var(--border)", background: "var(--bg-panel)" }}
    >
      <NavItem to="/" label="Dashboard" emoji="◉" end />
      <NavItem to="/plan" label="Plan Mode" emoji="⊕" />
      <NavItem to="/watch" label="Watch List" emoji="◎" />
      <NavItem to="/feeds" label="Feed Health" emoji="◈" />
      <NavItem to="/alerts" label="Alert Rules" emoji="⚑" />
      <NavItem to="/sitrep" label="Sitrep Builder" emoji="≡" />
      <div className="flex-1" />
      <NavItem to="/settings" label="Settings" emoji="⊙" />
    </nav>
  );
}

function NavItem({ to, label, emoji, end }: { to: string; label: string; emoji: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 6, fontSize: 16, border: "none",
        cursor: "pointer", textDecoration: "none",
        color: isActive ? "var(--green-primary)" : "var(--text-muted)",
        background: isActive ? "var(--bg-hover)" : "transparent",
        transition: "color 150ms, background 150ms",
      })}
    >
      {emoji}
    </NavLink>
  );
}

/** Visible only on mobile (≤640px) — replaces the hidden side nav */
function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav" style={{
      display: "none", position: "fixed", bottom: 0, left: 0, right: 0,
      height: 52, background: "var(--bg-panel)", borderTop: "1px solid var(--border)",
      zIndex: 100, justifyContent: "space-around", alignItems: "center",
    }}>
      <NavLink to="/" end style={({ isActive }) => bottomNavStyle(isActive)}>
        <span>◉</span><span style={{ fontSize: 9 }}>Map</span>
      </NavLink>
      <NavLink to="/plan" style={({ isActive }) => bottomNavStyle(isActive)}>
        <span>⊕</span><span style={{ fontSize: 9 }}>Plan</span>
      </NavLink>
      <NavLink to="/alerts" style={({ isActive }) => bottomNavStyle(isActive)}>
        <span>⚑</span><span style={{ fontSize: 9 }}>Alerts</span>
      </NavLink>
      <NavLink to="/feeds" style={({ isActive }) => bottomNavStyle(isActive)}>
        <span>◈</span><span style={{ fontSize: 9 }}>Feeds</span>
      </NavLink>
      <NavLink to="/settings" style={({ isActive }) => bottomNavStyle(isActive)}>
        <span>⊙</span><span style={{ fontSize: 9 }}>Settings</span>
      </NavLink>
    </nav>
  );
}

function bottomNavStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    textDecoration: "none", fontSize: 16, padding: "4px 8px",
    color: isActive ? "var(--green-primary)" : "var(--text-muted)",
  };
}
