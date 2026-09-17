import { type RowSelectionState, type SortingState, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { jobColumns, jobTableFeatures } from "./jobColumns";
import type { JobRow } from "./jobRows";

const rowHeight = 40;

export interface JobTableProps {
  rows: JobRow[];
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((current: SortingState) => SortingState)) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (
    updater: RowSelectionState | ((current: RowSelectionState) => RowSelectionState),
  ) => void;
  selectedJobId?: string;
  onSelectJob: (jobId: string) => void;
}

export function JobTable({
  rows,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  selectedJobId,
  onSelectJob,
}: JobTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(
    () =>
      rows.some((row) => row.autoFilterReason)
        ? jobColumns
        : jobColumns.filter((column) => column.id !== "autoFilterReason"),
    [rows],
  );

  const table = useTable({
    features: jobTableFeatures,
    columns,
    data: rows,
    getRowId: (row) => row.job.id,
    state: { sorting, rowSelection },
    onSortingChange,
    onRowSelectionChange,
  });

  const modelRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 16,
  });

  const totalWidth = useMemo(
    () => table.getAllLeafColumns().reduce((sum: number, column) => sum + column.getSize(), 0),
    [table],
  );

  return (
    <div className="rounded-md border">
      <div ref={scrollRef} className="h-[calc(100vh-22rem)] min-h-64 overflow-auto">
        <table className="grid" style={{ width: totalWidth }}>
          <thead className="sticky top-0 z-10 grid bg-muted text-muted-foreground text-xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="flex w-full border-b">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                      className="shrink-0 px-2 py-2 text-left font-medium"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-1 text-left hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? <ChevronUpIcon className="size-3" /> : null}
                          {sorted === "desc" ? <ChevronDownIcon className="size-3" /> : null}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = modelRows[item.index];
              if (!row) return null;
              const isActive = row.original.job.id === selectedJobId;
              return (
                <tr
                  key={row.id}
                  data-index={item.index}
                  tabIndex={0}
                  className={cn(
                    "absolute flex w-full cursor-pointer items-center border-b text-sm hover:bg-accent/40",
                    isActive && "bg-accent",
                  )}
                  style={{ height: rowHeight, transform: `translateY(${item.start}px)` }}
                  onClick={() => {
                    onSelectJob(row.original.job.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectJob(row.original.job.id);
                  }}
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="flex shrink-0 items-center overflow-hidden px-2"
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modelRows.length === 0 ? (
        <p className="px-4 py-6 text-center text-muted-foreground text-sm">
          No jobs match the current filters.
        </p>
      ) : null}
    </div>
  );
}

export default JobTable;
