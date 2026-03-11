import { type ClassValue, clsx } from "clsx";
import type { SeverityLevel } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatUTC(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export const SEVERITY_COLOR: Record<SeverityLevel, string> = {
  info: "#448aff",
  low: "#00e676",
  medium: "#ffeb3b",
  high: "#ff9800",
  critical: "#ff5252",
};

export const SEVERITY_BG: Record<SeverityLevel, string> = {
  info: "rgba(68,138,255,0.15)",
  low: "rgba(0,230,118,0.15)",
  medium: "rgba(255,235,59,0.15)",
  high: "rgba(255,152,0,0.15)",
  critical: "rgba(255,82,82,0.2)",
};

export const CATEGORY_ICON: Record<string, string> = {
  environment: "🌍",
  military: "⚔",
  aviation: "✈",
  maritime: "⚓",
  cyber: "⚡",
  finance: "◈",
  geopolitical: "⊕",
  humanitarian: "♡",
  nuclear: "☢",
  space: "★",
  social: "◉",
  energy: "⚙",
};
