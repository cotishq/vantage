package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type recentTradeEntry struct {
	ProxyWallet  string    `json:"proxy_wallet"`
	UserName     string    `json:"user_name"`
	ProfileImage string    `json:"profile_image"`
	MarketTitle  string    `json:"market_title"`
	MarketSlug   string    `json:"market_slug"`
	MarketIcon   string    `json:"market_icon"`
	MarketLink   string    `json:"market_link"`
	Outcome      string    `json:"outcome"`
	Price        float64   `json:"price"`
	Size         float64   `json:"size"`
	OccurredAt   time.Time `json:"occurred_at"`
	Score        *float64  `json:"score"`
	Sharpe       *float64  `json:"sharpe"`
	ConditionID  string    `json:"-"`
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

		// Enrich trades with market images and clean links from Gamma API
		conditionIDs := make([]string, 0, len(trades))
		seen := make(map[string]bool)
		for _, t := range trades {
			if t.ConditionID != "" && !seen[t.ConditionID] {
				conditionIDs = append(conditionIDs, t.ConditionID)
				seen[t.ConditionID] = true
			}
		}

		if len(conditionIDs) > 0 {
			pm := polymarket.NewClient()
			metadataList, err := pm.GetMarketsByConditionIDs(conditionIDs)
			if err == nil {
				metadataMap := make(map[string]polymarket.Market)
				for _, meta := range metadataList {
					metadataMap[meta.ConditionID] = meta
				}

				for i, t := range trades {
					// Default fallback link using the stored market_slug
					trades[i].MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", t.MarketSlug)

					if meta, found := metadataMap[t.ConditionID]; found {
						trades[i].MarketIcon = meta.Image
						if trades[i].MarketIcon == "" {
							trades[i].MarketIcon = meta.Icon
						}

						if len(meta.Events) > 0 && meta.Events[0].Slug != "" {
							trades[i].MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", meta.Events[0].Slug)
						} else if meta.Slug != "" {
							trades[i].MarketLink = fmt.Sprintf("https://polymarket.com/market/%s", meta.Slug)
						}
					}
				}
			} else {
				log.Printf("warning: recent trades GetMarketsByConditionIDs failed: %v", err)
				for i, t := range trades {
					trades[i].MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", t.MarketSlug)
				}
			}
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
			COALESCE(ta.market_slug, ''),
			COALESCE(ta.outcome, ''),
			ta.price,
			ta.size,
			ta.occurred_at,
			ls.score,
			ls.sharpe,
			ta.condition_id
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
			&trade.MarketSlug,
			&trade.Outcome,
			&trade.Price,
			&trade.Size,
			&trade.OccurredAt,
			&score,
			&sharpe,
			&trade.ConditionID,
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
