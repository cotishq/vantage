"use client";

import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardAction,
} from "@/components/ui/card";
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

interface MarketPositionDetail {
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

interface GroupedMarketPositions {
	condition_id: string;
	market_title: string;
	slug: string;
	current_price: number;
	end_date: string | null;
	icon: string | null;
	total_value: number;
	traders_count: number;
	smart_yes_pct: number;
	smart_no_pct: number;
	positions: MarketPositionDetail[];
}

type SideOption = "All" | "Yes" | "No";

const PAGE_SIZE = 12;

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

function scoreColorClass(score: number): string {
	if (score >= 80) return "text-emerald-600 dark:text-emerald-400 font-bold";
	if (score >= 65) return "text-emerald-600/90 dark:text-emerald-500/90";
	if (score >= 50) return "text-amber-600 dark:text-amber-400";
	return "text-rose-600 dark:text-rose-400";
}

function formatDaysLeft(endDateStr: string | null): string {
	if (!endDateStr) return "";
	const diff = new Date(endDateStr).getTime() - new Date().getTime();
	if (diff <= 0) return "Ended";
	const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
	return `${days}d left`;
}

function formatRelativeTime(dateStr: string): string {
	try {
		const diffMs = new Date().getTime() - new Date(dateStr).getTime();
		const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
		if (diffHrs < 1) {
			const diffMins = Math.floor(diffMs / (1000 * 60));
			return `${Math.max(1, diffMins)}m`;
		}
		if (diffHrs >= 24) {
			return `${Math.floor(diffHrs / 24)}d`;
		}
		return `${diffHrs}h`;
	} catch (e) {
		return "";
	}
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
	} catch (e) {
		return "";
	}
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonGrid() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			{Array.from({ length: 4 }).map((_, i) => (
				<Card key={i} className="border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/60 p-5 gap-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<Skeleton className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
							<div className="flex flex-col gap-2">
								<Skeleton className="h-4 w-40 bg-zinc-200 dark:bg-zinc-800" />
								<Skeleton className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800" />
							</div>
						</div>
						<Skeleton className="h-6 w-20 bg-zinc-200 dark:bg-zinc-800" />
					</div>
					<div className="space-y-3 mt-4">
						<Skeleton className="h-6 w-full bg-zinc-200 dark:bg-zinc-800" />
						<div className="space-y-2">
							<Skeleton className="h-8 w-full bg-zinc-200/50 dark:bg-zinc-800/40" />
							<Skeleton className="h-8 w-full bg-zinc-200/50 dark:bg-zinc-800/40" />
						</div>
					</div>
				</Card>
			))}
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PositionsPage() {
	const [side, setSide] = useState<SideOption>("All");
	const [minValue, setMinValue] = useState<number>(1000);
	const [minScore, setMinScore] = useState<number>(0);
	const [minSharpe, setMinSharpe] = useState<number>(0);
	const [hide95, setHide95] = useState<boolean>(false);
	const [page, setPage] = useState(1);
	const [markets, setMarkets] = useState<GroupedMarketPositions[]>([]);
	const [totalMarkets, setTotalMarkets] = useState<number>(0);
	const [totalPositions, setTotalPositions] = useState<number>(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [todayPnL, setTodayPnL] = useState<number | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);

	const hasNextPage = markets.length === PAGE_SIZE;

	// Fetch Today's Overall PnL aggregate stat
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
	}, [markets]);

	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);

		const baseUrl = process.env.NEXT_PUBLIC_API_URL;
		const offset = (page - 1) * PAGE_SIZE;
		const sideParam = side !== "All" ? `&side=${side}` : "";
		const url = `${baseUrl}/positions?limit=${PAGE_SIZE}&offset=${offset}&minValue=${minValue}&minScore=${minScore}&minSharpe=${minSharpe}&hide95=${hide95}${sideParam}`;

		fetch(url, { signal: controller.signal })
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const marketsHeader = res.headers.get("X-Total-Markets");
				const positionsHeader = res.headers.get("X-Total-Positions");
				setTotalMarkets(marketsHeader ? parseInt(marketsHeader, 10) : 0);
				setTotalPositions(positionsHeader ? parseInt(positionsHeader, 10) : 0);

				const data = await res.json();
				return data;
			})
			.then((data: GroupedMarketPositions[]) => {
				setMarkets(data);
				if (data.length > 0 && data[0].positions.length > 0) {
					setLastUpdated(new Date().toISOString()); // default timestamp
				}
				setLoading(false);
			})
			.catch((err: Error) => {
				if (err.name === "AbortError") return;
				setError(err.message);
				setLoading(false);
			});

		return () => controller.abort();
	}, [side, minValue, minScore, minSharpe, hide95, page]);

	return (
		<main className="min-h-screen bg-background text-foreground">
			{/* Sticky header */}
			<div className="border-b border-zinc-200 dark:border-white/5 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
				<div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
					<div className="flex items-center gap-6">
						<div>
							<h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-sans">
								Vantage
							</h1>
							<p className="text-sm text-zinc-500 dark:text-zinc-400 font-sans font-normal">
								Top Prediction Positions
							</p>
							{lastUpdated && (
								<p className="text-xs text-zinc-400 dark:text-zinc-500 font-sans font-normal mt-0.5">
									P&amp;L updated {formatLastUpdated(lastUpdated)}
								</p>
							)}
						</div>
						{todayPnL !== null && (
							<div className="bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 rounded-lg px-3 py-1.5 font-sans font-semibold text-sm flex-shrink-0 flex items-center gap-1.5">
								<span className="text-zinc-500 dark:text-zinc-500 font-normal">Today:</span>{" "}
								<span className={todayPnL >= 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
									{todayPnL >= 0 ? "+" : ""}{formatCurrency(todayPnL)}
								</span>
							</div>
						)}
					</div>

					{/* Navigation */}
					<div className="flex items-center gap-3">
						<SiteNav />
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

				{/* Filter Toolbar Section */}
				<div className="mb-6 space-y-4">
					{/* First Row of Filters */}
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex flex-wrap items-center gap-4">
							{/* Side filter group */}
							<div className="flex items-center gap-2">
								<span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
									Side:
								</span>
								<div className="flex rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-950/40 p-0.5">
									{(["All", "Yes", "No"] as SideOption[]).map((option) => (
										<Button
											key={option}
											type="button"
											size="sm"
											variant={side === option ? "secondary" : "ghost"}
											className="h-7 px-3 text-xs font-semibold font-sans"
											onClick={() => {
												setSide(option);
												setPage(1);
											}}
										>
											{option}
										</Button>
									))}
								</div>
							</div>

							{/* Hide 95%+ filter pill */}
							<Button
								type="button"
								variant={hide95 ? "secondary" : "outline"}
								size="sm"
								className="h-8 border-zinc-200 dark:border-white/10 text-xs font-semibold font-sans"
								onClick={() => {
									setHide95(!hide95);
									setPage(1);
								}}
							>
								Hide 95%+
							</Button>
						</div>

						{/* Total Count stats info */}
						{!loading && (
							<div className="text-zinc-500 dark:text-zinc-400 text-xs font-semibold font-sans">
								{totalMarkets} markets &middot; {totalPositions} positions
							</div>
						)}
					</div>

					{/* Second Row of Filters */}
					<div className="flex flex-wrap items-center gap-4 pt-1">
						{/* Min Value select */}
						<div className="flex items-center gap-2">
							<span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
								Min Value:
							</span>
							<Select
								value={String(minValue)}
								onValueChange={(v) => {
									setMinValue(Number(v));
									setPage(1);
								}}
							>
								<SelectTrigger className="w-[110px] h-8 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 text-xs font-semibold font-sans">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-sans">
									<SelectItem value="100" className="text-xs">
										$100+
									</SelectItem>
									<SelectItem value="1000" className="text-xs">
										$1k+
									</SelectItem>
									<SelectItem value="5000" className="text-xs">
										$5k+
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

						{/* Score select */}
						<div className="flex items-center gap-2">
							<span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
								Score:
							</span>
							<Select
								value={String(minScore)}
								onValueChange={(v) => {
									setMinScore(Number(v));
									setPage(1);
								}}
							>
								<SelectTrigger className="w-[100px] h-8 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 text-xs font-semibold font-sans">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-sans">
									<SelectItem value="0" className="text-xs">
										Any
									</SelectItem>
									<SelectItem value="50" className="text-xs">
										&gt; 50
									</SelectItem>
									<SelectItem value="65" className="text-xs">
										&gt; 65
									</SelectItem>
									<SelectItem value="80" className="text-xs">
										&gt; 80
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Sharpe select */}
						<div className="flex items-center gap-2">
							<span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
								Sharpe:
							</span>
							<Select
								value={String(minSharpe)}
								onValueChange={(v) => {
									setMinSharpe(Number(v));
									setPage(1);
								}}
							>
								<SelectTrigger className="w-[100px] h-8 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 text-xs font-semibold font-sans">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="bg-white dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 font-sans">
									<SelectItem value="0" className="text-xs">
										Any
									</SelectItem>
									<SelectItem value="0.5" className="text-xs">
										&gt; 0.5
									</SelectItem>
									<SelectItem value="1.0" className="text-xs">
										&gt; 1.0
									</SelectItem>
									<SelectItem value="1.5" className="text-xs">
										&gt; 1.5
									</SelectItem>
									<SelectItem value="2.0" className="text-xs">
										&gt; 2.0
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				{/* Cards Layout Grid */}
				{loading ? (
					<SkeletonGrid />
				) : markets.length === 0 ? (
					<div className="text-center py-20 border border-white/5 rounded-xl bg-zinc-900/40 text-zinc-500 font-sans text-sm">
						No positions found matching these criteria.
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{markets.map((gm) => {
							const daysLeftText = formatDaysLeft(gm.end_date);
							const currentProbability = gm.current_price > 0 ? Math.round(gm.current_price * 100) : null;

							return (
								<Card
									key={gm.condition_id}
									className="border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-900/60 shadow-2xl overflow-hidden hover:border-zinc-300 dark:hover:border-white/10 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/80 transition-all duration-200 flex flex-col gap-4"
								>
									{/* Card Header area */}
									<CardHeader className="flex flex-row items-start justify-between gap-4 p-5 pb-1">
										<div className="flex items-start gap-3 min-w-0">
											{gm.icon ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img
													src={gm.icon}
													alt=""
													className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10 flex-shrink-0"
												/>
											) : (
												<div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400 ring-1 ring-white/10 flex-shrink-0">
													PM
												</div>
											)}
											<div className="min-w-0">
												<a
													href={`https://polymarket.com/event/${gm.slug}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-300 font-sans line-clamp-2 leading-snug"
													title={gm.market_title}
												>
													{gm.market_title}
												</a>
												<div className="flex items-center gap-2 mt-0.5">
													{currentProbability !== null && (
														<span className="text-[11px] font-mono font-bold text-zinc-400">
															{currentProbability}¢
														</span>
													)}
													{daysLeftText && (
														<span className="text-[10px] font-sans">
															&middot;&nbsp;
															{daysLeftText === "Ended" ? (
																<span className="text-rose-400 font-semibold">Ended</span>
															) : (
																<span className="text-zinc-500">{daysLeftText}</span>
															)}
														</span>
													)}
												</div>
											</div>
										</div>

										<CardAction className="flex flex-col items-end gap-1">
											<span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
												{formatCurrency(gm.total_value)}
											</span>
											<span className="text-[10px] text-zinc-500 dark:text-zinc-550 font-sans">
												{gm.traders_count} traders
											</span>
										</CardAction>
									</CardHeader>

									{/* Visual Allocation Breakdown Bar */}
									<CardContent className="p-5 pt-0 pb-1 space-y-1">
										<div className="flex justify-between text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 font-sans">
											<span className="text-emerald-600 dark:text-emerald-400">Smart {gm.smart_yes_pct}% Y</span>
											<span className="text-rose-600 dark:text-rose-400">{gm.smart_no_pct}% N</span>
										</div>
										<div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800/40 overflow-hidden flex">
											<div
												style={{ width: `${gm.smart_yes_pct}%` }}
												className="bg-emerald-500 h-full transition-all duration-300"
											/>
											<div
												style={{ width: `${gm.smart_no_pct}%` }}
												className="bg-rose-500 h-full transition-all duration-300"
											/>
										</div>
									</CardContent>

									{/* List of positions with scroll */}
									<CardContent className="p-5 pt-0 flex-1">
										<div className="border border-zinc-200 dark:border-white/5 rounded-lg overflow-hidden bg-zinc-100/30 dark:bg-zinc-950/40">
											{/* Position Table Headers */}
											<div className="grid grid-cols-[1fr_35px_45px_45px_70px_80px] gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-white/5 text-[9px] uppercase font-bold tracking-wider text-zinc-500 font-sans bg-zinc-200/20 dark:bg-zinc-900/30">
												<span>Trader</span>
												<span className="text-center">Side</span>
												<span className="text-right">Score</span>
												<span className="text-right">Entry</span>
												<span className="text-right">P&amp;L</span>
												<span className="text-right">Value</span>
											</div>

											{/* Scrollable Position rows container */}
											<div className="max-h-[220px] overflow-y-auto divide-y divide-zinc-200 dark:divide-white/5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-zinc-100/20 dark:[&::-webkit-scrollbar-track]:bg-zinc-950/20 [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zinc-400 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/20">
												{gm.positions.map((pos) => {
													const displayName = pos.user_name || truncateWallet(pos.proxy_wallet);
													const isYes = stringsMatchYes(pos.outcome);

													return (
														<div
															key={pos.proxy_wallet + pos.outcome}
															className="grid grid-cols-[1fr_35px_45px_45px_70px_80px] gap-2 px-3 py-2 items-center hover:bg-zinc-100/60 dark:hover:bg-white/[0.015] transition-colors text-xs font-sans"
														>
															{/* Trader info */}
															<div className="flex items-center gap-2 min-w-0">
																{pos.profile_image ? (
																	// eslint-disable-next-line @next/next/no-img-element
																	<img
																		src={pos.profile_image}
																		alt=""
																		className="h-5 w-5 rounded-full object-cover ring-1 ring-white/5 flex-shrink-0"
																	/>
																) : (
																	<div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-semibold text-zinc-500 ring-1 ring-white/5 flex-shrink-0">
																		{displayName.slice(0, 2).toUpperCase()}
																	</div>
																)}
																<div className="flex flex-col min-w-0">
																	<div className="flex items-center gap-1.5 min-w-0">
																		{pos.user_name ? (
																			<a
																				href={`https://polymarket.com/@${pos.user_name}`}
																				target="_blank"
																				rel="noopener noreferrer"
																				className="text-zinc-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-300 font-medium truncate max-w-[80px]"
																				title={pos.user_name}
																			>
																				{pos.user_name}
																			</a>
																		) : (
																			<span
																				className="text-zinc-650 dark:text-zinc-400 font-medium truncate max-w-[80px]"
																				title={pos.proxy_wallet}
																			>
																				{displayName}
																			</span>
																		)}
																		{pos.x_username && (
																			<a
																				href={`https://x.com/${pos.x_username}`}
																				target="_blank"
																				rel="noopener noreferrer"
																				className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
																				title={`@${pos.x_username} on X`}
																			>
																				<svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
																					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
																				</svg>
																			</a>
																		)}
																	</div>
																	<Badge className={`w-fit text-[8px] px-0.5 py-0 border font-sans scale-90 origin-left mt-0.5 ${tierBadgeClass(pos.trader_tier)}`}>
																		{pos.trader_tier}
																	</Badge>
																</div>
															</div>

															{/* Outcome Side */}
															<span
																className={`text-center font-bold text-[10px] ${
																	isYes ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500"
																}`}
															>
																{isYes ? "Y" : "N"}
															</span>

															{/* Trader Score */}
															<span className={`text-right font-mono text-[11px] tabular-nums font-semibold ${scoreColorClass(pos.score)}`}>
																{pos.score.toFixed(0)}
															</span>

															{/* Entry Price */}
															<span className="text-right font-mono text-[11px] tabular-nums text-zinc-400">
																{Math.round(pos.avg_price * 100)}¢
															</span>

															{/* Cash PNL */}
															<span
																className={`text-right font-mono text-[11px] tabular-nums font-semibold ${
																	pos.cash_pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
																}`}
															>
																{pos.cash_pnl >= 0 ? "+" : ""}
																{formatCurrency(pos.cash_pnl)}
															</span>

															{/* Position Value */}
															<span className="text-right font-mono text-[11px] tabular-nums text-zinc-800 dark:text-zinc-200 font-semibold">
																{formatCurrency(pos.current_value)}
															</span>
														</div>
													);
												})}
											</div>
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}

				{/* Pagination Controls */}
				<Pagination className="mt-8">
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
										setPage((current) => current - 1);
									}
								}}
							/>
						</PaginationItem>
						<PaginationItem>
							<span className="flex h-9 items-center px-4 text-xs font-semibold text-zinc-550 dark:text-zinc-400 font-sans">
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
										setPage((current) => current + 1);
									}
								}}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</main>
	);
}

// Helper to match outcomes with Yes/Y
function stringsMatchYes(outcome: string): boolean {
	const out = outcome.toLowerCase();
	return out === "yes" || out === "y";
}
