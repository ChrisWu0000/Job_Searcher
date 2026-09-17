import { FileTextIcon, GraduationCapIcon, MessageSquareIcon, PaperclipIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Job, JobStatus } from "@/types/job";
import type { ScoreVerdict } from "@/types/scoring";

const verdictClasses: Record<ScoreVerdict, string> = {
  apply: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  maybe: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  skip: "bg-muted text-muted-foreground",
};

const statusClasses: Record<JobStatus, string> = {
  new: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  skipped: "bg-muted text-muted-foreground",
  interested: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  applied: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  error: "bg-destructive/15 text-destructive",
};

export function VerdictBadge({ verdict }: { verdict: ScoreVerdict | undefined }) {
  if (!verdict) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("border-transparent capitalize", verdictClasses[verdict])}>
      {verdict}
    </Badge>
  );
}

export function NewBadge() {
  return (
    <Badge className="border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300">New</Badge>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge className={cn("border-transparent capitalize", statusClasses[status])}>{status}</Badge>
  );
}

function scoreClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function ScoreBadge({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-medium tabular-nums", scoreClass(score))}>{Math.round(score)}</span>
  );
}

const documentIcons = [
  { key: "resume", label: "Resume required", Icon: FileTextIcon },
  { key: "coverLetter", label: "Cover letter required", Icon: PaperclipIcon },
  { key: "gradeReport", label: "Grade report required", Icon: GraduationCapIcon },
  { key: "prescreen", label: "Prescreen questions", Icon: MessageSquareIcon },
] as const;

export function DocumentIcons({ job }: { job: Job }) {
  const required: Record<(typeof documentIcons)[number]["key"], boolean> = {
    resume: job.application.resume,
    coverLetter: job.application.coverLetter,
    gradeReport: job.application.gradeReport,
    prescreen: job.application.hasPrescreenQuestions,
  };

  return (
    <span className="flex items-center gap-1">
      {documentIcons.map(({ key, label, Icon }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <span>
              <Icon
                className={cn(
                  "size-3.5",
                  required[key] ? "text-foreground" : "text-muted-foreground/25",
                )}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{required[key] ? label : `No ${label.toLowerCase()}`}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
