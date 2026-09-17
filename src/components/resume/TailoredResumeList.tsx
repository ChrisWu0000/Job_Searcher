import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUsd } from "@/lib/ai/cost";
import { deleteTailoredResume } from "@/lib/db/repo";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TailoredResume } from "@/types/resume";

export interface TailoredResumeListProps {
  resumes: TailoredResume[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

function ResumeRow({
  resume,
  selected,
  onSelect,
}: {
  resume: TailoredResume;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2",
          selected ? "border-primary bg-accent/40" : "",
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            onSelect(resume.id);
          }}
        >
          <span className="block truncate font-medium text-sm">{resume.company}</span>
          <span className="block truncate text-muted-foreground text-xs">{resume.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={resume.source === "model" ? "default" : "secondary"}>
              {resume.source}
            </Badge>
            <span className="text-muted-foreground text-xs">{resume.model}</span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-muted-foreground text-xs">
              {formatRelative(resume.createdAt)}
            </span>
            {resume.usage.costUsd > 0 ? (
              <>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-muted-foreground text-xs">
                  {formatUsd(resume.usage.costUsd)}
                </span>
              </>
            ) : null}
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Delete tailored resume"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this tailored resume?</DialogTitle>
            <DialogDescription>
              The LaTeX for {resume.company} — {resume.title}, including any edits, is removed. The
              experience bank is untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void deleteTailoredResume(resume.id)
                  .then(() => {
                    toast.success("Tailored resume deleted");
                  })
                  .catch((cause: unknown) => {
                    toast.error(errorMessage(cause));
                  });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function TailoredResumeList({ resumes, selectedId, onSelect }: TailoredResumeListProps) {
  if (resumes.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
        No tailored resumes yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {resumes.map((resume) => (
        <ResumeRow
          key={resume.id}
          resume={resume}
          selected={resume.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export default TailoredResumeList;
