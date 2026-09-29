export const SITE = {
  name: "Vanillate Science",
  shortName: "Vanillate",
  tagline: "Kalkulator matematika & sains dengan langkah penyelesaian yang terverifikasi",
  description:
    "Kalkulator matematika dan sains berbahasa Indonesia: aljabar, kalkulus, matriks, statistika, fisika, kimia, keuangan, dan konversi satuan — lengkap dengan langkah penyelesaian, penjelasan, dan verifikasi otomatis. Tanpa AI generatif: setiap hasil dihitung oleh mesin matematika deterministik.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, ""),
  locale: "id_ID",
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
};

export function absoluteUrl(path: string): string {
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}
