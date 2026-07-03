package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

var consensusTitleDatePattern = regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}\b`)

type ConsensusSignal struct {
	ConditionID       string                  `json:"condition_id"`
	MarketTitle       string                  `json:"market_title"`
	MarketSlug        string                  `json:"market_slug"`
	MarketLink        string                  `json:"market_link"`
	MarketIcon        string                  `json:"market_icon"`
	EndDate           string                  `json:"end_date"`
	Outcome           string                  `json:"outcome"`
	ProfitableTraders int                     `json:"profitable_traders"`
	TotalSize         float64                 `json:"total_size"`
	TotalValue        float64                 `json:"total_value"`
	AvgEntryPrice     float64                 `json:"avg_entry_price"`
	AvgCurrentPrice   float64                 `json:"avg_current_price"`
	TotalCashPnL      float64                 `json:"total_cash_pnl"`
	AvgTraderScore    float64                 `json:"avg_trader_score"`
	RecentBuyCount    int                     `json:"recent_buy_count"`
	UnrealizedROI     float64                 `json:"unrealized_roi"`
	ConfidenceScore   float64                 `json:"confidence_score"`
	Traders           []ConsensusSignalTrader `json:"traders"`
}

type ConsensusSignalTrader struct {
	ProxyWallet  string  `json:"proxy_wallet"`
	UserName     string  `json:"user_name"`
	ProfileImage string  `json:"profile_image"`
	XUsername    string  `json:"x_username"`
	Score        float64 `json:"score"`
	Sharpe       float64 `json:"sharpe"`
	Outcome      string  `json:"outcome"`
	AvgPrice     float64 `json:"avg_price"`
	CurrentPrice float64 `json:"current_price"`
	Size         float64 `json:"size"`
	CurrentValue float64 `json:"current_value"`
	CashPnL      float64 `json:"cash_pnl"`
	PercentPnL   float64 `json:"percent_pnl"`
	TraderTier   string  `json:"trader_tier"`
}

func GetConsensusSignalsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit, err := parseIntQuery(r, "limit", 10)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if limit < 1 {
			limit = 10
		}
		if limit > 50 {
			limit = 50
		}

		candidateLimit := limit * 8
		if candidateLimit < 40 {
			candidateLimit = 40
		}
		if candidateLimit > 200 {
			candidateLimit = 200
		}

		signals, err := listConsensusSignals(r.Context(), db, candidateLimit)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		signals = enrichAndFilterConsensusSignals(signals, limit)
		if err := populateConsensusSignalTraders(r.Context(), db, signals); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, signals)
	}
}

func enrichAndFilterConsensusSignals(signals []ConsensusSignal, limit int) []ConsensusSignal {
	conditionIDs := make([]string, 0, len(signals))
	seen := make(map[string]bool)
	for _, signal := range signals {
		if signal.ConditionID == "" || seen[signal.ConditionID] {
			continue
		}
		conditionIDs = append(conditionIDs, signal.ConditionID)
		seen[signal.ConditionID] = true
	}

	for i, signal := range signals {
		if signal.MarketSlug != "" {
			signals[i].MarketLink = fmt.Sprintf("https://polymarket.com/market/%s", signal.MarketSlug)
		}
	}

	if len(conditionIDs) == 0 {
		return nil
	}

	pm := polymarket.NewClient()
	metadataList, err := pm.GetMarketsByConditionIDs(conditionIDs)
	if err != nil {
		log.Printf("warning: consensus signals GetMarketsByConditionIDs failed: %v", err)
		return nil
	}

	metadataMap := make(map[string]polymarket.Market, len(metadataList))
	for _, meta := range metadataList {
		metadataMap[meta.ConditionID] = meta
	}

	filtered := make([]ConsensusSignal, 0, limit)
	for _, signal := range signals {
		if hasPastDatedTitle(signal.MarketTitle) {
			continue
		}

		meta, found := metadataMap[signal.ConditionID]
		if !found || !isLiveMarket(meta) {
			continue
		}

		if len(meta.Events) > 0 && meta.Events[0].Slug != "" {
			signal.MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", meta.Events[0].Slug)
		} else if meta.Slug != "" {
			signal.MarketLink = fmt.Sprintf("https://polymarket.com/market/%s", meta.Slug)
		}
		signal.EndDate = meta.EndDate
		signal.MarketIcon = meta.Image
		if signal.MarketIcon == "" {
			signal.MarketIcon = meta.Icon
		}
		filtered = append(filtered, signal)
		if len(filtered) >= limit {
			break
		}
	}
	return filtered
}

func hasPastDatedTitle(title string) bool {
	for _, match := range consensusTitleDatePattern.FindAllString(title, -1) {
		marketDate, err := time.Parse("2006-01-02", match)
		if err != nil {
			continue
		}
		today := time.Now().UTC().Truncate(24 * time.Hour)
		if marketDate.Before(today) {
			return true
		}
	}
	return false
}

func isLiveMarket(m polymarket.Market) bool {
	if !m.Active || m.Closed {
		return false
	}
	if m.EndDate == "" {
		return true
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		endDate, err := time.Parse(layout, m.EndDate)
		if err == nil {
			return endDate.After(time.Now().UTC())
		}
	}
	return false
}

func listConsensusSignals(ctx context.Context, db *pgxpool.Pool, limit int) ([]ConsensusSignal, error) {
	const query = `
		WITH eligible_positions AS (
			SELECT
				tp.proxy_wallet,
				tp.condition_id,
				COALESCE(tp.market_title, '') AS market_title,
				COALESCE(tp.slug, '') AS market_slug,
				COALESCE(tp.outcome, '') AS outcome,
				tp.size,
				tp.current_value,
				tp.avg_price,
				COALESCE(NULLIF(tp.cur_price, 0), tp.current_value / NULLIF(tp.size, 0), 0) AS current_price,
				tp.cash_pnl,
				ls.score
			FROM trader_positions tp
			JOIN leaderboard_scores ls
				ON ls.proxy_wallet = tp.proxy_wallet
				AND ls.time_window = 'ALL'
				AND ls.pnl > 0
			WHERE tp.size > 0
				AND tp.current_value > 0
				AND tp.redeemable = false
				AND tp.cur_price > 0.01
				AND tp.cur_price < 0.99
				AND tp.condition_id IS NOT NULL
				AND tp.condition_id != ''
		),
		recent_buys AS (
			SELECT
				ta.condition_id,
				COALESCE(ta.outcome, '') AS outcome,
				COUNT(*) AS recent_buy_count
			FROM trader_activity ta
			JOIN leaderboard_scores ls
				ON ls.proxy_wallet = ta.proxy_wallet
				AND ls.time_window = 'ALL'
				AND ls.pnl > 0
			WHERE ta.activity_type = 'TRADE'
				AND ta.side = 'BUY'
				AND ta.occurred_at >= now() - interval '24 hours'
			GROUP BY ta.condition_id, COALESCE(ta.outcome, '')
		),
		grouped AS (
			SELECT
				ep.condition_id,
				ep.market_title,
				ep.market_slug,
				ep.outcome,
				COUNT(DISTINCT ep.proxy_wallet) AS profitable_traders,
				SUM(ep.size) AS total_size,
				SUM(ep.current_value) AS total_value,
				COALESCE(SUM(ep.avg_price * ep.size) / NULLIF(SUM(ep.size), 0), 0) AS avg_entry_price,
				COALESCE(SUM(ep.current_price * ep.size) / NULLIF(SUM(ep.size), 0), 0) AS avg_current_price,
				SUM(ep.cash_pnl) AS total_cash_pnl,
				AVG(ep.score) AS avg_trader_score,
				COALESCE(rb.recent_buy_count, 0) AS recent_buy_count
			FROM eligible_positions ep
			LEFT JOIN recent_buys rb
				ON rb.condition_id = ep.condition_id
				AND rb.outcome = ep.outcome
			GROUP BY ep.condition_id, ep.market_title, ep.market_slug, ep.outcome, rb.recent_buy_count
			HAVING COUNT(DISTINCT ep.proxy_wallet) >= 2
		),
		scored AS (
			SELECT
				*,
				COALESCE((avg_current_price - avg_entry_price) / NULLIF(avg_entry_price, 0), 0) AS unrealized_roi,
				(
					(LEAST(profitable_traders / 20.0, 1.0) * 100.0 * 0.4)
					+ (LEAST(GREATEST(COALESCE((avg_current_price - avg_entry_price) / NULLIF(avg_entry_price, 0), 0), 0.0), 1.0) * 100.0 * 0.3)
					+ (LEAST(recent_buy_count / 50.0, 1.0) * 100.0 * 0.3)
				) AS confidence_score
			FROM grouped
		)
		SELECT
			condition_id,
			market_title,
			market_slug,
			outcome,
			profitable_traders,
			total_size,
			total_value,
			avg_entry_price,
			avg_current_price,
			total_cash_pnl,
			avg_trader_score,
			recent_buy_count,
			unrealized_roi,
			confidence_score
		FROM scored
		WHERE unrealized_roi > 0
		ORDER BY confidence_score DESC, profitable_traders DESC, total_value DESC
		LIMIT $1
	`

	rows, err := db.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("query consensus signals: %w", err)
	}
	defer rows.Close()

	signals := make([]ConsensusSignal, 0, limit)
	for rows.Next() {
		var signal ConsensusSignal
		if err := rows.Scan(
			&signal.ConditionID,
			&signal.MarketTitle,
			&signal.MarketSlug,
			&signal.Outcome,
			&signal.ProfitableTraders,
			&signal.TotalSize,
			&signal.TotalValue,
			&signal.AvgEntryPrice,
			&signal.AvgCurrentPrice,
			&signal.TotalCashPnL,
			&signal.AvgTraderScore,
			&signal.RecentBuyCount,
			&signal.UnrealizedROI,
			&signal.ConfidenceScore,
		); err != nil {
			return nil, fmt.Errorf("scan consensus signal: %w", err)
		}
		signals = append(signals, signal)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate consensus signals: %w", err)
	}
	return signals, nil
}

func populateConsensusSignalTraders(ctx context.Context, db *pgxpool.Pool, signals []ConsensusSignal) error {
	const query = `
		SELECT
			tp.proxy_wallet,
			COALESCE(t.user_name, '') AS user_name,
			COALESCE(t.profile_image, '') AS profile_image,
			COALESCE(t.x_username, '') AS x_username,
			COALESCE(ls.score, 0) AS score,
			COALESCE(ls.sharpe, 0) AS sharpe,
			COALESCE(tp.outcome, '') AS outcome,
			tp.avg_price,
			tp.cur_price,
			tp.size,
			tp.current_value,
			tp.cash_pnl,
			tp.percent_pnl
		FROM trader_positions tp
		JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
		JOIN leaderboard_scores ls
			ON ls.proxy_wallet = tp.proxy_wallet
			AND ls.time_window = 'ALL'
			AND ls.pnl > 0
		WHERE tp.condition_id = $1
			AND COALESCE(tp.outcome, '') = $2
			AND tp.size > 0
			AND tp.current_value > 0
			AND tp.redeemable = false
			AND tp.cur_price > 0.01
			AND tp.cur_price < 0.99
		ORDER BY tp.current_value DESC
		LIMIT 8
	`

	for i := range signals {
		rows, err := db.Query(ctx, query, signals[i].ConditionID, signals[i].Outcome)
		if err != nil {
			return fmt.Errorf("query consensus traders for %s %s: %w", signals[i].ConditionID, signals[i].Outcome, err)
		}

		var traders []ConsensusSignalTrader
		for rows.Next() {
			var trader ConsensusSignalTrader
			if err := rows.Scan(
				&trader.ProxyWallet,
				&trader.UserName,
				&trader.ProfileImage,
				&trader.XUsername,
				&trader.Score,
				&trader.Sharpe,
				&trader.Outcome,
				&trader.AvgPrice,
				&trader.CurrentPrice,
				&trader.Size,
				&trader.CurrentValue,
				&trader.CashPnL,
				&trader.PercentPnL,
			); err != nil {
				rows.Close()
				return fmt.Errorf("scan consensus trader: %w", err)
			}
			trader.TraderTier = scoreTier(trader.Score)
			traders = append(traders, trader)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return fmt.Errorf("iterate consensus traders: %w", err)
		}
		rows.Close()
		signals[i].Traders = traders
	}
	return nil
}
