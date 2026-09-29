import type { Metadata } from "next";
import { GraphingApp } from "@/components/graph/GraphingApp";

export const metadata: Metadata = {
  title: "Kalkulator Grafik Fungsi Online",
  description:
    "Gambar grafik fungsi y = f(x), kurva polar r(θ), dan kurva parametrik secara interaktif: geser, zoom, beberapa fungsi sekaligus, dan deteksi asimtot.",
  alternates: { canonical: "/grafik" },
};

export default function GrafikPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Kalkulator grafik
        </h1>
        <p className="max-w-3xl text-muted">
          Gambar beberapa fungsi sekaligus, kurva polar, atau parametrik. Fungsi dievaluasi oleh
          mesin yang sama dengan solver; titik di luar domain (misalnya √x untuk x &lt; 0) tidak
          digambar, dan asimtot tegak tidak disambung.
        </p>
      </header>
      <GraphingApp />
    </div>
  );
}
