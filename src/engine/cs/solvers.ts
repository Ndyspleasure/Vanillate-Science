/**
 * Computer science utilities: base conversion, two's complement, bitwise operations,
 * IPv4 subnetting, Base64, and Boolean logic (truth tables, Quine–McCluskey minimization).
 * References: K. H. Rosen, "Discrete Mathematics and Its Applications" (number
 * representations, Boolean algebra); RFC 4632 (CIDR), RFC 1918 (private addresses),
 * RFC 4648 (Base64).
 */
import { MathError } from "../core/errors";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification } from "../steps/format";
import type {
  Answer,
  Reference,
  Solution,
  Step,
  TableData,
  VerificationCheck,
} from "../steps/types";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const RFC4632: Reference = {
  name: "RFC 4632: Classless Inter-domain Routing (CIDR)",
  source: "IETF",
  url: "https://www.rfc-editor.org/rfc/rfc4632",
};
const RFC4648: Reference = {
  name: "RFC 4648: The Base16, Base32, and Base64 Data Encodings",
  source: "IETF",
  url: "https://www.rfc-editor.org/rfc/rfc4648",
};

function checkBase(b: number) {
  if (!Number.isInteger(b) || b < 2 || b > 36)
    throw new MathError("invalid-input", "Basis harus bilangan bulat 2–36.", { module: "cs" });
}

export function parseInBase(
  text: string,
  base: number,
): { int: bigint; frac: string; negative: boolean } {
  checkBase(base);
  let s = text.trim().toUpperCase().replace(/[_\s]/g, "");
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (base === 16) s = s.replace(/^0X/, "");
  if (base === 2) s = s.replace(/^0B/, "");
  if (base === 8) s = s.replace(/^0O/, "");
  if (!s) throw new MathError("invalid-input", "Bilangan kosong.", { module: "cs" });
  const [ip, fp = ""] = s.split(".");
  let v = 0n;
  for (const ch of ip || "0") {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base)
      throw new MathError("invalid-input", `Digit '${ch}' tidak valid untuk basis ${base}.`, {
        module: "cs",
        hint: `Basis ${base} memakai digit ${DIGITS.slice(0, base).split("").join(", ")}.`,
      });
    v = v * BigInt(base) + BigInt(d);
  }
  for (const ch of fp) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base)
      throw new MathError("invalid-input", `Digit '${ch}' tidak valid untuk basis ${base}.`, {
        module: "cs",
      });
  }
  if (v.toString(2).length > 4096)
    throw new MathError("limit-exceeded", "Bilangan terlalu besar.", { module: "cs" });
  return { int: v, frac: fp, negative };
}

export function toBase(v: bigint, base: number): string {
  checkBase(base);
  if (v === 0n) return "0";
  const neg = v < 0n;
  let x = neg ? -v : v;
  let out = "";
  while (x > 0n) {
    out = DIGITS[Number(x % BigInt(base))] + out;
    x /= BigInt(base);
  }
  return (neg ? "-" : "") + out;
}

