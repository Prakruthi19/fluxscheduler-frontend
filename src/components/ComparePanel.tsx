import React, { useState } from "react";
import * as api from "../api";
import type { SchedulingStrategy } from "../api";

// ── Types ──────────────────────────────────────────────────────────────────

interface Placement {
  node: string | null;
  reason: string;
  est_cost: number | null;
}

interface CompareJob {
  job_id: string;
  name: string;
  job_type: string;
  priority: number;
  placements: Record<SchedulingStrategy, Placement>;
}

interface CompareResult {
  strategies: SchedulingStrategy[];
  jobs: CompareJob[];
  summary: Record<SchedulingStrategy, number>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STRATEGY_DESC: Record<SchedulingStrategy, string> = {
  cheapest_fit: "Minimize cost",
  best_fit:     "Pack nodes tight",
  worst_fit:    "Spread load",
  first_fit:    "First eligible",
};

const STRATEGY_COLOR: Record<SchedulingStrategy, string> = {
  cheapest_fit: "var(--green)",
  best_fit:     "var(--accent)",
  worst_fit:    "var(--purple)",
  first_fit:    "var(--amber)",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function ComparePanel() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<CompareResult | null>(null);
  const [error, setError]     = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  async function runComparison() {
    setLoading(true);
    setError("");
    try {
      const data = await api.compareStrategies();
      setResult(data);
      setOpen(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    if (!open && !result) {
      runComparison();
      console.log("Running comparison…");
    } else {
      setOpen((o) => !o);
    }
  }

  // Find cheapest strategy in summary
  const cheapestStrategy = result
    ? (Object.entries(result.summary).sort(([, a], [, b]) => a - b)[0]?.[0] as SchedulingStrategy)
    : null;

  return (
    <div className="compare-panel">

      {/* ── Header / toggle ───────────────────────────────────────────── */}
      <div className="compare-header" onClick={toggleOpen}>
        <div className="compare-header-left">
          <span className="compare-icon">⚖</span>
          <div>
            <div className="section-title">Strategy Comparison</div>
            <div className="compare-subtitle">
              Dry-run all 4 strategies against current jobs — no assignments made
            </div>
          </div>
        </div>
        <div className="compare-header-right">
          {result && !open && cheapestStrategy && (
            <span className="compare-winner-pill">
              cheapest: {cheapestStrategy}
            </span>
          )}
          <button
            className="compare-toggle-btn"
            onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
            disabled={loading}
          >
            {loading ? "Running…" : open ? "▲ Collapse" : "▼ Run Comparison"}
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {open && (
        <div className="compare-body">
          {error && (
            <div className="compare-error">{error}</div>
          )}

          {result && result.jobs.length === 0 && (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              No pending or running jobs to compare. Submit some jobs first.
            </div>
          )}

          {result && result.jobs.length > 0 && (
            <>
              {/* ── Summary bar ──────────────────────────────────────── */}
              <div className="compare-summary">
                {result.strategies.map((s) => {
                  const cost = result.summary[s];
                  const isCheapest = s === cheapestStrategy;
                  return (
                    <div
                      key={s}
                      className={`compare-summary-card ${isCheapest ? "winner" : ""}`}
                      style={{ borderColor: isCheapest ? STRATEGY_COLOR[s] : undefined }}
                    >
                      {isCheapest && (
                        <div className="compare-winner-tag" style={{ color: STRATEGY_COLOR[s] }}>
                          ★ cheapest
                        </div>
                      )}
                      <div
                        className="compare-summary-name"
                        style={{ color: STRATEGY_COLOR[s] }}
                      >
                        {s}
                      </div>
                      <div className="compare-summary-desc">{STRATEGY_DESC[s]}</div>
                      <div className="compare-summary-cost">
                        ${cost.toFixed(5)}
                        <span className="compare-summary-unit">/hr slice</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Savings callout ───────────────────────────────────── */}
              {(() => {
                const costs = Object.values(result.summary);
                const max   = Math.max(...costs);
                const min   = Math.min(...costs);
                const saved = max - min;
                if (saved <= 0) return null;
                return (
                  <div className="compare-savings-bar">
                    <span className="compare-savings-label">Potential savings</span>
                    <span className="compare-savings-value">
                      ${saved.toFixed(5)}/hr vs worst strategy
                    </span>
                    <span className="compare-savings-pct">
                      ({((saved / max) * 100).toFixed(1)}% reduction)
                    </span>
                  </div>
                );
              })()}

              {/* ── Per-job breakdown ─────────────────────────────────── */}
              <div className="compare-jobs-label">Per-job placement breakdown</div>
              <div className="compare-jobs">
                {result.jobs.map((job) => {
                  const isExpanded = expandedJob === job.job_id;
                  return (
                    <div key={job.job_id} className="compare-job">

                      {/* Job header row */}
                      <div
                        className="compare-job-header"
                        onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                      >
                        <div className="compare-job-meta">
                          <span className="job-name">{job.name}</span>
                          <span className="job-id">#{job.job_id}</span>
                          <span className="cap-tag">{job.job_type}</span>
                          <span className="cap-tag">p{job.priority}</span>
                        </div>

                        {/* Compact node pills per strategy */}
                        <div className="compare-job-pills">
                          {result.strategies.map((s) => {
                            const p = job.placements[s];
                            return (
                              <span
                                key={s}
                                className="compare-node-pill"
                                style={{ borderColor: STRATEGY_COLOR[s], color: STRATEGY_COLOR[s] }}
                                title={`${s}: ${p.reason}`}
                              >
                                {p.node ?? "none"}
                              </span>
                            );
                          })}
                        </div>

                        <span className="compare-chevron">{isExpanded ? "▲" : "▼"}</span>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="compare-job-detail">
                          {result.strategies.map((s) => {
                            const p = job.placements[s];
                            return (
                              <div key={s} className="compare-detail-row">
                                <span
                                  className="compare-detail-strategy"
                                  style={{ color: STRATEGY_COLOR[s] }}
                                >
                                  {s}
                                </span>
                                <span className="compare-detail-node">
                                  {p.node ?? <span style={{ color: "var(--red)" }}>no node</span>}
                                </span>
                                <span className="compare-detail-reason">{p.reason}</span>
                                <span className="compare-detail-cost">
                                  {p.est_cost !== null
                                    ? `$${p.est_cost.toFixed(5)}/hr`
                                    : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Refresh button */}
              <button
                className="btn-ghost"
                style={{ marginTop: 12, fontSize: 12 }}
                onClick={runComparison}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "↻ Re-run comparison"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
