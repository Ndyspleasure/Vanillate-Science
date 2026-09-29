import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0c0e14 0%, #1e1b4b 100%)", color: "#ecebe6", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 700, color: "#fff" }}>√</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>{SITE.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Masukkan soalnya.</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, color: "#a5b4fc" }}>Lihat cara & buktinya.</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#a3a8b6" }}>
          <span>Langkah terverifikasi</span>
          <span>·</span>
          <span>Tanpa AI generatif</span>
          <span>·</span>
          <span>Matematika · Fisika · Kimia · Statistika</span>
        </div>
      </div>
    ),
    size,
  );
}
