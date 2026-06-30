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
import { Button } from "@/components/ui/button";
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
import { SiteNav } from "@/components/site-nav";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopPosition {
  id: string;
  market: string;
  outcome: string;
  size: number;
  current_value: number;
  avg_price: number;
  current_price: number;
  cash_pnl: number;
  percent_pnl: number;
  icon: string;
  polymarket_url: string;
  end_date: string;
  trader_name: string;
  trader_wallet: string;
  trader_pfp: string;
  trader_score: number;
  trader_tier: string;
  trader_sharpe: number;
}

type SideOption = "All" | "Yes" | "No";
type SortOption = "value" | "score" | "sharpe";

const SORT_LABELS: Record<SortOption, string> = {
  value: "Value",
  score: "Score",
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

function truncateWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

function initials(value: string): string {
  return value.slice(0, 2).toUpperCase();
}

function tierBadgeClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "elite" || t === "great") {
    return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30";
  }
  if (t === "good" || t === "average") {
    return "bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30";
  }
  return "bg-rose-600/20 text-rose-400 border-rose-600/30 hover:bg-rose-600/30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TraderCell({ position }: { position: TopPosition }) {
  const displayName = position.trader_name || truncateWallet(position.trader_wallet);
  const nameClass = "font-medium text-sm truncate max-w-[120px]";

  return (
    <div className="flex items-center gap-3">
      {position.trader_pfp ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={position.trader_pfp}
          alt={displayName}
          className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10 flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-400 ring-1 ring-white/10 flex-shrink-0">
          {initials(displayName)}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {position.trader_name ? (
          <a
            href={`https://polymarket.com/@${position.trader_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${nameClass} text-zinc-100 hover:text-emerald-300`}
            title={displayName}
          >
            {displayName}
          </a>
        ) : (
          <span className={nameClass} title={displayName}>
            {displayName}
          </span>
        )}
        <Badge className={`w-fit text-[10px] px-1 py-0 border font-sans scale-90 origin-left ${tierBadgeClass(position.trader_tier)}`}>
          {position.trader_tier}
        </Badge>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i} className="border-white/5">
          <TableCell>
            <Skeleton className="h-4 w-64 bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-zinc-700/60" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20 bg-zinc-700/60" />
                <Skeleton className="h-3 w-10 bg-zinc-700/60" />
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 ml-auto bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20 ml-auto bg-zinc-700/60" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const [side, setSide] = useState<SideOption>("All");
  const [minValue, setMinValue] = useState<number>(1000);
  const [sort, setSort] = useState<SortOption>("value");
  const [page, setPage] = useState(1);
  const [positions, setPositions] = useState<TopPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasNextPage = positions.length === PAGE_SIZE;

  useEffect(() => {
    const controller = new AbortController();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const offset = (page - 1) * PAGE_SIZE;
    const sideParam = side !== "All" ? `&side=${side}` : "";
    const url = `${baseUrl}/positions?limit=${PAGE_SIZE}&offset=${offset}&minValue=${minValue}&sort=${sort === "value" ? "" : sort}${sideParam}`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: TopPosition[]) => {
        setPositions(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [side, minValue, sort, page]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sticky header */}
      <div className="border-b border-white/5 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
              Vantage
            </h1>
            <p className="text-sm text-zinc-400 font-sans font-normal">
              Top Prediction Positions
            </p>
          </div>

          {/* Filters & Navigation */}
          <div className="flex items-center gap-3">
            <SiteNav />

            {/* Sort Select */}
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
                className="w-[120px] bg-zinc-800 border-white/10 text-zinc-200 text-sm font-sans"
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
            Failed to load positions: {error}
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          {/* Side toggle button group */}
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs font-medium uppercase tracking-wider text-zinc-500">
              Side:
            </span>
            <div className="flex rounded-md border border-white/10 bg-zinc-950/40 p-0.5">
              {(["All", "Yes", "No"] as SideOption[]).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={side === option ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs font-sans"
                  onClick={() => {
                    setSide(option);
                    setPage(1);
                    setLoading(true);
                    setError(null);
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          {/* Min Value Select */}
          <div className="flex items-center gap-2">
            <span className="font-sans text-xs font-medium uppercase tracking-wider text-zinc-500">
              Min Value:
            </span>
            <Select
              value={String(minValue)}
              onValueChange={(v) => {
                setMinValue(Number(v));
                setPage(1);
                setLoading(true);
                setError(null);
              }}
            >
              <SelectTrigger className="w-[120px] h-8 bg-zinc-800 border-white/10 text-zinc-200 text-xs font-sans">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-white/10 text-zinc-200 font-sans">
                <SelectItem value="100" className="text-xs">
                  $100+
                </SelectItem>
                <SelectItem value="1000" className="text-xs">
                  $1k+
                </SelectItem>
                <SelectItem value="10000" className="text-xs">
                  $10k+
                </SelectItem>
                <SelectItem value="100000" className="text-xs">
                  $100k+
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-zinc-900/60 overflow-hidden shadow-2xl shadow-black/40">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Market
                </TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Trader
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Entry
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Current
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  P&amp;L
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Value
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : positions.length === 0 ? (
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="text-center py-20 text-zinc-500 font-sans text-sm"
                  >
                    No positions found matching these criteria.
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((pos) => {
                  const hasUrl = pos.polymarket_url && pos.polymarket_url.trim() !== "";
                  const outcomeLetter = pos.outcome.slice(0, 1).toUpperCase();

                  return (
                    <TableRow
                      key={pos.id + pos.trader_wallet}
                      className="border-white/5 hover:bg-white/[0.025] transition-colors duration-150"
                    >
                      <TableCell className="max-w-[320px]">
                        <div className="flex items-center gap-2">
                          {hasUrl ? (
                            <a
                              href={pos.polymarket_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-zinc-100 hover:text-emerald-300 truncate"
                              title={pos.market}
                            >
                              {pos.market}
                            </a>
                          ) : (
                            <span className="text-sm font-medium text-zinc-100 truncate" title={pos.market}>
                              {pos.market}
                            </span>
                          )}
                          <Badge className="border border-zinc-600/40 bg-zinc-600/10 font-mono text-[10px] text-zinc-300 flex-shrink-0">
                            {outcomeLetter}
                          </Badge>
                        </div>
                      </TableCell>

                      <TableCell>
                        <TraderCell position={pos} />
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-300">
                        {(pos.avg_price * 100).toFixed(0)}¢
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm tabular-nums text-zinc-300">
                        {pos.current_price === 0 ? "—" : `${(pos.current_price * 100).toFixed(0)}¢`}
                      </TableCell>

                      <TableCell
                        className={`text-right font-mono text-sm font-medium tabular-nums ${
                          pos.cash_pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatCurrency(pos.cash_pnl)}
                      </TableCell>

                      <TableCell className="text-right font-mono text-sm text-zinc-100 font-medium tabular-nums">
                        {formatCurrency(pos.current_value)}
                      </TableCell>
                    </TableRow>
                  );
                })
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

        {!loading && positions.length > 0 && (
          <p className="text-xs text-zinc-600 font-sans mt-4 text-center">
            Showing {positions.length} positions &middot; sorted by {SORT_LABELS[sort]}
          </p>
        )}
      </div>
    </main>
  );
}
