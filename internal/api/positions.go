package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// topPositionEntry mirrors the predicting.top /api/p/overview response shape exactly.
type topPositionEntry struct {
	ID            string  `json:"id"`             // CLOB asset token id
	Market        string  `json:"market"`         // market_title
	Outcome       string  `json:"outcome"`        // "Yes" / "No" / team name etc.
	Size          float64 `json:"size"`           // number of shares held
	CurrentValue  float64 `json:"current_value"`  // current_value in USD
	AvgPrice      float64 `json:"avg_price"`      // avg entry price (0–1)
	CurrentPrice  float64 `json:"current_price"`  // latest market price (0–1)
	CashPnL       float64 `json:"cash_pnl"`       // unrealised P&L in USD
	PercentPnL    float64 `json:"percent_pnl"`    // P&L as % of cost basis
	Icon          string  `json:"icon"`           // market icon URL (empty until Gamma enrichment)
	PolymarketURL string  `json:"polymarket_url"` // deep link to Polymarket event
	EndDate       string  `json:"end_date"`       // resolution date (empty until Gamma enrichment)
	TraderName    string  `json:"trader_name"`
	TraderWallet  string  `json:"trader_wallet"`
	TraderPfp     string  `json:"trader_pfp"`
	TraderScore   float64 `json:"trader_score"`
	TraderTier    string  `json:"trader_tier"`
	TraderSharpe  float64 `json:"trader_sharpe"`
}

// GetTopPositionsHandler returns GET /positions.
//
// Query params:
//   - side     optional "Yes" or "No" — prefix-matches outcome (case-insensitive)
//   - minValue optional float, default 1000 — filters current_value >= minValue
//   - sort     optional "score" | "sharpe" | "value" (default) — sort column, always DESC
//   - limit    default 50, max 200
//   - offset   default 0
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

		// --- sort ---
		sortCol, ok := positionsSortColumn(q.Get("sort"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sort must be 'score', 'sharpe', or 'value'"})
			return
		}

		// --- limit / offset ---
		limit, err := parseIntQuery(r, "limit", 50)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if limit < 1 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}

		offset, err := parseIntQuery(r, "offset", 0)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if offset < 0 {
			offset = 0
		}

		positions, err := listTopPositions(r.Context(), db, side, minValue, sortCol, limit, offset)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, positions)
	}
}

func listTopPositions(ctx context.Context, db *pgxpool.Pool, side string, minValue float64, sortCol string, limit, offset int) ([]topPositionEntry, error) {
	// sortCol is already validated and safe to interpolate.
	query := fmt.Sprintf(`
		SELECT
			tp.asset,
			COALESCE(tp.market_title, ''),
			COALESCE(tp.outcome, ''),
			tp.size,
			tp.current_value,
			tp.avg_price,
			tp.cur_price,
			tp.cash_pnl,
			tp.percent_pnl,
			COALESCE(tp.slug, ''),
			tp.proxy_wallet,
			COALESCE(t.user_name, ''),
			COALESCE(t.profile_image, ''),
			COALESCE(ls.score, 0),
			COALESCE(ls.sharpe, 0)
		FROM trader_positions tp
		JOIN traders t ON t.proxy_wallet = tp.proxy_wallet
		LEFT JOIN leaderboard_scores ls
			ON ls.proxy_wallet = tp.proxy_wallet
			AND ls.time_window = 'ALL'
		WHERE tp.current_value >= $1
			AND ($2::text IS NULL OR lower(tp.outcome) LIKE $2)
		ORDER BY %s DESC
		LIMIT $3 OFFSET $4
	`, sortCol)

	// outcome prefix: "yes" → "yes%%" matches "Yes", "YES", etc.
	var outcomeFilter *string
	if side != "" {
		f := side + "%"
		outcomeFilter = &f
	}

	rows, err := db.Query(ctx, query, minValue, outcomeFilter, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("query top positions: %w", err)
	}
	defer rows.Close()

	entries := make([]topPositionEntry, 0, limit)
	for rows.Next() {
		var e topPositionEntry
		var slug string
		var score pgtype.Float8
		var sharpe pgtype.Float8

		if err := rows.Scan(
			&e.ID,
			&e.Market,
			&e.Outcome,
			&e.Size,
			&e.CurrentValue,
			&e.AvgPrice,
			&e.CurrentPrice,
			&e.CashPnL,
			&e.PercentPnL,
			&slug,
			&e.TraderWallet,
			&e.TraderName,
			&e.TraderPfp,
			&score,
			&sharpe,
		); err != nil {
			return nil, fmt.Errorf("scan top position: %w", err)
		}

		if score.Valid {
			e.TraderScore = score.Float64
		}
		if sharpe.Valid {
			e.TraderSharpe = sharpe.Float64
		}
		e.TraderTier = scoreTier(e.TraderScore)

		// Build Polymarket deep-link from slug (same pattern predicting.top uses).
		if slug != "" {
			e.PolymarketURL = "https://polymarket.com/event/" + slug + "/" + slug
		}
		// icon and end_date are left empty — requires Gamma API enrichment (future work).

		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate top positions: %w", err)
	}
	return entries, nil
}

// positionsSortColumn maps the user-supplied sort param to a safe, whitelisted SQL expression.
func positionsSortColumn(sort string) (string, bool) {
	switch sort {
	case "", "value":
		return "tp.current_value", true
	case "score":
		return "COALESCE(ls.score, 0)", true
	case "sharpe":
		return "COALESCE(ls.sharpe, 0)", true
	default:
		return "", false
	}
}

// scoreTier maps a 0–100 score to a trader tier label matching predicting.top's labels.
// Thresholds derived from observed data: 79.4 → "Great", 62.3 → "Good".
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

func parseFloatRaw(s, key string) (float64, error) {
	var v float64
	if _, err := fmt.Sscanf(s, "%f", &v); err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return v, nil
}