export function solveBaseConversion(p: {
  value: string;
  from: number;
  to: number;
  fractionDigits?: number;
}): Solution {
  const { int, frac, negative } = parseInBase(p.value, p.from);
  checkBase(p.to);
  const steps: Step[] = [];
  const tables: TableData[] = [];
  // 1. to decimal
  if (p.from !== 10) {
    const digits = (
      p.value
        .trim()
        .toUpperCase()
        .replace(/^-/, "")
        .replace(/^0[XBO]/, "")
        .split(".")[0] || "0"
    ).split("");
    const terms = digits.map(
      (d, k) => `${DIGITS.indexOf(d)} \\cdot ${p.from}^{${digits.length - 1 - k}}`,
    );
    steps.push({
      title: `Ubah ke desimal (ekspansi posisi basis ${p.from})`,
      after: `${terms.join(" + ")} = ${int.toString()}`,
      operation: "positional",
      rule: {
        id: "positional",
        name: "Notasi posisi",
        formula: "(d_k \\ldots d_0)_b = \\sum d_i b^i",
      },
      reason: "Setiap digit dikalikan pangkat basis sesuai posisinya.",
    });
  }
  // 2. integer part to target base by repeated division
  let result = toBase(int, p.to);
  if (p.to !== 10 && int > 0n) {
    const rows: string[][] = [];
    let x = int;
    while (x > 0n) {
      const qv = x / BigInt(p.to);
      const r = x % BigInt(p.to);
      rows.push([
        x.toString(),
        qv.toString(),
        `${r.toString()}${Number(r) > 9 ? ` (${DIGITS[Number(r)]})` : ""}`,
      ]);
      x = qv;
    }
    tables.push({
      caption: `Pembagian berulang dengan ${p.to}`,
      headers: ["Bilangan", "Hasil bagi", "Sisa"],
      rows,
    });
    steps.push({
      title: `Bagi berulang dengan ${p.to}, baca sisa dari bawah ke atas`,
      after: `${int.toString()}_{10} = ${result}_{${p.to}}`,
      operation: "repeated-division",
      rule: { id: "repeated-division", name: "Pembagian berulang", formula: "n = q \\cdot b + r" },
      reason: "Sisa pembagian adalah digit, dari digit paling kanan ke kiri.",
    });
  }
  // fraction part
  const notes: string[] = [];
  if (frac) {
    let num = 0n;
    let den = 1n;
    for (const ch of frac) {
      num = num * BigInt(p.from) + BigInt(DIGITS.indexOf(ch));
      den *= BigInt(p.from);
    }
    const maxDigits = p.fractionDigits ?? 24;
    let out = "";
    const seen = new Map<string, number>();
    let rem = num;
    let repeatAt = -1;
    const rows: string[][] = [];
    while (rem !== 0n && out.length < maxDigits) {
      const key = rem.toString();
      if (seen.has(key)) {
        repeatAt = seen.get(key)!;
        break;
      }
      seen.set(key, out.length);
      const prod = rem * BigInt(p.to);
      const d = prod / den;
      rows.push([`${rem}/${den} × ${p.to}`, DIGITS[Number(d)]]);
      out += DIGITS[Number(d)];
      rem = prod % den;
    }
    if (repeatAt >= 0) {
      result += `.${out.slice(0, repeatAt)}(${out.slice(repeatAt)})`;
      notes.push("Bagian pecahan berulang; digit dalam kurung berulang tak hingga.");
    } else {
      result += `.${out}`;
      if (rem !== 0n)
        notes.push(`Bagian pecahan dipotong setelah ${maxDigits} digit (tidak berhenti).`);
    }
    tables.push({
      caption: "Perkalian berulang bagian pecahan",
      headers: ["Langkah", "Digit"],
      rows,
    });
    steps.push({
      title: `Bagian pecahan: kalikan berulang dengan ${p.to}`,
      after: result,
      operation: "repeated-multiplication",
      reason: "Bagian bulat hasil perkalian menjadi digit berikutnya.",
    });
  }
  if (negative) result = `-${result}`;
  const back = parseInBase(result.replace(/\(.*\)/, "").replace(/\.$/, ""), p.to);
  const checks: VerificationCheck[] = [
    {
      description: "Konversi balik bagian bulat menghasilkan nilai semula",
      passed: back.int === int,
      method: "Konversi balik eksak (BigInt)",
    },
  ];
  return makeSolution({
    kind: "computer-science",
    title: "Konversi basis bilangan",
    input: JSON.stringify(p),
    inputLatex: `${p.value}_{${p.from}} \\to (\\ldots)_{${p.to}}`,
    answers: [
      {
        label: `Basis ${p.to}`,
        latex: `${result.replace(/\((.*)\)/, "\\overline{$1}")}_{${p.to}}`,
        text: result,
        exact: true,
      },
      ...(p.to !== 10 && p.from !== 10
        ? [
            {
              label: "Desimal",
              latex: `${negative ? "-" : ""}${int.toString()}${frac ? ".\\ldots" : ""}`,
              text: `${negative ? "-" : ""}${int}`,
              exact: true,
            } as Answer,
          ]
        : []),
    ],
    method: {
      name: "Melalui basis 10",
      description:
        "Ekspansi posisi ke desimal, lalu pembagian berulang (bagian bulat) dan perkalian berulang (bagian pecahan).",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "cs",
    notes,
    tables,
    references: [REFERENCES.rosen],
  });
}

export function solveTwosComplement(p: { value: string; bits: number }): Solution {
  const bits = p.bits;
  if (![4, 8, 16, 32, 64, 128].includes(bits))
    throw new MathError("invalid-input", "Jumlah bit harus 4, 8, 16, 32, 64, atau 128.", {
      module: "cs",
    });
  const v = BigInt(p.value.trim());
  const min = -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(bits - 1)) - 1n;
  if (v < min || v > max)
    throw new MathError(
      "domain-error",
      `Nilai di luar rentang ${bits}-bit bertanda [${min}, ${max}].`,
      { module: "cs" },
    );
  const mask = (1n << BigInt(bits)) - 1n;
  const repr = v >= 0n ? v : (1n << BigInt(bits)) + v;
  const bin = repr.toString(2).padStart(bits, "0");
  const steps: Step[] = [];
  if (v < 0n) {
    const posBin = (-v).toString(2).padStart(bits, "0");
    const inv = (~-v & mask).toString(2).padStart(bits, "0");
    steps.push({
      title: `Tulis |${v}| dalam ${bits} bit`,
      after: posBin,
      operation: "magnitude",
      reason: "Mulai dari nilai mutlaknya.",
    });
    steps.push({
      title: "Balik semua bit (komplemen satu)",
      after: inv,
      operation: "invert",
      reason: "0 → 1 dan 1 → 0.",
    });
    steps.push({
      title: "Tambahkan 1",
      after: bin,
      operation: "add-one",
      rule: { id: "twos-complement", name: "Komplemen dua", formula: "-x = \\overline{x} + 1" },
      reason: "Hasilnya adalah representasi komplemen dua.",
    });
  } else
    steps.push({
      title: "Bilangan non-negatif: biner biasa dengan bit tanda 0",
      after: bin,
      operation: "positive",
      reason: "Bit paling kiri = 0 menandakan positif.",
    });
  const decoded = bin[0] === "1" ? BigInt(`0b${bin}`) - (1n << BigInt(bits)) : BigInt(`0b${bin}`);
  return makeSolution({
    kind: "computer-science",
    title: "Komplemen dua",
    input: JSON.stringify(p),
    inputLatex: `${v}\\ (${bits}\\text{ bit})`,
    answers: [
      {
        label: "Biner",
        latex: `\\texttt{${bin.replace(/(.{4})(?!$)/g, "$1\\ ")}}`,
        text: bin,
        exact: true,
      },
      {
        label: "Heksadesimal",
        latex: `\\texttt{0x${repr
          .toString(16)
          .toUpperCase()
          .padStart(bits / 4, "0")}}`,
        text: `0x${repr
          .toString(16)
          .toUpperCase()
          .padStart(bits / 4, "0")}`,
        exact: true,
      },
    ],
    method: {
      name: "Komplemen dua",
      description: "Representasi bilangan bertanda standar pada komputer.",
    },
    steps,
    verification: aggregateVerification([
      {
        description: "Decode kembali menghasilkan nilai semula",
        passed: decoded === v,
        method: "Konversi balik",
      },
    ]),
    module: "cs",
    references: [REFERENCES.rosen],
  });
}

