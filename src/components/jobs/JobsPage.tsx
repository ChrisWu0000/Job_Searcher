import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDownIcon, DownloadIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  startTailoring,
  tailoringSourceLabels,
  tailoringSources,
} from "@/components/resume/tailorActions";
import { errorMessage } from "@/components/shared/download";
import RunnerStatus from "@/components/shared/RunnerStatus";
import { useEngine, useRegisteredEngine } from "@/components/shared/useEngine";
import { useProfile } from "@/components/shared/useProfile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ScoringProgress } from "@/engines/contracts";
import { engineRegistry } from "@/engines/registry";
import { planScoringRun, ScoringEngine } from "@/engines/ScoringEngine";
import { formatUsd } from "@/lib/ai/cost";
import { db } from "@/lib/db/db";
import { latestSyncRunStartedAt, listLatestScores, setJobStatuses } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { JobStatus } from "@/types/job";
import { type ExportFormat, exportJobs, exportRawJobs } from "./export";
import JobDetail from "./JobDetail";
import JobFiltersBar from "./JobFilters";
import JobTable from "./JobTable";
import { buildJobRows, distinctCountries, filterJobRows, type JobRow } from "./jobRows";

const bulkStatuses: JobStatus[] = ["new", "interested", "skipped", "applied"];

interface ScoringPlan {
  count: number;
  costUsd: number;
  pricingKnown: boolean;
}

function startScoring(jobIds: string[] | undefined): void {
  const engine = new ScoringEngine(jobIds ? { jobIds } : {});
  engineRegistry.set("score", engine);
  void engine.start().catch((cause: unknown) => {
    toast.error(errorMessage(cause));
  });
}

