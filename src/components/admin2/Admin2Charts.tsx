import { useState } from 'react';

export interface DailySeriesPoint {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  articleReads: number;
}

interface TrafficAreaChartProps {
  data: DailySeriesPoint[];
  height?: number;
}

export function TrafficAreaChart({ data, height = 220 }: TrafficAreaChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        Traffic data will populate automatically as readers visit the website.
      </div>
    );
  }

  const width = 640;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(
    4,
    ...data.map((d) => Math.max(d.pageViews, d.uniqueVisitors, d.articleReads))
  );
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const toX = (idx: number) => padLeft + (data.length > 1 ? idx * stepX : innerW / 2);
  const toY = (val: number) => padTop + innerH - (val / maxVal) * innerH;

  const pageViewPoints = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.pageViews).toFixed(1)}`).join(' ');
  const visitorPoints = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.uniqueVisitors).toFixed(1)}`).join(' ');

  const areaPath =
    data.length > 1
      ? `M ${toX(0).toFixed(1)},${(padTop + innerH).toFixed(1)} L ${data
          .map((d, i) => `${toX(i).toFixed(1)},${toY(d.pageViews).toFixed(1)}`)
          .join(' L ')} L ${toX(data.length - 1).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`
      : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t));
  const labelInterval = Math.max(1, Math.ceil(data.length / 6));
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#1D4ED8]" />
            Page Views
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Unique Visitors
          </span>
        </div>
        {hovered ? (
          <div className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
            {hovered.date}: <span className="text-[#1D4ED8] dark:text-blue-400">{hovered.pageViews} views</span> ·{' '}
            <span className="text-emerald-600 dark:text-emerald-400">{hovered.uniqueVisitors} visitors</span> ·{' '}
            <span>{hovered.articleReads} reads</span>
          </div>
        ) : (
          <span className="text-[11px]">Hover any day for exact counts</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Daily page views and unique visitors chart"
      >
        <defs>
          <linearGradient id="cn2AreaBlue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, i) => {
          const y = toY(tick);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeDasharray={i === 0 ? undefined : '3 3'}
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] tabular-nums"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#cn2AreaBlue)" />}

        {data.length > 1 && (
          <>
            <polyline
              fill="none"
              stroke="#1D4ED8"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pageViewPoints}
            />
            <polyline
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={visitorPoints}
            />
          </>
        )}

        {data.map((d, idx) => {
          const cx = toX(idx);
          const cy = toY(d.pageViews);
          const isHovered = hoverIdx === idx;
          return (
            <g key={d.date}>
              {isHovered && (
                <line
                  x1={cx}
                  y1={padTop}
                  x2={cx}
                  y2={padTop + innerH}
                  className="stroke-slate-400 dark:stroke-slate-600"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 4.5 : 2.6}
                fill="#1D4ED8"
                className="transition-all"
              />
              <circle
                cx={cx}
                cy={toY(d.uniqueVisitors)}
                r={isHovered ? 4 : 2.2}
                fill="#10B981"
                className="transition-all"
              />
              {idx % labelInterval === 0 || idx === data.length - 1 ? (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] tabular-nums"
                >
                  {d.date.slice(5)}
                </text>
              ) : null}
              <rect
                x={cx - Math.max(10, stepX / 2)}
                y={padTop}
                width={Math.max(20, stepX)}
                height={innerH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface HorizontalBarListProps {
  items: Array<{ label: string; value: number; subLabel?: string }>;
  emptyText?: string;
  barClassName?: string;
}

export function HorizontalBarList({
  items,
  emptyText = 'No recorded data yet.',
  barClassName = 'bg-[#0F274A] dark:bg-blue-500',
}: HorizontalBarListProps) {
  if (!items || items.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">{emptyText}</p>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(2, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                <strong className="font-semibold text-slate-900 dark:text-white">
                  {item.value.toLocaleString('en-IN')}
                </strong>
                {item.subLabel ? ` · ${item.subLabel}` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barClassName}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
