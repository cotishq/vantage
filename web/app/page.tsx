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
import { SiteNav } from "@/components/site-nav";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Trader {
  rank: number;
  proxy_wallet: string;
  user_name: string | null;
  x_username: string | null;
  profile_image: string | null;
  pnl: number;
  win_rate: number;
  profit_factor: number;
  sharpe: number;
  score: number;
  computed_at?: string;
}

type WindowOption = "ALL" | "MONTH" | "WEEK" | "DAY";
type SortOption = "score" | "pnl" | "sharpe";

const WINDOW_LABELS: Record<WindowOption, string> = {
  ALL: "All Time",
  MONTH: "This Month",
  WEEK: "This Week",
  DAY: "Today",
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

function sharpeColorClass(sharpe: number): string {
  if (sharpe >= 1.0) return "text-emerald-600 dark:text-emerald-400";
  if (sharpe >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function formatLastUpdated(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TraderCell({ trader }: { trader: Trader }) {
  const displayName = trader.user_name || truncateWallet(trader.proxy_wallet);
  const nameClass = "font-medium text-sm truncate max-w-[160px]";

  return (
    <div className="flex items-center gap-3">
      {trader.profile_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trader.profile_image}
          alt={displayName}
          className="h-8 w-8 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-white/10 flex-shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-500 dark:text-zinc-400 ring-1 ring-zinc-200 dark:ring-white/10 flex-shrink-0">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        {trader.user_name ? (
          <a
            href={`https://polymarket.com/@${trader.user_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${nameClass} text-zinc-800 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-300`}
            title={displayName}
          >
            {displayName}
          </a>
        ) : (
          <span className={`${nameClass} text-zinc-600 dark:text-zinc-400`} title={displayName}>
            {displayName}
          </span>
        )}
        {trader.x_username && (
          <a
            href={`https://x.com/${trader.x_username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
            title={`@${trader.x_username} on X`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function SkeletonRows({ showSharpe }: { showSharpe: boolean }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i} className="border-zinc-200 dark:border-white/5">
          <TableCell>
            <Skeleton className="h-4 w-6 bg-zinc-200 dark:bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700/60" />
              <Skeleton className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700/60" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20 ml-auto bg-zinc-200 dark:bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 ml-auto bg-zinc-200 dark:bg-zinc-700/60" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16 ml-auto bg-zinc-200 dark:bg-zinc-700/60" />
          </TableCell>
          {showSharpe && (
            <TableCell>
              <Skeleton className="h-4 w-12 ml-auto bg-zinc-200 dark:bg-zinc-700/60" />
            </TableCell>
          )}
          <TableCell>
            <Skeleton className="h-6 w-14 ml-auto rounded-full bg-zinc-200 dark:bg-zinc-700/60" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [selectedWindow, setSelectedWindow] = useState<WindowOption>("ALL");
  const [sort, setSort] = useState<SortOption>("pnl");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showSharpe, setShowSharpe] = useState(false);
  const [page, setPage] = useState(1);
  const [xLinked, setXLinked] = useState(false);
  const [profitable, setProfitable] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [unfilteredCount, setUnfilteredCount] = useState<number | null>(null);
  const [todayPnL, setTodayPnL] = useState<number | null>(null);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasNextPage = totalCount !== null ? (page * PAGE_SIZE < totalCount) : (traders.length === PAGE_SIZE);

  const handleSort = (field: SortOption) => {
    if (sort === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSort(field);
      setSortOrder("desc");
    }
    setPage(1);
    setLoading(true);
    setError(null);
  };

  const getSharpeHeader = () => {
    switch (selectedWindow) {
      case "DAY":
        return "Sharpe 1D";
      case "WEEK":
        return "Sharpe 7D";
      case "MONTH":
        return "Sharpe 30D";
      default:
        return "Sharpe";
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    fetch(`${baseUrl}/leaderboard/today-pnl`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((data: { today_pnl: number }) => {
        setTodayPnL(data.today_pnl);
      })
      .catch((err) => {
        console.error("Failed to fetch today PnL:", err);
      });
  }, [traders]);

  useEffect(() => {
    const controller = new AbortController();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const offset = (page - 1) * PAGE_SIZE;
    const profitableParam = profitable ? "&profitable=true" : "";
    const url = `${baseUrl}/leaderboard?window=${selectedWindow}&sort=${sort}&order=${sortOrder}&limit=${PAGE_SIZE}&offset=${offset}&xLinked=${xLinked}&search=${encodeURIComponent(debouncedSearch)}${profitableParam}`;

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const totalHeader = res.headers.get("X-Total-Count");
        const total = totalHeader ? parseInt(totalHeader, 10) : 0;
        const data = await res.json();
        return { data, total };
      })
      .then(({ data, total }) => {
        setTraders(data);
        setTotalCount(total);
        if (!xLinked && !debouncedSearch && !profitable) {
          setUnfilteredCount(total);
        }
        if (data.length > 0 && data[0].computed_at) {
          setLastUpdated(data[0].computed_at);
        } else {
          setLastUpdated(null);
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [selectedWindow, sort, sortOrder, page, xLinked, profitable, debouncedSearch]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Sticky header */}
      <div className="border-b border-zinc-200 dark:border-white/5 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 w-full sm:w-auto">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-sans">
                Vantage
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-sans font-normal">
                Polymarket Trader Leaderboard
              </p>
              {lastUpdated && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 font-sans font-normal mt-0.5">
                  P&amp;L updated {formatLastUpdated(lastUpdated)}
                </p>
              )}
            </div>
            {todayPnL !== null && (
              <div className="bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 rounded-lg px-3 py-1.5 font-sans font-semibold text-sm flex-shrink-0 flex items-center gap-1.5 w-fit">
                <span className="text-zinc-500 dark:text-zinc-500 font-normal">Today:</span>{" "}
                <span className={todayPnL >= 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
                  {todayPnL >= 0 ? "+" : ""}{formatCurrency(todayPnL)}
                </span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <SiteNav />
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

        {/* Search bar & filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search traders..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-zinc-100/50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 transition-colors font-sans"
              />
            </div>
            <span className="text-sm text-zinc-500 dark:text-zinc-400 font-sans font-medium">
              {totalCount !== null && unfilteredCount !== null ? (
                `${totalCount} of ${unfilteredCount} traders`
              ) : totalCount !== null ? (
                `${totalCount} traders`
              ) : (
                "Loading..."
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* X Linked Filter Pill */}
            <button
              onClick={() => {
                setXLinked(!xLinked);
                setPage(1);
                setLoading(true);
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium font-sans transition-colors ${
                xLinked
                  ? "bg-zinc-900 border-transparent text-zinc-50 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                  : "bg-zinc-100 dark:bg-zinc-950/40 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>linked</span>
            </button>

            {/* Profitable Filter Pill */}
            <button
              onClick={() => {
                setProfitable(!profitable);
                setPage(1);
                setLoading(true);
                setError(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium font-sans transition-colors ${
                profitable
                  ? "bg-emerald-600 border-transparent text-white hover:bg-emerald-500"
                  : "bg-zinc-100 dark:bg-zinc-950/40 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span>Profitable Only</span>
            </button>

            {/* Sharpe Toggle Button */}
            <button
              onClick={() => {
                setShowSharpe(!showSharpe);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium font-sans transition-colors ${
                showSharpe
                  ? "bg-zinc-900 border-transparent text-zinc-50 hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                  : "bg-zinc-100 dark:bg-zinc-950/40 border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <span>Sharpe</span>
            </button>

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
                className="w-[140px] bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 text-sm font-sans"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-sans">
                {(Object.keys(WINDOW_LABELS) as WindowOption[]).map((key) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="text-zinc-800 dark:text-zinc-200 focus:bg-zinc-100 dark:focus:bg-zinc-700 focus:text-zinc-900 dark:focus:text-white"
                  >
                    {WINDOW_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/60 overflow-x-auto shadow-2xl dark:shadow-black/40">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow className="border-zinc-200 dark:border-white/5 hover:bg-transparent">
                <TableHead className="w-12 text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  #
                </TableHead>
                <TableHead className="text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold">
                  Trader
                </TableHead>
                <TableHead
                  onClick={() => handleSort("pnl")}
                  className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold cursor-pointer select-none hover:text-zinc-300 transition-colors w-28"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>PnL</span>
                    {sort === "pnl" && (
                      <span className="text-zinc-300 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold w-24">
                  Win Rate
                </TableHead>
                <TableHead className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold w-28">
                  Profit Factor
                </TableHead>
                {showSharpe && (
                  <TableHead
                    onClick={() => handleSort("sharpe")}
                    className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold cursor-pointer select-none hover:text-zinc-300 transition-colors w-28"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>{getSharpeHeader()}</span>
                      {sort === "sharpe" && (
                        <span className="text-zinc-300 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                      )}
                    </div>
                  </TableHead>
                )}
                <TableHead
                  onClick={() => handleSort("score")}
                  className="text-right text-zinc-500 text-xs uppercase tracking-wider font-sans font-semibold cursor-pointer select-none hover:text-zinc-300 transition-colors w-24"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Score</span>
                    {sort === "score" && (
                      <span className="text-zinc-300 font-bold">{sortOrder === "desc" ? "↓" : "↑"}</span>
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows showSharpe={showSharpe} />
              ) : traders.length === 0 ? (
                <TableRow className="border-zinc-200 dark:border-white/5 hover:bg-transparent">
                  <TableCell
                    colSpan={showSharpe ? 7 : 6}
                    className="text-center py-20 text-zinc-500 dark:text-zinc-500 font-sans text-sm"
                  >
                    No data for this window yet.
                  </TableCell>
                </TableRow>
              ) : (
                traders.map((trader) => (
                  <TableRow
                    key={trader.proxy_wallet}
                    className="border-zinc-200 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-white/[0.025] transition-colors duration-150"
                  >
                    <TableCell className="text-sm text-zinc-500 dark:text-zinc-500 font-sans tabular-nums">
                      {trader.rank}
                    </TableCell>

                    <TableCell>
                      <TraderCell trader={trader} />
                    </TableCell>

                    <TableCell
                      className={`text-right font-mono text-sm font-sans font-semibold tabular-nums ${
                        trader.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatCurrency(trader.pnl)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm text-zinc-700 dark:text-zinc-300 font-sans tabular-nums">
                      {formatPercent(trader.win_rate)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm text-zinc-700 dark:text-zinc-300 font-sans tabular-nums">
                      {trader.profit_factor.toFixed(2)}x
                    </TableCell>

                    {showSharpe && (
                      <TableCell className={`text-right font-mono text-sm font-sans tabular-nums ${sharpeColorClass(trader.sharpe)}`}>
                        {trader.sharpe !== undefined && trader.sharpe !== null ? trader.sharpe.toFixed(2) : "-"}
                      </TableCell>
                    )}

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
                    : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5"
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
              <span className="flex h-9 items-center px-4 text-sm text-zinc-500 dark:text-zinc-400 font-sans">
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
                    : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5"
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
            Showing {traders.length} traders &middot; {WINDOW_LABELS[selectedWindow]} &middot; sorted by {SORT_LABELS[sort]} ({sortOrder.toUpperCase()}){xLinked && <> &middot; X linked only</>}{profitable && <> &middot; profitable only</>}
          </p>
        )}
      </div>
    </main>
  );
}
