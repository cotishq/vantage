package api

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GroupedMarketPositions struct {
	ConditionID  string                 `json:"condition_id"`
	MarketTitle  string                 `json:"market_title"`
	Slug         string                 `json:"slug"`
	CurrentPrice float64                `json:"current_price"`
	EndDate      string                 `json:"end_date"`
	Icon         string                 `json:"icon"`
	TotalValue   float64                `json:"total_value"`
	TradersCount int                    `json:"traders_count"`
	SmartYesPct  int                    `json:"smart_yes_pct"`
	SmartNoPct   int                    `json:"smart_no_pct"`
	Positions    []MarketPositionDetail `json:"positions"`
}

type MarketPositionDetail struct {
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

func GetTopPositionsHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()

		// --- side ---
		side := strings.ToLower(q.Get("side"))
		if side != "" && side != "yes" && side != "no" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "side must be 'Yes' or 'No'"})
			return
		}

		// --- minValue ---
		minValue := 1000.0
		if raw := q.Get("minValue"); raw != "" {
			var err error
			minValue, err = parseFloatRaw(raw, "minValue")
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}

		// --- minScore ---
		minScore := 0.0
		if raw := q.Get("minScore"); raw != "" {
			var err error
			minScore, err = parseFloatRaw(raw, "minScore")
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}

		// --- minSharpe ---
		minSharpe := 0.0
		if raw := q.Get("minSharpe"); raw != "" {
			var err error
			minSharpe, err = parseFloatRaw(raw, "minSharpe")
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
		}

		// --- hide95 ---
		hide95 := q.Get("hide95") == "true"

		// --- limit / offset ---
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

		// Build WHERE clause
		whereParts := []string{"1=1"}
		var args []any
		argIndex := 1

		// minValue filter
		whereParts = append(whereParts, fmt.Sprintf("tp.current_value >= $%d", argIndex))
		args = append(args, minValue)
		argIndex++

		// side filter
		if side != "" {
			whereParts = append(whereParts, fmt.Sprintf("lower(tp.outcome) = $%d", argIndex))
			args = append(args, side)
			argIndex++
		}

		// minScore filter
		if minScore > 0 {
			whereParts = append(whereParts, fmt.Sprintf("COALESCE(ls.score, 0) >= $%d", argIndex))
			args = append(args, minScore)
			argIndex++
		}

		// minSharpe filter
		if minSharpe > 0 {
			whereParts = append(whereParts, fmt.Sprintf("COALESCE(ls.sharpe, 0) >= $%d", argIndex))
			args = append(args, minSharpe)
			argIndex++
		}

		// hide95 filter
		if hide95 {
			whereParts = append(whereParts, "tp.cur_price < 0.95 AND tp.cur_price > 0.05")
		}

		whereClause := strings.Join(whereParts, " AND ")

		// 1. Fetch total counts
		countMarketsQuery := fmt.Sprintf(`
			SELECT COUNT(DISTINCT tp.condition_id)
			FROM trader_positions tp
			JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
			LEFT JOIN leaderboard_scores ls
				ON ls.proxy_wallet = tp.proxy_wallet
				AND ls.time_window = 'ALL'
			WHERE %s
		`, whereClause)

		countPositionsQuery := fmt.Sprintf(`
			SELECT COUNT(*)
			FROM trader_positions tp
			JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
			LEFT JOIN leaderboard_scores ls
				ON ls.proxy_wallet = tp.proxy_wallet
				AND ls.time_window = 'ALL'
			WHERE %s
		`, whereClause)

		var totalMarkets, totalPositions int
		err = db.QueryRow(r.Context(), countMarketsQuery, args...).Scan(&totalMarkets)
		if err != nil {
			log.Printf("warning: query total markets count failed: %v", err)
		}
		err = db.QueryRow(r.Context(), countPositionsQuery, args...).Scan(&totalPositions)
		if err != nil {
			log.Printf("warning: query total positions count failed: %v", err)
		}

		w.Header().Set("X-Total-Markets", strconv.Itoa(totalMarkets))
		w.Header().Set("X-Total-Positions", strconv.Itoa(totalPositions))

		// 2. Query distinct markets
		marketsQuery := fmt.Sprintf(`
			SELECT
				tp.condition_id,
				COALESCE(tp.market_title, '') as market_title,
				COALESCE(tp.slug, '') as slug,
				COALESCE(MAX(tp.cur_price) FILTER (WHERE lower(tp.outcome) = 'yes' OR tp.outcome = 'Y'), MAX(tp.cur_price)) as current_price,
				SUM(tp.current_value) as total_value,
				COUNT(DISTINCT tp.proxy_wallet) as traders_count
			FROM trader_positions tp
			JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
			LEFT JOIN leaderboard_scores ls
				ON ls.proxy_wallet = tp.proxy_wallet
				AND ls.time_window = 'ALL'
			WHERE %s
			GROUP BY tp.condition_id, tp.market_title, tp.slug
			ORDER BY total_value DESC
			LIMIT $%d OFFSET $%d
		`, whereClause, argIndex, argIndex+1)

		argsForMarkets := append(args, limit, offset)
		mRows, err := db.Query(r.Context(), marketsQuery, argsForMarkets...)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": fmt.Sprintf("query markets: %v", err)})
			return
		}
		defer mRows.Close()

		var groupedList []GroupedMarketPositions
		var conditionIDs []string

		for mRows.Next() {
			var gm GroupedMarketPositions
			err := mRows.Scan(
				&gm.ConditionID,
				&gm.MarketTitle,
				&gm.Slug,
				&gm.CurrentPrice,
				&gm.TotalValue,
				&gm.TradersCount,
			)
			if err == nil {
				groupedList = append(groupedList, gm)
				conditionIDs = append(conditionIDs, gm.ConditionID)
			}
		}

		if len(groupedList) == 0 {
			writeJSON(w, http.StatusOK, []GroupedMarketPositions{})
			return
		}

		// 3. Fetch fresh metadata from Polymarket Gamma API (image, end date)
		pm := polymarket.NewClient()
		metadataList, err := pm.GetMarketsByConditionIDs(conditionIDs)
		metadataMap := make(map[string]polymarket.Market)
		if err == nil {
			for _, meta := range metadataList {
				metadataMap[meta.ConditionID] = meta
			}
		} else {
			log.Printf("warning: GetMarketsByConditionIDs failed: %v", err)
		}

		// 4. Fetch individual positions for each market and populate final list
		for i, gm := range groupedList {
			// Query position details for this condition ID
			wherePartsForPositions := append([]string{fmt.Sprintf("tp.condition_id = $%d", argIndex)}, whereParts...)
			whereClauseForPositions := strings.Join(wherePartsForPositions, " AND ")
			argsForPositions := append(args, gm.ConditionID)

			positionsQuery := fmt.Sprintf(`
				SELECT
					tp.proxy_wallet,
					COALESCE(t.user_name, '') as user_name,
					COALESCE(t.profile_image, '') as profile_image,
					COALESCE(t.x_username, '') as x_username,
					COALESCE(ls.score, 0) as score,
					COALESCE(ls.sharpe, 0) as sharpe,
					COALESCE(tp.outcome, '') as outcome,
					tp.avg_price,
					tp.cur_price,
					tp.size,
					tp.current_value,
					tp.cash_pnl,
					tp.percent_pnl
				FROM trader_positions tp
				JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
				LEFT JOIN leaderboard_scores ls
					ON ls.proxy_wallet = tp.proxy_wallet
					AND ls.time_window = 'ALL'
				WHERE %s
				ORDER BY tp.current_value DESC
			`, whereClauseForPositions)

			tRows, err := db.Query(r.Context(), positionsQuery, argsForPositions...)
			if err != nil {
				log.Printf("warning: query positions details failed for %s: %v", gm.ConditionID, err)
				continue
			}

			var traders []MarketPositionDetail
			var yesValue, noValue float64

			for tRows.Next() {
				var p MarketPositionDetail
				err := tRows.Scan(
					&p.ProxyWallet,
					&p.UserName,
					&p.ProfileImage,
					&p.XUsername,
					&p.Score,
					&p.Sharpe,
					&p.Outcome,
					&p.AvgPrice,
					&p.CurrentPrice,
					&p.Size,
					&p.CurrentValue,
					&p.CashPnL,
					&p.PercentPnL,
				)
				if err == nil {
					p.TraderTier = scoreTier(p.Score)
					traders = append(traders, p)

					outcomeLower := strings.ToLower(p.Outcome)
					if outcomeLower == "yes" || outcomeLower == "y" {
						yesValue += p.CurrentValue
					} else if outcomeLower == "no" || outcomeLower == "n" {
						noValue += p.CurrentValue
					}
				}
			}
			tRows.Close()

			// Allocation math
			totalYesNo := yesValue + noValue
			smartYesPct := 0
			smartNoPct := 0
			if totalYesNo > 0 {
				smartYesPct = int(math.Round((yesValue / totalYesNo) * 100))
				smartNoPct = 100 - smartYesPct
			}

			groupedList[i].Positions = traders
			groupedList[i].SmartYesPct = smartYesPct
			groupedList[i].SmartNoPct = smartNoPct

			// Populate enriched metadata
			if meta, found := metadataMap[gm.ConditionID]; found {
				groupedList[i].Icon = meta.Image
				if gm.Icon == "" {
					groupedList[i].Icon = meta.Icon
				}
				groupedList[i].EndDate = meta.EndDate
				if len(meta.Events) > 0 && meta.Events[0].Slug != "" {
					groupedList[i].Slug = meta.Events[0].Slug
				}
			}
		}

		writeJSON(w, http.StatusOK, groupedList)
	}
}

func parseFloatRaw(s, key string) (float64, error) {
	var v float64
	if _, err := fmt.Sscanf(s, "%f", &v); err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return v, nil
}

func scoreTier(score float64) string {
	switch {
	case score >= 80:
		return "Elite"
	case score >= 65:
		return "Great"
	case score >= 50:
		return "Good"
	case score >= 30:
		return "Average"
	default:
		return "Risky"
	}
}
