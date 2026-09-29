import type { MetadataRoute } from "next";
import { CALCULATORS, CATEGORIES, calculatorPath } from "@/lib/calculators";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ["/", "/calculator", "/grafik", "/verifikasi", "/panduan", "/tentang"].map(
    (p) => ({
      url: absoluteUrl(p),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: p === "/" ? 1 : 0.8,
    }),
  );
  const categories = CATEGORIES.map((c) => ({
    url: absoluteUrl(`/calculator/${c.id}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  const calculators = CALCULATORS.map((c) => ({
    url: absoluteUrl(calculatorPath(c)),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [...staticPages, ...categories, ...calculators];
}