export default function JobsPage() {
  const filters = useUiStore((store) => store.filters);
  const selectJob = useUiStore((store) => store.selectJob);
  const selectedJobId = useUiStore((store) => store.selectedJobId);

  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [plan, setPlan] = useState<ScoringPlan | undefined>(undefined);

  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const scores = useLiveQuery(() => listLatestScores(), []);
  const newSince = useLiveQuery(() => latestSyncRunStartedAt(), []);
  const profile = useProfile();

  const rows = useMemo(
    () => (profile ? buildJobRows(jobs ?? [], scores ?? [], newSince, profile) : []),
    [jobs, scores, newSince, profile],
  );
  const filtered = useMemo(() => filterJobRows(rows, filters), [rows, filters]);
  const countries = useMemo(() => distinctCountries(rows), [rows]);
  const unscoredKey = rows
    .filter(
      (row) => row.score === undefined && !row.autoFilterReason && row.job.status !== "skipped",
    )
    .map((row) => row.job.id)
    .join("|");

  const scoringEngine = useRegisteredEngine<ScoringProgress>("score");
  const scoring = useEngine(scoringEngine);

  useEffect(() => {
    if (unscoredKey.length === 0 || !profile?.version) {
      setPlan(undefined);
      return;
    }
    let cancelled = false;
    void planScoringRun({ jobIds: unscoredKey.split("|") })
      .then((result) => {
        if (cancelled) return;
        setPlan({
          count: result.estimate.jobCount,
          costUsd: result.estimate.estimatedCostUsd,
          pricingKnown: result.estimate.pricingKnown,
        });
      })
      .catch(() => {
        if (!cancelled) setPlan(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [unscoredKey, profile?.version]);

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, value]) => value)
        .map(([key]) => key),
    [rowSelection],
  );

  const clearSelection = () => {
    setRowSelection({});
  };

  const selectedRows = useMemo(
    () => rows.filter((row) => rowSelection[row.job.id]),
    [rows, rowSelection],
  );
  const exportChoices: {
    key: string;
    label: string;
    rows: JobRow[];
    format: ExportFormat;
    prefix: string;
  }[] = [
    {
      key: "visible-csv",
      label: `Visible jobs as CSV (${filtered.length})`,
      rows: filtered,
      format: "csv",
      prefix: "jobs",
    },
    {
      key: "visible-json",
      label: `Visible jobs as JSON (${filtered.length})`,
      rows: filtered,
      format: "json",
      prefix: "jobs",
    },
    {
      key: "selected-csv",
      label: `Selected jobs as CSV (${selectedRows.length})`,
      rows: selectedRows,
      format: "csv",
      prefix: "selected-jobs",
    },
    {
      key: "selected-json",
      label: `Selected jobs as JSON (${selectedRows.length})`,
      rows: selectedRows,
      format: "json",
      prefix: "selected-jobs",
    },
    {
      key: "all-csv",
      label: `All jobs as CSV (${rows.length})`,
      rows,
      format: "csv",
      prefix: "all-jobs",
    },
    {
      key: "all-json",
      label: `All jobs as JSON (${rows.length})`,
      rows,
      format: "json",
      prefix: "all-jobs",
    },
  ];

  return (
    <div className="space-y-4">
      <JobFiltersBar
        countries={countries}
        visibleCount={filtered.length}
        totalCount={rows.length}
        trailing={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!jobs || jobs.length === 0}
              onClick={() => {
                if (!jobs) return;
                exportRawJobs(jobs);
                toast.success(`Saved ${jobs.length} raw jobs as JSON`);
              }}
            >
              <DownloadIcon className="size-4" />
              Raw jobs
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={rows.length === 0}>
                  <DownloadIcon className="size-4" />
                  Export
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {exportChoices.map((choice) => (
                  <DropdownMenuItem
                    key={choice.key}
                    disabled={choice.rows.length === 0}
                    onSelect={() => {
                      exportJobs(choice.rows, choice.format, choice.prefix);
                      toast.success(
                        `Exported ${choice.rows.length} jobs as ${choice.format.toUpperCase()}`,
                      );
                    }}
                  >
                    {choice.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <p className="text-muted-foreground text-sm">
        {rows.filter((row) => row.autoFilterReason).length} automatically filtered ·{" "}
        {rows.filter((row) => row.verdict === "skip" && !row.autoFilterReason).length} other skipped
        jobs. Filtered postings stay saved, are hidden by default, and do not use AI ranking. Turn
        on Automatically filtered to review the reasons.
      </p>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm">{selectedIds.length} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Set status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {bulkStatuses.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => {
                    void setJobStatuses(selectedIds, status)
                      .then(() => {
                        toast.success(`Marked ${selectedIds.length} jobs as ${status}`);
                        clearSelection();
                      })
                      .catch((cause: unknown) => {
                        toast.error(errorMessage(cause));
                      });
                  }}
                >
                  <span className="capitalize">{status}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            onClick={() => {
              startScoring(selectedIds);
              clearSelection();
            }}
          >
            <SparklesIcon className="size-4" />
            Score selected
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <FileTextIcon className="size-4" />
                Tailor resumes
                <ChevronDownIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {tailoringSources.map((source) => (
                <DropdownMenuItem
                  key={source}
                  onSelect={() => {
                    startTailoring(selectedIds, source);
                    toast.info(`Tailoring ${selectedIds.length} resumes…`);
                    clearSelection();
                  }}
                >
                  {tailoringSourceLabels[source]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      ) : null}

      {scoringEngine ? (
        <RunnerStatus
          title="Scoring"
          engine={scoringEngine}
          state={scoring.state}
          logs={scoring.logs}
          lastError={scoring.lastError}
          completed={scoring.progress?.done}
          total={scoring.progress?.total}
          startLabel="Score unscored"
          onStart={() => {
            startScoring(undefined);
          }}
        >
          {scoring.progress ? (
            <p className="text-muted-foreground text-xs">
              {scoring.progress.cached} cached · {scoring.progress.skippedByPrefilter} prefiltered ·{" "}
              {scoring.progress.failed} failed · {formatUsd(scoring.progress.costUsd)} spent
            </p>
          ) : null}
        </RunnerStatus>
      ) : null}

      <JobTable
        rows={filtered}
        sorting={sorting}
        onSortingChange={setSorting}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectedJobId={selectedJobId}
        onSelectJob={selectJob}
      />

      {plan && plan.count > 0 ? (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            className="shadow-lg"
            disabled={scoring.state === "running" || scoring.state === "paused"}
            onClick={() => {
              startScoring(undefined);
            }}
          >
            <SparklesIcon className="size-4" />
            Score {plan.count} unscored {plan.count === 1 ? "job" : "jobs"}
            {plan.pricingKnown ? ` (est. ${formatUsd(plan.costUsd)})` : ""}
          </Button>
        </div>
      ) : null}

      <JobDetail />
    </div>
  );
}
