import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FileTextIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import RecordView from "@/components/inspector/RecordView";
import {
  startTailoring,
  tailoringSourceLabels,
  tailoringSources,
} from "@/components/resume/tailorActions";
import { errorMessage } from "@/components/shared/download";
import {
  deadlineTone,
  deadlineToneClasses,
  formatDateTime,
  formatDeadline,
  formatDuration,
} from "@/components/shared/format";
import { useProfile } from "@/components/shared/useProfile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ParsedHourlyPay } from "@/lib/ai/contracts";
import { formatUsd } from "@/lib/ai/cost";
import { db } from "@/lib/db/db";
import {
  latestScoreForJob,
  latestTailoredResumeForJob,
  setJobNotes,
  setJobStatus,
} from "@/lib/db/repo";
import { classifyJobCategories, jobCategoryLabels } from "@/lib/ranking/categories";
import { prefilterJob } from "@/lib/ranking/prefilter";
import { canonicalJobUrl } from "@/lib/sources/publicFeeds";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import type { Job } from "@/types/job";
import type { JobScore } from "@/types/scoring";
import InterestedButton from "./InterestedButton";
import { ScoreBadge, StatusBadge, VerdictBadge } from "./JobBadges";
import { effectiveVerdict, jobDeadline } from "./jobRows";

const notesDebounceMs = 500;

function Section({ title, body }: { title: string; body: string | undefined }) {
  if (!body) return null;
  return (
    <section className="space-y-1">
      <h3 className="font-medium text-sm">{title}</h3>
      <p className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">{body}</p>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-right">{value}</span>
    </div>
  );
}

function NotesField({ job }: { job: Job }) {
  const [notes, setNotes] = useState(job.notes ?? "");

  useEffect(() => {
    setNotes(job.notes ?? "");
  }, [job.notes]);

  useEffect(() => {
    if (notes === (job.notes ?? "")) return;
    const handle = setTimeout(() => {
      void setJobNotes(job.id, notes).catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
    }, notesDebounceMs);
    return () => {
      clearTimeout(handle);
    };
  }, [notes, job.id, job.notes]);

  return (
    <Textarea
      value={notes}
      rows={4}
      placeholder="Private notes about this posting"
      onChange={(event) => {
        setNotes(event.target.value);
      }}
    />
  );
}

function ParsedPayLine({ pay }: { pay: ParsedHourlyPay | undefined }) {
  if (!pay) return null;
  return (
    <p className="text-muted-foreground text-xs">
      Pay parsed as {pay.amount.toFixed(2)} {pay.currency}/h from "{pay.original}" ({pay.basis}{" "}
      rate)
    </p>
  );
}

