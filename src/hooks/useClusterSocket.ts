import { useEffect, useRef, useState, useCallback } from "react";
import type { Node, Job, ClusterMetrics } from "../api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClusterState {
  nodes: Node[];
  jobs: Job[];
  metrics: ClusterMetrics | null;
  connected: boolean;
  lastUpdate: number | null;  // unix ms
}

const WS_URL = (process.env.REACT_APP_API_URL || "http://localhost:8000")
  .replace(/^http/, "ws") + "/ws";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY = 15000;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useClusterSocket(): [ClusterState, () => void] {
  const [state, setState] = useState<ClusterState>({
    nodes: [],
    jobs: [],
    metrics: null,
    connected: false,
    lastUpdate: null,
  });

  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(RECONNECT_DELAY_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unmounted      = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) return;
      reconnectDelay.current = RECONNECT_DELAY_MS; // reset backoff
      setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const data = JSON.parse(event.data);
        setState((s) => ({
          ...s,
          nodes:      data.nodes   ?? s.nodes,
          jobs:       data.jobs    ?? s.jobs,
          metrics:    data.metrics ?? s.metrics,
          lastUpdate: Date.now(),
        }));
      } catch (e) {
        console.warn("WS parse error", e);
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setState((s) => ({ ...s, connected: false }));
      // Exponential backoff reconnect
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 1.5,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => {
      ws.close(); // triggers onclose → reconnect
    };
  }, []);

  // Manual refresh — for after mutations (submit job, seed, etc.)
  const forceRefresh = useCallback(async () => {
    try {
      const [nodes, jobs, metrics] = await Promise.all([
        fetch((process.env.REACT_APP_API_URL || "http://localhost:8000") + "/api/nodes").then(r => r.json()),
        fetch((process.env.REACT_APP_API_URL || "http://localhost:8000") + "/api/jobs").then(r => r.json()),
        fetch((process.env.REACT_APP_API_URL || "http://localhost:8000") + "/api/metrics").then(r => r.json()),
      ]);
      setState((s) => ({
        ...s,
        nodes,
        jobs,
        metrics,
        lastUpdate: Date.now(),
      }));
    } catch {}
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return [state, forceRefresh];
}
