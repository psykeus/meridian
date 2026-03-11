import { NavLink, Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { ContextDrawer } from "@/components/Panel/ContextDrawer";

export function AppLayout() {
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
