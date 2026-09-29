"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { HISTORY_KEY, useStoredList } from "@/lib/storage";

export function RecentHistory({ limit = 5 }: { limit?: number }) {
  const list = useStoredList(HISTORY_KEY);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="riwayat-terakhir" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="riwayat-terakhir" className="flex items-center gap-2 text-sm font-semibold text-text">
          <History size={16} aria-hidden /> Terakhir dihitung
        </h2>
        <Link href="/riwayat" className="text-xs font-medium text-accent">
          Semua riwayat →
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {list.slice(0, limit).map((e) => (
          <li key={e.id}>
            <Link href={e.href} className="flex items-baseline justify-between gap-3 py-2 text-sm hover:text-accent">
              <span className="truncate font-mono text-text">{e.input}</span>
              <span className="shrink-0 text-xs text-muted">{e.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
