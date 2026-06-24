import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import * as api from "./api";
import GanttModal from "./components/GanttModal";
import ComparePanel from "./components/ComparePanel";
import NodeModal from "./components/NodeModal";
import { useSparklines } from "./hooks/useSparklines";
import { useClusterSocket } from "./hooks/useClusterSocket";
import type {
  Node,
  Job,
  ClusterMetrics,
  JobSubmitRequest,
  JobType,
  SchedulingStrategy,
} from "./api";

// ── Constants ──────────────────────────────────────────────────────────────

const STRATEGIES: { value: SchedulingStrategy; label: string; hint: string }[] = [
  { value: "cheapest_fit", label: "cheapest_fit", hint: "Minimize cost" },
  { value: "best_fit",     label: "best_fit",     hint: "Pack nodes tight" },
  { value: "worst_fit",    label: "worst_fit",    hint: "Spread load" },
  { value: "first_fit",    label: "first_fit",    hint: "First eligible" },
];

const JOB_TYPES: JobType[] = [
  "llm_inference",
  "embedding",
  "fine_tuning",
  "data_pipeline",
  "general",
];

const STATUS_BADGE: Record<string, string> = {
  pending:   "badge badge-amber",
  running:   "badge badge-blue",
  completed: "badge badge-green",
  failed:    "badge badge-red",
};

const TYPE_BADGE: Record<string, string> = {
  llm_inference: "badge badge-purple",
  embedding:     "badge badge-blue",
  fine_tuning:   "badge badge-amber",
  data_pipeline: "badge badge-green",
  general:       "badge",
};

// Realistic demo job names per type
// Resource values are intentionally conservative so multiple jobs fit
// on the seeded nodes simultaneously:
//   gpu-worker-01: 8000m CPU, 32768MB RAM, 40GB GPU
//   gpu-worker-02: 4000m CPU, 16384MB RAM, 16GB GPU
//   cpu-worker-01: 32000m CPU, 65536MB RAM, 0GB GPU
const DEMO_JOBS: Record<JobType, { names: string[]; cpu: number; mem: number; gpu: number }> = {
  llm_inference: {
    names: ["infer-gpt4-batch", "llm-serve-req", "inference-queue-flush", "chat-completion-run"],
    cpu: 1000, mem: 2048, gpu: 4,
  },
  embedding:     {
    names: ["embed-docs-v2", "vectorize-corpus", "embed-batch-42", "semantic-index-run"],
    cpu: 500, mem: 1024, gpu: 2,
  },
  fine_tuning:   {
    names: ["finetune-llama3", "lora-train-run", "qlora-adapt-v1", "finetune-epoch-3"],
    cpu: 1000, mem: 4096, gpu: 4,
  },
  data_pipeline: {
    names: ["etl-ingest-run", "pipeline-clean-v3", "feature-extract-job", "data-transform-batch"],
    cpu: 1000, mem: 2048, gpu: 0,
  },
  general:       {
    names: ["health-check-job", "cron-task-run", "cleanup-artifacts", "batch-process-v2"],
    cpu: 500, mem: 512, gpu: 0,
  },
};

// ── Small helpers ──────────────────────────────────────────────────────────

function utilClass(pct: number) {
  if (pct >= 90) return "critical";
  if (pct >= 70) return "high";
  return "";
}

