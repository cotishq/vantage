package scoring

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"github.com/cotishq/vantage/internal/polymarket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RawMetrics struct {
	ProxyWallet  string
	TimeWindow   string
	PnL          float64 // ALL uses current position snapshot PnL; other windows use activity net cash flow.
	WinRate      float64 // Current-snapshot/lifetime metric, only meaningful for ALL.
	MaxLoss      float64 // Current-snapshot/lifetime metric, only meaningful for ALL.
	ProfitFactor float64 // Current-snapshot/lifetime metric, only meaningful for ALL.
	Consistency  float64 // Window-scoped activity net cash flow metric.
	Sharpe       float64 // Window-scoped activity net cash flow metric.
}

type LeaderboardScore struct {
	RawMetrics
	Score float64
}

func NormalizeAndScore(metrics []RawMetrics) []LeaderboardScore {
	if len(metrics) == 0 {
		return nil
	}

	minPnL, maxPnL := metrics[0].PnL, metrics[0].PnL
	minMaxLoss, maxMaxLoss := metrics[0].MaxLoss, metrics[0].MaxLoss
	for _, metric := range metrics[1:] {
		minPnL = math.Min(minPnL, metric.PnL)
		maxPnL = math.Max(maxPnL, metric.PnL)
		minMaxLoss = math.Min(minMaxLoss, metric.MaxLoss)
		maxMaxLoss = math.Max(maxMaxLoss, metric.MaxLoss)
	}

	scores := make([]LeaderboardScore, 0, len(metrics))
	for _, metric := range metrics {
		normalizedPnL := normalize(metric.PnL, minPnL, maxPnL)
		invertedNormalizedMaxLoss := 1 - normalize(metric.MaxLoss, minMaxLoss, maxMaxLoss)
		normalizedProfitFactor := clamp01(metric.ProfitFactor / 10)

		score := 100 * (0.25*metric.Consistency +
			0.25*normalizedPnL +
			0.20*metric.WinRate +
			0.15*invertedNormalizedMaxLoss +
			0.15*normalizedProfitFactor)

		scores = append(scores, LeaderboardScore{
			RawMetrics: metric,
			Score:      score,
		})
	}
	return scores
}

// windowToLeaderboardTimePeriod maps our internal window name to Polymarket's
// timePeriod enum values. Returns false if the window is not recognized.
func windowToLeaderboardTimePeriod(window string) (polymarket.LeaderboardTimePeriod, bool) {
	switch strings.ToUpper(window) {
	case "DAY":
		return polymarket.LeaderboardTimePeriodDay, true
	case "WEEK":
		return polymarket.LeaderboardTimePeriodWeek, true
	case "MONTH":
		return polymarket.LeaderboardTimePeriodMonth, true
	case "ALL":
		return polymarket.LeaderboardTimePeriodAll, true
	default:
		return "", false
	}
}

func ComputeRawMetrics(ctx context.Context, db *pgxpool.Pool, pm *polymarket.Client, wallet string, window string, windowStart, windowEnd time.Time) (RawMetrics, error) {
	metrics := RawMetrics{
		ProxyWallet: wallet,
		TimeWindow:  window,
	}

	// win_rate, max_loss, profit_factor — computed from trader_positions snapshot.
	// These are ALL-window lifetime metrics only; used as-is for all windows.
	if err := computePositionMetrics(ctx, db, wallet, &metrics); err != nil {
		return RawMetrics{}, err
	}
	// consistency, sharpe — computed from trader_activity, correctly window-scoped.
	if err := computeActivityMetrics(ctx, db, wallet, windowStart, windowEnd, &metrics); err != nil {
		return RawMetrics{}, err
	}

	// Fetch window-accurate PnL from Polymarket's leaderboard API.
	// This overrides the activity-derived PnL for non-ALL windows (and also ALL, for consistency).
	// If the user has no leaderboard entry for the period, PnL stays at 0.
	if timePeriod, ok := windowToLeaderboardTimePeriod(window); ok {
		entry, err := pm.GetLeaderboardForUser(wallet, timePeriod)
		if err != nil {
			log.Printf("warning: GetLeaderboardForUser %s %s: %v — falling back to PnL 0", wallet, window, err)
		} else if entry != nil {
			metrics.PnL = entry.Pnl
		}
	}

	return metrics, nil
}

func ComputeAllRawMetrics(ctx context.Context, db *pgxpool.Pool, pm *polymarket.Client, window string, windowStart, windowEnd time.Time) ([]RawMetrics, error) {
	wallets, err := listTrackedWallets(ctx, db)
	if err != nil {
		return nil, err
	}

	metrics := make([]RawMetrics, 0, len(wallets))
	for _, wallet := range wallets {
		raw, err := ComputeRawMetrics(ctx, db, pm, wallet, window, windowStart, windowEnd)
		if err != nil {
			log.Printf("warning: compute raw metrics for %s failed: %v", wallet, err)
			continue
		}
		metrics = append(metrics, raw)
	}
	return metrics, nil
}

