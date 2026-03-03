"use client";

export type AIVisualChartType = "line" | "bar" | "donut";

export type AIVisualPoint = {
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

export type AIVisualDataset = {
  id: string;
  label: string;
  accent: string;
  suffix?: string;
  points: AIVisualPoint[];
};

export type AIVisualCard = {
  datasetId: string;
  title: string;
  subtitle: string;
  chartType: AIVisualChartType;
  insight: string;
  highlight: string;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function buildArcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
}

export function AIVisualGallery({
  summary,
  cards,
  datasets,
}: {
  summary: string;
  cards: AIVisualCard[];
  datasets: AIVisualDataset[];
}) {
  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const visibleCards = cards.filter((card) => datasetById.has(card.datasetId));

  if (!visibleCards.length) {
    return (
      <p className="text-sm text-slate-600">
        No chart cards were returned yet. Refresh the visuals to let AI rebuild them.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.6rem] border border-slate-200 bg-white/75 px-5 py-5">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          AI Summary
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-700">{summary}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleCards.map((card) => {
          const dataset = datasetById.get(card.datasetId);
          if (!dataset) return null;

          return (
            <div
              key={`${card.datasetId}-${card.title}`}
              className="rounded-[1.75rem] border border-slate-200 bg-white/82 px-5 py-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {card.title}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{card.subtitle}</div>
                </div>
                <div className="rounded-full bg-slate-950/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                  {card.chartType}
                </div>
              </div>

              <div className="mt-5">
                <ChartRenderer
                  accent={dataset.accent}
                  chartType={card.chartType}
                  points={dataset.points}
                  suffix={dataset.suffix}
                />
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <p className="text-sm leading-7 text-slate-700">{card.insight}</p>
                <div className="rounded-[1.25rem] bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-[0_14px_32px_rgba(15,23,42,0.22)]">
                  {card.highlight}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartRenderer({
  chartType,
  points,
  accent,
  suffix = "",
}: {
  chartType: AIVisualChartType;
  points: AIVisualPoint[];
  accent: string;
  suffix?: string;
}) {
  if (!points.length) {
    return (
      <div className="flex h-52 items-center justify-center rounded-[1.35rem] bg-slate-100/80 text-sm text-slate-500">
        Not enough data for this visual yet.
      </div>
    );
  }

  if (chartType === "bar") {
    return <BarChart accent={accent} points={points} suffix={suffix} />;
  }

  if (chartType === "donut") {
    return <DonutChart accent={accent} points={points} suffix={suffix} />;
  }

  return <LineChart accent={accent} points={points} suffix={suffix} />;
}

function LineChart({
  points,
  accent,
  suffix,
}: {
  points: AIVisualPoint[];
  accent: string;
  suffix: string;
}) {
  const width = 420;
  const height = 220;
  const padding = 24;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);

  const linePoints = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { x, y, ...point };
  });

  const linePath = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${linePoints[linePoints.length - 1]?.x ?? padding} ${
    height - padding
  } L ${linePoints[0]?.x ?? padding} ${height - padding} Z`;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,245,248,0.9))]"
      >
        <defs>
          <linearGradient id={`line-fill-${accent.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={`M ${padding} ${height - padding} H ${width - padding}`} stroke="#d7dee7" strokeWidth="1" />
        <path d={areaPath} fill={`url(#line-fill-${accent.replace("#", "")})`} />
        <path d={linePath} fill="none" stroke={accent} strokeLinecap="round" strokeWidth="4" />
        {linePoints.map((point) => (
          <circle
            key={`${point.label}-${point.value}`}
            cx={point.x}
            cy={point.y}
            fill={accent}
            r="4.5"
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {points[0]?.label}: {points[0]?.value}
          {suffix}
        </span>
        <span>
          {points[points.length - 1]?.label}: {points[points.length - 1]?.value}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function BarChart({
  points,
  accent,
  suffix,
}: {
  points: AIVisualPoint[];
  accent: string;
  suffix: string;
}) {
  const width = 420;
  const height = 220;
  const padding = 24;
  const max = Math.max(...points.map((point) => point.value), 1);
  const barAreaWidth = width - padding * 2;
  const barWidth = Math.max(28, barAreaWidth / Math.max(points.length * 1.35, 1));
  const gap = points.length > 1 ? (barAreaWidth - barWidth * points.length) / (points.length - 1) : 0;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(240,245,248,0.9))]"
      >
        <path d={`M ${padding} ${height - padding} H ${width - padding}`} stroke="#d7dee7" strokeWidth="1" />
        {points.map((point, index) => {
          const x = padding + index * (barWidth + gap);
          const normalizedHeight = (point.value / max) * (height - padding * 2);
          const y = height - padding - normalizedHeight;
          const fill = point.color || accent;

          return (
            <g key={`${point.label}-${point.value}`}>
              <rect
                fill={fill}
                height={normalizedHeight}
                opacity="0.92"
                rx="12"
                width={barWidth}
                x={x}
                y={y}
              />
            </g>
          );
        })}
      </svg>
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        {points.map((point) => (
          <div key={`${point.label}-${point.value}`} className="flex items-center justify-between rounded-full bg-slate-950/5 px-3 py-2">
            <span>{point.label}</span>
            <span className="font-semibold text-slate-900">
              {point.value}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutChart({
  points,
  accent,
  suffix,
}: {
  points: AIVisualPoint[];
  accent: string;
  suffix: string;
}) {
  const palette = [accent, "#d17a44", "#4f7d75", "#1e3a8a", "#8b5cf6", "#ca8a04"];
  const total = Math.max(
    points.reduce((sum, point) => sum + Math.max(point.value, 0), 0),
    1
  );
  const cx = 110;
  const cy = 110;
  const radius = 78;
  const slices = points.map((point, index) => {
    const priorValue = points
      .slice(0, index)
      .reduce((sum, candidate) => sum + Math.max(candidate.value, 0), 0);
    const startAngle = (priorValue / total) * 360;
    const endAngle = ((priorValue + Math.max(point.value, 0)) / total) * 360;

    return {
      point,
      color: point.color || palette[index % palette.length],
      path: buildArcPath(cx, cy, radius, startAngle, endAngle),
    };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-center">
      <svg
        viewBox="0 0 220 220"
        className="mx-auto h-56 w-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.95),rgba(240,245,248,0.86))]"
      >
        <circle cx={cx} cy={cy} fill="none" r={radius} stroke="#e6edf3" strokeWidth="24" />
        {slices.map((slice) => (
          <path
            key={`${slice.point.label}-${slice.point.value}`}
            d={slice.path}
            fill="none"
            stroke={slice.color}
            strokeLinecap="round"
            strokeWidth="24"
          />
        ))}
        <circle cx={cx} cy={cy} fill="white" r="48" />
        <text
          fill="#0f172a"
          fontSize="24"
          fontWeight="700"
          textAnchor="middle"
          x={cx}
          y={cy - 4}
        >
          {Math.round(total)}
        </text>
        <text
          fill="#64748b"
          fontSize="11"
          fontWeight="600"
          letterSpacing="1.2"
          textAnchor="middle"
          x={cx}
          y={cy + 18}
        >
          TOTAL{suffix}
        </text>
      </svg>

      <div className="space-y-2">
        {slices.map((slice) => {
          const pct = Math.round((Math.max(slice.point.value, 0) / total) * 100);

          return (
            <div
              key={`${slice.point.label}-${slice.point.value}`}
              className="rounded-[1.15rem] border border-slate-200 bg-white/72 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-sm font-medium text-slate-900">{slice.point.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  {slice.point.value}
                  {suffix}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: slice.color,
                    width: `${Math.min(Math.max(pct, 4), 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
