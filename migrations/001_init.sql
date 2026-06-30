CREATE TABLE IF NOT EXISTS traders (
    proxy_wallet     TEXT PRIMARY KEY,
    user_name        TEXT,
    x_username       TEXT,
    verified_badge   BOOLEAN NOT NULL DEFAULT FALSE,
    profile_image    TEXT,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_polled_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trader_activity (
    id               BIGSERIAL PRIMARY KEY,
    proxy_wallet     TEXT NOT NULL REFERENCES traders(proxy_wallet),
    activity_type    TEXT NOT NULL,
    side             TEXT,
    condition_id     TEXT NOT NULL,
    asset            TEXT,
    market_title     TEXT,
    market_slug      TEXT,
    outcome          TEXT,
    size             DOUBLE PRECISION NOT NULL DEFAULT 0,
    price            DOUBLE PRECISION NOT NULL DEFAULT 0,
    occurred_at      TIMESTAMPTZ NOT NULL,
    inserted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (proxy_wallet, condition_id, side, size, price, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_trader_activity_wallet_time
    ON trader_activity (proxy_wallet, occurred_at DESC);

CREATE TABLE IF NOT EXISTS trader_positions (
    id               BIGSERIAL PRIMARY KEY,
    proxy_wallet     TEXT NOT NULL REFERENCES traders(proxy_wallet),
    condition_id     TEXT NOT NULL,
    asset            TEXT,
    market_title     TEXT,
    outcome          TEXT,
    size             DOUBLE PRECISION NOT NULL DEFAULT 0,
    avg_price        DOUBLE PRECISION NOT NULL DEFAULT 0,
    initial_value    DOUBLE PRECISION NOT NULL DEFAULT 0,
    current_value    DOUBLE PRECISION NOT NULL DEFAULT 0,
    cash_pnl         DOUBLE PRECISION NOT NULL DEFAULT 0,
    percent_pnl      DOUBLE PRECISION NOT NULL DEFAULT 0,
    realized_pnl     DOUBLE PRECISION NOT NULL DEFAULT 0,
    redeemable       BOOLEAN NOT NULL DEFAULT FALSE,
    cur_price        DOUBLE PRECISION NOT NULL DEFAULT 0,
    slug             TEXT NOT NULL DEFAULT '',
    snapshot_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (proxy_wallet, condition_id, asset)
);

CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id               BIGSERIAL PRIMARY KEY,
    proxy_wallet     TEXT NOT NULL REFERENCES traders(proxy_wallet),
    time_window      TEXT NOT NULL,
    pnl              DOUBLE PRECISION NOT NULL DEFAULT 0,
    volume           DOUBLE PRECISION NOT NULL DEFAULT 0,
    win_rate         DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_loss         DOUBLE PRECISION NOT NULL DEFAULT 0,
    profit_factor    DOUBLE PRECISION NOT NULL DEFAULT 0,
    consistency      DOUBLE PRECISION NOT NULL DEFAULT 0,
    sharpe           DOUBLE PRECISION NOT NULL DEFAULT 0,
    score            DOUBLE PRECISION NOT NULL DEFAULT 0,
    rank             INT,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (proxy_wallet, time_window)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_window_score
    ON leaderboard_scores (time_window, score DESC);