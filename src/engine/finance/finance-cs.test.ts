import { describe, expect, it } from "vitest";
import {
  solveBreakEven,
  solveCompoundInterest,
  solveDepreciation,
  solveIRR,
  solveLoan,
  solveNPV,
  solveRealRate,
  solveSimpleInterest,
  solveAnnuityValue,
  money,
} from "./solvers";
import {
  solveBase64,
  solveBaseConversion,
  solveBitwise,
  solveBoolean,
  solveSubnet,
  solveTwosComplement,
} from "../cs/solvers";

describe("finance", () => {
  it("formats money in Indonesian style", () => {
    expect(money(1234567.891)).toBe("1.234.567,89");
  });
  it("simple and compound interest", () => {
    expect(
      solveSimpleInterest({ principal: "1000000", ratePercent: "6", years: "2" }).answers[0].text,
    ).toBe("120.000,00");
    const c = solveCompoundInterest({
      principal: "1000",
      ratePercent: "12",
      years: "1",
      periodsPerYear: "12",
    });
    expect(c.answers[0].text).toBe("1.126,83");
    expect(c.verification.status).toBe("verified");
  });
  it("loan schedules end at zero", () => {
    for (const method of ["anuitas", "efektif", "flat"] as const) {
      const s = solveLoan({
        principal: "100000000",
        annualRatePercent: "9",
        years: "5",
        paymentsPerYear: "12",
        method,
      });
      expect(s.verification.status).toBe("verified");
    }
    expect(
      solveLoan({
        principal: "100000000",
        annualRatePercent: "12",
        years: "1",
        paymentsPerYear: "12",
        method: "anuitas",
      }).answers[0].text,
    ).toBe("8.884.878,87");
  });
  it("NPV and IRR", () => {
    const npv = solveNPV({ ratePercent: "10", cashflows: ["-1000", "500", "400", "300"] });
    expect(npv.answers[0].text).toBe("10,52");
    const irr = solveIRR({ cashflows: ["-1000", "500", "400", "300"] });
    expect(Number(irr.answers[0].text.replace("%", ""))).toBeCloseTo(10.65, 1);
    expect(irr.verification.status).toBe("verified-numeric");
  });
  it("break-even, depreciation, Fisher, annuity", () => {
    expect(
      solveBreakEven({ fixedCost: "1000000", price: "15000", variableCost: "10000" }).answers[0]
        .text,
    ).toMatch(/^200 unit/);
    expect(
      solveDepreciation({ cost: "10000", salvage: "1000", life: "5", method: "garis-lurus" })
        .verification.status,
    ).toBe("verified");
    expect(
      solveDepreciation({ cost: "10000", salvage: "1000", life: "5", method: "jumlah-angka-tahun" })
        .verification.status,
    ).toBe("verified");
    expect(
      solveDepreciation({ cost: "10000", salvage: "1000", life: "5", method: "saldo-menurun" })
        .verification.status,
    ).toBe("verified");
    expect(
      Number(
        solveRealRate({ nominalPercent: "10", inflationPercent: "5" }).answers[0].text.replace(
          "%",
          "",
        ),
      ),
    ).toBeCloseTo(4.7619047619, 8);
    expect(
      solveAnnuityValue({ payment: "100", ratePercent: "1", periods: "12", kind: "fv" })
        .verification.status,
    ).toBe("verified");
  });
});

describe("computer science", () => {
  it("converts bases with fractions", () => {
    expect(solveBaseConversion({ value: "255", from: 10, to: 2 }).answers[0].text).toBe("11111111");
    expect(solveBaseConversion({ value: "FF", from: 16, to: 10 }).answers[0].text).toBe("255");
    expect(solveBaseConversion({ value: "0.1", from: 10, to: 2 }).answers[0].text).toBe(
      "0.0(0011)",
    );
    expect(solveBaseConversion({ value: "-42", from: 10, to: 16 }).answers[0].text).toBe("-2A");
    expect(() => solveBaseConversion({ value: "12", from: 2, to: 10 })).toThrowError(/tidak valid/);
  });
  it("two's complement and bitwise", () => {
    expect(solveTwosComplement({ value: "-5", bits: 8 }).answers[0].text).toBe("11111011");
    expect(solveBitwise({ a: "12", b: "10", op: "xor", bits: 8 }).answers[0].text).toBe("6");
    expect(solveBitwise({ a: "0x0F", op: "not", bits: 8 }).answers[0].text).toBe("240");
  });
  it("subnets", () => {
    const s = solveSubnet({ address: "192.168.1.130/26" });
    expect(s.answers.map((a) => a.text).slice(0, 4)).toEqual([
      "192.168.1.128/26",
      "192.168.1.191",
      "192.168.1.129 – 192.168.1.190",
      "62",
    ]);
    expect(solveSubnet({ address: "10.0.0.1 255.0.0.0" }).answers[0].text).toBe("10.0.0.0/8");
  });
  it("base64 round-trips UTF-8", () => {
    expect(solveBase64({ text: "Halo, dunia! ✓", mode: "encode" }).answers[0].text).toBe(
      "SGFsbywgZHVuaWEhIOKckw==",
    );
    expect(solveBase64({ text: "SGFsbywgZHVuaWEhIOKckw==", mode: "decode" }).answers[0].text).toBe(
      "Halo, dunia! ✓",
    );
  });
  it("boolean logic", () => {
    expect(solveBoolean({ expression: "p -> q <-> !q -> !p" }).answers[0].text).toBe("tautologi");
    expect(solveBoolean({ expression: "A and not A" }).answers[0].text).toBe("kontradiksi");
    const s = solveBoolean({ expression: "A'B'C' + A'B'C + AB'C + ABC" });
    expect(s.answers[1].text).toBe("(¬A∧¬B) ∨ (A∧C)");
    expect(s.verification.status).toBe("verified");
  });
});
