import { useEffect, useRef, useState, useCallback } from "react";
import type { Node, Job, ClusterMetrics } from "../api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClusterState {
  nodes: Node[];
  jobs: Job[];
  metrics: ClusterMetrics | null;
  connected: boolean;
  lastUpdate: number | null;
}

const BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const POLL_MS = 2000;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useClusterSocket(): [ClusterState, () => void] {
  const [state, setState] = useState<ClusterState>({
    nodes: [],
    jobs: [],
    metrics: null,
    connected: false,
    lastUpdate: null,
  });

  const unmounted = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const [nodes, jobs, metrics] = await Promise.all([
        fetch(`${BASE}/api/nodes`).then((r) => r.json()),
        fetch(`${BASE}/api/jobs`).then((r) => r.json()),
        fetch(`${BASE}/api/metrics`).then((r) => r.json()),
      ]);
      if (unmounted.current) return;
      setState({
        nodes,
        jobs,
        metrics,
        connected: true,
        lastUpdate: Date.now(),
      });
    } catch {
      if (!unmounted.current)
        setState((s) => ({ ...s, connected: false }));
    }
  }, []);

  useEffect(() => {
    unmounted.current = false;
    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => {
      unmounted.current = true;
      clearInterval(id);
    };
  }, [fetchAll]);

  return [state, fetchAll];
}