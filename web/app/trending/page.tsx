"use client";

import { useEffect, useState } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardAction,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site-nav";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Event {
	id: string;
	slug: string;
}

interface MarketMetadata {
	id: string;
	question: string;
	conditionId: string;
	slug: string;
	twitterCardImage: string | null;
	endDate: string | null;
	category: string | null;
	liquidity: string | null;
	image: string | null;
	icon: string | null;
	outcomes: string;
	outcomePrices: string;
	volume: string;
	active: boolean;
	closed: boolean;
	events?: Event[];
}

interface TrendingTrader {
	proxy_wallet: string;
	user_name: string;
	profile_image: string;
	x_username: string;
	buys_count: number;
	sells_count: number;
	net_inflow: number;
	last_trade_at: string;
}

interface TrendingMarketStats {
	cohort_volume: number;
	cohort_inflow: number;
	traders_count: number;
}

interface TrendingMarketItem {
	market: MarketMetadata;
	stats: TrendingMarketStats;
	top_traders: TrendingTrader[];
}

type WindowOption = "1h" | "6h" | "24h" | "3d" | "1w";

const WINDOW_LABELS: Record<WindowOption, string> = {
	"1h": "1 Hour",
	"6h": "6 Hours",
	"24h": "24 Hours",
	"3d": "3 Days",
	"1w": "1 Week",
};

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
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{Array.from({ length: 6 }).map((_, i) => (
				<Card key={i} className="border-white/5 bg-zinc-900/60 p-5 gap-4">
					<div className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-lg bg-zinc-800" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-3/4 bg-zinc-800" />
							<Skeleton className="h-3 w-1/4 bg-zinc-800" />
						</div>
					</div>
					<div className="space-y-3 mt-4">
						<Skeleton className="h-16 w-full bg-zinc-800/60 rounded-lg" />
						<div className="space-y-2 pt-2">
							<Skeleton className="h-8 w-full bg-zinc-800/40" />
							<Skeleton className="h-8 w-full bg-zinc-800/40" />
							<Skeleton className="h-8 w-full bg-zinc-800/40" />
						</div>
					</div>
				</Card>
			))}
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrendingMarketsPage() {
	const [selectedWindow, setSelectedWindow] = useState<WindowOption>("1w");
	const [markets, setMarkets] = useState<TrendingMarketItem[]>([]);
	const [todayPnL, setTodayPnL] = useState<number | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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

	// Fetch Trending Markets data
	useEffect(() => {
		const controller = new AbortController();
		setLoading(true);

		const baseUrl = process.env.NEXT_PUBLIC_API_URL;
		const url = `${baseUrl}/trending-markets?window=${selectedWindow}&limit=12`;

		fetch(url, { signal: controller.signal })
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: TrendingMarketItem[]) => {
				setMarkets(data);
				// Set last updated time based on first trader's activity if available
				if (data.length > 0 && data[0].top_traders.length > 0) {
					setLastUpdated(data[0].top_traders[0].last_trade_at);
				} else {
					setLastUpdated(new Date().toISOString());
				}
				setLoading(false);
			})
			.catch((err: Error) => {
				if (err.name === "AbortError") return;
				setError(err.message);
				setLoading(false);
			});

		return () => controller.abort();
	}, [selectedWindow]);

	return (
		<main className="min-h-screen bg-zinc-950 text-zinc-100">
			{/* Sticky header */}
			<div className="border-b border-white/5 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-10">
				<div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
					<div className="flex items-center gap-6">
						<div>
							<h1 className="text-2xl font-bold tracking-tight text-white font-sans">
								Vantage
							</h1>
							<p className="text-sm text-zinc-400 font-sans font-normal">
								Polymarket Trader Leaderboard
							</p>
							{lastUpdated && (
								<p className="text-xs text-zinc-500 font-sans font-normal mt-0.5">
									P&amp;L updated {formatLastUpdated(lastUpdated)}
								</p>
							)}
						</div>
						{todayPnL !== null && (
							<div className="bg-zinc-900/60 border border-white/5 rounded-lg px-3 py-1.5 font-sans font-semibold text-sm flex-shrink-0 flex items-center gap-1.5">
								<span className="text-zinc-500 font-normal">Today:</span>{" "}
								<span className={todayPnL >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
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
				{/* Top Controls Bar */}
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
					<div>
						<h2 className="text-xl font-bold tracking-tight text-white font-sans">
							Trending Markets
						</h2>
						<p className="text-sm text-zinc-400 font-sans">
							Active markets with highest tracked cohort trading volume
						</p>
					</div>

					{/* Window Toggles */}
					<div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-zinc-950/40 p-1 self-start">
						{(["1h", "6h", "24h", "3d", "1w"] as WindowOption[]).map((w) => {
							const active = selectedWindow === w;
							return (
								<button
									key={w}
									onClick={() => setSelectedWindow(w)}
									className={`rounded px-3 py-1 text-xs font-semibold font-sans transition-colors ${
										active
											? "bg-white text-zinc-950 shadow-md"
											: "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
									}`}
								>
									{w.toUpperCase()}
								</button>
							);
						})}
					</div>
				</div>

				{error && (
					<div className="rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 px-4 py-3 text-sm font-sans mb-6">
						Failed to load trending markets: {error}
					</div>
				)}

				{loading ? (
					<SkeletonGrid />
				) : markets.length === 0 ? (
					<div className="text-center py-20 border border-white/5 rounded-xl bg-zinc-900/40 text-zinc-500 font-sans text-sm">
						No active trending markets in this timeframe.
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{markets.map(({ market, stats, top_traders }) => {
							// Parse outcome prices/labels
							let outcomes: string[] = [];
							let outcomePrices: number[] = [];
							try {
								if (market.outcomes) outcomes = JSON.parse(market.outcomes);
								if (market.outcomePrices) outcomePrices = JSON.parse(market.outcomePrices).map(Number);
							} catch (e) {
								console.error("Parse error for outcomes", market.id, e);
							}

							const currentProbability = outcomePrices.length > 0 ? Math.round(outcomePrices[0] * 100) : 0;
							const hasProbability = outcomePrices.length > 0;
							const daysLeftText = formatDaysLeft(market.endDate);

							return (
								<Card
									key={market.id}
									className="border-white/5 bg-zinc-900/60 overflow-hidden shadow-2xl hover:border-white/10 hover:bg-zinc-900/80 transition-all duration-200"
								>
									<CardHeader className="flex flex-row items-start justify-between gap-4 p-5 pb-3">
										<div className="flex items-start gap-3 min-w-0">
											{market.image || market.icon ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img
													src={market.image || market.icon || ""}
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
													href={
														market.events && market.events.length > 0
															? `https://polymarket.com/event/${market.events[0].slug}`
															: `https://polymarket.com/event/${market.slug}`
													}
													target="_blank"
													rel="noopener noreferrer"
													className="text-sm font-bold text-zinc-100 hover:text-emerald-300 font-sans line-clamp-2 leading-snug"
													title={market.question || ""}
												>
													{market.question}
												</a>
												{daysLeftText && (
													<span className="text-[10px] text-zinc-500 font-sans mt-0.5 block">
														{daysLeftText}
													</span>
												)}
											</div>
										</div>
										{hasProbability && (
											<CardAction>
												<span
													className={`text-sm font-bold font-mono ${
														currentProbability >= 50 ? "text-emerald-400" : "text-rose-400"
													}`}
												>
													{currentProbability}%
												</span>
											</CardAction>
										)}
									</CardHeader>

									<CardContent className="p-5 pt-0 space-y-4">
										{/* Statistics Row */}
										<div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-lg bg-zinc-950/40 border border-white/5 text-center text-[11px] font-sans">
											<div>
												<span className="text-zinc-500 block">Cohort Volume</span>
												<span className="text-zinc-200 font-semibold font-mono">
													{formatCurrency(stats.cohort_volume)}
												</span>
											</div>
											<div>
												<span className="text-zinc-500 block">Tracked Traders</span>
												<span className="text-zinc-200 font-semibold font-mono">
													{stats.traders_count}
												</span>
											</div>
											<div>
												<span className="text-zinc-500 block">Cohort Inflow</span>
												<span
													className={`font-semibold font-mono ${
														stats.cohort_inflow >= 0 ? "text-emerald-400" : "text-rose-400"
													}`}
												>
													{stats.cohort_inflow >= 0 ? "+" : ""}
													{formatCurrency(stats.cohort_inflow)}
												</span>
											</div>
										</div>

										{/* Top Traders Section */}
										<div className="space-y-2">
											<div className="flex items-center justify-between text-[10px] uppercase font-semibold text-zinc-500 font-sans border-b border-white/5 pb-1">
												<span>Trader</span>
												<div className="flex gap-6">
													<span className="w-10 text-right">TXs</span>
													<span className="w-16 text-right">Inflow</span>
													<span className="w-8 text-right">Last</span>
												</div>
											</div>

											{top_traders.length === 0 ? (
												<div className="text-center py-4 text-xs text-zinc-600 font-sans">
													No cohort trades recorded yet
												</div>
											) : (
												<div className="space-y-1.5">
													{top_traders.map((trader) => {
														const displayName = trader.user_name || truncateWallet(trader.proxy_wallet);
														return (
															<div
																key={trader.proxy_wallet}
																className="flex items-center justify-between text-xs font-sans hover:bg-white/[0.01] py-1 rounded transition-colors"
															>
																<div className="flex items-center gap-2 min-w-0">
																	{trader.profile_image ? (
																		// eslint-disable-next-line @next/next/no-img-element
																		<img
																			src={trader.profile_image}
																			alt=""
																			className="h-5 w-5 rounded-full object-cover ring-1 ring-white/5 flex-shrink-0"
																		/>
																	) : (
																		<div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-semibold text-zinc-500 ring-1 ring-white/5 flex-shrink-0">
																			{displayName.slice(0, 2).toUpperCase()}
																		</div>
																	)}
																	{trader.user_name ? (
																		<a
																			href={`https://polymarket.com/@${trader.user_name}`}
																			target="_blank"
																			rel="noopener noreferrer"
																			className="text-zinc-200 hover:text-emerald-300 font-medium truncate max-w-[100px]"
																			title={trader.user_name}
																		>
																			{trader.user_name}
																		</a>
																	) : (
																		<span
																			className="text-zinc-400 font-medium truncate max-w-[100px]"
																			title={trader.proxy_wallet}
																		>
																			{displayName}
																		</span>
																	)}
																	{trader.x_username && (
																		<a
																			href={`https://x.com/${trader.x_username}`}
																			target="_blank"
																			rel="noopener noreferrer"
																			className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
																			title={`@${trader.x_username} on X`}
																		>
																			<svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
																				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
																			</svg>
																		</a>
																	)}
																</div>

																<div className="flex gap-6 font-mono text-[11px] tabular-nums">
																	<span className="w-10 text-right text-zinc-400">
																		<span className="text-emerald-500">{trader.buys_count}</span>
																		<span className="text-zinc-600">/</span>
																		<span className="text-rose-500">{trader.sells_count}</span>
																	</span>
																	<span
																		className={`w-16 text-right font-medium ${
																			trader.net_inflow >= 0 ? "text-emerald-400" : "text-rose-400"
																		}`}
																	>
																		{trader.net_inflow >= 0 ? "+" : ""}
																		{formatCurrency(trader.net_inflow)}
																	</span>
																	<span className="w-8 text-right text-zinc-500">
																		{formatRelativeTime(trader.last_trade_at)}
																	</span>
																</div>
															</div>
														);
													})}
												</div>
											)}
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</main>
	);
}
