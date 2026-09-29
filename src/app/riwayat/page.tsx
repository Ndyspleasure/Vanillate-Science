import type { Metadata } from "next";
import { HistoryView } from "@/components/HistoryView";

export const metadata: Metadata = {
  title: "Riwayat & Favorit",
  description: "Riwayat perhitungan dan favorit Anda, tersimpan hanya di perangkat ini.",
  robots: { index: false },
};

export default function RiwayatPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Riwayat & favorit
        </h1>
        <p className="text-muted">
          Disimpan hanya di peramban Anda (localStorage) — tidak dikirim ke server. Menghapus data
          situs akan menghapus daftar ini.
        </p>
      </header>
      <HistoryView />
    </div>
  );
}
