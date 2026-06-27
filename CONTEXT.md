# Vantage — Context for AI assistance

## What this is
A Polymarket trader leaderboard + trending markets + recent trades app,
built in Go for a 1-week job assignment (modeled after predicting.top).

## Stack
- Go, chi router, pgx (raw SQL, no ORM)
- Postgres
- No auth needed — Polymarket's Gamma + Data APIs are fully public

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

## What's already built (Day 1-3 — done, Jun 25-27)
- internal/polymarket/client.go — base Client struct, generic get() helper
- internal/polymarket/leaderboard.go — LeaderboardEntry, GetLeaderboard,
  parseJSONFloat/parseJSONInt (shared flexible-number decoders, reused everywhere)
- internal/polymarket/activity.go — Position, Activity structs, GetPositions, GetActivity
- internal/store/db.go — New(ctx, dsn) opens pgxpool.Pool
- internal/store/traders.go — Trader struct, UpsertTrader, MarkPolled, ListTrackedWallets
- internal/store/positions.go — UpsertPosition (ON CONFLICT DO UPDATE — live snapshot)
- internal/store/activity.go — InsertActivity (ON CONFLICT DO NOTHING — immutable history)
- internal/store/scores.go — UpsertLeaderboardScore (ON CONFLICT DO UPDATE)
- internal/scoring/scoring.go — RawMetrics, ComputeRawMetrics, ComputeAllRawMetrics
  (win/loss classification from trader_positions for ALL window; daily flow from
  trader_activity including REDEEM-as-inflow for consistency/sharpe),
  LeaderboardScore, NormalizeAndScore (cohort min-max normalization, weighted
  Score formula, scaled to 0-100)
- cmd/server/poll.go — pollAllTraders, loops GetPositions/GetActivity over every
  tracked wallet with 250ms delay, calls MarkPolled on success
- cmd/server/main.go — connects DB, seeds traders, runs pollAllTraders, computes
  + normalizes + saves leaderboard_scores for window "ALL", chi server with
  /health and /debug/leaderboard (calls Polymarket live, kept as a debug tool)

## Known limitation (documented, not blocking)
trader_positions has no per-trade timestamp, so position-based metrics (win_rate,
max_loss, profit_factor) are currently only computed/valid for window "ALL", not
"1D"/"WEEK"/"MONTH". Shorter windows would need a different approach (e.g., deriving
everything from trader_activity's REDEEM/TRADE events with real timestamps instead).
Scoped out for now given the assignment timeline.

## Next goal (Day 4 — Jun 28)
1. Build GET /leaderboard API endpoint reading from leaderboard_scores (window, sort,
   limit, offset params), joined with traders for display info.
2. Wrap pollAllTraders + scoring pipeline in a background goroutine so server startup
   isn't blocked for ~2 minutes on every restart.
3. Begin frontend (simple table, not full predicting.top clone) once API is solid.