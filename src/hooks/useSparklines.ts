import { useEffect, useRef, useState } from "react";
import type { Node } from "../api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MetricPoint {
  ts: number;          // unix ms
  cpu: number;         // utilization 0-100
  memory: number;      // utilization 0-100
  gpu: number;         // utilization 0-100
}

export type NodeHistory = Record<string, MetricPoint[]>;

const MAX_POINTS = 60;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSparklines(nodes: Node[]): NodeHistory {
  const [history, setHistory] = useState<NodeHistory>({});
  const prevNodes = useRef<Node[]>([]);

  useEffect(() => {
    if (nodes.length === 0) return;

    const ts = Date.now();

    setHistory((prev) => {
      const next: NodeHistory = { ...prev };

      for (const node of nodes) {
        const existing = next[node.node_id] ?? [];

        // CPU utilization
        const cpuUsed = node.total.cpu_millicores - node.available.cpu_millicores;
        const cpu = node.total.cpu_millicores > 0
          ? Math.min(100, (cpuUsed / node.total.cpu_millicores) * 100)
          : 0;

        // Memory utilization
        const memUsed = node.total.memory_mb - node.available.memory_mb;
        const memory = node.total.memory_mb > 0
          ? Math.min(100, (memUsed / node.total.memory_mb) * 100)
          : 0;

        // GPU utilization (0 if no GPU)
        const gpuUsed = node.total.gpu_memory_gb - node.available.gpu_memory_gb;
        const gpu = node.total.gpu_memory_gb > 0
          ? Math.min(100, (gpuUsed / node.total.gpu_memory_gb) * 100)
          : 0;

        const point: MetricPoint = { ts, cpu, memory, gpu };
        const updated = [...existing, point].slice(-MAX_POINTS);
        next[node.node_id] = updated;
      }

      return next;
    });

    prevNodes.current = nodes;
  }, [nodes]);

  return history;
}
