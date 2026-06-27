package store

import (
	"context"
	"fmt"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

func InsertActivity(ctx context.Context, db *pgxpool.Pool, walletAddr string, a polymarket.Activity) error {
	const query = `
		INSERT INTO trader_activity (
			proxy_wallet,
			activity_type,
			side,
			condition_id,
			asset,
			market_title,
			market_slug,
			outcome,
			size,
			price,
			occurred_at
		)
		VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11
		)
		ON CONFLICT (proxy_wallet, condition_id, side, size, price, occurred_at) DO NOTHING
	`

	occurredAt := time.Unix(a.Timestamp, 0).UTC()
	_, err := db.Exec(
		ctx,
		query,
		walletAddr,
		a.Type,
		a.Side,
		a.ConditionID,
		a.Asset,
		a.Title,
		a.Slug,
		a.Outcome,
		a.Size,
		a.Price,
		occurredAt,
	)
	if err != nil {
		return fmt.Errorf("insert activity %s %s %s %s: %w", walletAddr, a.ConditionID, a.Side, occurredAt.Format(time.RFC3339), err)
	}
	return nil
}