func computePositionMetrics(ctx context.Context, db *pgxpool.Pool, wallet string, metrics *RawMetrics) error {
	const query = `
		SELECT cash_pnl, realized_pnl, redeemable
		FROM trader_positions
		WHERE proxy_wallet = $1
	`

	rows, err := db.Query(ctx, query, wallet)
	if err != nil {
		return fmt.Errorf("query position metrics for %s: %w", wallet, err)
	}
	defer rows.Close()

	wins := 0
	losses := 0
	winPnL := 0.0
	lossPnL := 0.0
	maxLoss := 0.0

	for rows.Next() {
		var cashPnL float64
		var realizedPnL float64
		var redeemable bool
		if err := rows.Scan(&cashPnL, &realizedPnL, &redeemable); err != nil {
			return fmt.Errorf("scan position metrics for %s: %w", wallet, err)
		}

		// metrics.PnL always reflects total dollar exposure regardless of realization status.
		metrics.PnL += cashPnL

		// Determine the single relevantPnL used for win/loss classification:
		//   1. If realized_pnl != 0, use it (position is closed/redeemed).
		//   2. Else if redeemable, use cash_pnl as a proxy (outcome is known).
		//   3. Otherwise, outcome is not yet known — skip this position entirely.
		var relevantPnL float64
		if realizedPnL != 0 {
			relevantPnL = realizedPnL
		} else if redeemable {
			relevantPnL = cashPnL
		} else {
			// Open, non-redeemable position with no realized PnL — exclude from scoring.
			continue
		}

		switch {
		case relevantPnL > 0:
			wins++
			winPnL += relevantPnL
		case relevantPnL < 0:
			losses++
			lossPnL += relevantPnL
			if losses == 1 || relevantPnL < maxLoss {
				maxLoss = relevantPnL
			}
			// exactly 0 is neither win nor loss
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate position metrics for %s: %w", wallet, err)
	}

	resolved := wins + losses
	if resolved > 0 {
		metrics.WinRate = float64(wins) / float64(resolved)
	}
	metrics.MaxLoss = maxLoss

	switch {
	case wins == 0 && losses == 0:
		metrics.ProfitFactor = 0
	case losses == 0:
		metrics.ProfitFactor = 10
	default:
		metrics.ProfitFactor = winPnL / math.Abs(lossPnL)
	}

	return nil
}

func computeActivityMetrics(ctx context.Context, db *pgxpool.Pool, wallet string, windowStart, windowEnd time.Time, metrics *RawMetrics) error {
	const query = `
		SELECT COALESCE(SUM(
			CASE
				WHEN activity_type = 'REDEEM' THEN size
				WHEN activity_type = 'TRADE' AND side = 'BUY' THEN -price * size
				WHEN activity_type = 'TRADE' AND side = 'SELL' THEN price * size
				ELSE 0
			END
		), 0)
		FROM trader_activity
		WHERE proxy_wallet = $1
			AND occurred_at BETWEEN $2 AND $3
			AND activity_type IN ('TRADE', 'REDEEM')
		GROUP BY date_trunc('day', occurred_at AT TIME ZONE 'UTC')
		ORDER BY date_trunc('day', occurred_at AT TIME ZONE 'UTC')
	`

	rows, err := db.Query(ctx, query, wallet, windowStart, windowEnd)
	if err != nil {
		return fmt.Errorf("query activity metrics for %s: %w", wallet, err)
	}
	defer rows.Close()

	// Simplification: trader_activity has trade cash flow, not resolved PnL.
	// REDEEM size is treated as positive inflow even though losing-token redemption handling may differ.
	var dailyFlows []float64
	activityPnL := 0.0
	positiveDays := 0
	for rows.Next() {
		var flow float64
		if err := rows.Scan(&flow); err != nil {
			return fmt.Errorf("scan activity metrics for %s: %w", wallet, err)
		}
		dailyFlows = append(dailyFlows, flow)
		activityPnL += flow
		if flow > 0 {
			positiveDays++
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate activity metrics for %s: %w", wallet, err)
	}

	if !isAllWindow(metrics.TimeWindow) {
		metrics.PnL = activityPnL
	}

	activeDays := len(dailyFlows)
	if activeDays == 0 {
		return nil
	}

	metrics.Consistency = float64(positiveDays) / float64(activeDays)
	if activeDays < 2 {
		return nil
	}

	mean := 0.0
	for _, flow := range dailyFlows {
		mean += flow
	}
	mean /= float64(activeDays)

	variance := 0.0
	for _, flow := range dailyFlows {
		diff := flow - mean
		variance += diff * diff
	}
	stddev := math.Sqrt(variance / float64(activeDays))
	if stddev == 0 {
		return nil
	}
	metrics.Sharpe = mean / stddev
	return nil
}

func isAllWindow(window string) bool {
	return strings.EqualFold(window, "ALL")
}

func listTrackedWallets(ctx context.Context, db *pgxpool.Pool) ([]string, error) {
	const query = `
		SELECT proxy_wallet
		FROM traders
		ORDER BY proxy_wallet
	`

	rows, err := db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list tracked wallets: %w", err)
	}
	defer rows.Close()

	var wallets []string
	for rows.Next() {
		var wallet string
		if err := rows.Scan(&wallet); err != nil {
			return nil, fmt.Errorf("scan tracked wallet: %w", err)
		}
		wallets = append(wallets, wallet)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate tracked wallets: %w", err)
	}
	return wallets, nil
}

func normalize(value, minValue, maxValue float64) float64 {
	if minValue == maxValue {
		return 0.5
	}
	return (value - minValue) / (maxValue - minValue)
}

func clamp01(value float64) float64 {
	return math.Max(0, math.Min(1, value))
}
