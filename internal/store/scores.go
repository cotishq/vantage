package store

import (
	"context"
	"fmt"

	"github.com/cotishq/vantage/internal/scoring"
	"github.com/jackc/pgx/v5/pgxpool"
)

func UpsertLeaderboardScore(ctx context.Context, db *pgxpool.Pool, s scoring.LeaderboardScore) error {
	const query = `
		INSERT INTO leaderboard_scores (
			proxy_wallet,
			time_window,
			pnl,
			win_rate,
			max_loss,
			profit_factor,
			consistency,
			sharpe,
			score,
			computed_at
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
			now()
		)
		ON CONFLICT (proxy_wallet, time_window) DO UPDATE SET
			pnl = EXCLUDED.pnl,
			win_rate = EXCLUDED.win_rate,
			max_loss = EXCLUDED.max_loss,
			profit_factor = EXCLUDED.profit_factor,
			consistency = EXCLUDED.consistency,
			sharpe = EXCLUDED.sharpe,
			score = EXCLUDED.score,
			computed_at = now()
	`

	_, err := db.Exec(
		ctx,
		query,
		s.ProxyWallet,
		s.TimeWindow,
		s.PnL,
		s.WinRate,
		s.MaxLoss,
		s.ProfitFactor,
		s.Consistency,
		s.Sharpe,
		s.Score,
	)
	if err != nil {
		return fmt.Errorf("upsert leaderboard score %s %s: %w", s.ProxyWallet, s.TimeWindow, err)
	}
	return nil
}
