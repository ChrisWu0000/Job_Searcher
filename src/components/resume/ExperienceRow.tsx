import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from "lucide-react";
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
import { deleteExperience, moveExperience } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { ExperienceEntry } from "@/types/resume";
import { entryDates } from "./bankUtils";

export interface ExperienceRowProps {
  entry: ExperienceEntry;
}

export function ExperienceRow({ entry }: ExperienceRowProps) {
  const selectExperience = useUiStore((store) => store.selectExperience);
  const [confirming, setConfirming] = useState(false);

  const dates = entryDates(entry);

  const move = (direction: -1 | 1) => {
    void moveExperience(entry.id, direction).catch((cause: unknown) => {
      toast.error(errorMessage(cause));
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">
            {entry.title.trim().length > 0 ? entry.title : "Untitled entry"}
          </span>
          {entry.pinned ? (
            <Badge variant="secondary" className="text-[10px]">
              Pinned
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {[entry.organization, entry.location, dates].filter(Boolean).join(" · ") || "No details"}
        </p>
      </div>

      <span className="text-muted-foreground text-xs">
        {entry.bullets.length} {entry.bullets.length === 1 ? "bullet" : "bullets"}
      </span>

      <Button
        size="icon"
        variant="ghost"
        aria-label="Move entry up"
        onClick={() => {
          move(-1);
        }}
      >
        <ArrowUpIcon className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Move entry down"
        onClick={() => {
          move(1);
        }}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          selectExperience(entry.id);
        }}
      >
        <PencilIcon className="size-4" />
        Edit
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete entry"
        onClick={() => {
          setConfirming(true);
        }}
      >
        <Trash2Icon className="size-4" />
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {entry.title.trim().length > 0 ? entry.title : "This entry"} and its{" "}
              {entry.bullets.length} bullets are removed from the bank. Tailored resumes already
              generated keep their text.
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
                void deleteExperience(entry.id)
                  .then(() => {
                    toast.success("Entry deleted");
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

export default ExperienceRow;
