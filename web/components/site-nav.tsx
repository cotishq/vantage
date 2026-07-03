"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ModeToggle } from "./mode-toggle";

const links = [
  { href: "/", label: "Leaderboard" },
  { href: "/trades", label: "Recent Trades" },
  { href: "/signals", label: "Consensus" },
  { href: "/positions", label: "Top Positions" },
  { href: "/trending", label: "Trending Markets" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2 w-full justify-between sm:w-auto">
      <nav className="flex items-center gap-1 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-100/80 dark:bg-zinc-950/40 p-1 overflow-x-auto max-w-[calc(100vw-80px)] sm:max-w-none no-scrollbar whitespace-nowrap">
        {links.map((link) => {
          const active = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded px-2.5 py-1.5 text-xs sm:text-sm font-medium font-sans transition-colors inline-block",
                active
                  ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <ModeToggle />
    </div>
  );
}
