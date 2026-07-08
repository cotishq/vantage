# Vantage

**Vantage** is a prediction market intelligence dashboard built as a probation submission assignment. It tracks, parses, and scores the performance of top Polymarket traders in real-time, providing deep insights into cohort positioning, recent trade activity, and trending markets.

### Live Deployments
- **Live Frontend (Vercel)**: [https://vantage-mauve-tau.vercel.app/](https://vantage-mauve-tau.vercel.app/)
- **Live Backend API (Render)**: [https://vantage-backend.onrender.com](https://vantage-backend.onrender.com)

---

## Project Context

- **Purpose**: Built as a specialized submission assignment to evaluate engineering capabilities, data architecture decisions, and frontend UX execution.
- **Scope & Platform Strategy**: Focused exclusively on **Polymarket** tracking. During initial design, integrations with other prediction platforms (such as Kalshi and OpinionLabs) were analyzed but intentionally deferred to prioritize high reliability, data enrichment quality, and premium UX for the core Polymarket trader cohort.
- **Timeline**: Built and refined over a focused 1 week sprint.

---

## Features & Algorithms

### 1. Leaderboard Scoring & Risk Filters
* **Leaderboard Score (0-100)**: Ranks traders on risk-adjusted profitability. Weighted as:
  * **Consistency (25%)**: Ratio of positive trading days to active days.
  * **Cohort-Normalized PnL (25%)**: Profit normalized relative to the cohort min and max PnL.
  * **Win Rate (20%)**: Percentage of resolved positions that closed in profit.
  * **Inverted Cohort-Normalized Max Loss (15%)**: Penalizes massive single-position drawdowns.
  * **Normalized Profit Factor (15%)**: Gross win volume divided by gross loss volume (clamped using a divisor of 10).
* **Sharpe Ratio**: Computed from daily net transaction flows inside `trader_activity` as $\text{Mean} / \text{StdDev}$. Identifies steady-return traders with low day-to-day volatility.

### 2. Consensus Signals & Confidence Score
* **Consensus Engine**: Aggregates active positions where profitable tracked traders hold the same outcome side, exposing where the "smart money" is co-investing.
* **Weighted Confidence Score (0-100)**: Evaluates opportunity strength:
  * **Trader Count (40% Weight)**: $\min(\text{trader\\_count} / 20.0, 1.0) \times 100$ (maxed at 20+ traders).
  * **ROI Score (30% Weight)**: $\min(\max(\text{roi}, 0.0), 1.0) \times 100$ (rewards early cohort entry, capped at 100% ROI).
  * **Recency Score (30% Weight)**: $\min(\text{buys\\_24h} / 50.0, 1.0) \times 100$ (rewards active buy momentum in the last 24 hours).

---


## Decisions & Debug Log

This log documents critical engineering choices, bugs resolved, and structural tradeoffs made during development:

### 1. Auto-Healing Schema Migrations (Production Crash Fix)
- **Problem**: In production, the `/positions` endpoint initially crashed because the database schema was missing columns (`cur_price` and `slug` in the `trader_positions` table), whereas they were present in the local database.
- **Resolution**: Instead of relying on manual production database console changes, we implemented automatic DB migrations inside `cmd/server/main.go`. On server boot, a schema catalog checker queries `information_schema.columns` and runs dynamic `ALTER TABLE` statements to auto-heal missing schema components. This ensures deployment parity across local, staging, and production.

### 2. Today's P&L Cohort Size Divergence
- **Observation**: The local environment reported a "Today P&L" of **$3.88M** while the production environment reported **$3.19M**.
- **Analysis**: Investigated the database state and confirmed this discrepancy is due to cohort sizing. The local database has **220** tracked proxy wallets, whereas the production cohort size has **180** wallets. The scoring engine calculates values accurately based on the active cohort size in the respective database.

### 3. Separation of Positions and Activity Snapshots
- **Design Decision**: Kept the `trader_positions` snapshots table separate from the `trader_activity` event log table. Position updates are upserted when user positions sync, while activity records sequential trade events. This design choice prevents race conditions, simplifies database locks, and enables high-performance reads when calculating YES/NO smart money allocations.

### 4. Closed Markets Gamma API Fallback
- **Problem**: The Polymarket Gamma API `/markets` endpoint excludes closed/resolved markets by default. This caused closed trending markets to render with missing dates or broken count labels.
- **Resolution**: Built a fallback routing mechanism in the internal client library (`internal/polymarket/markets.go`). If a market query returns empty, the client batches and retries queries using the `closed=true` parameter.

---

## Known Limitations & Tradeoffs

- **All-Time Metrics in Leaderboard Table**: 
  While the **P&L** and **Sharpe ratio** dynamically adjust to the selected time window (Day, Week, Month, All-Time) based on historical snapshots, auxiliary metrics like **Score, Win Rate, Max Loss, and Profit Factor** display all-time aggregates due to schema indexing constraints. A warning note has been integrated into the frontend UI to ensure user clarity.
- **API Rate Limiting**:
  To prevent getting rate-limited by the Polymarket Gamma API, metadata fetching is batched on the Go backend using concurrent HTTP request pools.

---

## Folder Structure

```text
├── cmd/
│   └── server/          # Go backend server entry point (main.go)
├── internal/
│   ├── api/             # REST API endpoint handlers (leaderboard, trades, positions)
│   ├── polymarket/      # Internal Client wrapper for Polymarket Gamma API metadata
│   ├── scoring/         # Metric scoring algorithms (Sharpe ratio, win rates)
│   └── store/           # Database setup and PostgreSQL queries
├── migrations/          # DB initialization schemas and auto-migration scripts
├── web/                 # Next.js frontend application (React, Tailwind CSS, next-themes)
└── README.md
```

---

## Local Running Instructions

### 1. Prerequisites
- Go 1.21+
- Node.js 18+ (npm)
- Docker (for database instance)

### 2. Run Database
Ensure you have a local PostgreSQL instance running:
```bash
docker start vantage-pg
```

### 3. Run Backend Server
Ensure you have a `.env` file in the root directory:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/vantage?sslmode=disable
PORT=8081
```
Start the Go server:
```bash
go run ./cmd/server
```

### 4. Run Frontend
Navigate to the web folder and launch the development server:
```bash
cd web
npm install
npm run dev
```

---

## Future Roadmap

If given more time, these are the key features I would implement next:
1. **Multi-Platform Normalization**: Add APIs for **Kalshi** and **OpinionLabs**, wrapping them in a unified adapter design pattern to merge trader positions across multiple prediction markets.
2. **Per-Window Score Reconstruction**: Store historical scoring parameters in the DB, allowing Score, Win Rate, and Profit Factor to reconstruct historically per selected window.
3. **WebSockets Stream**: Stream recent trade events in real-time as they hit the backend database using WebSockets, replacing the current 15-second HTTP polling loop.
