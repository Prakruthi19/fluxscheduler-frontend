import React from "react";
import type { MetricPoint } from "../hooks/useSparklines";

// ── Types ──────────────────────────────────────────────────────────────────

interface SparklineProps {
  points: MetricPoint[];
  width?: number;
  height?: number;
}

interface SeriesConfig {
  key: keyof Pick<MetricPoint, "cpu" | "memory" | "gpu">;
  color: string;
  label: string;
}

// ── Series config ──────────────────────────────────────────────────────────

const SERIES: SeriesConfig[] = [
  { key: "cpu",    color: "#3b82f6", label: "CPU"  },
  { key: "memory", color: "#10b981", label: "MEM"  },
  { key: "gpu",    color: "#a78bfa", label: "GPU"  },
];

// ── SVG path builder ───────────────────────────────────────────────────────

function buildPath(
  values: number[],
  width: number,
  height: number,
  padY = 3
): string {
  if (values.length < 2) return "";
  const n      = values.length;
  const usableH = height - padY * 2;

  return values
    .map((v, i) => {
      const x = (i / (n - 1)) * width;
      const y = padY + usableH - (v / 100) * usableH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildArea(
  values: number[],
  width: number,
  height: number,
  padY = 3
): string {
  if (values.length < 2) return "";
  const linePath = buildPath(values, width, height, padY);
  const lastX    = width;
  const firstX   = 0;
  return `${linePath} L${lastX},${height} L${firstX},${height} Z`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Sparkline({ points, width = 220, height = 48 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <div className="sparkline-empty">
        collecting data…
      </div>
    );
  }

  const latest = points[points.length - 1];

  return (
    <div className="sparkline-wrap">
      {/* SVG chart */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="sparkline-svg"
      >
        {/* Horizontal guide lines at 25 / 50 / 75% */}
        {[25, 50, 75].map((pct) => {
          const y = 3 + (height - 6) - (pct / 100) * (height - 6);
          return (
            <line
              key={pct}
              x1={0} y1={y} x2={width} y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          );
        })}

        {/* Area fills (subtle) */}
        {SERIES.map(({ key, color }) => {
          const values = points.map((p) => p[key]);
          const area   = buildArea(values, width, height);
          if (!area) return null;
          return (
            <path
              key={`area-${key}`}
              d={area}
              fill={color}
              fillOpacity={0.06}
            />
          );
        })}

        {/* Lines */}
        {SERIES.map(({ key, color }) => {
          const values = points.map((p) => p[key]);
          const path   = buildPath(values, width, height);
          if (!path) return null;
          return (
            <path
              key={`line-${key}`}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}

        {/* Latest value dots */}
        {SERIES.map(({ key, color }) => {
          const v  = latest[key];
          const x  = width;
          const y  = 3 + (height - 6) - (v / 100) * (height - 6);
          return (
            <circle key={`dot-${key}`} cx={x} cy={y} r={2.5} fill={color} />
          );
        })}
      </svg>

      {/* Legend with live values */}
      <div className="sparkline-legend">
        {SERIES.map(({ key, color, label }) => {
          const val = latest[key];
          // Dim GPU legend if node has no GPU (value always 0)
          const allZero = points.every((p) => p[key] === 0);
          if (allZero && key === "gpu") {
            return (
              <span key={key} className="sparkline-metric dimmed">
                <span className="sparkline-dot" style={{ background: color, opacity: 0.3 }} />
                <span style={{ opacity: 0.3 }}>{label} —</span>
              </span>
            );
          }
          return (
            <span key={key} className="sparkline-metric">
              <span className="sparkline-dot" style={{ background: color }} />
              {label} <span style={{ color }}>{val.toFixed(0)}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