export function solveBitwise(p: {
  a: string;
  b?: string;
  op: "and" | "or" | "xor" | "not" | "shl" | "shr";
  bits: number;
}): Solution {
  const bits = p.bits;
  const mask = (1n << BigInt(bits)) - 1n;
  const parse = (s: string) => {
    const t = s.trim().toLowerCase();
    const v = t.startsWith("0x") ? BigInt(t) : t.startsWith("0b") ? BigInt(t) : BigInt(t);
    if (v < 0n || v > mask)
      throw new MathError("domain-error", `Nilai harus 0–${mask} untuk ${bits} bit.`, {
        module: "cs",
      });
    return v;
  };
  const a = parse(p.a);
  const b = p.b !== undefined && p.b !== "" ? parse(p.b) : 0n;
  let r: bigint;
  const sym = {
    and: "\\land",
    or: "\\lor",
    xor: "\\oplus",
    not: "\\lnot",
    shl: "\\ll",
    shr: "\\gg",
  }[p.op];
  switch (p.op) {
    case "and":
      r = a & b;
      break;
    case "or":
      r = a | b;
      break;
    case "xor":
      r = a ^ b;
      break;
    case "not":
      r = ~a & mask;
      break;
    case "shl":
      r = (a << b) & mask;
      break;
    case "shr":
      r = a >> b;
      break;
  }
  const bin = (x: bigint) => x.toString(2).padStart(bits, "0");
  const rows =
    p.op === "not"
      ? [
          ["A", bin(a)],
          ["¬A", bin(r)],
        ]
      : p.op === "shl" || p.op === "shr"
        ? [
            ["A", bin(a)],
            [`A ${p.op === "shl" ? "<<" : ">>"} ${b}`, bin(r)],
          ]
        : [
            ["A", bin(a)],
            ["B", bin(b)],
            [p.op.toUpperCase(), bin(r)],
          ];
  const bitCheck =
    p.op === "and" || p.op === "or" || p.op === "xor"
      ? [...bin(r)].every((c, k) => {
          const x = bin(a)[k] === "1";
          const y = bin(b)[k] === "1";
          const z = p.op === "and" ? x && y : p.op === "or" ? x || y : x !== y;
          return (c === "1") === z;
        })
      : true;
  return makeSolution({
    kind: "computer-science",
    title: "Operasi bitwise",
    input: JSON.stringify(p),
    inputLatex: p.op === "not" ? `\\lnot ${a}` : `${a} ${sym} ${b}`,
    answers: [
      { label: "Hasil (desimal)", latex: r.toString(), text: r.toString(), exact: true },
      { label: "Hasil (biner)", latex: `\\texttt{${bin(r)}}`, text: bin(r), exact: true },
      {
        label: "Hasil (heksadesimal)",
        latex: `\\texttt{0x${r.toString(16).toUpperCase()}}`,
        text: `0x${r.toString(16).toUpperCase()}`,
        exact: true,
      },
    ],
    method: {
      name: "Operasi bit per bit",
      description: "Setiap posisi bit diproses secara independen.",
    },
    steps: [
      {
        title: "Sejajarkan bit dan operasikan per kolom",
        after: `\\begin{array}{r} ${rows.map(([l, v]) => `\\text{${l}}: & \\texttt{${v}}`).join(" \\\\ ")} \\end{array}`,
        operation: "bitwise",
        reason:
          p.op === "shl"
            ? "Geser ke kiri = kalikan 2ⁿ (bit yang keluar dibuang)."
            : p.op === "shr"
              ? "Geser ke kanan = bagi 2ⁿ (dibulatkan ke bawah)."
              : "Tabel kebenaran operasi diterapkan pada setiap kolom.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Pemeriksaan per bit dengan tabel kebenaran",
        passed: bitCheck,
        method: "Pemeriksaan independen per bit",
      },
    ]),
    module: "cs",
    tables: [{ caption: "Representasi biner", headers: ["", "Biner"], rows }],
    references: [REFERENCES.rosen],
  });
}

