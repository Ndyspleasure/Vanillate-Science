import {
  Atom,
  Binary,
  Calculator,
  FlaskConical,
  Landmark,
  Orbit,
  Ruler,
  Shapes,
  Sigma,
  Wrench,
} from "lucide-react";
import type { CategoryId } from "@/lib/calculators";

const ICONS: Record<CategoryId, typeof Sigma> = {
  math: Sigma,
  physics: Atom,
  chemistry: FlaskConical,
  statistics: Calculator,
  finance: Landmark,
  "computer-science": Binary,
  astronomy: Orbit,
  engineering: Wrench,
  geometry: Shapes,
  units: Ruler,
};

export function CategoryIcon({ id, size = 18 }: { id: CategoryId; size?: number }) {
  const Icon = ICONS[id];
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-strong"
      aria-hidden
    >
      <Icon size={size} />
    </span>
  );
}
