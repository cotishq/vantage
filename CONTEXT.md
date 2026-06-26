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

## Today's goal (Day 1)
1. Polymarket client methods: GetLeaderboard, GetPositions, GetActivity
2. Seed traders table from GetLeaderboard
3. Pull positions + activity for one test wallet, insert into trader_positions / trader_activity
4. chi server with /health and /debug/leaderboard