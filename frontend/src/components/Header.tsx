import { money } from "@/lib/format";
import type { ConnectionState } from "@/lib/types";

interface HeaderProps {
  totalValue: number;
  cashBalance: number;
  status: ConnectionState;
}

const STATUS_LABEL: Record<ConnectionState, string> = {
  connected: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
};

const STATUS_DOT: Record<ConnectionState, string> = {
  connected: "bg-up",
  reconnecting: "bg-accent",
  disconnected: "bg-down",
};

export function Header({ totalValue, cashBalance, status }: HeaderProps) {
  return (
    <header
      data-testid="header"
      className="flex h-11 shrink-0 items-center gap-6 border-b border-edge bg-rail px-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold tracking-[0.2em] text-accent">ARTIFINANCIAL</span>
        <span className="text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          Trading Terminal
        </span>
      </div>

      <Readout label="Total value" testId="total-value" value={money(totalValue)} accent />
      <Readout label="Cash" testId="cash-balance" value={money(cashBalance)} />

      <div className="ml-auto flex items-center gap-2">
        <span
          data-testid="connection-status"
          data-status={status}
          title={STATUS_LABEL[status]}
          className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
        />
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          {STATUS_LABEL[status]}
        </span>
      </div>
    </header>
  );
}

function Readout({
  label,
  value,
  testId,
  accent = false,
}: {
  label: string;
  value: string;
  testId: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-[0.14em] text-ink-faint">{label}</span>
      <span
        data-testid={testId}
        className={`tnum text-[14px] font-medium ${accent ? "text-accent" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
