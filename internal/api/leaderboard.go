package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type leaderboardEntry struct {
	Rank          int       `json:"rank"`
	ProxyWallet   string    `json:"proxy_wallet"`
	UserName      string    `json:"user_name"`
	XUsername     string    `json:"x_username"`
	VerifiedBadge bool      `json:"verified_badge"`
	ProfileImage  string    `json:"profile_image"`
	PnL           float64   `json:"pnl"`
	WinRate       float64   `json:"win_rate"`
	MaxLoss       float64   `json:"max_loss"`
	ProfitFactor  float64   `json:"profit_factor"`
	Consistency   float64   `json:"consistency"`
	Sharpe        float64   `json:"sharpe"`
	Score         float64   `json:"score"`
	ComputedAt    time.Time `json:"computed_at"`
}

func GetLeaderboardHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		window := r.URL.Query().Get("window")
		if window == "" {
			window = "ALL"
		}

		sortColumn, ok := leaderboardSortColumn(r.URL.Query().Get("sort"))
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sort"})
			return
		}

		limit, err := parseIntQuery(r, "limit", 50)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if limit < 1 {
			limit = 50
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

		xLinked := r.URL.Query().Get("xLinked") == "true"
		order := r.URL.Query().Get("order")
		if order != "asc" && order != "desc" {
			order = "desc"
		}
		search := r.URL.Query().Get("search")

		totalCount, err := countLeaderboard(r.Context(), db, window, xLinked, search)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		entries, err := listLeaderboard(r.Context(), db, window, sortColumn, order, limit, offset, xLinked, search)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		w.Header().Set("X-Total-Count", strconv.Itoa(totalCount))
		writeJSON(w, http.StatusOK, entries)
	}
}

func countLeaderboard(ctx context.Context, db *pgxpool.Pool, window string, xLinked bool, search string) (int, error) {
	whereClause := "WHERE ls.time_window = $1"
	if xLinked {
		whereClause += " AND t.x_username IS NOT NULL AND t.x_username != ''"
	}
	var args []any
	args = append(args, window)

	if search != "" {
		whereClause += " AND (t.user_name ILIKE $2 OR t.proxy_wallet ILIKE $2)"
		args = append(args, "%"+search+"%")
	}

	query := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM leaderboard_scores ls
		JOIN traders t ON t.proxy_wallet = ls.proxy_wallet
		%s
	`, whereClause)

	var count int
	err := db.QueryRow(ctx, query, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count leaderboard: %w", err)
	}
	return count, nil
}

func listLeaderboard(ctx context.Context, db *pgxpool.Pool, window, sortColumn, order string, limit, offset int, xLinked bool, search string) ([]leaderboardEntry, error) {
	whereClause := "WHERE ls.time_window = $1"
	if xLinked {
		whereClause += " AND t.x_username IS NOT NULL AND t.x_username != ''"
	}
	var args []any
	args = append(args, window, limit, offset)

	if search != "" {
		whereClause += " AND (t.user_name ILIKE $4 OR t.proxy_wallet ILIKE $4)"
		args = append(args, "%"+search+"%")
	}

	query := fmt.Sprintf(`
		SELECT
			ls.proxy_wallet,
			COALESCE(t.user_name, ''),
			COALESCE(t.x_username, ''),
			t.verified_badge,
			COALESCE(t.profile_image, ''),
			ls.pnl,
			ls.win_rate,
			ls.max_loss,
			ls.profit_factor,
			ls.consistency,
			ls.sharpe,
			ls.score,
			ls.computed_at
		FROM leaderboard_scores ls
		JOIN traders t ON t.proxy_wallet = ls.proxy_wallet
		%s
		ORDER BY ls.%s %s
		LIMIT $2 OFFSET $3
	`, whereClause, sortColumn, order)

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query leaderboard: %w", err)
	}
	defer rows.Close()

	entries := make([]leaderboardEntry, 0, limit)
	rank := offset + 1
	for rows.Next() {
		var entry leaderboardEntry
		entry.Rank = rank
		if err := rows.Scan(
			&entry.ProxyWallet,
			&entry.UserName,
			&entry.XUsername,
			&entry.VerifiedBadge,
			&entry.ProfileImage,
			&entry.PnL,
			&entry.WinRate,
			&entry.MaxLoss,
			&entry.ProfitFactor,
			&entry.Consistency,
			&entry.Sharpe,
			&entry.Score,
			&entry.ComputedAt,
		); err != nil {
			return nil, fmt.Errorf("scan leaderboard: %w", err)
		}
		entries = append(entries, entry)
		rank++
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate leaderboard: %w", err)
	}
	return entries, nil
}

func leaderboardSortColumn(sort string) (string, bool) {
	switch sort {
	case "", "score":
		return "score", true
	case "pnl":
		return "pnl", true
	case "sharpe":
		return "sharpe", true
	default:
		return "", false
	}
}

func parseIntQuery(r *http.Request, key string, fallback int) (int, error) {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return parsed, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("warning: write json response failed: %v", err)
	}
}
