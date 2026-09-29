import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-20 text-center">
      <p className="font-mono text-5xl font-bold text-accent">404</p>
      <h1 className="text-2xl font-semibold text-text">Halaman tidak ditemukan</h1>
      <p className="text-muted">
        Alamat yang Anda buka tidak ada. Mungkin kalkulatornya berpindah atau ada salah ketik.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast"
        >
          Ke Solver
        </Link>
        <Link
          href="/calculator"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text"
        >
          Semua kalkulator
        </Link>
      </div>
    </div>
  );
}
