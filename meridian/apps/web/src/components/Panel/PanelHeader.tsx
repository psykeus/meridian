import type { ReactNode } from "react";

interface PanelHeaderProps {
  title: string;
  sourceLabel?: string;
  isLive?: boolean;
  eventCount?: number;
  onExpand?: () => void;
  onClose?: () => void;
  children?: ReactNode;
}

export function PanelHeader({
  title,
  sourceLabel,
  isLive = true,
  eventCount,
  onExpand,
  onClose,
  children,
}: PanelHeaderProps) {
  return (
    <div className="panel-header panel-drag-handle" style={{ cursor: "grab" }}>
      <div className="flex items-center gap-2 min-w-0" style={{ overflow: "hidden" }}>
        {isLive && <div className="live-dot healthy flex-shrink-0" />}
        <span
          className="font-semibold truncate"
          style={{ fontSize: 12, color: "var(--text-primary)", letterSpacing: "0.02em" }}
        >
          {title}
        </span>
        {sourceLabel && <span className="source-badge flex-shrink-0">{sourceLabel}</span>}
        {eventCount !== undefined && (
          <span
            className="flex-shrink-0 font-mono"
            style={{ fontSize: 10, color: "var(--text-muted)" }}
          >
            {eventCount.toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1" style={{ flexShrink: 0 }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
        {onExpand && (
          <HeaderButton onClick={onExpand} title="Expand">⊞</HeaderButton>
        )}
        {onClose && (
          <HeaderButton onClick={onClose} title="Close">✕</HeaderButton>
        )}
      </div>
    </div>
  );
}

function HeaderButton({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        color: "var(--text-muted)",
        transition: "color 100ms, background 100ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)";
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
