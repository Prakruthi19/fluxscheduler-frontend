# FluxScheduler — Frontend

React + TypeScript dashboard for [FluxScheduler](https://github.com/Prakruthi19/fluxscheduler-backend), a distributed job scheduler for AI workloads.
[Deployed Link](https://fluxscheduler-frontend.vercel.app/)
Built by **Prakruthi** — M.S. Computer Science, George Washington University.

---

## What it does

Real-time cluster control plane UI. Connects to the FluxScheduler backend over WebSocket and renders live cluster state — no polling, server pushes every 2 seconds.

**Features**

- **Live cluster dashboard** — node health, utilization bars, job counts, cost metrics
- **Job submission** — submit jobs with custom resource requirements (CPU, memory, GPU VRAM)
- **⚡ Simulate Load** — fires 6 realistic AI jobs (LLM inference, embedding, fine-tuning, data pipeline) across the cluster to demo scheduling in action
- **Strategy selector** — switch between `cheapest_fit`, `best_fit`, `worst_fit`, `first_fit` live
- **Strategy Comparison panel** — dry-runs all 4 strategies against current jobs, shows per-job node placement and cost diff without making any assignments
- **Gantt timeline modal** — click any job to see wall-clock timeline of all jobs across nodes, with hover tooltips and a live "now" cursor
- **Node metrics modal** — click any node to see CPU/memory/GPU sparklines (60-point rolling history), current resource bars, and running jobs
- **Job retry** — manually fail jobs, auto-retries once after 10s, manual retry after that
- **Job history** — full session audit trail with status filters

---

## Stack

| Layer | Tech |
|---|---|
| Framework | React 18 + TypeScript |
| State | WebSocket push via custom `useClusterSocket` hook |
| Charts | Pure SVG — no charting library |
| Styling | CSS custom properties, no UI framework |
| Deploy | Vercel |

---

## Getting started

**Prerequisites:** Node 18+, and the [FluxScheduler backend](https://github.com/Prakruthi19/fluxscheduler-backend) running on port 8000.

```bash
git clone https://github.com/prakruthi/fluxscheduler-frontend
cd fluxscheduler-frontend
npm install
```

Create a `.env` file:

```
REACT_APP_API_URL=http://localhost:8000
```

Start the dev server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Quick demo

1. Make sure the backend is running — `uvicorn app:app --reload --port 8000`
2. Click **Seed Demo** — registers 3 worker nodes (2 GPU, 1 CPU)
3. Click **⚡ Simulate Load** — submits 6 jobs, watch the scheduler assign them within 3 seconds
4. Click **▼ Run Comparison** — see which strategy is cheapest for the current workload
5. Click any node card → sparklines modal
6. Click any job row → Gantt timeline modal
7. Click `✗` on a running job → watch auto-retry fire after 10 seconds

---

## Project structure

```
src/
├── App.tsx               # Main dashboard, all layout and state wiring
├── App.css               # Design tokens and all component styles
├── api.ts                # Typed API client (REST + WebSocket URLs)
├── useClusterSocket.ts   # WebSocket hook with exponential backoff reconnect
├── useSparklines.ts      # Rolling metric history hook (60-point buffer per node)
├── Sparkline.tsx         # Pure SVG sparkline component (CPU/MEM/GPU)
├── GanttModal.tsx        # Job timeline modal (wall clock, all nodes)
├── NodeModal.tsx         # Node metrics modal (sparklines + resource bars)
├── ComparePanel.tsx      # Collapsible strategy comparison panel
├── index.tsx             # React entry point
└── index.css             # Google Fonts import
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `REACT_APP_API_URL` | `http://localhost:8000` | Backend base URL (HTTP + WS) |

For production set this to your deployed backend URL in `.env.production`.

---

## Deploying to Vercel

```bash
npm run build
vercel --prod
```

Set `REACT_APP_API_URL` in Vercel's environment variable settings to your backend URL (Railway, Render, etc.).

---

## Related

- **[fluxscheduler-backend](https://github.com/Prakruthi19/fluxscheduler-backend)** — FastAPI control plane with 4 scheduling algorithms, WebSocket broadcast, and REST API
- **[distributed-scheduler](https://github.com/Prakruthi19/distributed-scheduler)** — original Go/gRPC prototype this was built from
