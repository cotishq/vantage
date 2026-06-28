# Vantage — Context for AI assistance

## What this is
A Polymarket trader leaderboard + recent trades app, built in Go + Next.js
for a 1-week job assignment (modeled after predicting.top). Trending Markets
feature was scoped out given the timeline (see Known limitations).

## Stack
- Backend: Go, chi router, pgx (raw SQL, no ORM), Postgres
- Frontend: Next.js (App Router, TypeScript), Tailwind, shadcn/ui
- No auth needed — Polymarket's Gamma + Data APIs are fully public
- Backend runs on :8081, frontend dev server on :3001 (CORS configured to allow this origin)

## API references
- Data API base: https://data-api.polymarket.com
- Leaderboard: GET /v1/leaderboard?category=&timePeriod=&orderBy=&limit=&offset=
  Response fields: rank (string!), proxyWallet, userName, vol, pnl, profileImage,
  xUsername, verifiedBadge
- Positions: GET /positions?user=<wallet>
  Response fields: proxyWallet, asset, conditionId, size, avgPrice, initialValue,
  currentValue, cashPnl, percentPnl, totalBought, realizedPnl, curPrice, redeemable,
  title, slug, outcome, outcomeIndex
- Activity: GET /activity?user=<wallet>&type=TRADE,SPLIT,MERGE,REDEEM,REWARD,CONVERSION
  Response fields: proxyWallet, side, asset, conditionId, size, price, timestamp,
  title, slug, outcome, outcomeIndex, type
- Trader's public Polymarket profile page (for linking trader names): 
  https://polymarket.com/@{userName} — if userName is empty, render as plain
  text, not a link (fallback pattern to wallet address not yet verified).
- NOTE: rank/vol/pnl/size/price/etc. sometimes come back as JSON strings instead of
  numbers. Already handled via parseJSONFloat/parseJSONInt helpers in
  internal/polymarket/leaderboard.go — reuse these, do not redefine.
- NOTE: Activity.Timestamp is Unix SECONDS (confirmed against real data Jun 27).
  Convert with time.Unix(ts, 0).UTC(), not UnixMilli.
- NOTE: trader_positions is a CURRENT SNAPSHOT, not historical — once a position
  is redeemed/closed it may disappear from /positions entirely. A wallet's biggest
  recent win can be invisible in trader_positions if already redeemed. This is why
  trader_activity (which has REDEEM events with real timestamps) is the source of
  truth for anything time-windowed; trader_positions is only used for lifetime/ALL
  window win-rate, max-loss, profit-factor (see scoring.go below).

## DB schema (already applied)
- traders(proxy_wallet PK, user_name, x_username, verified_badge, profile_image, first_seen_at, last_polled_at)
- trader_activity(id, proxy_wallet FK, activity_type, side, condition_id, asset,
  market_title, market_slug, outcome, size, price, occurred_at, inserted_at,
  UNIQUE(proxy_wallet, condition_id, side, size, price, occurred_at))
- trader_positions(id, proxy_wallet FK, condition_id, asset, market_title, outcome,
  size, avg_price, initial_value, current_value, cash_pnl, percent_pnl, realized_pnl,
  redeemable, snapshot_at, UNIQUE(proxy_wallet, condition_id, asset))
- leaderboard_scores(id, proxy_wallet FK, time_window, pnl, volume, win_rate, max_loss,
  profit_factor, consistency, sharpe, score, rank, computed_at,
  UNIQUE(proxy_wallet, time_window))

## Design decisions (don't violate these)
- We do NOT trust Polymarket's leaderboard pnl/vol fields for our own scoring —
  they're only used to discover which wallets to track. Our own Score/Sharpe/win-rate
  get computed from raw /activity and /positions data.
- All writes must respect the UNIQUE constraints above — use ON CONFLICT, never
  blind INSERT, since wallets get re-polled repeatedly.
- API layer only ever reads from leaderboard_scores (precomputed) — never compute
  scores live on request.
- Win/loss classification (locked in, don't reinterpret): a position is a WIN if
  realizedPnl > 0, OR (redeemable == true AND cashPnl > 0). A LOSS if realizedPnl < 0,
  OR (redeemable == true AND cashPnl < 0). For profit_factor/max_loss summing, use
  the SAME value used to classify (realizedPnl if non-zero, else cashPnl if
  redeemable) — not always raw cashPnl, to avoid sign mismatches between
  classification and the summed amount. Open/unresolved positions are excluded
  entirely from win_rate/profit_factor.
- Score is scaled 0-100 (not 0-1) to visually match predicting.top's Score column.
- Recent Trades' "Side" column = first letter of the Outcome field (e.g. "Yes"->"Y",
  "Virtus.pro"->"V"), NOT the BUY/SELL trade side — confirmed against predicting.top
  reference screenshots Jun 28.

