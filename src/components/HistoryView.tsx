"use client";

import { Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  clearList,
  FAVORITES_KEY,
  HISTORY_KEY,
  removeEntry,
  useStoredList,
  type HistoryEntry,
} from "@/lib/storage";

const KIND_LABEL: Record<HistoryEntry["kind"], string> = {
  solve: "Solver",
  tool: "Kalkulator",
  formula: "Rumus",
  units: "Satuan",
  graph: "Grafik",
  check: "Cek pekerjaan",
};

function formatTime(t: number) {
  try {
    return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(t),
    );
  } catch {
    return new Date(t).toLocaleString();
  }
}

function List({ storageKey, empty }: { storageKey: string; empty: string }) {
  const list = useStoredList(storageKey);
  const [confirm, setConfirm] = useState(false);
  if (list.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
        {empty}
      </p>
    );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={e.href} className="min-w-0 flex-1 hover:text-accent">
              <span className="block truncate font-mono text-sm text-text">{e.input}</span>
              <span className="block truncate text-xs text-muted">
                {KIND_LABEL[e.kind] ?? e.kind} · {e.title}
                {e.answer ? ` · ${e.answer}` : ""}
              </span>
            </Link>
            <time
              className="hidden shrink-0 text-xs text-muted sm:block"
              dateTime={new Date(e.time).toISOString()}
            >
              {formatTime(e.time)}
            </time>
            <button
              type="button"
              onClick={() => removeEntry(storageKey, e.id)}
              className="shrink-0 rounded-md p-1.5 text-muted hover:text-bad"
              aria-label={`Hapus ${e.input}`}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {confirm ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text">Hapus semua?</span>
          <button
            type="button"
            onClick={() => {
              clearList(storageKey);
              setConfirm(false);
            }}
            className="rounded-md bg-bad px-3 py-1 text-xs font-semibold text-white"
          >
            Ya, hapus
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded-md border border-border px-3 py-1 text-xs"
          >
            Batal
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="text-sm text-muted hover:text-bad"
        >
          Hapus semua
        </button>
      )}
    </div>
  );
}

export function HistoryView() {
  const [tab, setTab] = useState<"riwayat" | "favorit">("riwayat");
  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 rounded-lg bg-surface-2 p-1 sm:w-80"
        role="group"
        aria-label="Pilih daftar"
      >
        <button
          type="button"
          aria-pressed={tab === "riwayat"}
          onClick={() => setTab("riwayat")}
          className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm"
        >
          Riwayat
        </button>
        <button
          type="button"
          aria-pressed={tab === "favorit"}
          onClick={() => setTab("favorit")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm"
        >
          <Star size={14} aria-hidden /> Favorit
        </button>
      </div>
      {tab === "riwayat" ? (
        <List
          storageKey={HISTORY_KEY}
          empty="Belum ada riwayat. Hasil perhitungan Anda akan muncul di sini."
        />
      ) : (
        <List
          storageKey={FAVORITES_KEY}
          empty="Belum ada favorit. Tekan “Simpan” pada hasil untuk menyimpannya."
        />
      )}
    </div>
  );
}