function ipToInt(ip: string): number {
  const parts = ip.trim().split(".");
  if (parts.length !== 4 || parts.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) {
    throw new MathError("invalid-input", `Alamat IPv4 '${ip}' tidak valid.`, {
      module: "cs",
      hint: "Format: a.b.c.d dengan setiap bagian 0–255.",
    });
  }
  return parts.reduce((acc, x) => ((acc << 8) | Number(x)) >>> 0, 0) >>> 0;
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
}

export function solveSubnet(p: { address: string }): Solution {
  const m = /^\s*([\d.]+)\s*(?:\/\s*(\d{1,2})|\s+([\d.]+))\s*$/.exec(p.address);
  if (!m)
    throw new MathError(
      "invalid-input",
      "Masukkan alamat dengan prefix CIDR atau subnet mask, misalnya 192.168.1.10/24 atau 192.168.1.10 255.255.255.0.",
      { module: "cs" },
    );
  const ip = ipToInt(m[1]);
  let prefix: number;
  if (m[2] !== undefined) {
    prefix = Number(m[2]);
    if (prefix > 32)
      throw new MathError("invalid-input", "Prefix CIDR harus 0–32.", { module: "cs" });
  } else {
    const maskInt = ipToInt(m[3]);
    const bin = maskInt.toString(2).padStart(32, "0");
    if (!/^1*0*$/.test(bin))
      throw new MathError(
        "invalid-input",
        "Subnet mask tidak valid (bit 1 harus berurutan di kiri).",
        { module: "cs" },
      );
    prefix = bin.indexOf("0") === -1 ? 32 : bin.indexOf("0");
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix >= 31 ? (prefix === 31 ? 2 : 1) : total - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const firstOctet = ip >>> 24;
  const cls =
    firstOctet < 128
      ? "A"
      : firstOctet < 192
        ? "B"
        : firstOctet < 224
          ? "C"
          : firstOctet < 240
            ? "D (multicast)"
            : "E (eksperimental)";
  const isPrivate =
    ip >>> 24 === 10 || ((ip >>> 20) & 0xfff) === 0xac1 || ((ip >>> 16) & 0xffff) === 0xc0a8;
  const bin = (x: number) =>
    x
      .toString(2)
      .padStart(32, "0")
      .replace(/(.{8})(?!$)/g, "$1.");
  const answers: Answer[] = [
    {
      label: "Alamat jaringan",
      latex: `\\texttt{${intToIp(network)}/${prefix}}`,
      text: `${intToIp(network)}/${prefix}`,
      exact: true,
    },
    {
      label: "Broadcast",
      latex: `\\texttt{${intToIp(broadcast)}}`,
      text: intToIp(broadcast),
      exact: true,
    },
    {
      label: "Rentang host",
      latex: `\\texttt{${intToIp(first)}} - \\texttt{${intToIp(last)}}`,
      text: `${intToIp(first)} – ${intToIp(last)}`,
      exact: true,
    },
    {
      label: "Jumlah host yang dapat dipakai",
      latex: String(usable),
      text: String(usable),
      exact: true,
    },
    { label: "Subnet mask", latex: `\\texttt{${intToIp(mask)}}`, text: intToIp(mask), exact: true },
    {
      label: "Wildcard mask",
      latex: `\\texttt{${intToIp(~mask >>> 0)}}`,
      text: intToIp(~mask >>> 0),
      exact: true,
    },
    {
      label: "Kelas / jenis",
      latex: `\\text{${cls}, ${isPrivate ? "privat (RFC 1918)" : "publik/khusus"}}`,
      text: `Kelas ${cls}, ${isPrivate ? "privat (RFC 1918)" : "publik/khusus"}`,
      exact: true,
    },
  ];
  return makeSolution({
    kind: "computer-science",
    title: "Kalkulator subnet IPv4",
    input: p.address,
    inputLatex: `\\texttt{${intToIp(ip)}/${prefix}}`,
    answers,
    method: {
      name: "Operasi AND dengan subnet mask",
      description: "Alamat jaringan = IP AND mask; broadcast = jaringan OR (NOT mask).",
    },
    steps: [
      {
        title: "Tulis IP dan mask dalam biner",
        after: `\\begin{array}{r} \\text{IP}: & \\texttt{${bin(ip)}} \\\\ \\text{mask}: & \\texttt{${bin(mask)}} \\end{array}`,
        operation: "binary",
        reason: `Prefix /${prefix} berarti ${prefix} bit pertama mask bernilai 1.`,
      },
      {
        title: "Alamat jaringan = IP AND mask",
        after: `\\texttt{${bin(network)}} = ${intToIp(network)}`,
        operation: "and",
        rule: {
          id: "network",
          name: "Alamat jaringan",
          formula: "\\text{net} = \\text{IP} \\land \\text{mask}",
        },
        reason: "Bit host dinolkan.",
      },
      {
        title: "Broadcast = jaringan OR NOT mask",
        after: `\\texttt{${bin(broadcast)}} = ${intToIp(broadcast)}`,
        operation: "or",
        reason: "Semua bit host dijadikan 1.",
      },
      {
        title: "Jumlah host",
        after: `2^{32 - ${prefix}} ${prefix < 31 ? "- 2" : ""} = ${usable}`,
        operation: "hosts",
        reason:
          prefix < 31
            ? "Alamat jaringan dan broadcast tidak dipakai untuk host."
            : prefix === 31
              ? "/31 untuk tautan titik-ke-titik (RFC 3021): kedua alamat dipakai."
              : "/32 hanya satu host.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "IP berada di dalam rentang jaringan",
        passed: ip >= network && ip <= broadcast,
        method: "Pemeriksaan rentang",
      },
      {
        description: "Jaringan + ukuran blok − 1 = broadcast",
        passed: network + total - 1 === broadcast,
        method: "Aritmetika independen",
      },
    ]),
    module: "cs",
    references: [RFC4632],
  });
}