## What's already built (Day 1-4 — done, Jun 25-28)
Backend:
- internal/polymarket/client.go — base Client struct, generic get() helper
- internal/polymarket/leaderboard.go — LeaderboardEntry, GetLeaderboard,
  parseJSONFloat/parseJSONInt (shared flexible-number decoders, reused everywhere)
- internal/polymarket/activity.go — Position, Activity structs, GetPositions, GetActivity
- internal/store/db.go — New(ctx, dsn) opens pgxpool.Pool
- internal/store/traders.go — Trader struct, UpsertTrader, MarkPolled, ListTrackedWallets
- internal/store/positions.go — UpsertPosition (ON CONFLICT DO UPDATE — live snapshot)
- internal/store/activity.go — InsertActivity (ON CONFLICT DO NOTHING — immutable history)
- internal/store/scores.go — UpsertLeaderboardScore (ON CONFLICT DO UPDATE)
- internal/scoring/scoring.go — RawMetrics, ComputeRawMetrics, ComputeAllRawMetrics,
  LeaderboardScore, NormalizeAndScore (cohort min-max normalization, weighted
  Score formula, scaled to 0-100)
- internal/api/leaderboard.go — GetLeaderboardHandler for GET /leaderboard
  (window, sort [score|pnl|sharpe], limit, offset params; joins traders for
  display info; validates sort param, returns 400 on invalid value)
- cmd/server/poll.go — pollAllTraders, loops GetPositions/GetActivity over every
  tracked wallet with 250ms delay, calls MarkPolled on success
- cmd/server/main.go — connects DB, seeds traders, runs pollAllTraders + scoring
  pipeline (window "ALL" only) in a background goroutine so server starts
  immediately, chi server with CORS (allows localhost:3001), /health,
  /leaderboard, /debug/leaderboard (debug tool, calls Polymarket live)

Frontend (web/ — Next.js App Router + TypeScript + Tailwind + shadcn):
- app/page.tsx — leaderboard table (shadcn Table), window dropdown (currently
  ONLY "All Time" — see Known limitations), sort dropdown (score/pnl/sharpe),
  pagination (shadcn Pagination, pageSize=20, resets to page 1 on filter change),
  color-coded PnL (green/red) and Score badges (green >=60, yellow 40-60, red <40)

## Known limitations (documented, not blocking)
- trader_positions has no per-trade timestamp, so position-based metrics (win_rate,
  max_loss, profit_factor) are only computed/valid for window "ALL". The frontend's
  window dropdown currently only offers "All Time" as a result — MONTH/WEEK/DAY
  were intentionally hidden rather than shipped with misleading duplicate data.
- Trending Markets feature (per-market mini-leaderboards) scoped out entirely
  given the assignment timeline — noted as a "next step" in README.

## Next goal (Day 4 continued — Jun 28)
1. Build GET /recent-trades endpoint: params limit (default 20, max 100), offset
   (default 0), minAmount (optional float, filters price*size >= minAmount). Query
   trader_activity WHERE activity_type='TRADE', JOIN traders (user_name,
   profile_image), LEFT JOIN leaderboard_scores (time_window='ALL') for score/sharpe
   (LEFT JOIN since not every wallet has a score yet). Order by occurred_at DESC.
   Returns: proxy_wallet, user_name, profile_image, market_title, outcome, price,
   size, occurred_at, score (nullable), sharpe (nullable).
2. Build app/trades/page.tsx: fetch /recent-trades on mount, auto-refresh every
   15s merging new trades into the top (dedupe by proxy_wallet+market_title+
   occurred_at composite key, cap displayed list at 50). Table columns: Trader
   (avatar + name, linked to https://polymarket.com/@{userName}), Score/Sharpe
   (badge, toggle between the two, default Sharpe), Market (title, truncated),
   Side (first letter of outcome, uppercased), Price (cents), Amount (price*size,
   currency), Time (relative). Nav links between "/" and "/trades".
3. Add the same trader-name-as-profile-link pattern to app/page.tsx (leaderboard).