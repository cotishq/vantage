package store

import (
	"context"
	"fmt"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

func UpsertPosition(ctx context.Context, db *pgxpool.Pool, walletAddr string, p polymarket.Position) error {
	const query = `
		INSERT INTO trader_positions (
			proxy_wallet,
			condition_id,
			asset,
			market_title,
			outcome,
			size,
			avg_price,
			initial_value,
			current_value,
			cash_pnl,
			percent_pnl,
			realized_pnl,
			redeemable,
			cur_price,
			slug,
			snapshot_at
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
			$11,
			$12,
			$13,
			$14,
			$15,
			now()
		)
		ON CONFLICT (proxy_wallet, condition_id, asset) DO UPDATE SET
			market_title  = EXCLUDED.market_title,
			outcome       = EXCLUDED.outcome,
			size          = EXCLUDED.size,
			avg_price     = EXCLUDED.avg_price,
			initial_value = EXCLUDED.initial_value,
			current_value = EXCLUDED.current_value,
			cash_pnl      = EXCLUDED.cash_pnl,
			percent_pnl   = EXCLUDED.percent_pnl,
			realized_pnl  = EXCLUDED.realized_pnl,
			redeemable    = EXCLUDED.redeemable,
			cur_price     = EXCLUDED.cur_price,
			slug          = EXCLUDED.slug,
			snapshot_at   = EXCLUDED.snapshot_at
	`

	_, err := db.Exec(
		ctx,
		query,
		walletAddr,
		p.ConditionID,
		p.Asset,
		p.Title,
		p.Outcome,
		p.Size,
		p.AvgPrice,
		p.InitialValue,
		p.CurrentValue,
		p.CashPnl,
		p.PercentPnl,
		p.RealizedPnl,
		p.Redeemable,
		p.CurPrice,
		p.Slug,
	)
	if err != nil {
		return fmt.Errorf("upsert position %s %s %s: %w", walletAddr, p.ConditionID, p.Asset, err)
	}
	return nil
}
