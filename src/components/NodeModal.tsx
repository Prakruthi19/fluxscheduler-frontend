import React, { useEffect, useRef } from "react";
import type { Node, Job } from "../api";
import type { MetricPoint } from "../hooks/useSparklines";
import Sparkline from "./Sparkline";

interface Props {
  node: Node;
  jobs: Job[];
  history: MetricPoint[];
  onClose: () => void;
}

function ResourceBar({
  label, used, total, unit, color
}: {
  label: string; used: number; total: number; unit: string; color: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="node-modal-resource">
      <div className="node-modal-resource-header">
        <span className="node-modal-resource-label">{label}</span>
        <span className="node-modal-resource-value" style={{ color }}>
          {used.toLocaleString()} / {total.toLocaleString()} {unit}
        </span>
        <span className="node-modal-resource-pct">{pct.toFixed(1)}%</span>
      </div>
      <div className="util-bar-track" style={{ height: 6 }}>
        <div
          className="util-bar-fill"
          style={{
            width: `${pct}%`,
            background: pct > 85 ? "var(--red)" : pct > 65 ? "var(--amber)" : color,
            height: 6,
          }}
        />
      </div>
    </div>
  );
}

export default function NodeModal({ node, jobs, history, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleOverlay(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const runningJobs = jobs.filter(
    (j) => j.assigned_node === node.node_id && j.status === "running"
  );

  const cpuUsed = node.total.cpu_millicores - node.available.cpu_millicores;
  const memUsed = node.total.memory_mb - node.available.memory_mb;
  const gpuUsed = node.total.gpu_memory_gb - node.available.gpu_memory_gb;

  const latest = history[history.length - 1];

  return (
    <div className="gantt-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="gantt-modal node-modal">

        {/* Header */}
        <div className="gantt-header">
          <div>
            <div className="gantt-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {node.name}
              <span className={node.healthy ? "badge badge-green" : "badge badge-red"}>
                {node.healthy ? "healthy" : "offline"}
              </span>
            </div>
            <div className="gantt-subtitle">
              {node.address} &nbsp;·&nbsp; ${node.cost_per_hour}/hr &nbsp;·&nbsp;
              {node.capabilities.map((c:any) => (
                <span key={c} className="cap-tag" style={{ marginLeft: 4 }}>{c}</span>
              ))}
            </div>
          </div>
          <button className="gantt-close" onClick={onClose}>✕</button>
        </div>

        <div className="node-modal-body">

          {/* ── Sparkline section ─────────────────────────────────── */}
          <div className="node-modal-section">
            <div className="node-modal-section-title">
              Resource History
              <span className="node-modal-section-sub">last 60 samples · 3s interval</span>
            </div>
            <div className="node-modal-sparkline-wrap">
              <Sparkline points={history} width={560} height={100} />
            </div>
            {!latest && (
              <div className="sparkline-empty">Collecting data — check back in a few seconds.</div>
            )}
          </div>

          {/* ── Current resource bars ─────────────────────────────── */}
          <div className="node-modal-section">
            <div className="node-modal-section-title">Current Resources</div>
            <div className="node-modal-resources">
              <ResourceBar
                label="CPU"
                used={cpuUsed}
                total={node.total.cpu_millicores}
                unit="m"
                color="var(--accent)"
              />
              <ResourceBar
                label="Memory"
                used={memUsed}
                total={node.total.memory_mb}
                unit="MB"
                color="var(--green)"
              />
              {node.total.gpu_memory_gb > 0 && (
                <ResourceBar
                  label="GPU VRAM"
                  used={gpuUsed}
                  total={node.total.gpu_memory_gb}
                  unit="GB"
                  color="var(--purple)"
                />
              )}
            </div>
          </div>

          {/* ── Running jobs ──────────────────────────────────────── */}
          <div className="node-modal-section">
            <div className="node-modal-section-title">
              Running Jobs
              <span className="node-modal-section-sub">{runningJobs.length} active</span>
            </div>
            {runningJobs.length === 0 ? (
              <div className="empty-state" style={{ padding: "16px 0", fontSize: 12 }}>
                No jobs currently running on this node.
              </div>
            ) : (
              <div className="node-modal-jobs">
                {runningJobs.map((job) => (
                  <div key={job.job_id} className="node-modal-job-row">
                    <div>
                      <span className="job-name" style={{ fontSize: 12 }}>{job.name}</span>
                      <span className="job-id" style={{ marginLeft: 8 }}>#{job.job_id}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="cap-tag">{job.job_type}</span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)"
                      }}>
                        {job.required.cpu_millicores}m CPU
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)"
                      }}>
                        {job.required.memory_mb}MB
                      </span>
                      {job.required.gpu_memory_gb > 0 && (
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--purple)"
                        }}>
                          {job.required.gpu_memory_gb}GB GPU
                        </span>
                      )}
                      <span className="badge badge-blue">p{job.priority}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Live stats ────────────────────────────────────────── */}
          <div className="gantt-stats" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Utilization</span>
              <span className="gantt-stat-value" style={{ color: "var(--accent)" }}>
                {node.utilization_percent}%
              </span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Cost/hr</span>
              <span className="gantt-stat-value" style={{ color: "var(--green)" }}>
                ${node.cost_per_hour}
              </span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Free CPU</span>
              <span className="gantt-stat-value">{node.available.cpu_millicores}m</span>
            </div>
            <div className="gantt-stat">
              <span className="gantt-stat-label">Free MEM</span>
              <span className="gantt-stat-value">{node.available.memory_mb} MB</span>
            </div>
            {node.total.gpu_memory_gb > 0 && (
              <div className="gantt-stat">
                <span className="gantt-stat-label">Free GPU</span>
                <span className="gantt-stat-value" style={{ color: "var(--purple)" }}>
                  {node.available.gpu_memory_gb} GB
                </span>
              </div>
            )}
            <div className="gantt-stat">
              <span className="gantt-stat-label">History pts</span>
              <span className="gantt-stat-value">{history.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
