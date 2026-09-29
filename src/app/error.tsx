"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-text">Terjadi kesalahan pada halaman</h1>
      <p className="text-muted">
        Tampilan gagal dimuat. Perhitungan Anda tidak terpengaruh; coba muat ulang bagian ini.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Kode: {error.digest}</p>}
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast"
        >
          Coba lagi
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text"
        >
          Ke beranda
        </Link>
      </div>
    </div>
  );
}
