import Link from "next/link";
import { SITE } from "@/lib/site";
import { ThemeToggle } from "../ThemeToggle";
import { LogoMark } from "./Logo";
import { SiteNav } from "./SiteNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg font-semibold tracking-tight text-text"
          aria-label={`${SITE.name} — beranda`}
        >
          <LogoMark />
          <span className="text-[15px]">
            Vanillate <span className="text-muted font-normal">Science</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <SiteNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
