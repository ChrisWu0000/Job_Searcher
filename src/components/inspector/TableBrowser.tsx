import { useVirtualizer } from "@tanstack/react-virtual";
import { useLiveQuery } from "dexie-react-hooks";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { downloadJson, errorMessage, timestampedFileName } from "@/components/shared/download";
import { prettyJson, stringifyValue, truncate } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db, type TableName, tableNames } from "@/lib/db/db";
import { primaryKeyField } from "@/lib/db/relations";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import RecordView, { type RecordValue } from "./RecordView";

const columnSampleSize = 50;
const rowHeight = 34;

function deriveColumns(rows: RecordValue[]): string[] {
  const keys: string[] = [];
  for (const row of rows.slice(0, columnSampleSize)) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function matchesSearch(row: RecordValue, needle: string): boolean {
  if (needle.length === 0) return true;
  return prettyJson(row).toLowerCase().includes(needle);
}

export function TableBrowser() {
  const table = useUiStore((store) => store.inspectorTable);
  const setTable = useUiStore((store) => store.setInspectorTable);
  const recordId = useUiStore((store) => store.inspectorRecordId);
  const setRecordId = useUiStore((store) => store.setInspectorRecordId);

  const [search, setSearch] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToRef = useRef<string | undefined>(undefined);

  const rows = useLiveQuery(() => db.table<RecordValue>(table).toArray(), [table, refreshToken]);

  const allRows = useMemo(() => rows ?? [], [rows]);
  const keyField = primaryKeyField(table);
  const columns = useMemo(() => deriveColumns(allRows), [allRows]);
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () => allRows.filter((row) => matchesSearch(row, needle)),
    [allRows, needle],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const selected = useMemo(
    () => filtered.find((row) => stringifyValue(row[keyField]) === recordId),
    [filtered, keyField, recordId],
  );

  useEffect(() => {
    if (recordId === undefined || scrolledToRef.current === recordId) return;
    const index = filtered.findIndex((row) => stringifyValue(row[keyField]) === recordId);
    if (index < 0) return;
    scrolledToRef.current = recordId;
    virtualizer.scrollToIndex(index, { align: "center" });
  }, [recordId, filtered, keyField, virtualizer]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={table}
          onValueChange={(next) => {
            setTable(next as TableName);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tableNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          placeholder="Search across every field"
          className="max-w-sm"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />

        <span className="text-muted-foreground text-sm">
          Rows: {filtered.length}
          {filtered.length === allRows.length ? "" : ` of ${allRows.length}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              try {
                downloadJson(timestampedFileName(`wwpp-${table}`), prettyJson(filtered));
                toast.success(`Exported ${filtered.length} ${table} rows`);
              } catch (cause) {
                toast.error(errorMessage(cause));
              }
            }}
          >
            <DownloadIcon className="size-4" />
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRefreshToken((current) => current + 1);
            }}
          >
            <RefreshCwIcon className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="flex border-b bg-muted/50 text-muted-foreground text-xs">
          {columns.map((column) => (
            <div key={column} className="w-48 shrink-0 truncate px-3 py-2 font-medium">
              {column}
            </div>
          ))}
          {columns.length === 0 ? <div className="px-3 py-2">No rows</div> : null}
        </div>
        <div ref={scrollRef} className="h-[45vh] overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = filtered[item.index];
              if (!row) return null;
              const id = stringifyValue(row[keyField]);
              return (
                <button
                  type="button"
                  key={id || String(item.index)}
                  data-index={item.index}
                  className={cn(
                    "absolute flex w-full border-b text-left text-xs hover:bg-accent/50",
                    id === recordId && "bg-accent",
                  )}
                  style={{ height: rowHeight, transform: `translateY(${item.start}px)` }}
                  onClick={() => {
                    setRecordId(id);
                  }}
                >
                  {columns.map((column) => (
                    <span
                      key={column}
                      className="w-48 shrink-0 truncate px-3 py-2 font-mono"
                      title={stringifyValue(row[column])}
                    >
                      {truncate(stringifyValue(row[column]), 120) || "—"}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected ? (
        <div className="space-y-2">
          <p className="font-medium text-sm">
            Selected record
            <span className="ml-2 font-mono text-muted-foreground text-xs">{recordId}</span>
          </p>
          <RecordView table={table} record={selected} />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Select a row to inspect it.</p>
      )}
    </div>
  );
}

export default TableBrowser;
