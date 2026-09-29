"use client";

import { Download, FileCode2, Link2, Printer, Share2, Star } from "lucide-react";
import { useState } from "react";
import type { Solution } from "@/engine/steps/types";
import { answersText, solutionToLatex, solutionToMarkdown } from "@/lib/solution-export";
import {
  FAVORITES_KEY,
  isFavorite,
  toggleFavorite,
  useStoredList,
  type HistoryEntry,
} from "@/lib/storage";
import { copyText } from "../ui/CopyButton";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:text-text";

export function ResultActions({
  solution,
  shareUrl,
  entry,
}: {
  solution: Solution;
  shareUrl?: string;
  entry?: Omit<HistoryEntry, "id" | "time">;
}) {
  const favorites = useStoredList(FAVORITES_KEY);
  const [msg, setMsg] = useState("");
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 1800);
  };
  const fav = entry ? isFavorite(favorites, entry.href) : false;

  const download = () => {
    const blob = new Blob([solutionToMarkdown(solution, shareUrl)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vanillate-${solution.kind}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: solution.title,
          text: answersText(solution),
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported → fall back to copying
      }
    }
    flash((await copyText(shareUrl)) ? "Tautan disalin" : "Gagal menyalin tautan");
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={btn}
        onClick={async () =>
          flash(
            (await copyText(solutionToMarkdown(solution, shareUrl)))
              ? "Langkah disalin (Markdown)"
              : "Gagal menyalin",
          )
        }
      >
        <Link2 size={14} aria-hidden /> Salin langkah
      </button>
      <button
        type="button"
        className={btn}
        onClick={async () =>
          flash((await copyText(solutionToLatex(solution))) ? "LaTeX disalin" : "Gagal menyalin")
        }
      >
        <FileCode2 size={14} aria-hidden /> Salin LaTeX
      </button>
      <button type="button" className={btn} onClick={download}>
        <Download size={14} aria-hidden /> Unduh .md
      </button>
      <button type="button" className={btn} onClick={() => window.print()}>
        <Printer size={14} aria-hidden /> Cetak / PDF
      </button>
      {shareUrl && (
        <button type="button" className={btn} onClick={share}>
          <Share2 size={14} aria-hidden /> Bagikan
        </button>
      )}
      {entry && (
        <button
          type="button"
          className={`${btn} ${fav ? "border-warm/40 text-warm" : ""}`}
          aria-pressed={fav}
          onClick={() => toggleFavorite(entry)}
        >
          <Star size={14} aria-hidden fill={fav ? "currentColor" : "none"} />{" "}
          {fav ? "Favorit" : "Simpan"}
        </button>
      )}
      <span className="text-xs text-ok" role="status" aria-live="polite">
        {msg}
      </span>
    </div>
  );
}
