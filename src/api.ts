const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

export type JobType =
  | "llm_inference"
  | "embedding"
  | "fine_tuning"
  | "data_pipeline"
  | "general";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type SchedulingStrategy =
  | "best_fit"
  | "cheapest_fit"
  | "worst_fit"
  | "first_fit";

export interface Resource {
  cpu_millicores: number;
  memory_mb: number;
  gpu_memory_gb: number;
}

export interface Node {
  node_id: string;
  name: string;
  total: Resource;
  available: Resource;
  capabilities: JobType[];
  cost_per_hour: number;
  address: string;
  healthy: boolean;
  last_seen: string;
  running_task_ids: string[];
  utilization_percent: number;
}

export interface Job {
  job_id: string;
  name: string;
  job_type: JobType;
  required: Resource;
  priority: number;
  status: JobStatus;
  assigned_node: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  retry_count: number;
}

export interface ClusterMetrics {
  total_nodes: number;
  healthy_nodes: number;
  total_jobs: number;
  running_jobs: number;
  pending_jobs: number;
  completed_jobs: number;
  avg_utilization: number;
  total_cost_per_hour: number;
  cost_saved_today: number;
  active_strategy: SchedulingStrategy;
}

export interface JobSubmitRequest {
  name: string;
  job_type: JobType;
  required: Resource;
  priority: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── Health ─────────────────────────────────────────────────────────────────

export const health = () =>
  request<{ status: string; time: string }>("/health");

// ── Nodes ──────────────────────────────────────────────────────────────────

export const getNodes = () => request<Node[]>("/api/nodes");

export const removeNode = (nodeId: string) =>
  request<{ message: string }>(`/api/nodes/${nodeId}`, { method: "DELETE" });

// ── Jobs ───────────────────────────────────────────────────────────────────

export const getJobs = () => request<Job[]>("/api/jobs");

export const submitJob = (body: JobSubmitRequest) =>
  request<{ message: string; job_id: string; status: JobStatus }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const completeJob = (jobId: string) =>
  request<{ message: string; job_id: string }>(
    `/api/jobs/${jobId}/complete`,
    { method: "POST" }
  );

export const deleteJob = (jobId: string) =>
  request<{ message: string }>(`/api/jobs/${jobId}`, { method: "DELETE" });

// ── Metrics ────────────────────────────────────────────────────────────────

export const getMetrics = () => request<ClusterMetrics>("/api/metrics");

// ── Strategy ───────────────────────────────────────────────────────────────

export const setStrategy = (strategy: SchedulingStrategy) =>
  request<{ message: string; active: SchedulingStrategy }>(
    `/api/strategy/${strategy}`,
    { method: "POST" }
  );

// ── Demo ───────────────────────────────────────────────────────────────────

export const seedDemo = () =>
  request<{ message: string; nodes: string[] }>("/api/demo/seed", {
    method: "POST",
  });

export const compareStrategies = () =>
  request<{
    strategies: SchedulingStrategy[];
    jobs: {
      job_id: string;
      name: string;
      job_type: JobType;
      priority: number;
      required: Resource;
      placements: Record<SchedulingStrategy, {
        node: string | null;
        reason: string;
        est_cost: number | null;
      }>;
    }[];
    summary: Record<SchedulingStrategy, number>;
  }>("/api/compare");

export const failJob = (jobId: string) =>
  request<{ message: string; job_id: string }>(`/api/jobs/${jobId}/fail`, {
    method: "POST",
  });

export const retryJob = (jobId: string) =>
  request<{ message: string; job_id: string; retry_count: number }>(
    `/api/jobs/${jobId}/retry`,
    { method: "POST" }
  );
