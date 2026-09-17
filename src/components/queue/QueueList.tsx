import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import RecordView from "@/components/inspector/RecordView";
import { formatDateTime } from "@/components/shared/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types/application";
import type { Job } from "@/types/job";

const statusClasses: Record<ApplicationStatus, string> = {
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "in-progress": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  paused: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  submitted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export const applicationStatusOrder: ApplicationStatus[] = [
  "queued",
  "paused",
  "in-progress",
  "submitted",
  "failed",
  "cancelled",
];

export interface QueueRowProps {
  application: Application;
  job: Job | undefined;
  reorderable: boolean;
  onMove: (jobId: string, direction: -1 | 1) => void;
  onRemove: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}

function QueueRow({ application, job, reorderable, onMove, onRemove, onRetry }: QueueRowProps) {
  const [logOpen, setLogOpen] = useState(false);
  const lastEntry = application.log.at(-1);

  return (
    <li className="border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("border-transparent", statusClasses[application.status])}>
          {application.status}
        </Badge>
        <span className="font-medium text-sm">{job?.title ?? application.jobId}</span>
        <span className="text-muted-foreground text-sm">{job?.company ?? ""}</span>
        <span className="text-muted-foreground text-xs">{job?.location ?? ""}</span>

        <div className="ml-auto flex items-center gap-1">
          {reorderable ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move up in queue"
                onClick={() => {
                  onMove(application.jobId, -1);
                }}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move down in queue"
                onClick={() => {
                  onMove(application.jobId, 1);
                }}
              >
                <ArrowDownIcon className="size-4" />
              </Button>
            </>
          ) : null}
          {application.status === "failed" || application.status === "cancelled" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onRetry(application.jobId);
              }}
            >
              <RotateCcwIcon className="size-4" />
              Retry
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLogOpen((current) => !current);
            }}
          >
            {logOpen ? "Hide log" : `Log (${application.log.length})`}
          </Button>
          {application.status !== "submitted" ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove from queue"
              onClick={() => {
                onRemove(application.jobId);
              }}
            >
              <Trash2Icon className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {application.submittedAt ? `Submitted ${formatDateTime(application.submittedAt)}` : null}
        {lastEntry
          ? `${application.submittedAt ? " · " : ""}${lastEntry.step}${
              lastEntry.detail ? `: ${lastEntry.detail}` : ""
            }`
          : null}
      </p>

      {logOpen ? (
        <div className="mt-2">
          <RecordView table="applications" record={application} />
        </div>
      ) : null}
    </li>
  );
}

export interface QueueListProps {
  status: ApplicationStatus;
  applications: Application[];
  jobs: Map<string, Job>;
  onMove: (jobId: string, direction: -1 | 1) => void;
  onRemove: (jobId: string) => void;
  onRetry: (jobId: string) => void;
}

export function QueueList({
  status,
  applications,
  jobs,
  onMove,
  onRemove,
  onRetry,
}: QueueListProps) {
  if (applications.length === 0) return null;

  return (
    <section className="space-y-1">
      <h3 className="font-medium text-sm capitalize">
        {status}
        <span className="ml-2 text-muted-foreground text-xs">{applications.length}</span>
      </h3>
      <ul className="rounded-md border px-3">
        {applications.map((application) => (
          <QueueRow
            key={application.jobId}
            application={application}
            job={jobs.get(application.jobId)}
            reorderable={status === "queued"}
            onMove={onMove}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        ))}
      </ul>
    </section>
  );
}

export default QueueList;
