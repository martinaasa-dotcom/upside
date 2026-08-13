"use client";

import {
  downloadHoldingsCsvTemplate,
  parseHoldingsCsv,
  type CsvHoldingRow,
  type CsvSkippedRow,
} from "@/lib/csv-import";
import { cn } from "@/lib/format";
import { AlertTriangle, Download, FileUp, X } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  open: boolean;
  portfolioName: string;
  onClose: () => void;
  onImport: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  /** Hide the Call % column/copy for viewers with no options experience. */
  hideCallPct?: boolean;
};

export function CsvImportModal({
  open,
  portfolioName,
  onClose,
  onImport,
  hideCallPct = false,
}: Props) {
  const [rows, setRows] = useState<CsvHoldingRow[]>([]);
  const [cash, setCash] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<CsvSkippedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setRows([]);
    setCash(null);
    setSkipped([]);
    setFileName(null);
    setError(null);
  }

  function handleFile(file: File) {
    setError(null);
    file
      .text()
      .then((text) => {
        const parsed = parseHoldingsCsv(text);
        if (parsed.rows.length === 0 && parsed.cash == null) {
          setError(
            parsed.skipped[0]?.reason ??
              "No valid holdings found. Check the column headers match Ticker, Shares, Buy Price."
          );
          setRows([]);
          setCash(null);
          setSkipped(parsed.skipped);
          return;
        }
        setRows(parsed.rows);
        setCash(parsed.cash);
        setSkipped(parsed.skipped);
        setFileName(file.name);
      })
      .catch(() => setError("Couldn't read that file. Is it a .csv?"));
  }

  function handleClose() {
    reset();
    onClose();
  }

  function confirm() {
    if (rows.length === 0 && cash == null) return;
    onImport({ rows, cash, replace });
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={handleClose}
      />
      <div className="relative z-10 flex max-h-[min(90dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-brand-bright" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Import CSV · {portfolioName}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-sm text-zinc-400">
            Columns: <span className="text-zinc-200">Ticker</span>,{" "}
            <span className="text-zinc-200">Shares</span>,{" "}
            <span className="text-zinc-200">Buy Price</span>.{" "}
            {hideCallPct ? "Cash" : "Call % and Cash"} column
            {hideCallPct ? " is" : "s are"} optional. A row named CASH is
            read as your cash balance.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
            >
              <FileUp className="h-4 w-4" />
              Choose CSV file
            </button>
            <button
              type="button"
              onClick={() => downloadHoldingsCsvTemplate()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              <Download className="h-3.5 w-3.5" />
              Download template
            </button>
            {fileName && (
              <span className="text-xs text-zinc-500">{fileName}</span>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
                <span>Preview · {rows.length} holding{rows.length === 1 ? "" : "s"}</span>
                {cash != null && (
                  <span className="text-zinc-400">
                    Cash ${cash.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Ticker</th>
                      <th className="px-3 py-1.5 font-medium">Shares</th>
                      <th className="px-3 py-1.5 font-medium">Buy price</th>
                      {!hideCallPct && (
                        <th className="px-3 py-1.5 font-medium">Call %</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ticker} className="border-t border-zinc-900">
                        <td className="px-3 py-1.5 font-medium text-white">
                          {r.ticker}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-zinc-300">
                          {r.shares}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-zinc-300">
                          ${r.buyPrice.toFixed(2)}
                        </td>
                        {!hideCallPct && (
                          <td className="px-3 py-1.5 tabular-nums text-zinc-500">
                            {r.callPct != null
                              ? `${Math.round(r.callPct * 100)}%`
                              : "default"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-amber-400/80">
                Skipped {skipped.length} row{skipped.length === 1 ? "" : "s"}
              </p>
              <ul className="max-h-24 space-y-1 overflow-y-auto text-xs text-zinc-500">
                {skipped.slice(0, 10).map((s) => (
                  <li key={`${s.line}-${s.raw}`}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand focus:ring-brand/50"
              />
              Replace this sheet&apos;s holdings (uncheck to only add/update
              the tickers above, keeping everything else)
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={rows.length === 0 && cash == null}
            onClick={confirm}
            className={cn(
              "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright",
              rows.length === 0 && cash == null && "cursor-not-allowed opacity-40"
            )}
          >
            Import{rows.length > 0 ? ` ${rows.length} holding${rows.length === 1 ? "" : "s"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
