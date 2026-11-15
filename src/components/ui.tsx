import { STATUS_LABEL } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-pine-soft text-pine-dark",
  CHECKED_IN: "bg-dusk-soft text-dusk",
  CHECKED_OUT: "bg-paper text-muted",
  CANCELLED: "bg-danger-soft text-danger",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Flash({ sp }: { sp: Record<string, string | undefined> }) {
  return (
    <>
      {sp.error && <p className="mb-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{sp.error}</p>}
      {sp.notice && <p className="mb-4 rounded-lg bg-pine-soft px-4 py-3 text-sm text-pine-dark">{sp.notice}</p>}
    </>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Simple vertical bar chart. Values are scaled to the tallest bar (or `max`). */
export function Bars({ data, max, format, height = 140 }: { data: { label: string; value: number; tone?: string }[]; max?: number; format: (n: number) => string; height?: number }) {
  const top = max ?? Math.max(1e-9, ...data.map((d) => d.value));
  const every = Math.ceil(data.length / 12);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end">
            <div className={`w-full rounded-t-sm ${d.tone ?? "bg-pine"} opacity-85 group-hover:opacity-100`} style={{ height: `${Math.max(1, (d.value / top) * 100)}%` }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block">
              {d.label}: {format(d.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] border-t border-line pt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-muted">{i % every === 0 ? d.label : ""}</div>
        ))}
      </div>
    </div>
  );
}
