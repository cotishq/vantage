"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SiteNav } from "@/components/site-nav";

interface RecentTrade {
  proxy_wallet: string;
  user_name: string | null;
  profile_image: string | null;
  market_title: string;
  outcome: string;
  price: number;
  size: number;
  occurred_at: string;
  score: number | null;
  sharpe: number | null;
}

type MetricMode = "score" | "sharpe";

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

function initials(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function tradeKey(trade: RecentTrade): string {
  return `${trade.proxy_wallet}:${trade.market_title}:${trade.occurred_at}:${trade.price}:${trade.size}`;
}

function mergeTrades(current: RecentTrade[], incoming: RecentTrade[]): RecentTrade[] {
  const seen = new Set(current.map(tradeKey));
  const fresh = incoming.filter((trade) => {
    const key = tradeKey(trade);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...fresh, ...current].slice(0, 50);
}

function metricBadgeClass(value: number | null): string {
  if (value === null || value === 0) {
    return "border-zinc-600/40 bg-zinc-600/10 text-zinc-400 hover:bg-zinc-600/20";
  }
  if (value > 0) {
    return "border-emerald-600/30 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30";
  }
  return "border-rose-600/30 bg-rose-600/20 text-rose-400 hover:bg-rose-600/30";
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i} className="border-white/5">
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-zinc-700/60" />
              <Skeleton className="h-4 w-28 bg-zinc-700/60" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16 rounded-full bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-56 bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-8 rounded-full bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-12 bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-20 bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-20 bg-zinc-700/60" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function TraderCell({ trade }: { trade: RecentTrade }) {
  const displayName = trade.user_name || truncateWallet(trade.proxy_wallet);

  return (
    <div className="flex items-center gap-3">
      {trade.profile_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trade.profile_image}
          alt={displayName}
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-400 ring-1 ring-white/10">
          {initials(displayName)}
        </div>
      )}
      {trade.user_name ? (
        <a
          href={`https://polymarket.com/@${trade.user_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[150px] truncate text-sm font-medium text-zinc-100 hover:text-emerald-300"
          title={displayName}
        >
          {displayName}
        </a>
      ) : (
        <span
          className="max-w-[150px] truncate text-sm font-medium text-zinc-100"
          title={displayName}
        >
          {displayName}
        </span>
      )}
    </div>
  );
}

export default function RecentTradesPage() {
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [metricMode, setMetricMode] = useState<MetricMode>("sharpe");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;

    const fetchTrades = async (initial = false) => {
      try {
        const response = await fetch(`${baseUrl}/recent-trades?limit=20`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as RecentTrade[];
        if (!mounted) return;

        setTrades((current) => (initial ? data.slice(0, 50) : mergeTrades(current, data)));
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted && initial) {
          setLoading(false);
        }
      }
    };

    fetchTrades(true);
    const interval = window.setInterval(() => fetchTrades(false), 15_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-white/5 bg-zinc-900/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="font-sans text-2xl font-bold tracking-tight text-white">
              Vantage
            </h1>
            <p className="font-sans text-sm font-normal text-zinc-500">
              Recent Polymarket Trades
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SiteNav />
            <div className="flex rounded-md border border-white/10 bg-zinc-950/40 p-1">
              <Button
                type="button"
                size="sm"
                variant={metricMode === "score" ? "secondary" : "ghost"}
                className="h-8 px-3"
                onClick={() => setMetricMode("score")}
              >
                Score
              </Button>
              <Button
                type="button"
                size="sm"
                variant={metricMode === "sharpe" ? "secondary" : "ghost"}
                className="h-8 px-3"
                onClick={() => setMetricMode("sharpe")}
              >
                Sharpe
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 font-sans text-sm text-rose-400">
            Failed to load recent trades: {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-white/5 bg-zinc-900/60 shadow-2xl shadow-black/40">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Trader
                </TableHead>
                <TableHead className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {metricMode === "score" ? "Score" : "Sharpe"}
                </TableHead>
                <TableHead className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Market
                </TableHead>
                <TableHead className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Side
                </TableHead>
                <TableHead className="text-right font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Price
                </TableHead>
                <TableHead className="text-right font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Amount
                </TableHead>
                <TableHead className="text-right font-sans text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Time
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : trades.length === 0 ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="py-20 text-center font-sans text-sm text-zinc-500"
                  >
                    No recent trades
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => {
                  const metricValue =
                    metricMode === "score" ? trade.score : trade.sharpe;

                  return (
                    <TableRow
                      key={tradeKey(trade)}
                      className="border-white/5 transition-colors duration-150 hover:bg-white/[0.025]"
                    >
                      <TableCell>
                        <TraderCell trade={trade} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`border font-mono text-xs tabular-nums ${metricBadgeClass(metricValue)}`}
                        >
                          {metricValue === null ? "N/A" : metricValue.toFixed(2)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className="block max-w-[320px] truncate font-sans text-sm text-zinc-200"
                          title={trade.market_title}
                        >
                          {trade.market_title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className="border border-zinc-600/40 bg-zinc-600/10 font-mono text-xs text-zinc-300">
                          {trade.outcome.slice(0, 1).toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-300">
                        {(trade.price * 100).toFixed(0)}¢
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-300">
                        {formatCurrency(trade.price * trade.size)}
                      </TableCell>
                      <TableCell className="text-right font-sans text-sm text-zinc-500">
                        {relativeTime(trade.occurred_at)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}