function fmtDuration(s: number | null) {
  if (s === null) return "—";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function fmtCPU(mc: number) {
  return mc >= 1000 ? `${mc / 1000} CPU` : `${mc}m`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Default form state ─────────────────────────────────────────────────────

const EMPTY_FORM: JobSubmitRequest = {
  name: "",
  job_type: "general",
  required: { cpu_millicores: 1000, memory_mb: 2048, gpu_memory_gb: 0 },
  priority: 5,
};

// ── History entry (client-side only) ──────────────────────────────────────

interface HistoryEntry {
  job_id: string;
  name: string;
  job_type: JobType;
  status: "pending" | "running" | "completed" | "failed";
  assigned_node: string | null;
  priority: number;
  submitted_at: string;
  duration_seconds: number | null;
  cpu_millicores: number;
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [{ nodes, jobs, metrics, connected, lastUpdate }, refresh] = useClusterSocket();
  const [form, setForm]       = useState<JobSubmitRequest>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [toast, setToast]     = useState("");
  const [seeding, setSeeding] = useState(false);
  const [ganttJob, setGanttJob]   = useState<Job | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histFilter, setHistFilter] = useState<"all" | "pending" | "running" | "completed" | "failed">("all");
  const toastTimer            = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoRetried             = useRef<Set<string>>(new Set());
  const sparkHistory          = useSparklines(nodes);
  const prevJobIds            = useRef<Set<string>>(new Set());

  // ── WebSocket drives state; sync history whenever jobs change ───────────
  useEffect(() => {
    if (jobs.length === 0) return;
    setHistory((prev) => {
      const map = new Map(prev.map((h) => [h.job_id, h]));
      for (const job of jobs) {
        map.set(job.job_id, {
          job_id: job.job_id,
          name: job.name,
          job_type: job.job_type,
          status: job.status,
          assigned_node: job.assigned_node,
          priority: job.priority,
          submitted_at: job.created_at,
          duration_seconds: job.duration_seconds,
          cpu_millicores: job.required.cpu_millicores,
        });
      }
      for (const h of prev) {
        if (!map.has(h.job_id)) map.set(h.job_id, h);
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );
    });
    prevJobIds.current = new Set(jobs.map((j) => j.job_id));
  }, [jobs]);

  // ── Auto-retry: once per failed job, after 10s ────────────────────────
  useEffect(() => {
    const failedJobs = jobs.filter(
      (j) => j.status === "failed" && j.retry_count === 0
    );
    for (const job of failedJobs) {
      if (autoRetried.current.has(job.job_id)) continue;
      autoRetried.current.add(job.job_id);
      showToast(`Auto-retrying ${job.name} in 10s…`);
      setTimeout(async () => {
        try {
          await api.retryJob(job.job_id);
          showToast(`↻ ${job.name} requeued (auto-retry)`);
          refresh();
        } catch {
          showToast(`Auto-retry failed for ${job.name}`);
        }
      }, 10000);
    }
  }, [jobs]);

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  // ── Strategy ─────────────────────────────────────────────────────────────

  async function handleStrategy(s: SchedulingStrategy) {
    await api.setStrategy(s);
    refresh();
  }

  // ── Seed demo ─────────────────────────────────────────────────────────────

  async function handleSeed() {
    setSeeding(true);
    try {
      await api.seedDemo();
      showToast("Cluster seeded with 3 demo nodes");
      refresh();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSeeding(false);
    }
  }

  // ── Simulate Load ─────────────────────────────────────────────────────────

  async function handleSimulate() {
    setSimulating(true);
    showToast("Simulating 6 jobs across all types…");
    const types = Object.keys(DEMO_JOBS) as JobType[];
    // Submit 6 jobs with a small stagger so it looks live on camera
    for (let i = 0; i < 6; i++) {
      const type = types[i % types.length];
      const cfg  = DEMO_JOBS[type];
      const name = randomItem(cfg.names) + `-${Date.now().toString(36).slice(-4)}`;
      try {
        await api.submitJob({
          name,
          job_type: type,
          required: {
            cpu_millicores: cfg.cpu,
            memory_mb: cfg.mem,
            gpu_memory_gb: cfg.gpu,
          },
          priority: Math.ceil(Math.random() * 10),
        });
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    await refresh();
    showToast("6 jobs submitted — watch the scheduler assign them!");
    setSimulating(false);
  }

  // ── Job submit ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.submitJob(form);
      showToast(`Job ${res.job_id} submitted`);
      setForm(EMPTY_FORM);
      refresh();
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function setResource(field: keyof JobSubmitRequest["required"], value: string) {
    setForm((f) => ({
      ...f,
      required: { ...f.required, [field]: Number(value) },
    }));
  }

  // ── Node / job actions ────────────────────────────────────────────────────

  async function handleRemoveNode(nodeId: string) {
    await api.removeNode(nodeId);
    refresh();
  }

  async function handleCompleteJob(jobId: string) {
    await api.completeJob(jobId);
    refresh();
  }

  async function handleDeleteJob(jobId: string) {
    await api.deleteJob(jobId);
    refresh();
  }

  async function handleFailJob(jobId: string, name: string) {
    await api.failJob(jobId);
    showToast(`${name} marked as failed`);
    refresh();
  }

  async function handleRetryJob(jobId: string, name: string) {
    await api.retryJob(jobId);
    showToast(`↻ ${name} requeued`);
    refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeStrategy = metrics?.active_strategy ?? "cheapest_fit";
  const filteredHistory = histFilter === "all"
    ? history
    : history.filter((h) => h.status === histFilter);

  const histCounts = {
    all: history.length,
    pending: history.filter(h => h.status === "pending").length,
    running: history.filter(h => h.status === "running").length,
    completed: history.filter(h => h.status === "completed").length,
    failed: history.filter(h => h.status === "failed").length,
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.9" />
            <rect x="12" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5" />
            <rect x="1" y="12" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.5" />
            <rect x="12" y="12" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.3" />
          </svg>
          FluxScheduler
        </div>
        <div className="header-divider" />
        <span className="header-tag">Cluster Control Plane</span>
        <div className="header-spacer" />
        <div className="header-status">
          <div className={`pulse-dot ${connected ? "" : "offline"}`} />
          {connected ? "live" : "disconnected"}
          {lastUpdate && (
            <span className="header-lastseen">
              {Math.round((Date.now() - lastUpdate) / 1000)}s ago
            </span>
          )}
        </div>
      </header>

      <main className="main">

        {/* ── Metrics row ─────────────────────────────────────────────── */}
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Healthy Nodes</span>
            <span className={`metric-value ${metrics && metrics.healthy_nodes > 0 ? "green" : ""}`}>
              {metrics?.healthy_nodes ?? "—"}/{metrics?.total_nodes ?? "—"}
            </span>
            <span className="metric-sub">
              ${metrics?.total_cost_per_hour.toFixed(2) ?? "0.00"}/hr cluster cost
            </span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Avg Utilization</span>
            <span className={`metric-value ${(metrics?.avg_utilization ?? 0) > 70 ? "amber" : "accent"}`}>
              {metrics?.avg_utilization ?? 0}%
            </span>
            <span className="metric-sub">across healthy nodes</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Running Jobs</span>
            <span className="metric-value accent">{metrics?.running_jobs ?? 0}</span>
            <span className="metric-sub">{metrics?.pending_jobs ?? 0} pending</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Completed</span>
            <span className="metric-value green">{metrics?.completed_jobs ?? 0}</span>
            <span className="metric-sub">total jobs processed</span>
          </div>

          <div className="metric-card">
            <span className="metric-label">Cost Saved</span>
            <span className="metric-value purple">
              ${metrics?.cost_saved_today.toFixed(4) ?? "0.0000"}
            </span>
            <span className="metric-sub">vs. naive scheduling</span>
          </div>
        </div>

        {/* ── Strategy selector ──────────────────────────────────────── */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">Scheduling Strategy</span>
          </div>
          <div className="strategy-bar">
            {STRATEGIES.map((s) => (
              <button
                key={s.value}
                className={`strategy-btn ${activeStrategy === s.value ? "active" : ""}`}
                onClick={() => handleStrategy(s.value)}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Strategy Comparison ───────────────────────────────────── */}
        <ComparePanel />

        {/* ── Two-column: Nodes + Submit ─────────────────────────────── */}
        <div className="two-col">

          {/* Nodes */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">Worker Nodes</span>
              <div className="seed-row">
                {toast && <span className="toast">{toast}</span>}
                <button
                  className="btn-ghost"
                  onClick={handleSeed}
                  disabled={seeding}
                >
                  {seeding ? "Seeding…" : "Seed Demo"}
                </button>
              </div>
            </div>

            {nodes.length === 0 ? (
              <div className="empty-state">
                No nodes registered.
                <br />Click "Seed Demo" to spin up a test cluster.
              </div>
            ) : (
              <div className="node-list">
                {nodes.map((node) => (
                  <div className="node-card clickable-row" key={node.node_id} onClick={() => setSelectedNode(node)} title="Click to view metrics">
                    <div className="node-row">
                      <span className="node-name">{node.name}</span>
                      <span className={node.healthy ? "badge badge-green" : "badge badge-red"}>
                        {node.healthy ? "healthy" : "offline"}
                      </span>
                    </div>

                    <div className="util-bar-wrap">
                      <div className="util-bar-track">
                        <div
                          className={`util-bar-fill ${utilClass(node.utilization_percent)}`}
                          style={{ width: `${node.utilization_percent}%` }}
                        />
                      </div>
                      <span className="util-pct">{node.utilization_percent}%</span>
                    </div>

                    <div className="caps-row">
                      {node.capabilities.map((c: any) => (
                        <span key={c} className="cap-tag">{c}</span>
                      ))}
                    </div>

                    <div className="node-footer">
                      <span className="node-addr">
                        {node.address} &nbsp;·&nbsp;
                        <span className="cost-tag">${node.cost_per_hour}/hr</span>
                      </span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                          {fmtCPU(node.available.cpu_millicores)} free
                        </span>
                        <button
                          className="icon-btn"
                          onClick={() => handleRemoveNode(node.node_id)}
                          title="Remove node"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit job */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">Submit Job</span>
              <button
                className="btn-simulate"
                onClick={handleSimulate}
                disabled={simulating || nodes.length === 0}
                title="Submit 6 realistic jobs across all types"
              >
                {simulating ? "Simulating…" : "⚡ Simulate Load"}
              </button>
            </div>

            <form className="job-form" onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Job Name</label>
                  <input
                    type="text"
                    placeholder="e.g. embed-batch-42"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label>Job Type</label>
                  <select
                    value={form.job_type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, job_type: e.target.value as JobType }))
                    }
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Priority (1–10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priority: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 4 }}>
                Resource Requirements
              </div>

              <div className="resource-row">
                <div className="field">
                  <label>CPU (millicores)</label>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={form.required.cpu_millicores}
                    onChange={(e) => setResource("cpu_millicores", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Memory (MB)</label>
                  <input
                    type="number"
                    min={128}
                    step={128}
                    value={form.required.memory_mb}
                    onChange={(e) => setResource("memory_mb", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>GPU VRAM (GB)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.required.gpu_memory_gb}
                    onChange={(e) => setResource("gpu_memory_gb", e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || !form.name.trim()}
              >
                {submitting ? "Submitting…" : "→ Submit Job"}
              </button>
            </form>
          </div>
        </div>

        {/* ── Active Jobs table ──────────────────────────────────────── */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">
              Active Jobs &nbsp;
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                ({jobs.filter(j => j.status !== "completed").length} live)
              </span>
            </span>
          </div>

          {jobs.filter(j => j.status !== "completed").length === 0 ? (
            <div className="empty-state">No active jobs. Submit one or click "⚡ Simulate Load".</div>
          ) : (
            <div className="jobs-table-wrap">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Node</th>
                    <th>Priority</th>
                    <th>Running for</th>
                    <th>CPU req</th>
                    <th>Retries</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.filter(j => j.status !== "completed").map((job) => (
                    <tr key={job.job_id} className="clickable-row" onClick={() => setGanttJob(job)} title="Click to view timeline">
                      <td>
                        <div className="job-name">{job.name}</div>
                        <div className="job-id">#{job.job_id}</div>
                      </td>
                      <td>
                        <span className={TYPE_BADGE[job.job_type] ?? "badge"}>
                          {job.job_type}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_BADGE[job.status] ?? "badge"}>
                          {job.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {job.assigned_node ?? "—"}
                      </td>
                      <td style={{ color: "var(--text-dim)" }}>{job.priority}</td>
                      <td>{fmtDuration(job.duration_seconds)}</td>
                      <td>{fmtCPU(job.required.cpu_millicores)}</td>
                      <td>
                        {job.retry_count > 0
                          ? <span className="badge badge-amber">↻ {job.retry_count}</span>
                          : <span style={{color:"var(--text-muted)"}}>—</span>}
                      </td>
                      <td>
                        <div className="actions-cell">
                          {job.status === "running" && (
                            <button
                              className="icon-btn"
                              onClick={(e) => { e.stopPropagation(); handleCompleteJob(job.job_id); }}
                              title="Mark complete"
                            >
                              ✓
                            </button>
                          )}
                          {(job.status === "running" || job.status === "pending") && (
                            <button
                              className="icon-btn icon-btn-warn"
                              onClick={(e) => { e.stopPropagation(); handleFailJob(job.job_id, job.name); }}
                              title="Mark as failed"
                            >
                              ✗
                            </button>
                          )}
                          {job.status === "failed" && (
                            <button
                              className="icon-btn icon-btn-retry"
                              onClick={(e) => { e.stopPropagation(); handleRetryJob(job.job_id, job.name); }}
                              title={job.retry_count > 0 ? `Retry again (retried ${job.retry_count}x)` : "Retry job"}
                            >
                              ↻{job.retry_count > 0 ? ` ${job.retry_count}` : ""}
                            </button>
                          )}
                          <button
                            className="icon-btn"
                            onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.job_id); }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Job History ────────────────────────────────────────────── */}
        <div className="card">
          <div className="section-header">
            <span className="section-title">
              Job History &nbsp;
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                ({history.length} total)
              </span>
            </span>
            <div className="hist-filters">
              {(["all", "running", "pending", "completed", "failed"] as const).map((f) => (
                <button
                  key={f}
                  className={`hist-filter-btn ${histFilter === f ? "active" : ""}`}
                  onClick={() => setHistFilter(f)}
                >
                  {f}
                  {histCounts[f] > 0 && (
                    <span className="hist-count">{histCounts[f]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="empty-state">
              {history.length === 0
                ? "No jobs submitted yet. Submit a job or simulate load to see history here."
                : `No ${histFilter} jobs.`}
            </div>
          ) : (
            <div className="jobs-table-wrap">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Job</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Node</th>
                    <th>Priority</th>
                    <th>Duration</th>
                    <th>CPU</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((h) => (
                    <tr key={h.job_id}>
                      <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {fmtTime(h.submitted_at)}
                      </td>
                      <td>
                        <div className="job-name">{h.name}</div>
                        <div className="job-id">#{h.job_id}</div>
                      </td>
                      <td>
                        <span className={TYPE_BADGE[h.job_type] ?? "badge"}>
                          {h.job_type}
                        </span>
                      </td>
                      <td>
                        <span className={STATUS_BADGE[h.status] ?? "badge"}>
                          {h.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {h.assigned_node ?? "—"}
                      </td>
                      <td style={{ color: "var(--text-dim)" }}>{h.priority}</td>
                      <td>{fmtDuration(h.duration_seconds)}</td>
                      <td>{fmtCPU(h.cpu_millicores)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>

      {/* ── Node Modal ────────────────────────────────────────────── */}
      {selectedNode && (
        <NodeModal
          node={selectedNode}
          jobs={jobs}
          history={sparkHistory[selectedNode.node_id] ?? []}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* ── Gantt Modal ────────────────────────────────────────────── */}
      {ganttJob && (
        <GanttModal
          selectedJob={ganttJob}
          allJobs={jobs}
          onClose={() => setGanttJob(null)}
        />
      )}
    </div>
  );
}
