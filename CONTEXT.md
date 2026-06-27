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
  Response fields: rank, proxyWallet, userName, vol, pnl, profileImage, xUsername, verifiedBadge
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
- NOTE: Activity.Timestamp is Unix SECONDS (confirmed against real data on Jun 27).
  Convert with time.Unix(ts, 0).UTC(), not UnixMilli.

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

## What's already built (Day 1 — done, Jun 25-26)
- internal/polymarket/client.go — base Client struct, generic get() helper
- internal/polymarket/leaderboard.go — LeaderboardEntry, GetLeaderboard,
  parseJSONFloat/parseJSONInt (shared flexible-number decoders, reused everywhere)
- internal/polymarket/activity.go — Position, Activity structs, GetPositions, GetActivity
- internal/store/db.go — New(ctx, dsn) opens pgxpool.Pool
- internal/store/traders.go — Trader struct, UpsertTrader, MarkPolled
- internal/store/positions.go — UpsertPosition (ON CONFLICT DO UPDATE — live snapshot)
- internal/store/activity.go — InsertActivity (ON CONFLICT DO NOTHING — immutable history)
- cmd/server/main.go — connects DB, seeds traders from leaderboard, chi server with
  /health and /debug/leaderboard. Currently has a temporary single-test-wallet block
  pulling positions/activity for entries[0] — this needs to generalize to ALL tracked
  wallets today (see Today's goal below).

## Today's goal (Day 3 — Jun 27)
1. DONE (Jun 27): Generalized ingestion to loop GetPositions/GetActivity over every
   wallet in `traders`, with delay between calls, MarkPolled on success.
2. Build the Score computation engine — a function that reads a wallet's stored
   trader_activity + trader_positions rows (NOT live API calls) for a given time_window,
   and computes:
   - win/loss classification: a position is a WIN if realizedPnl > 0, OR
     (redeemable == true AND cashPnl > 0). A position is a LOSS if realizedPnl < 0,
     OR (redeemable == true AND cashPnl < 0). Open, non-redeemable positions with
     no realized PnL are EXCLUDED entirely (outcome not yet known). This is a
     pragmatic proxy for true win/loss since it doesn't use Polymarket's separate
     closed-positions endpoint — document as a known simplification in README.
   - win_rate: wins / (wins + losses), using the win/loss definition above
   - max_loss: most negative cashPnl among loss positions in the window
   - profit_factor: sum(cashPnl of wins) / abs(sum(cashPnl of losses)), capped at
     10 if there are zero losses (avoid divide-by-zero / infinity)
   - consistency: group trader_activity by calendar day in the window, compute net
     PnL per day, consistency = (days with positive net PnL) / (active days)
   - sharpe: mean(daily net PnL) / stddev(daily net PnL), using the same daily
     series as consistency
   - pnl: sum of cashPnl across all positions in the window (this is "returns")
   - score: 0.25*consistency + 0.25*normalized_returns + 0.20*win_rate +
     0.15*(1 - normalized_max_loss) + 0.15*normalized_profit_factor
     Normalize returns, max_loss, and profit_factor via min-max scaling against
     ALL tracked wallets in the same time_window (not in isolation) before
     applying weights. win_rate and consistency are already 0-1, no normalization
     needed. max_loss is inverted after normalizing since a smaller loss is better.
3. Upsert results into leaderboard_scores per (proxy_wallet, time_window), starting
   with windows '1D' and 'ALL' to prove correctness before expanding to all windows.
4. Manually spot-check 2-3 wallets' computed scores against their raw activity by hand.