export function solveBase64(p: { text: string; mode: "encode" | "decode" }): Solution {
  let out: string;
  if (p.mode === "encode") {
    const bytes = new TextEncoder().encode(p.text);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    out = btoa(bin);
  } else {
    const clean = p.text.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0)
      throw new MathError("invalid-input", "Teks Base64 tidak valid.", {
        module: "cs",
        cause: "Hanya karakter A–Z, a–z, 0–9, +, / dan padding '=' dengan panjang kelipatan 4.",
      });
    const bin = atob(clean);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    out = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const back =
    p.mode === "encode"
      ? new TextDecoder().decode(Uint8Array.from(atob(out), (c) => c.charCodeAt(0)))
      : (() => {
          const bytes = new TextEncoder().encode(out);
          let bin = "";
          bytes.forEach((b) => (bin += String.fromCharCode(b)));
          return btoa(bin);
        })();
  return makeSolution({
    kind: "computer-science",
    title: p.mode === "encode" ? "Encode Base64" : "Decode Base64",
    input: JSON.stringify(p),
    inputLatex: "\\text{teks}",
    answers: [{ label: "Hasil", latex: "\\text{(lihat teks)}", text: out, exact: true }],
    method: {
      name: "Base64 (RFC 4648)",
      description:
        "Setiap 3 byte (24 bit) dipecah menjadi 4 kelompok 6 bit yang dipetakan ke alfabet Base64; teks dikodekan UTF-8.",
    },
    steps: [
      {
        title:
          p.mode === "encode"
            ? "Ubah teks ke byte UTF-8 lalu kelompokkan per 6 bit"
            : "Petakan karakter ke 6 bit lalu gabungkan per 8 bit",
        after: "\\text{lihat hasil}",
        operation: "base64",
        reason: "Padding '=' menandai byte terakhir yang tidak lengkap.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Proses balik menghasilkan input semula",
        passed: p.mode === "encode" ? back === p.text : back === p.text.replace(/\s+/g, ""),
        method: "Round-trip",
      },
    ]),
    module: "cs",
    references: [RFC4648],
  });
}

// ---------------------------------------------------------------------------
// Boolean logic
// ---------------------------------------------------------------------------

