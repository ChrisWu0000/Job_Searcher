import { useLiveQuery } from "dexie-react-hooks";
import { PlayIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { queueJob } from "@/components/jobs/actions";
import { errorMessage } from "@/components/shared/download";
import RunnerStatus from "@/components/shared/RunnerStatus";
import { useEngine, useRegisteredEngine } from "@/components/shared/useEngine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApplyEngine } from "@/engines/ApplyEngine";
import type { ApplyProgress } from "@/engines/contracts";
import { engineRegistry } from "@/engines/registry";
import { db } from "@/lib/db/db";
import {
  byQueueOrder,
  moveQueuedApplication,
  setApplicationStatus,
  setJobStatus,
} from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { Application, ApplicationStatus } from "@/types/application";
import type { Job } from "@/types/job";
import PauseCard from "./PauseCard";
import QueueList, { applicationStatusOrder } from "./QueueList";

export default function QueuePage() {
  const applyOptions = useUiStore((store) => store.applyOptions);
  const setApplyOption = useUiStore((store) => store.setApplyOption);

  const [resumable, setResumable] = useState<ApplyEngine | undefined>(undefined);

  const engine = useRegisteredEngine<ApplyProgress>("apply");
  const controls = engine instanceof ApplyEngine ? engine : undefined;
  const { state, progress, logs, lastError } = useEngine(engine);

  const applications = useLiveQuery(() => db.applications.toArray(), []);
  const jobList = useLiveQuery(() => db.jobs.toArray(), []);

  const jobs = useMemo(() => {
    const map = new Map<string, Job>();
    for (const job of jobList ?? []) map.set(job.id, job);
    return map;
  }, [jobList]);

  const byStatus = useMemo(() => {
    const grouped = new Map<ApplicationStatus, Application[]>();
    for (const application of applications ?? []) {
      const bucket = grouped.get(application.status) ?? [];
      bucket.push(application);
      grouped.set(application.status, bucket);
    }
    return grouped;
  }, [applications]);

  const queued = useMemo(() => [...(byStatus.get("queued") ?? [])].sort(byQueueOrder), [byStatus]);

  const running = state === "running" || state === "paused";

  useEffect(() => {
    if (running) {
      setResumable(undefined);
      return;
    }
    let cancelled = false;
    void ApplyEngine.fromCheckpoint()
      .then((found) => {
        if (!cancelled) setResumable(found);
      })
      .catch(() => {
        if (!cancelled) setResumable(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [running]);

  const start = () => {
    const jobIds = queued.map((application) => application.jobId);
    if (jobIds.length === 0) {
      toast.error("Nothing is queued yet");
      return;
    }
    const next = new ApplyEngine({ jobIds, stopOnFailure: applyOptions.stopOnFailure });
    engineRegistry.set("apply", next);
    setResumable(undefined);
    void next.start().catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  const resume = () => {
    if (!resumable) return;
    engineRegistry.set("apply", resumable);
    setResumable(undefined);
    void resumable.start().catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  const move = (jobId: string, direction: -1 | 1) => {
    void moveQueuedApplication(jobId, direction).catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  const remove = (jobId: string) => {
    void Promise.all([setApplicationStatus(jobId, "cancelled"), setJobStatus(jobId, "interested")])
      .then(() => {
        toast.success("Removed from the queue");
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
  };

  const retry = (jobId: string) => {
    void queueJob(jobId)
      .then(() => {
        toast.success("Requeued");
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Apply queue</CardTitle>
          <CardDescription>
            The runner drives your own WaterlooWorks tab, pauses at every prescreen question, and
            always waits for you before submitting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="apply-stop-on-failure"
                checked={applyOptions.stopOnFailure}
                onCheckedChange={(checked) => {
                  setApplyOption("stopOnFailure", checked);
                }}
              />
              <Label htmlFor="apply-stop-on-failure">Stop the queue on the first failure</Label>
            </div>
            {resumable ? (
              <Button size="sm" variant="outline" onClick={resume}>
                <PlayIcon className="size-4" />
                Resume interrupted run
              </Button>
            ) : null}
          </div>

          <RunnerStatus
            title="Apply engine"
            description={`${queued.length} queued`}
            engine={engine}
            state={state}
            logs={logs}
            lastError={lastError}
            completed={progress ? progress.currentIndex : undefined}
            total={progress ? progress.queue.length : undefined}
            startLabel="Start queue"
            onStart={start}
          >
            {progress ? (
              <p className="text-muted-foreground text-xs">
                Step {progress.step} · {progress.done} done · {progress.failed} failed ·{" "}
                {progress.skipped} skipped
                {progress.currentJob ? ` · ${progress.currentJob.title}` : ""}
              </p>
            ) : null}
          </RunnerStatus>

          {progress && controls && progress.waitingFor !== undefined ? (
            <PauseCard progress={progress} controls={controls} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Applications</CardTitle>
          <CardDescription>Every application row grouped by status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(applications ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing here yet. Queue a job from the Jobs tab.
            </p>
          ) : (
            applicationStatusOrder.map((status) => (
              <QueueList
                key={status}
                status={status}
                applications={status === "queued" ? queued : (byStatus.get(status) ?? [])}
                jobs={jobs}
                onMove={move}
                onRemove={remove}
                onRetry={retry}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
