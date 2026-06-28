package api

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type recentTradeEntry struct {
	ProxyWallet  string    `json:"proxy_wallet"`
	UserName     string    `json:"user_name"`
	ProfileImage string    `json:"profile_image"`
	MarketTitle  string    `json:"market_title"`
	Outcome      string    `json:"outcome"`
	Price        float64   `json:"price"`
	Size         float64   `json:"size"`
	OccurredAt   time.Time `json:"occurred_at"`
	Score        *float64  `json:"score"`
	Sharpe       *float64  `json:"sharpe"`
}

func GetRecentTradesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, err := parseIntQuery(r, "limit", 20)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if limit < 1 {
			limit = 20
		}
		if limit > 100 {
			limit = 100
		}

		offset, err := parseIntQuery(r, "offset", 0)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if offset < 0 {
			offset = 0
		}

		minAmount, err := parseOptionalFloatQuery(r, "minAmount")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		trades, err := listRecentTrades(r.Context(), db, limit, offset, minAmount)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, trades)
	}
}

func listRecentTrades(ctx context.Context, db *pgxpool.Pool, limit, offset int, minAmount *float64) ([]recentTradeEntry, error) {
	const query = `
		SELECT
			ta.proxy_wallet,
			COALESCE(t.user_name, ''),
			COALESCE(t.profile_image, ''),
			COALESCE(ta.market_title, ''),
			COALESCE(ta.outcome, ''),
			ta.price,
			ta.size,
			ta.occurred_at,
			ls.score,
			ls.sharpe
		FROM trader_activity ta
		JOIN traders t ON t.proxy_wallet = ta.proxy_wallet
		LEFT JOIN leaderboard_scores ls
			ON ls.proxy_wallet = ta.proxy_wallet
			AND ls.time_window = 'ALL'
		WHERE ta.activity_type = 'TRADE'
			AND ($3::double precision IS NULL OR ta.price * ta.size >= $3)
		ORDER BY ta.occurred_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := db.Query(ctx, query, limit, offset, minAmount)
	if err != nil {
		return nil, fmt.Errorf("query recent trades: %w", err)
	}
	defer rows.Close()

	trades := make([]recentTradeEntry, 0, limit)
	for rows.Next() {
		var trade recentTradeEntry
		var score pgtype.Float8
		var sharpe pgtype.Float8
		if err := rows.Scan(
			&trade.ProxyWallet,
			&trade.UserName,
			&trade.ProfileImage,
			&trade.MarketTitle,
			&trade.Outcome,
			&trade.Price,
			&trade.Size,
			&trade.OccurredAt,
			&score,
			&sharpe,
		); err != nil {
			return nil, fmt.Errorf("scan recent trade: %w", err)
		}
		if score.Valid {
			trade.Score = &score.Float64
		}
		if sharpe.Valid {
			trade.Sharpe = &sharpe.Float64
		}
		trades = append(trades, trade)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent trades: %w", err)
	}
	return trades, nil
}

func parseOptionalFloatQuery(r *http.Request, key string) (*float64, error) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return nil, nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid %s", key)
	}
	return &parsed, nil
}
