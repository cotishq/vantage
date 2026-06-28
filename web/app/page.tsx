"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Trader {
  rank: number;
  proxy_wallet: string;
  user_name: string | null;
  profile_image: string | null;
  pnl: number;
  win_rate: number;
  profit_factor: number;
  score: number;
}

type WindowOption = "ALL"
type SortOption = "score" | "pnl" | "sharpe";

const WINDOW_LABELS: Record<WindowOption, string> = {
  ALL: "All Time",
};

const SORT_LABELS: Record<SortOption, string> = {
  score: "Score",
  pnl: "PnL",
  sharpe: "Sharpe",
};

const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

function scoreBadgeClass(score: number): string {
  if (score >= 60) return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30";
  if (score >= 40) return "bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30";
  return "bg-rose-600/20 text-rose-400 border-rose-600/30 hover:bg-rose-600/30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TraderCell({ trader }: { trader: Trader }) {
  const displayName = trader.user_name || truncateWallet(trader.proxy_wallet);

  return (
    <div className="flex items-center gap-3">
      {trader.profile_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trader.profile_image}
          alt={displayName}
          className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-400 ring-1 ring-white/10 flex-shrink-0">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span
        className="font-medium text-sm truncate max-w-[160px]"
        title={displayName}
      >
        {displayName}
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i} className="border-white/5">
          <TableCell>
            <Skeleton className="h-4 w-6 bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-zinc-700/60" />
              <Skeleton className="h-4 w-32 bg-zinc-700/60" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-14 ml-auto rounded-full bg-zinc-700/60" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>("ALL");
  const [sort, setSort] = useState<SortOption>("score");
  const [page, setPage] = useState(1);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasNextPage = traders.length === PAGE_SIZE;

  useEffect(() => {
    const controller = new AbortController();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const offset = (page - 1) * PAGE_SIZE;
    const url = `${baseUrl}/leaderboard?window=${selectedWindow}&sort=${sort}&limit=${PAGE_SIZE}&offset=${offset}`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Trader[]) => {
        setTraders(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [selectedWindow, sort, page]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sticky header */}
      <div className="border-b border-white/5 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
              Vantage
            </h1>
            <p className="text-sm text-zinc-500 font-sans font-normal">
              Polymarket Trader Leaderboard
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <Select
              value={selectedWindow}
              onValueChange={(v) => {
                setSelectedWindow(v as WindowOption);
                setPage(1);
                setLoading(true);
                setError(null);
              }}
            >
              <SelectTrigger
                id="window-select"
                className="w-[140px] bg-zinc-800 border-white/10 text-zinc-200 text-sm font-sans"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-white/10 text-zinc-200 font-sans">
                {(Object.keys(WINDOW_LABELS) as WindowOption[]).map((key) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="text-zinc-200 focus:bg-zinc-700 focus:text-white"
                  >
                    {WINDOW_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as SortOption);
                setPage(1);
                setLoading(true);
                setError(null);
              }}
            >
              <SelectTrigger
                id="sort-select"
                className="w-[130px] bg-zinc-800 border-white/10 text-zinc-200 text-sm font-sans"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-white/10 text-zinc-200 font-sans">
                {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="text-zinc-200 focus:bg-zinc-700 focus:text-white"
                  >
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm font-sans mb-6">
            Failed to load leaderboard: {error}
          </div>
        )}

        <div className="rounded-xl border border-white/5 bg-zinc-900/60 overflow-hidden shadow-2xl shadow-black/40">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12 text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  #
                </TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Trader
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  PnL
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Win Rate
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Profit Factor
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Score
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : traders.length === 0 ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="text-center py-20 text-zinc-500 font-sans text-sm"
                  >
                    No data for this window yet.
                  </TableCell>
                </TableRow>
              ) : (
                traders.map((trader) => (
                  <TableRow
                    key={trader.proxy_wallet}
                    className="border-white/5 hover:bg-white/[0.025] transition-colors duration-150"
                  >
                    <TableCell className="text-sm text-zinc-500 font-sans tabular-nums">
                      {trader.rank}
                    </TableCell>

                    <TableCell>
                      <TraderCell trader={trader} />
                    </TableCell>

                    <TableCell
                      className={`text-right font-mono text-sm font-sans font-medium tabular-nums ${
                        trader.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatCurrency(trader.pnl)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm text-zinc-300 font-sans tabular-nums">
                      {formatPercent(trader.win_rate)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm text-zinc-300 font-sans tabular-nums">
                      {trader.profit_factor.toFixed(2)}x
                    </TableCell>

                    <TableCell className="text-right">
                      <Badge
                        className={`font-mono text-xs tabular-nums border font-sans ${scoreBadgeClass(trader.score)}`}
                      >
                        {trader.score.toFixed(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination className="mt-5">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={page === 1 || loading}
                tabIndex={page === 1 || loading ? -1 : undefined}
                className={
                  page === 1 || loading
                    ? "pointer-events-none opacity-40"
                    : "text-zinc-300 hover:text-white"
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 1 && !loading) {
                    setLoading(true);
                    setError(null);
                    setPage((current) => current - 1);
                  }
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="flex h-9 items-center px-4 text-sm text-zinc-400 font-sans">
                Page {page}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={!hasNextPage || loading}
                tabIndex={!hasNextPage || loading ? -1 : undefined}
                className={
                  !hasNextPage || loading
                    ? "pointer-events-none opacity-40"
                    : "text-zinc-300 hover:text-white"
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (hasNextPage && !loading) {
                    setLoading(true);
                    setError(null);
                    setPage((current) => current + 1);
                  }
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>

        {!loading && traders.length > 0 && (
          <p className="text-xs text-zinc-600 font-sans mt-4 text-center">
            Showing {traders.length} traders &middot; {WINDOW_LABELS[selectedWindow]} &middot; sorted by {SORT_LABELS[sort]}
          </p>
        )}
      </div>
    </main>
  );
}
