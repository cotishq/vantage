"use client";

import { useEffect, useState } from "react";

import { SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ConsensusSignal {
  condition_id: string;
  market_title: string;
  market_slug: string;
  market_link: string;
  market_icon: string;
  end_date: string;
  outcome: string;
  profitable_traders: number;
  total_size: number;
  total_value: number;
  avg_entry_price: number;
  avg_current_price: number;
  total_cash_pnl: number;
  avg_trader_score: number;
  recent_buy_count: number;
  unrealized_roi: number;
  confidence_score: number;
  traders: ConsensusSignalTrader[];
}

interface ConsensusSignalTrader {
  proxy_wallet: string;
  user_name: string;
  profile_image: string;
  x_username: string;
  score: number;
  sharpe: number;
  outcome: string;
  avg_price: number;
  current_price: number;
  size: number;
  current_value: number;
  cash_pnl: number;
  percent_pnl: number;
  trader_tier: string;
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${value < 0 ? "-" : ""}$${(abs / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrice(value: number): string {
  return `${Math.round(value * 100)}¢`;
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

function initials(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

function formatDaysLeft(endDate: string): string {
  if (!endDate) return "";
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days}d left`;
}

function confidenceColor(score: number): string {
  if (score >= 75) return "text-emerald-500 dark:text-emerald-400";
  if (score >= 55) return "text-amber-500 dark:text-amber-400";
  return "text-zinc-400";
}

function confidenceBg(score: number): string {
  if (score >= 75)
    return "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400";
  if (score >= 55)
    return "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400";
  return "bg-zinc-500/10 border-zinc-500/20 text-zinc-500 dark:text-zinc-400";
}

function confidenceRing(score: number): string {
  if (score >= 75) return "ring-emerald-500/30";
  if (score >= 55) return "ring-amber-500/30";
  return "ring-zinc-500/20";
}

function outcomeClass(outcome: string): string {
  return outcome.toLowerCase() === "yes"
    ? "border-emerald-600/30 bg-emerald-600/20 text-emerald-600 dark:text-emerald-400"
    : "border-rose-600/30 bg-rose-600/20 text-rose-600 dark:text-rose-400";
}

// ─── Skeleton Cards ──────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card
          key={i}
          className="border-zinc-200 bg-white dark:border-white/5 dark:bg-zinc-900/80"
        >
          <CardHeader className="border-b border-zinc-100 dark:border-white/5 pb-5">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-xl bg-zinc-200 dark:bg-zinc-700/60" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-72 bg-zinc-200 dark:bg-zinc-700/60" />
                <Skeleton className="h-3 w-20 bg-zinc-200 dark:bg-zinc-700/60" />
              </div>
              <Skeleton className="h-10 w-16 rounded-xl bg-zinc-200 dark:bg-zinc-700/60" />
            </div>
            <div className="mt-4 flex gap-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton
                  key={j}
                  className="h-14 flex-1 rounded-lg bg-zinc-200 dark:bg-zinc-700/60"
                />
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 py-3">
                <Skeleton className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700/60" />
                <Skeleton className="h-4 w-28 bg-zinc-200 dark:bg-zinc-700/60" />
                <Skeleton className="ml-auto h-4 w-16 bg-zinc-200 dark:bg-zinc-700/60" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Stat Chip ───────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]">
      <span className="font-sans text-[9px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${valueClass || "text-zinc-800 dark:text-zinc-200"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Signal Card ─────────────────────────────────────────────────────────────

function SignalCard({
  signal,
  rank,
}: {
  signal: ConsensusSignal;
  rank: number;
}) {
  const daysLeft = formatDaysLeft(signal.end_date);
  const roiPositive = signal.unrealized_roi >= 0;

  return (
    <Card className="group/signal overflow-hidden border-zinc-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg dark:border-white/5 dark:bg-zinc-900/80 dark:shadow-black/20 dark:hover:shadow-black/40">
      {/* ── Card Header: Market Info ────────────────────────────────── */}
      <CardHeader className="border-b border-zinc-100 pb-0 dark:border-white/5">
        <div className="flex items-start gap-4">
          {/* Rank + Icon */}
          <div className="relative flex-shrink-0">
            <span className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 font-mono text-[10px] font-bold text-white ring-2 ring-white dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-900">
              {rank}
            </span>
            {signal.market_icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signal.market_icon}
                alt=""
                className="h-12 w-12 rounded-xl object-cover ring-1 ring-zinc-200 dark:ring-white/10"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 font-sans text-sm font-bold text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-white/10">
                PM
              </div>
            )}
          </div>

          {/* Title + Meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {signal.market_link ? (
                <a
                  href={signal.market_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-sans text-base font-semibold text-zinc-900 transition-colors hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
                  title={signal.market_title}
                >
                  {signal.market_title}
                </a>
              ) : (
                <span
                  className="truncate font-sans text-base font-semibold text-zinc-900 dark:text-white"
                  title={signal.market_title}
                >
                  {signal.market_title}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                className={`border font-mono text-[11px] font-semibold ${outcomeClass(signal.outcome)}`}
              >
                {signal.outcome}
              </Badge>
              {daysLeft && (
                <span className="font-sans text-[11px] text-zinc-400 dark:text-zinc-500">
                  {daysLeft}
                </span>
              )}
            </div>
          </div>

          {/* Confidence Score */}
          <div
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 ${confidenceBg(signal.confidence_score)}`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-widest opacity-70">
              Confidence
            </span>
            <span className="font-mono text-xl font-bold tabular-nums leading-none">
              {signal.confidence_score.toFixed(1)}
            </span>
          </div>
        </div>

        {/* ── Stat Chips Row ──────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-3 gap-2 pb-4 sm:grid-cols-6">
          <StatChip
            label="Entry"
            value={formatPrice(signal.avg_entry_price)}
          />
          <StatChip
            label="Current"
            value={formatPrice(signal.avg_current_price)}
          />
          <StatChip
            label="ROI"
            value={formatPercent(signal.unrealized_roi)}
            valueClass={
              roiPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }
          />
          <StatChip
            label="Traders"
            value={String(signal.profitable_traders)}
          />
          <StatChip label="Value" value={formatCurrency(signal.total_value)} />
          <StatChip
            label="Buys 24h"
            value={String(signal.recent_buy_count)}
            valueClass={
              signal.recent_buy_count > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-800 dark:text-zinc-200"
            }
          />
        </div>
      </CardHeader>

      {/* ── Card Body: Traders Table ────────────────────────────────── */}
      <CardContent className="px-0 py-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="border-zinc-100 hover:bg-transparent dark:border-white/5">
                <TableHead className="pl-6 font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Trader
                </TableHead>
                <TableHead className="font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Side
                </TableHead>
                <TableHead className="text-right font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Score
                </TableHead>
                <TableHead className="text-right font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Entry
                </TableHead>
                <TableHead className="text-right font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Current
                </TableHead>
                <TableHead className="text-right font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  P&amp;L
                </TableHead>
                <TableHead className="pr-6 text-right font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  Value
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signal.traders.map((trader) => {
                const displayName =
                  trader.user_name || truncateWallet(trader.proxy_wallet);

                return (
                  <TableRow
                    key={`${signal.condition_id}:${signal.outcome}:${trader.proxy_wallet}`}
                    className="border-zinc-100 transition-colors duration-100 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-white/[0.015]"
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2.5">
                        {trader.profile_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={trader.profile_image}
                            alt={displayName}
                            className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-white/10"
                          />
                        ) : (
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-white/10">
                            {initials(displayName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          {trader.user_name ? (
                            <a
                              href={`https://polymarket.com/@${trader.user_name}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-[140px] truncate font-sans text-sm font-medium text-zinc-800 transition-colors hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-400"
                              title={displayName}
                            >
                              {displayName}
                            </a>
                          ) : (
                            <span
                              className="block max-w-[140px] truncate font-sans text-sm font-medium text-zinc-600 dark:text-zinc-400"
                              title={displayName}
                            >
                              {displayName}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border font-mono text-[10px] ${outcomeClass(trader.outcome)}`}
                      >
                        {trader.outcome.slice(0, 1).toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {trader.score.toFixed(0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatPrice(trader.avg_price)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatPrice(trader.current_price)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-semibold tabular-nums ${
                        trader.cash_pnl >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatCurrencyFull(trader.cash_pnl)}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatCurrencyFull(trader.current_value)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ConsensusSignalsPage() {
  const [signals, setSignals] = useState<ConsensusSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;

    fetch(`${baseUrl}/signals/consensus?limit=10`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data: ConsensusSignal[]) => {
        setSignals(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-white/5 dark:bg-zinc-900/60">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center">
          <div>
            <h1 className="font-sans text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Vantage
            </h1>
            <p className="font-sans text-sm font-normal text-zinc-500 dark:text-zinc-400">
              Consensus Signals
            </p>
          </div>
          <SiteNav />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-sans text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Profitable wallet overlap
            </p>
            <h2 className="mt-1 font-sans text-xl font-semibold text-zinc-900 dark:text-white">
              Top candidate markets to inspect for your next bet
            </h2>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Active positions where profitable tracked traders hold the same
              outcome, ranked by overlap, position value, entry/current spread,
              score, and recent buys.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 font-sans text-sm text-rose-400">
            Failed to load consensus signals: {error}
          </div>
        )}

        {loading ? (
          <SkeletonCards />
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="font-sans text-sm text-zinc-500">
              No consensus signals yet.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {signals.map((signal, index) => (
              <SignalCard
                key={`${signal.condition_id}:${signal.outcome}`}
                signal={signal}
                rank={index + 1}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-center font-sans text-xs text-zinc-400 dark:text-zinc-500">
          Signals are a shortlist for research, not recommendations. Check market
          context and liquidity before acting.
        </p>
      </div>
    </main>
  );
}
