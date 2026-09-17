import { StarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { setJobStatus } from "@/lib/db/repo";
import { cn } from "@/lib/utils";
import type { Job } from "@/types/job";

export default function InterestedButton({ job }: { job: Job }) {
  const [saving, setSaving] = useState(false);
  const interested = job.status === "interested";
  const label = interested
    ? `Remove ${job.title} from Interested`
    : `Mark ${job.title} as Interested`;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      aria-pressed={interested}
      disabled={saving}
      className={cn(interested && "text-amber-600 hover:text-amber-600 dark:text-amber-400")}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        setSaving(true);
        void setJobStatus(job.id, interested ? "new" : "interested")
          .catch((cause: unknown) => {
            toast.error(errorMessage(cause));
          })
          .finally(() => {
            setSaving(false);
          });
      }}
    >
      <StarIcon className={cn("size-4", interested && "fill-current")} />
    </Button>
  );
}