function ScorePanel({ job, score }: { job: Job; score: JobScore | undefined }) {
  const profile = useProfile();
  const openInspectorTarget = useUiStore((store) => store.openInspectorTarget);
  const prefilter = profile ? prefilterJob(job, profile) : undefined;
  const parsedPay = prefilter?.parsedHourlyPay;

  if (prefilter?.excluded) {
    return (
      <div className="space-y-2">
        <h3 className="font-medium text-sm">Automatically filtered · Ranking skipped</h3>
        <p className="text-sm">{prefilter.reason}</p>
        <p className="text-muted-foreground text-xs">
          Hidden by your current requirements. This posting does not need an AI ranking call.
        </p>
        <ParsedPayLine pay={parsedPay} />
      </div>
    );
  }

  if (!score || score.model === "prefilter") {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">{job.title} has not been scored yet.</p>
        <ParsedPayLine pay={parsedPay} />
      </div>
    );
  }

  const constraintText = (constraintId: string) =>
    profile?.constraints.find((constraint) => constraint.id === constraintId)?.text ?? constraintId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Score <ScoreBadge score={score.score} />
        </span>
        <span className="text-sm">
          Likelihood <ScoreBadge score={score.likelihood} />
        </span>
        <VerdictBadge verdict={effectiveVerdict(job, score)} />
        {job.status === "skipped" && score.verdict !== "skip" ? (
          <span className="text-muted-foreground text-xs">
            model said {score.verdict}; skipped by you
          </span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            openInspectorTarget({ table: "jobScores", id: score.id });
          }}
        >
          View prompt/response
        </Button>
      </div>

      <p className="text-sm leading-relaxed">{score.summary}</p>
      <ParsedPayLine pay={parsedPay} />

      {score.strengths.length > 0 ? (
        <section className="space-y-1">
          <h3 className="font-medium text-sm">Strengths</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground text-sm">
            {score.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {score.gaps.length > 0 ? (
        <section className="space-y-1">
          <h3 className="font-medium text-sm">Gaps</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground text-sm">
            {score.gaps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {score.hardViolations.length > 0 ? (
        <section className="space-y-1">
          <h3 className="font-medium text-destructive text-sm">Hard violations</h3>
          <ul className="space-y-1 text-sm">
            {score.hardViolations.map((constraintId) => (
              <li key={constraintId} className="text-destructive">
                {constraintText(constraintId)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {score.softNotes.length > 0 ? (
        <section className="space-y-1">
          <h3 className="font-medium text-sm">Constraint notes</h3>
          <ul className="space-y-1.5 text-sm">
            {score.softNotes.map((note) => (
              <li key={note.constraintId} className="flex gap-2">
                {note.satisfied ? (
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span>
                  <span className="font-medium">{constraintText(note.constraintId)}</span>
                  <span className="block text-muted-foreground">{note.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Separator />
      <div>
        <FactRow label="Model" value={score.model} />
        <FactRow label="Cost" value={formatUsd(score.usage.costUsd)} />
        <FactRow
          label="Tokens"
          value={`${score.usage.promptTokens} in / ${score.usage.completionTokens} out`}
        />
        <FactRow label="Scored at" value={formatDateTime(score.scoredAt)} />
        <FactRow label="Profile version" value={score.profileVersion} />
      </div>
    </div>
  );
}

export function JobDetail() {
  const profile = useProfile();
  const selectedJobId = useUiStore((store) => store.selectedJobId);
  const open = useUiStore((store) => store.jobDetailOpen);
  const setOpen = useUiStore((store) => store.setJobDetailOpen);
  const openTailoredResume = useUiStore((store) => store.openTailoredResume);

  const job = useLiveQuery(
    () => (selectedJobId === undefined ? undefined : db.jobs.get(selectedJobId)),
    [selectedJobId],
  );
  const score = useLiveQuery(
    () => (selectedJobId === undefined ? undefined : latestScoreForJob(selectedJobId)),
    [selectedJobId],
  );

  const tailored = useLiveQuery(
    () => (selectedJobId === undefined ? undefined : latestTailoredResumeForJob(selectedJobId)),
    [selectedJobId],
  );

  const deadline = job ? jobDeadline(job) : undefined;
  const prefilter = job && profile ? prefilterJob(job, profile) : undefined;
  const autoFilterReason = prefilter?.excluded ? prefilter.reason : undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        {job ? (
          <>
            <SheetHeader className="pb-2">
              <SheetTitle className="pr-8 text-base leading-snug">{job.title}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>{job.company}</span>
                <span>·</span>
                <span>{job.location}</span>
                <StatusBadge status={job.status} />
                <VerdictBadge verdict={effectiveVerdict(job, score, autoFilterReason)} />
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void setJobStatus(job.id, "skipped").catch((cause: unknown) => {
                    toast.error(errorMessage(cause));
                  });
                }}
              >
                <XIcon className="size-4" />
                Skip
              </Button>
              <InterestedButton job={job} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <SparklesIcon className="size-4" />
                    Tailor resume
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {tailoringSources.map((source) => (
                    <DropdownMenuItem
                      key={source}
                      onSelect={() => {
                        startTailoring([job.id], source);
                        toast.info(`Tailoring resume for ${job.company}…`);
                      }}
                    >
                      {tailoringSourceLabels[source]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {tailored ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    openTailoredResume(tailored.id);
                  }}
                >
                  <FileTextIcon className="size-4" />
                  Open tailored resume
                </Button>
              ) : null}
              {job.url && canonicalJobUrl(job.url) ? (
                <Button asChild size="sm" variant="outline" className="ml-auto">
                  <a href={canonicalJobUrl(job.url)} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon className="size-4" />
                    Open original posting
                  </a>
                </Button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
              {autoFilterReason ? (
                <div className="mb-3 rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Automatically filtered · Ranking skipped</p>
                  <p className="mt-1">{autoFilterReason}</p>
                </div>
              ) : null}
              <Tabs defaultValue="overview">
                <TabsList className="mb-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="score">Score</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="rounded-md border px-3 py-2">
                    <FactRow label="Source" value={job.source ?? "—"} />
                    <FactRow
                      label="Categories"
                      value={
                        classifyJobCategories(job)
                          .map((category) => jobCategoryLabels[category])
                          .join(", ") || "—"
                      }
                    />
                    <FactRow label="Arrangement" value={job.arrangement ?? "—"} />
                    <FactRow label="Duration" value={formatDuration(job.durationMonths)} />
                    <FactRow label="Pay" value={job.compensation ?? "—"} />
                    <FactRow label="Openings" value={String(job.openings ?? "—")} />
                    <div className="flex justify-between gap-4 py-1 text-sm">
                      <span className="text-muted-foreground">Deadline</span>
                      <span
                        className={cn("text-right", deadlineToneClasses[deadlineTone(deadline)])}
                      >
                        {formatDeadline(deadline)} ({formatDateTime(deadline)})
                      </span>
                    </div>
                    <FactRow label="Detail scraped" value={formatDateTime(job.detailScrapedAt)} />
                  </div>

                  <Section title="Summary" body={job.summary} />
                  <Section title="Responsibilities" body={job.responsibilities} />
                  <Section title="Qualifications" body={job.qualifications} />

                  {job.targetedPrograms && job.targetedPrograms.length > 0 ? (
                    <section className="space-y-1">
                      <h3 className="font-medium text-sm">Targeted programs</h3>
                      <p className="text-muted-foreground text-sm">
                        {job.targetedPrograms.join(", ")}
                      </p>
                    </section>
                  ) : null}

                  <section className="space-y-1">
                    <h3 className="font-medium text-sm">Notes</h3>
                    <NotesField job={job} />
                  </section>
                </TabsContent>

                <TabsContent value="score">
                  <ScorePanel job={job} score={score} />
                </TabsContent>

                <TabsContent value="raw">
                  <RecordView table="jobs" record={job} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        ) : (
          <div className="p-6">
            <SheetHeader>
              <SheetTitle>No job selected</SheetTitle>
              <SheetDescription>Pick a row in the table to see its details.</SheetDescription>
            </SheetHeader>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default JobDetail;
