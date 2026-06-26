package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/cotishq/vantage/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("warning: write json response failed: %v", err)
	}
}
