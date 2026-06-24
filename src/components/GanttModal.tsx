import React, { useEffect, useRef } from "react";
import type { Job } from "../api";

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  selectedJob: Job;
  allJobs: Job[];
  onClose: () => void;
}

// ── Colour map by job type ─────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  llm_inference: "#a78bfa",
  embedding:     "#3b82f6",
  fine_tuning:   "#f59e0b",
  data_pipeline: "#10b981",
  general:       "#64748b",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtWall(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function GanttModal({ selectedJob, allJobs, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // ── Build rows: one row per node that has jobs ──────────────────────────

  // Collect all jobs that have started (have started_at)
  const started = allJobs.filter((j) => j.started_at !== null);

  // Group by node
  const nodeMap = new Map<string, Job[]>();
  for (const job of started) {
    const node = job.assigned_node ?? "unassigned";
    if (!nodeMap.has(node)) nodeMap.set(node, []);
    nodeMap.get(node)!.push(job);
  }

  // If selected job has no node yet, still show it in an "unassigned" row
  if (selectedJob.assigned_node === null && selectedJob.started_at === null) {
    const key = "unassigned";
    if (!nodeMap.has(key)) nodeMap.set(key, []);
    if (!nodeMap.get(key)!.find((j) => j.job_id === selectedJob.job_id)) {
      nodeMap.get(key)!.push(selectedJob);
    }
  }

  // Timeline bounds: earliest start → latest end (or now)
  const now = Date.now();
  const allTimes = started.flatMap((j) => [
    new Date(j.started_at!).getTime(),
    j.completed_at ? new Date(j.completed_at).getTime() : now,
  ]);
  const tMin = allTimes.length ? Math.min(...allTimes) : now - 60000;
  const tMax = allTimes.length ? Math.max(...allTimes, now) : now;
  const tSpan = Math.max(tMax - tMin, 5000); // at least 5s wide

  function pct(ts: number) {
    return Math.max(0, Math.min(100, ((ts - tMin) / tSpan) * 100));
  }

  // X-axis ticks: 5 evenly spaced
  const ticks = Array.from({ length: 6 }, (_, i) =>
    tMin + (tSpan * i) / 5
  );

  const rows = Array.from(nodeMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  // ── Tooltip state ──────────────────────────────────────────────────────
  const [tooltip, setTooltip] = React.useState<{
    job: Job; x: number; y: number;
  } | null>(null);

  return (
    <div className="gantt-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="gantt-modal">

        {/* Header */}
        <div className="gantt-header">
          <div>
            <div className="gantt-title">Job Timeline</div>
            <div className="gantt-subtitle">
              Showing all jobs on the cluster &nbsp;·&nbsp; selected:&nbsp;
              <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                {selectedJob.name} #{selectedJob.job_id}
              </span>
            </div>
          </div>
          <button className="gantt-close" onClick={onClose}>✕</button>
        </div>

        {/* Legend */}
        <div className="gantt-legend">
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            <span key={type} className="gantt-legend-item">
              <span className="gantt-legend-dot" style={{ background: color }} />
              {type}
            </span>
          ))}
          <span className="gantt-legend-item">
            <span className="gantt-legend-dot" style={{
              background: "transparent",
              border: "2px solid var(--accent)",
            }} />
            selected
          </span>
        </div>

        {/* Chart area */}
        <div className="gantt-chart">

          {/* Node rows */}
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: "40px 0" }}>
              No started jobs yet — submit some jobs and wait for the scheduler to assign them.
            </div>
          ) : (
            <>
              {rows.map(([nodeName, nodeJobs]) => (
                <div key={nodeName} className="gantt-row">
                  <div className="gantt-row-label" title={nodeName}>
                    {nodeName}
                  </div>
                  <div className="gantt-row-track">
                    {nodeJobs.map((job) => {
                      if (!job.started_at) return null;
                      const start = new Date(job.started_at).getTime();
                      const end   = job.completed_at
                        ? new Date(job.completed_at).getTime()
                        : now;
                      const left  = pct(start);
                      const width = Math.max(pct(end) - left, 0.5);
                      const color = TYPE_COLOR[job.job_type] ?? "#64748b";
                      const isSelected = job.job_id === selectedJob.job_id;

                      return (
                        <div
                          key={job.job_id}
                          className={`gantt-bar ${isSelected ? "selected" : ""} ${job.status}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: isSelected
                              ? `linear-gradient(90deg, ${color}cc, ${color})`
                              : `${color}80`,
                            borderColor: isSelected ? color : `${color}40`,
                            boxShadow: isSelected ? `0 0 8px ${color}60` : "none",
                          }}
                          onMouseEnter={(e) =>
                            setTooltip({ job, x: e.clientX, y: e.clientY })
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {width > 8 && (
                            <span className="gantt-bar-label">{job.name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* X-axis */}
              <div className="gantt-row gantt-axis-row">
                <div className="gantt-row-label" />
                <div className="gantt-row-track gantt-axis">
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="gantt-tick"
                      style={{ left: `${pct(t)}%` }}
                    >
                      <div className="gantt-tick-line" />
                      <div className="gantt-tick-label">{fmtWall(new Date(t).toISOString())}</div>
                    </div>
                  ))}
                  {/* "now" cursor */}
                  <div
                    className="gantt-now-line"
                    style={{ left: `${pct(now)}%` }}
                    title="now"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stats bar */}
        {started.length > 0 && (
          <div className="gantt-stats">
            <div className="gantt-stat">
              <span className="gantt-stat-label">Window</span>
              <span className="gantt-stat-value">{fmtMs(tSpan)}</span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Jobs plotted</span>
              <span className="gantt-stat-value">{started.length}</span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Nodes active</span>
              <span className="gantt-stat-value">{rows.length}</span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Selected status</span>
              <span className={`gantt-stat-value status-${selectedJob.status}`}>
                {selectedJob.status}
              </span>
            </div>
            {selectedJob.started_at && (
              <div className="gantt-stat">
                <span className="gantt-stat-label">Started at</span>
                <span className="gantt-stat-value">{fmtWall(selectedJob.started_at)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="gantt-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="gantt-tooltip-name">{tooltip.job.name}</div>
          <div className="gantt-tooltip-row">
            <span>type</span><span>{tooltip.job.job_type}</span>
          </div>
          <div className="gantt-tooltip-row">
            <span>status</span>
            <span className={`status-${tooltip.job.status}`}>{tooltip.job.status}</span>
          </div>
          <div className="gantt-tooltip-row">
            <span>node</span><span>{tooltip.job.assigned_node ?? "—"}</span>
          </div>
          {tooltip.job.started_at && (
            <div className="gantt-tooltip-row">
              <span>started</span><span>{fmtWall(tooltip.job.started_at)}</span>
            </div>
          )}
          {tooltip.job.duration_seconds !== null && (
            <div className="gantt-tooltip-row">
              <span>duration</span><span>{fmtMs((tooltip.job.duration_seconds ?? 0) * 1000)}</span>
            </div>
          )}
          <div className="gantt-tooltip-row">
            <span>priority</span><span>{tooltip.job.priority}</span>
          </div>
        </div>
      )}
    </div>
  );
}
