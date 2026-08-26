import type { ReactNode } from "react";

interface PanelProps {
  label: string;
  /** Colour of the slug tick; identifies the panel at a glance. */
  tone?: "accent" | "primary" | "submit" | "ink";
  /** Live datum shown at the right of the slug. */
  datum?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body; used for panel-level controls. */
  footer?: ReactNode;
  testId?: string;
  className?: string;
}

const TICK: Record<string, string> = {
  accent: "bg-accent",
  primary: "bg-primary",
  submit: "bg-submit",
  ink: "bg-ink-faint",
};

/**
 * The terminal's one structural device: a slug bar carrying a coloured tick,
 * a micro label, and a live datum, above a panel body that scrolls on its own.
 */
export function Panel({
  label,
  tone = "ink",
  datum,
  children,
  footer,
  testId,
  className = "",
}: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={`flex min-h-0 flex-col border border-edge bg-panel ${className}`}
    >
      <div className="flex h-[26px] shrink-0 items-center gap-2 border-b border-edge px-2">
        <span className={`h-[9px] w-[2px] ${TICK[tone]}`} aria-hidden />
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-dim">{label}</h2>
        <div className="tnum ml-auto text-[10px] text-ink-faint">{datum}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {footer ? <div className="shrink-0 border-t border-edge">{footer}</div> : null}
    </section>
  );
}
