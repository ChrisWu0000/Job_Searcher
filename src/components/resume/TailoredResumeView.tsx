import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDownIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { formatUsd } from "@/lib/ai/cost";
import { getTailoredResume, listExperiences } from "@/lib/db/repo";
import { formatRelative } from "@/lib/time";
import { useUiStore } from "@/stores/ui";
import LatexEditor from "./LatexEditor";
import SelectionPanel from "./SelectionPanel";
import { startTailoring, tailoringSourceLabels, tailoringSources } from "./tailorActions";

export interface TailoredResumeViewProps {
  resumeId: string | undefined;
}

export function TailoredResumeView({ resumeId }: TailoredResumeViewProps) {
  const selectJob = useUiStore((store) => store.selectJob);
  const setActiveTab = useUiStore((store) => store.setActiveTab);

  const resume = useLiveQuery(
    () => (resumeId === undefined ? undefined : getTailoredResume(resumeId)),
    [resumeId],
  );
  const entries = useLiveQuery(() => listExperiences(), []);

  if (!resumeId || !resume) {
    return (
      <p className="rounded-md border border-dashed px-3 py-10 text-center text-muted-foreground text-sm">
        Pick a tailored resume on the left to read its selection and edit its LaTeX.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium text-base leading-snug">{resume.title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
          <span>{resume.company}</span>
          <Badge variant={resume.source === "model" ? "default" : "secondary"}>
            {resume.source}
          </Badge>
          <span>{resume.model}</span>
          <span>·</span>
          <span>
            {resume.usage.promptTokens} in / {resume.usage.completionTokens} out
          </span>
          <span>·</span>
          <span>{formatUsd(resume.usage.costUsd)}</span>
          <span>·</span>
          <span>bank {resume.bankVersion.slice(0, 8)}</span>
          <span>·</span>
          <span>{formatRelative(resume.createdAt)}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            selectJob(resume.jobId);
            setActiveTab("jobs");
          }}
        >
          <ExternalLinkIcon className="size-4" />
          Open job
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <SparklesIcon className="size-4" />
              Regenerate
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {tailoringSources.map((source) => (
              <DropdownMenuItem
                key={source}
                onSelect={() => {
                  startTailoring([resume.jobId], source);
                  toast.info(`Tailoring resume for ${resume.company}…`);
                }}
              >
                {tailoringSourceLabels[source]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {resume.selection.rationale.trim().length > 0 ? (
        <p className="text-sm leading-relaxed">{resume.selection.rationale}</p>
      ) : null}

      {resume.groundingNotes.length > 0 ? (
        <div className="space-y-1 rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
          <p className="font-medium">
            These rewrites were reverted because they introduced facts not in your bank
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {resume.groundingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <SelectionPanel selection={resume.selection} entries={entries ?? []} />

      <Separator />

      <LatexEditor resume={resume} />
    </div>
  );
}

export default TailoredResumeView;