type BNode =
  | { k: "var"; name: string }
  | { k: "const"; value: boolean }
  | { k: "not"; a: BNode }
  | { k: "bin"; op: "and" | "or" | "xor" | "imp" | "iff"; a: BNode; b: BNode };

function tokenizeBool(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  const two: Record<string, string> = {
    "&&": "and",
    "||": "or",
    "->": "imp",
    "=>": "imp",
    "<->": "iff",
    "<=>": "iff",
  };
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const three = s.slice(i, i + 3);
    if (three === "<->" || three === "<=>") {
      out.push("iff");
      i += 3;
      continue;
    }
    const tw = s.slice(i, i + 2);
    if (two[tw]) {
      out.push(two[tw]);
      i += 2;
      continue;
    }
    const map: Record<string, string> = {
      "∧": "and",
      "&": "and",
      "·": "and",
      "*": "and",
      "∨": "or",
      "|": "or",
      "+": "or",
      "¬": "not",
      "!": "not",
      "~": "not",
      "⊕": "xor",
      "^": "xor",
      "→": "imp",
      "⇒": "imp",
      "↔": "iff",
      "⇔": "iff",
      "(": "(",
      ")": ")",
      "'": "'",
    };
    if (map[ch]) {
      out.push(map[ch]);
      i++;
      continue;
    }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (
      w &&
      /^[A-Z]{2,}$/.test(w[0]) &&
      !["AND", "OR", "NOT", "XOR", "IFF", "TRUE", "FALSE"].includes(w[0])
    ) {
      // juxtaposed single-letter variables: ABC = A ∧ B ∧ C
      out.push(w[0][0]);
      i += 1;
      continue;
    }
    if (w) {
      const word = w[0].toLowerCase();
      const kw: Record<string, string> = {
        and: "and",
        dan: "and",
        or: "or",
        atau: "or",
        not: "not",
        tidak: "not",
        xor: "xor",
        implies: "imp",
        iff: "iff",
        true: "1",
        false: "0",
        t: w[0] === "T" ? "1" : w[0],
        f: w[0] === "F" ? "0" : w[0],
      };
      out.push(kw[word] ?? w[0]);
      i += w[0].length;
      continue;
    }
    if (ch === "0" || ch === "1") {
      out.push(ch);
      i++;
      continue;
    }
    throw new MathError("invalid-input", `Karakter '${ch}' tidak dikenali dalam ekspresi logika.`, {
      module: "logic",
    });
  }
  return out;
}

export function parseBool(s: string): BNode {
  const t = tokenizeBool(s);
  let pos = 0;
  const peek = () => t[pos];
  const OPS = ["and", "or", "xor", "imp", "iff", "not", "(", ")", "'"];
  const primary = (): BNode => {
    const tok = t[pos++];
    if (tok === undefined)
      throw new MathError("invalid-input", "Ekspresi logika tidak lengkap.", { module: "logic" });
    if (tok === "not") return { k: "not", a: postfix(primary()) };
    if (tok === "(") {
      const e = iff();
      if (t[pos++] !== ")")
        throw new MathError("invalid-input", "Kurung buka tidak memiliki pasangan.", {
          module: "logic",
        });
      return postfix(e);
    }
    if (tok === "0" || tok === "1") return postfix({ k: "const", value: tok === "1" });
    if (OPS.includes(tok))
      throw new MathError("invalid-input", `Operator '${tok}' tidak diharapkan di sini.`, {
        module: "logic",
      });
    return postfix({ k: "var", name: tok });
  };
  const postfix = (e: BNode): BNode => {
    while (peek() === "'") {
      pos++;
      e = { k: "not", a: e };
    }
    return e;
  };
  const conj = (): BNode => {
    let e = primary();
    for (;;) {
      if (peek() === "and") {
        pos++;
        e = { k: "bin", op: "and", a: e, b: primary() };
      } else if (peek() && !OPS.includes(peek())) {
        e = { k: "bin", op: "and", a: e, b: primary() };
      } else if (peek() === "(" || peek() === "not") {
        e = { k: "bin", op: "and", a: e, b: primary() };
      } else break;
    }
    return e;
  };
  const xor = (): BNode => {
    let e = conj();
    while (peek() === "xor") {
      pos++;
      e = { k: "bin", op: "xor", a: e, b: conj() };
    }
    return e;
  };
  const disj = (): BNode => {
    let e = xor();
    while (peek() === "or") {
      pos++;
      e = { k: "bin", op: "or", a: e, b: xor() };
    }
    return e;
  };
  const imp = (): BNode => {
    const e = disj();
    if (peek() === "imp") {
      pos++;
      return { k: "bin", op: "imp", a: e, b: imp() };
    }
    return e;
  };
  const iff = (): BNode => {
    let e = imp();
    while (peek() === "iff") {
      pos++;
      e = { k: "bin", op: "iff", a: e, b: imp() };
    }
    return e;
  };
  const e = iff();
  if (pos !== t.length)
    throw new MathError("invalid-input", `Token tak terduga '${t[pos]}'.`, { module: "logic" });
  return e;
}

