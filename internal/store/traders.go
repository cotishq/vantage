package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Trader struct {
	ProxyWallet   string
	UserName      string
	XUsername     string
	VerifiedBadge bool
	ProfileImage  string
	FirstSeenAt   *time.Time
}

func UpsertTrader(ctx context.Context, db *pgxpool.Pool, t Trader) error {
	const query = `
		INSERT INTO traders (
			proxy_wallet,
			user_name,
			x_username,
			verified_badge,
			profile_image,
			first_seen_at
		)
		VALUES (
			$1,
			$2,
			$3,
			$4,
			$5,
			COALESCE($6::timestamptz, now())
		)
		ON CONFLICT (proxy_wallet) DO UPDATE SET
			user_name = EXCLUDED.user_name,
			x_username = EXCLUDED.x_username,
			verified_badge = EXCLUDED.verified_badge,
			profile_image = EXCLUDED.profile_image
	`

	_, err := db.Exec(
		ctx,
		query,
		t.ProxyWallet,
		t.UserName,
		t.XUsername,
		t.VerifiedBadge,
		t.ProfileImage,
		t.FirstSeenAt,
	)
	if err != nil {
		return fmt.Errorf("upsert trader %s: %w", t.ProxyWallet, err)
	}
	return nil
}

func MarkPolled(ctx context.Context, db *pgxpool.Pool, wallet string) error {
	const query = `
		UPDATE traders
		SET last_polled_at = now()
		WHERE proxy_wallet = $1
	`

	if _, err := db.Exec(ctx, query, wallet); err != nil {
		return fmt.Errorf("mark trader polled %s: %w", wallet, err)
	}
	return nil
}
