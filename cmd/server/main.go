package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/cotishq/vantage/internal/api"
	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/cotishq/vantage/internal/scoring"
	"github.com/cotishq/vantage/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dsn := envOrDefault("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/vantage?sslmode=disable")
	port := envOrDefault("PORT", "8081")
	ctx := context.Background()

	db, err := store.New(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to connect to db: %v", err)
	}
	defer db.Close()

	log.Println("connected to postgres")

	pm := polymarket.NewClient()
	leaderboardParams := polymarket.LeaderboardParams{
		Category:   polymarket.LeaderboardCategoryOverall,
		TimePeriod: polymarket.LeaderboardTimePeriodDay,
		OrderBy:    polymarket.LeaderboardOrderByPnl,
		Limit:      50,
	}

	entries, err := pm.GetLeaderboard(leaderboardParams)
	if err != nil {
		log.Printf("warning: seed leaderboard failed: %v", err)
	} else {
		seeded := 0
		for _, entry := range entries {
			err := store.UpsertTrader(ctx, db, store.Trader{
				ProxyWallet:   entry.ProxyWallet,
				UserName:      entry.UserName,
				XUsername:     entry.XUsername,
				VerifiedBadge: entry.VerifiedBadge,
				ProfileImage:  entry.ProfileImage,
			})
			if err != nil {
				log.Printf("warning: seed trader %s failed: %v", entry.ProxyWallet, err)
				continue
			}
			seeded++
		}
		log.Printf("seeded %d traders", seeded)
	}

	go func() {
		tickCount := 0
		runPollAndScore(ctx, db, pm, tickCount)

		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			tickCount++
			runPollAndScore(ctx, db, pm, tickCount)
		}
	}()
	log.Println("background poll+score started, server is ready")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"http://localhost:3001", "https://*.vercel.app"},
		AllowedMethods: []string{"GET", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/leaderboard", api.GetLeaderboardHandler(db))
	r.Get("/recent-trades", api.GetRecentTradesHandler(db))
	r.Get("/positions", api.GetTopPositionsHandler(db))

	r.Get("/debug/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		entries, err := pm.GetLeaderboard(leaderboardParams)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, entries)
	})

	addr := ":" + port
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func runPollAndScore(ctx context.Context, db *pgxpool.Pool, pm *polymarket.Client, tickCount int) {
	if err := pollAllTraders(ctx, db, pm); err != nil {
		log.Printf("warning: poll traders failed: %v", err)
	}

	// Compute, normalize, and persist leaderboard scores for the ALL window.
	allRawMetrics, err := scoring.ComputeAllRawMetrics(ctx, db, pm, "ALL", time.Time{}, time.Now())
	if err != nil {
		log.Printf("warning: compute raw metrics (ALL) failed: %v", err)
		return
	}
	allScores := scoring.NormalizeAndScore(allRawMetrics)

	// Build a lookup map so sub-windows can copy ALL-time values for metrics
	// that aren't genuinely window-accurate yet.
	allScoreByWallet := make(map[string]scoring.LeaderboardScore, len(allScores))
	for _, s := range allScores {
		allScoreByWallet[s.ProxyWallet] = s
	}

	savedAll := 0
	for _, s := range allScores {
		if err := store.UpsertLeaderboardScore(ctx, db, s); err != nil {
			log.Printf("warning: save score for %s (ALL) failed: %v", s.ProxyWallet, err)
			continue
		}
		savedAll++
	}
	log.Printf("computed and saved %d leaderboard scores (ALL)", savedAll)

	// Compute and save DAY/WEEK/MONTH windows.
	//
	// Design note (intentional): DAY/WEEK/MONTH currently only have correct PnL
	// (from Polymarket's leaderboard API) and Sharpe (from windowed activity).
	// win_rate, max_loss, profit_factor, consistency, and the overall Score are
	// copied from the ALL window for context, because those metrics rely on
	// trader_positions which is a current snapshot with no per-trade timestamps —
	// genuine window-scoped reconstruction from activity events is a future task.
	//
	// Rate-limiting: DAY/WEEK/MONTH are only recomputed every 4th tick (~20 min)
	// to reduce Polymarket API load. ALL is computed every tick as the primary window.
	if tickCount%4 != 0 {
		log.Printf("skipping DAY/WEEK/MONTH sub-windows on tick %d (runs every 4th tick)", tickCount)
		return
	}

	now := time.Now().UTC()
	subWindows := []struct {
		name  string
		start time.Time
	}{
		{"DAY", now.Add(-24 * time.Hour)},
		{"WEEK", now.Add(-7 * 24 * time.Hour)},
		{"MONTH", now.Add(-30 * 24 * time.Hour)},
	}

	for _, w := range subWindows {
		rawMetrics, err := scoring.ComputeAllRawMetrics(ctx, db, pm, w.name, w.start, now)
		if err != nil {
			log.Printf("warning: compute raw metrics (%s) failed: %v", w.name, err)
			continue
		}
		scores := scoring.NormalizeAndScore(rawMetrics)

		saved := 0
		for _, s := range scores {
			allS, hasAll := allScoreByWallet[s.ProxyWallet]
			if hasAll {
				// Copy ALL-time values for metrics that aren't window-accurate yet.
				// Consistency is intentionally NOT copied — it's computed from windowed
				// activity (same source as Sharpe) and is genuinely window-scoped.
				s.WinRate = allS.WinRate
				s.MaxLoss = allS.MaxLoss
				s.ProfitFactor = allS.ProfitFactor
				s.Score = allS.Score
			}
			if err := store.UpsertLeaderboardScore(ctx, db, s); err != nil {
				log.Printf("warning: save score for %s (%s) failed: %v", s.ProxyWallet, w.name, err)
				continue
			}
			saved++
		}
		log.Printf("computed and saved %d leaderboard scores (%s)", saved, w.name)
	}
}


func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("warning: write json response failed: %v", err)
	}
}
