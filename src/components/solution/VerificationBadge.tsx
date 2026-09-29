import { AlertTriangle, CircleHelp, ShieldCheck, ShieldX, Sigma } from "lucide-react";
import type { VerificationStatus } from "@/engine/steps/types";

export const VERIFICATION_META: Record<
  VerificationStatus,
  { label: string; description: string; tone: string }
> = {
  verified: {
    label: "Terverifikasi",
    description: "Hasil dibuktikan dengan pemeriksaan eksak/simbolik.",
    tone: "bg-ok-soft text-ok border-ok/30",
  },
  "verified-numeric": {
    label: "Terverifikasi numerik",
    description: "Hasil diperiksa secara numerik dengan toleransi yang dinyatakan.",
    tone: "bg-ok-soft text-ok border-ok/30",
  },
  partial: {
    label: "Sebagian terverifikasi",
    description: "Sebagian pemeriksaan lolos; sebagian tidak dapat dilakukan atau gagal.",
    tone: "bg-warn-soft text-warn border-warn/30",
  },
  unverified: {
    label: "Belum terverifikasi",
    description: "Tidak ada metode verifikasi independen untuk hasil ini.",
    tone: "bg-surface-2 text-muted border-border",
  },
  failed: {
    label: "Verifikasi gagal",
    description: "Pemeriksaan independen tidak cocok. Jangan gunakan hasil ini.",
    tone: "bg-bad-soft text-bad border-bad/30",
  },
};

export function VerificationBadge({
  status,
  className = "",
}: {
  status: VerificationStatus;
  className?: string;
}) {
  const meta = VERIFICATION_META[status];
  const Icon =
    status === "verified"
      ? ShieldCheck
      : status === "verified-numeric"
        ? Sigma
        : status === "failed"
          ? ShieldX
          : status === "partial"
            ? AlertTriangle
            : CircleHelp;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.tone} ${className}`}
      title={meta.description}
    >
      <Icon size={13} aria-hidden />
      {meta.label}
    </span>
  );
}
