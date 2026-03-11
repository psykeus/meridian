import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { ContextDrawer } from "@/components/Panel/ContextDrawer";
import { useEventStore } from "@/stores/useEventStore";
import { useLayoutStore } from "@/stores/useLayoutStore";
import { usePlanStore } from "@/stores/usePlanStore";

export function AppLayout() {
  const closeDrawer = useEventStore((s) => s.closeDrawer);
  const toggleLayerPanel = useLayoutStore((s) => s.toggleLayerPanel);
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
          if (useLayoutStore.getState().maximizedPanel) {
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
      <div className="flex flex-1 overflow-hidden relative">
        <SideNav />
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
        <ContextDrawer />
      </div>
    </div>
  );
}

function SideNav() {
  return (
    <nav
      className="flex flex-col items-center gap-1 py-3 flex-shrink-0"
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
