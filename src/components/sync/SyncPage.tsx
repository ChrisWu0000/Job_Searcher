import { useLiveQuery } from "dexie-react-hooks";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { formatDateTime } from "@/components/shared/format";
import ImportPostingButton from "@/components/shared/ImportPostingButton";
import RunnerStatus from "@/components/shared/RunnerStatus";
import SaveFixtureButton from "@/components/shared/SaveFixtureButton";
import { useEngine, useRegisteredEngine } from "@/components/shared/useEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SyncProgress } from "@/engines/contracts";
import { engineRegistry } from "@/engines/registry";
import { SyncEngine } from "@/engines/SyncEngine";
import { clearRuns, listRuns } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { PageKind } from "@/types/job";
import type { RunStatus } from "@/types/run";

const runStatusClasses: Record<RunStatus, string> = {
  running: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  stopped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
};

const unrecognizedPageClasses = "bg-muted text-muted-foreground";

const pageKindClasses: Partial<Record<PageKind, string>> = {
  results: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  posting: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  apply: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  login: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="font-medium text-sm tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

export default function SyncPage() {
  const options = useUiStore((store) => store.syncOptions);
  const setOption = useUiStore((store) => store.setSyncOption);
  const openInspectorTarget = useUiStore((store) => store.openInspectorTarget);
  const currentPage = useUiStore((store) => store.waterlooWorksPage);

  const engine = useRegisteredEngine<SyncProgress>("sync");
  const { state, progress, logs, lastError } = useEngine(engine);

  const runs = useLiveQuery(() => listRuns(50), []);
  const syncRuns = (runs ?? []).filter((run) => run.kind === "sync");
  const active = state === "running" || state === "paused";

  const clearHistory = () => {
    void clearRuns("sync")
      .then((count) => {
        toast.success(count === 0 ? "No sync runs to clear" : `Cleared ${count} sync runs`);
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
  };

  const start = () => {
    const next = new SyncEngine({
      forceRefresh: options.forceRefresh,
      ...(options.maxPages === undefined ? {} : { maxPages: options.maxPages }),
    });
    engineRegistry.set("sync", next);
    void next.start().catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Sync</CardTitle>
          <CardDescription>
            Paginate WaterlooWorks search results in your own logged-in tab and import every posting
            into the local database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="sync-force"
                checked={options.forceRefresh}
                onCheckedChange={(checked) => {
                  setOption("forceRefresh", checked);
                }}
              />
              <Label htmlFor="sync-force">Force refresh already-scraped postings</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sync-max-pages">Max pages</Label>
              <Input
                id="sync-max-pages"
                className="w-24"
                inputMode="numeric"
                placeholder="all"
                value={options.maxPages === undefined ? "" : String(options.maxPages)}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setOption("maxPages", Number.isNaN(parsed) ? undefined : parsed);
                }}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {currentPage ? (
                <Badge
                  className={`border-transparent ${pageKindClasses[currentPage.kind] ?? unrecognizedPageClasses}`}
                >
                  {currentPage.kind === "other" ? "ready to navigate" : currentPage.kind}
                  {currentPage.jobId ? ` · ${currentPage.jobId}` : ""}
                </Badge>
              ) : null}
              <ImportPostingButton />
              <SaveFixtureButton />
            </div>
          </div>

          {currentPage?.kind === "other" ? (
            <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
              Start sync to open the Full-Cycle job search and show All Jobs automatically.
              WaterlooWorks can stay on its overview or Co-op Jobs page until then.
            </p>
          ) : null}

          <RunnerStatus
            title="Sync engine"
            description="Runs in the WaterlooWorks tab at roughly one posting every 1.5 seconds."
            engine={engine}
            state={state}
            logs={logs}
            lastError={lastError}
            completed={progress?.postingsDone}
            total={progress?.postingsTotal}
            startLabel="Start sync"
            onStart={start}
          >
            {progress ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Counter label="phase" value={progress.phase} />
                  <Counter label="page" value={progress.page} />
                  <Counter label="stubs found" value={progress.stubsFound} />
                  <Counter label="postings done" value={progress.postingsDone} />
                  <Counter label="skipped" value={progress.postingsSkipped} />
                  <Counter label="failed" value={progress.postingsFailed} />
                </div>
                {progress.currentJobId ? (
                  <p className="text-muted-foreground text-xs">
                    Current: {progress.currentJobTitle ?? progress.currentJobId} (
                    {progress.currentJobId})
                  </p>
                ) : null}
              </>
            ) : null}
          </RunnerStatus>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Recent sync runs</CardTitle>
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
            <p className="text-muted-foreground text-sm">No sync runs yet.</p>
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
