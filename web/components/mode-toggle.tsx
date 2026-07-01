"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <Button variant="ghost" size="icon" className="h-9 w-9 text-zinc-400" disabled />;
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-9 w-9 text-zinc-400 hover:text-zinc-100 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
			title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
		>
			{theme === "dark" ? (
				<Moon className="h-[1.2rem] w-[1.2rem] text-zinc-400" />
			) : (
				<Sun className="h-[1.2rem] w-[1.2rem] text-amber-700" />
			)}
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
