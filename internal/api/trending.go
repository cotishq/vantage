package api

import (
	"log"
	"net/http"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TrendingMarketTrader struct {
	ProxyWallet  string    `json:"proxy_wallet"`
	UserName     string    `json:"user_name"`
	ProfileImage string    `json:"profile_image"`
	XUsername    string    `json:"x_username"`
	BuysCount    int       `json:"buys_count"`
	SellsCount   int       `json:"sells_count"`
	NetInflow    float64   `json:"net_inflow"`
	LastTradeAt  time.Time `json:"last_trade_at"`
}

type TrendingMarketStats struct {
	CohortVolume float64 `json:"cohort_volume"`
	CohortInflow float64 `json:"cohort_inflow"`
	TradersCount int     `json:"traders_count"`
}

type TrendingMarketResponse struct {
	Market     polymarket.Market      `json:"market"`
	Stats      TrendingMarketStats    `json:"stats"`
	TopTraders []TrendingMarketTrader `json:"top_traders"`
}

func GetTrendingMarketsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window := r.URL.Query().Get("window")
		var duration time.Duration
		switch window {
		case "1h":
			duration = 1 * time.Hour
		case "6h":
			duration = 6 * time.Hour
		case "24h", "1d":
			duration = 24 * time.Hour
		case "3d":
			duration = 72 * time.Hour
		case "1w":
			duration = 168 * time.Hour
		default:
			duration = 168 * time.Hour // default 1 week
		}

		limit, err := parseIntQuery(r, "limit", 12)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if limit < 1 {
			limit = 12
		}
		if limit > 50 {
			limit = 50
		}

		startTime := time.Now().UTC().Add(-duration)

		// 1. Find most active condition IDs from our database
		activeConditionIDsQuery := `
			SELECT condition_id, COUNT(*) as trade_count
			FROM trader_activity
			WHERE activity_type = 'TRADE'
			  AND condition_id IS NOT NULL
			  AND condition_id != ''
			  AND occurred_at >= $1
			GROUP BY condition_id
			ORDER BY trade_count DESC
			LIMIT $2
		`

		var conditionIDs []string
		rows, err := db.Query(r.Context(), activeConditionIDsQuery, startTime, limit)
		if err == nil {
			for rows.Next() {
				var cid string
				var count int
				if err := rows.Scan(&cid, &count); err == nil {
					conditionIDs = append(conditionIDs, cid)
				}
			}
			rows.Close()
		} else {
			log.Printf("warning: query active condition IDs failed: %v", err)
		}

		// 2. Fetch fresh market metadata from Polymarket Gamma API
		var markets []polymarket.Market
		pm := polymarket.NewClient()

		if len(conditionIDs) > 0 {
			markets, err = pm.GetMarketsByConditionIDs(conditionIDs)
			if err != nil {
				log.Printf("warning: GetMarketsByConditionIDs failed: %v, falling back to top active markets", err)
				markets, err = pm.GetTopActiveMarkets(limit)
			}
		} else {
			markets, err = pm.GetTopActiveMarkets(limit)
		}

		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		// 3. For each market, query stats and top traders from our DB
		var response []TrendingMarketResponse

		for _, m := range markets {
			if m.ConditionID == "" {
				continue
			}

			// Query Cohort stats
			var stats TrendingMarketStats
			statsQuery := `
				SELECT
					COALESCE(SUM(ta.size * ta.price), 0) as cohort_volume,
					COALESCE(SUM(CASE WHEN ta.side = 'BUY' THEN ta.size * ta.price ELSE -ta.size * ta.price END), 0) as cohort_inflow,
					COUNT(DISTINCT ta.proxy_wallet) as traders_count
				FROM trader_activity ta
				WHERE ta.activity_type = 'TRADE'
				  AND ta.condition_id = $1
				  AND ta.occurred_at >= $2
			`
			err = db.QueryRow(r.Context(), statsQuery, m.ConditionID, startTime).Scan(&stats.CohortVolume, &stats.CohortInflow, &stats.TradersCount)
			if err != nil {
				log.Printf("warning: query stats for condition %s failed: %v", m.ConditionID, err)
			}

			// Query top 3 traders
			var traders []TrendingMarketTrader
			tradersQuery := `
				SELECT
					ta.proxy_wallet,
					COALESCE(t.user_name, '') as user_name,
					COALESCE(t.profile_image, '') as profile_image,
					COALESCE(t.x_username, '') as x_username,
					COUNT(CASE WHEN ta.side = 'BUY' THEN 1 END) as buys_count,
					COUNT(CASE WHEN ta.side = 'SELL' THEN 1 END) as sells_count,
					SUM(CASE WHEN ta.side = 'BUY' THEN ta.size * ta.price ELSE -ta.size * ta.price END) as net_inflow,
					MAX(ta.occurred_at) as last_trade_at
				FROM trader_activity ta
				JOIN traders t ON t.proxy_wallet = ta.proxy_wallet
				WHERE ta.activity_type = 'TRADE'
				  AND ta.condition_id = $1
				  AND ta.occurred_at >= $2
				GROUP BY ta.proxy_wallet, t.user_name, t.profile_image, t.x_username
				ORDER BY ABS(SUM(CASE WHEN ta.side = 'BUY' THEN ta.size * ta.price ELSE -ta.size * ta.price END)) DESC
				LIMIT 3
			`
			tRows, err := db.Query(r.Context(), tradersQuery, m.ConditionID, startTime)
			if err == nil {
				for tRows.Next() {
					var trader TrendingMarketTrader
					err := tRows.Scan(
						&trader.ProxyWallet,
						&trader.UserName,
						&trader.ProfileImage,
						&trader.XUsername,
						&trader.BuysCount,
						&trader.SellsCount,
						&trader.NetInflow,
						&trader.LastTradeAt,
					)
					if err == nil {
						traders = append(traders, trader)
					} else {
						log.Printf("warning: scan trader failed: %v", err)
					}
				}
				tRows.Close()
			} else {
				log.Printf("warning: query traders for condition %s failed: %v", m.ConditionID, err)
			}

			response = append(response, TrendingMarketResponse{
				Market:     m,
				Stats:      stats,
				TopTraders: traders,
			})
		}

		writeJSON(w, http.StatusOK, response)
	}
}
