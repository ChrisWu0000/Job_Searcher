import { useLiveQuery } from "dexie-react-hooks";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { formatDateTime } from "@/components/shared/format";
import RunnerStatus from "@/components/shared/RunnerStatus";
import { useEngine, useRegisteredEngine } from "@/components/shared/useEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExternalSyncProgress } from "@/engines/ExternalSyncEngine";
import { ExternalSyncEngine } from "@/engines/ExternalSyncEngine";
import { engineRegistry } from "@/engines/registry";
import { clearRuns, listRuns } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { RunStatus } from "@/types/run";

const runStatusClasses: Record<RunStatus, string> = {
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  stopped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="font-medium text-sm tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

export default function SourceSyncPage() {
  const engine = useRegisteredEngine<ExternalSyncProgress>("sync");
  const { state, progress, logs, lastError } = useEngine(engine);
  const runs = useLiveQuery(() => listRuns(50), []);
  const openInspectorTarget = useUiStore((store) => store.openInspectorTarget);
  const syncRuns = (runs ?? []).filter((run) => run.kind === "sync");
  const active = state === "running" || state === "paused";

  const clearHistory = () => {
    void clearRuns("sync")
      .then((count) => {
        toast.success(count === 0 ? "No source runs to clear" : `Cleared ${count} source runs`);
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
  };

  const start = () => {
    const next = new ExternalSyncEngine();
    engineRegistry.set("sync", next);
    void next.start().catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Job sources</CardTitle>
          <CardDescription>
            Load active software, data science, cyber security, hardware engineering, and fintech
            listings from public feeds, then refresh supported company boards discovered from those
            job links.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Sources include SimplifyJobs, zshah101, and aprameyak. Discovered boards use public
            Ashby, Greenhouse, Lever, SmartRecruiters, Workable, Pinpoint, Gem, and Workday job
            APIs. Private, markdown-only, and unresolved sources are not polled.
          </p>
          <RunnerStatus
            title="Source sync"
            description="Fetches the public job lists and refreshes deduplicated supported boards."
            engine={engine}
            state={state}
            logs={logs}
            lastError={lastError}
            completed={progress?.sourcesDone}
            total={progress?.sourcesTotal}
            startLabel="Start source sync"
            onStart={start}
          >
            {progress ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Counter label="sources completed" value={progress.sourcesDone} />
                <Counter label="sources failed" value={progress.sourcesFailed} />
                <Counter label="jobs imported" value={progress.jobsImported} />
                <Counter label="jobs skipped" value={progress.jobsSkipped} />
                <Counter label="current source" value={progress.currentSource ?? "—"} />
              </div>
            ) : null}
          </RunnerStatus>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Recent source runs</CardTitle>
            <CardDescription>Click a run to open it in the Inspector.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={active || syncRuns.length === 0}
            onClick={clearHistory}
          >
            <Trash2Icon className="size-4" />
            Clear history
          </Button>
        </CardHeader>
        <CardContent>
          {syncRuns.length === 0 ? (
            <p className="text-muted-foreground text-sm">No source runs yet.</p>
          ) : (
            <ul className="divide-y">
              {syncRuns.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() => {
                      if (run.id !== undefined) {
                        openInspectorTarget({ table: "runs", id: String(run.id) });
                      }
                    }}
                  >
                    <span className="w-14 font-mono text-muted-foreground text-xs">#{run.id}</span>
                    <Badge className={`border-transparent ${runStatusClasses[run.status]}`}>
                      {run.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(run.startedAt)}
                    </span>
                    <span className="ml-auto truncate text-muted-foreground text-xs">
                      {run.summary === undefined ? "" : JSON.stringify(run.summary)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