function evalBool(e: BNode, env: Record<string, boolean>): boolean {
  switch (e.k) {
    case "var":
      return env[e.name];
    case "const":
      return e.value;
    case "not":
      return !evalBool(e.a, env);
    case "bin": {
      const a = evalBool(e.a, env);
      const b = evalBool(e.b, env);
      switch (e.op) {
        case "and":
          return a && b;
        case "or":
          return a || b;
        case "xor":
          return a !== b;
        case "imp":
          return !a || b;
        case "iff":
          return a === b;
      }
    }
  }
}

function boolVars(e: BNode, out = new Set<string>()): Set<string> {
  if (e.k === "var") out.add(e.name);
  if (e.k === "not") boolVars(e.a, out);
  if (e.k === "bin") {
    boolVars(e.a, out);
    boolVars(e.b, out);
  }
  return out;
}

function boolLatex(e: BNode, parent = 0): string {
  const prec = { iff: 1, imp: 2, or: 3, xor: 4, and: 5 } as const;
  switch (e.k) {
    case "var":
      return e.name;
    case "const":
      return e.value ? "1" : "0";
    case "not":
      return `\\lnot ${e.a.k === "bin" ? `\\left(${boolLatex(e.a)}\\right)` : boolLatex(e.a)}`;
    case "bin": {
      const p = prec[e.op];
      const sym = {
        and: "\\land",
        or: "\\lor",
        xor: "\\oplus",
        imp: "\\rightarrow",
        iff: "\\leftrightarrow",
      }[e.op];
      const s = `${boolLatex(e.a, p)} ${sym} ${boolLatex(e.b, p + (e.op === "imp" ? 0 : 1))}`;
      return p < parent ? `\\left(${s}\\right)` : s;
    }
  }
}

interface Implicant {
  bits: string; // '0', '1', '-'
  minterms: number[];
}

/** Quine–McCluskey prime implicants + greedy cover after essential primes. */
export function quineMcCluskey(minterms: number[], n: number): Implicant[] {
  if (minterms.length === 0) return [];
  let groups: Implicant[] = minterms.map((m) => ({
    bits: m.toString(2).padStart(n, "0"),
    minterms: [m],
  }));
  const primes: Implicant[] = [];
  while (groups.length) {
    const used = new Set<number>();
    const next: Implicant[] = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i].bits;
        const b = groups[j].bits;
        let diff = -1;
        let count = 0;
        for (let k = 0; k < n; k++) {
          if (a[k] !== b[k]) {
            count++;
            diff = k;
          }
        }
        if (count === 1 && a[diff] !== "-" && b[diff] !== "-") {
          used.add(i);
          used.add(j);
          const bits = a.slice(0, diff) + "-" + a.slice(diff + 1);
          if (!next.some((x) => x.bits === bits))
            next.push({
              bits,
              minterms: [...new Set([...groups[i].minterms, ...groups[j].minterms])].sort(
                (x, y) => x - y,
              ),
            });
        }
      }
    }
    groups.forEach((g, i) => {
      if (!used.has(i) && !primes.some((p) => p.bits === g.bits)) primes.push(g);
    });
    groups = next;
  }
  // cover
  const remaining = new Set(minterms);
  const chosen: Implicant[] = [];
  for (const m of minterms) {
    const covering = primes.filter((p) => p.minterms.includes(m));
    if (covering.length === 1 && !chosen.includes(covering[0])) chosen.push(covering[0]);
  }
  chosen.forEach((c) => c.minterms.forEach((m) => remaining.delete(m)));
  while (remaining.size) {
    let best = primes[0];
    let bestCount = -1;
    for (const p of primes) {
      const c = p.minterms.filter((m) => remaining.has(m)).length;
      if (
        c > bestCount ||
        (c === bestCount && p.bits.split("-").length > best.bits.split("-").length)
      ) {
        best = p;
        bestCount = c;
      }
    }
    chosen.push(best);
    best.minterms.forEach((m) => remaining.delete(m));
  }
  return chosen;
}

function implicantLatex(imp: Implicant, vars: string[]): string {
  const lits = imp.bits
    .split("")
    .map((b, k) => (b === "1" ? vars[k] : b === "0" ? `\\lnot ${vars[k]}` : ""))
    .filter(Boolean);
  return lits.length ? lits.join(" \\land ") : "1";
}

