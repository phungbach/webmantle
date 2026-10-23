// Charts from the "Full Charts" Figma component set: pill bars with a MAX line, donut with the value
// in the centre, bars on a track, gradient area and a contribution heat map. Plain SVG and HTML, drawn
// on the server, so they need no chart library and no JavaScript in the browser.

export const CHART = {
  navy: "#03045E",
  blue: "#0077B6",
  cyan: "#00B4D8",
  sky: "#90E0EF",
  mist: "#ADE8F4",
  haze: "#E4F8FF",
  track: "#E9E9E9",
} as const;

/** Vertical bars. The tallest bar is highlighted and a dashed MAX line marks its height. */
export function BarChart({
  data,
  maxLabel,
  ariaLabel,
}: {
  data: { label: string; value: number }[];
  maxLabel: string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hasData = data.some((d) => d.value > 0);
  const top = hasData
    ? data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0)
    : -1;
  return (
    <figure role="img" aria-label={ariaLabel} className="m-0">
      <div className="relative h-52 pr-14">
        <div className="absolute inset-x-0 top-0 flex items-center">
          <span className="flex-1 border-t border-dashed border-ink-3/60" />
          <span className="w-14 pl-2 text-[10px] font-semibold uppercase text-ink-3">
            {maxLabel} {max}
          </span>
        </div>
        <div className="flex h-full items-end gap-2">
          {data.map((d, i) => (
            <div
              key={d.label}
              title={`${d.label}: ${d.value}`}
              className="relative flex h-full flex-1 items-end"
            >
              <div
                className="w-full rounded-md"
                style={{
                  height: `${Math.max(3, (d.value / max) * 100)}%`,
                  background: i === top ? CHART.blue : CHART.track,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-2 pr-14 text-[10px] text-ink-3">
        {data.map((d, i) => (
          <span
            key={d.label}
            className={`flex-1 truncate text-center ${i === top ? "font-semibold text-ink" : ""}`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Ring with a rounded arc and the value in the centre. */
export function DonutChart({
  percent,
  caption,
  ariaLabel,
}: {
  percent: number;
  caption?: string;
  ariaLabel: string;
}) {
  const value = Math.min(100, Math.max(0, percent));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div role="img" aria-label={ariaLabel} className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#EEEEEE" strokeWidth="10" />
        {value > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={CHART.blue}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-8 text-ink">{Math.round(value)}%</span>
        {caption ? <span className="text-[11px] text-ink-3">{caption}</span> : null}
      </div>
    </div>
  );
}

/** Horizontal bars with a light track behind them. */
export function PillBars({
  rows,
  suffix = "",
}: {
  rows: { label: string; value: number }[];
  suffix?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-4 text-sm">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1.5 flex justify-between gap-3 text-ink-2">
            <span className="truncate">{row.label}</span>
            <span className="font-medium text-ink">
              {row.value}
              {suffix}
            </span>
          </div>
          <div className="h-3 rounded-full" style={{ background: CHART.mist }}>
            <div
              className="h-3 rounded-full"
              style={{
                width: `${row.value === 0 ? 0 : Math.max(6, (row.value / max) * 100)}%`,
                background: CHART.blue,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Smooth line with a gradient fill underneath. An optional second line is drawn without a fill. */
export function AreaChart({
  id,
  values,
  secondary,
  labels,
  ariaLabel,
}: {
  id: string;
  values: number[];
  secondary?: number[];
  labels: string[];
  ariaLabel: string;
}) {
  const W = 600;
  const H = 160;
  const max = Math.max(1, ...values, ...(secondary ?? []));
  const n = Math.max(2, values.length);
  const point = (v: number, i: number) => ({
    x: (i / (n - 1)) * W,
    y: H - 6 - (v / max) * (H - 22),
  });
  const curve = (series: number[]) => {
    const pts = series.map(point);
    let d = `M ${pts[0]?.x ?? 0} ${pts[0]?.y ?? H}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const mid = (a.x + b.x) / 2;
      d += ` C ${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`;
    }
    return { d, last: pts[pts.length - 1] ?? { x: W, y: H } };
  };
  const main = curve(values);
  const other = secondary ? curve(secondary) : null;
  const area = `${main.d} L ${main.last.x} ${H} L 0 ${H} Z`;
  return (
    <figure role="img" aria-label={ariaLabel} className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.cyan} stopOpacity="0.4" />
              <stop offset="100%" stopColor={CHART.cyan} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="#EEEEEE"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${id})`} />
          <path
            d={main.d}
            fill="none"
            stroke={CHART.blue}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {other ? (
            <path
              d={other.d}
              fill="none"
              stroke={CHART.cyan}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <span
          aria-hidden="true"
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: `${(main.last.x / W) * 100}%`,
            top: `${(main.last.y / H) * 100}%`,
            background: CHART.blue,
          }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-3">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </figure>
  );
}

/** Contribution-style grid: one column per week, one row per weekday (Monday first). */
export function HeatMap({
  weeks,
  monthLabels,
  legend,
  ariaLabel,
}: {
  weeks: { date: string; count: number }[][];
  monthLabels: (string | null)[];
  legend: { less: string; more: string };
  ariaLabel: string;
}) {
  const max = Math.max(1, ...weeks.flat().map((c) => c.count));
  const shade = (count: number) =>
    count === 0
      ? CHART.haze
      : count <= max / 3
        ? CHART.sky
        : count <= (max * 2) / 3
          ? CHART.blue
          : CHART.navy;
  return (
    <figure role="img" aria-label={ariaLabel} className="m-0 overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="mb-2 flex gap-1 text-[10px] font-semibold text-ink">
          {monthLabels.map((label, i) => (
            <span key={i} className="w-5 shrink-0 overflow-visible whitespace-nowrap">
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-1">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  title={`${cell.date}: ${cell.count}`}
                  className="h-5 w-5 rounded-[4px]"
                  style={{ background: shade(cell.count) }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-ink-3">
          <span>{legend.less}</span>
          {[CHART.haze, CHART.sky, CHART.blue, CHART.navy].map((c) => (
            <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
          ))}
          <span>{legend.more}</span>
        </div>
      </div>
    </figure>
  );
}
