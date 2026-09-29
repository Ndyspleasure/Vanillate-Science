import type { TableData } from "@/engine/steps/types";

export function TableView({ table }: { table: TableData }) {
  return (
    <figure className="min-w-0">
      {table.caption && <figcaption className="mb-2 text-sm font-medium text-text">{table.caption}</figcaption>}
      <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {table.headers.map((h, i) => (
                <th key={i} scope="col" className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold text-text">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="odd:bg-surface even:bg-surface-2/40">
                {row.map((cell, c) => (
                  <td key={c} className="whitespace-nowrap border-b border-border/60 px-3 py-1.5 font-mono text-[13px] tabular-nums text-text">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
