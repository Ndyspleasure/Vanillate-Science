import { describe, expect, it } from "vitest";
import { solve } from "@/engine/router";
import { GUIDE } from "./guide";

describe("syntax guide examples", () => {
  for (const section of GUIDE) {
    it(section.title, () => {
      for (const row of section.rows) {
        const r = solve(row.example);
        if (!r.ok) throw new Error(`${row.example}: ${r.error.message}`);
        expect(["verified", "verified-numeric"], row.example).toContain(r.solution.verification.status);
      }
    });
  }
});
