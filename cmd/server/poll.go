package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/cotishq/vantage/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

func pollAllTraders(ctx context.Context, db *pgxpool.Pool, pm *polymarket.Client) error {
	wallets, err := store.ListTrackedWallets(ctx, db)
	if err != nil {
		return err
	}

	processed := 0
	failed := 0
	totalPositions := 0
	totalActivity := 0

	for i, wallet := range wallets {
		walletFailed := false

		positions, err := pm.GetPositions(wallet, 50, 0)
		if err != nil {
			log.Printf("warning: get positions for %s failed: %v", wallet, err)
			walletFailed = true
		} else {
			for _, position := range positions {
				if err := store.UpsertPosition(ctx, db, wallet, position); err != nil {
					log.Printf("warning: upsert position for %s failed: %v", wallet, err)
					walletFailed = true
					continue
				}
				totalPositions++
			}
		}

		activity, err := pm.GetActivity(wallet, nil, 50, 0)
		if err != nil {
			log.Printf("warning: get activity for %s failed: %v", wallet, err)
			walletFailed = true
		} else {
			for _, event := range activity {
				if err := store.InsertActivity(ctx, db, wallet, event); err != nil {
					log.Printf("warning: insert activity for %s failed: %v", wallet, err)
					walletFailed = true
					continue
				}
				totalActivity++
			}
		}

		if walletFailed {
			failed++
		} else {
			if err := store.MarkPolled(ctx, db, wallet); err != nil {
				log.Printf("warning: mark polled for %s failed: %v", wallet, err)
				failed++
			} else {
				processed++
			}
		}

		if i < len(wallets)-1 {
			time.Sleep(250 * time.Millisecond)
		}
	}

	log.Printf(
		"poll summary: wallets processed=%d positions inserted=%d activity inserted=%d wallets failed=%d",
		processed,
		totalPositions,
		totalActivity,
		failed,
	)

	if failed > 0 {
		return fmt.Errorf("poll completed with %d failed wallets", failed)
	}
	return nil
}