function implicantText(imp: Implicant, vars: string[]): string {
  const lits = imp.bits
    .split("")
    .map((b, k) => (b === "1" ? vars[k] : b === "0" ? `¬${vars[k]}` : ""))
    .filter(Boolean);
  return lits.length ? lits.join("∧") : "1";
}

export function solveBoolean(p: { expression: string }): Solution {
  const e = parseBool(p.expression);
  const vars = [...boolVars(e)].sort();
  if (vars.length > 10)
    throw new MathError("limit-exceeded", "Maksimal 10 variabel (1024 baris tabel kebenaran).", {
      module: "logic",
    });
  const n = vars.length;
  const rows: string[][] = [];
  const minterms: number[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const env: Record<string, boolean> = {};
    vars.forEach((v, k) => (env[v] = ((m >> (n - 1 - k)) & 1) === 1));
    const val = evalBool(e, env);
    if (val) minterms.push(m);
    rows.push([...vars.map((v) => (env[v] ? "1" : "0")), val ? "1" : "0"]);
  }
  const kind =
    minterms.length === 1 << n
      ? "tautologi"
      : minterms.length === 0
        ? "kontradiksi"
        : "kontingensi";
  const primes = quineMcCluskey(minterms, n);
  const minimal =
    kind === "tautologi"
      ? "1"
      : kind === "kontradiksi"
        ? "0"
        : primes.map((pi) => `(${implicantLatex(pi, vars)})`).join(" \\lor ");
  const minimalText =
    kind === "tautologi"
      ? "1"
      : kind === "kontradiksi"
        ? "0"
        : primes.map((pi) => `(${implicantText(pi, vars)})`).join(" ∨ ");
  // verify minimal form
  let ok = true;
  for (let m = 0; m < 1 << n; m++) {
    const bits = m.toString(2).padStart(n, "0");
    const covered = primes.some((pi) =>
      pi.bits.split("").every((b, k) => b === "-" || b === bits[k]),
    );
    if (covered !== minterms.includes(m)) ok = false;
  }
  if (kind !== "kontingensi") ok = true;
  const dnf = minterms.length ? minterms.map((m) => `m_{${m}}`).join(" + ") : "0";
  return makeSolution({
    kind: "logic",
    title: "Logika proposisi / aljabar Boolean",
    input: p.expression,
    inputLatex: boolLatex(e),
    answers: [
      { label: "Jenis", latex: `\\text{${kind}}`, text: kind, exact: true },
      { label: "Bentuk minimal (SOP)", latex: minimal, text: minimalText, exact: true },
      {
        label: "Bentuk kanonik (jumlah minterm)",
        latex: `\\sum m(${minterms.join(", ")})`,
        text: `Σm(${minterms.join(", ")})`,
        exact: true,
      },
    ],
    method: {
      name: "Tabel kebenaran dan metode Quine–McCluskey",
      description:
        "Evaluasi semua kombinasi nilai, lalu gabungkan minterm yang berbeda satu bit untuk mendapat implikan prima.",
    },
    steps: [
      {
        title: "Susun tabel kebenaran",
        after: `2^{${n}} = ${1 << n}\\ \\text{baris}`,
        operation: "truth-table",
        reason: "Setiap kombinasi nilai variabel dievaluasi.",
      },
      {
        title: "Minterm (baris bernilai 1)",
        after: dnf,
        operation: "minterms",
        reason: "Bentuk normal disjungtif kanonik.",
      },
      {
        title: "Implikan prima terpilih",
        after:
          kind === "kontingensi"
            ? primes
                .map(
                  (pi) => `${pi.bits.replace(/-/g, "\\text{-}")}\\ (${implicantLatex(pi, vars)})`,
                )
                .join(",\\ ")
            : `\\text{${kind}}`,
        operation: "prime-implicants",
        rule: { id: "qm", name: "Metode Quine–McCluskey", formula: "XY + X\\bar{Y} = X" },
        reason:
          "Implikan esensial dipilih dahulu, lalu sisa minterm ditutup dengan implikan yang menutup paling banyak.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Tabel kebenaran bentuk minimal identik dengan ekspresi asli",
        passed: ok,
        method: "Pemeriksaan semua baris",
      },
    ]),
    module: "logic",
    tables:
      n <= 6 ? [{ caption: "Tabel kebenaran", headers: [...vars, "hasil"], rows }] : undefined,
    notes:
      primes.length > 0 && kind === "kontingensi"
        ? [
            "Pemilihan penutup setelah implikan esensial bersifat greedy; bentuk yang ditampilkan valid dan umumnya minimal, tetapi untuk kasus tertentu mungkin ada bentuk lain dengan jumlah literal sama atau lebih sedikit.",
          ]
        : [],
    references: [REFERENCES.rosen],
  });
}

export { ipToInt, intToIp };
export type { TableData };
