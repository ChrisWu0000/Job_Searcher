import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { importCurrentPosting } from "@/components/jobs/actions";
import { Button } from "@/components/ui/button";
import { errorMessage } from "./download";

export interface ImportPostingButtonProps {
  variant?: "default" | "outline";
}

export function ImportPostingButton({ variant = "outline" }: ImportPostingButtonProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void importCurrentPosting()
          .then((job) => {
            toast.success(`Imported ${job.title} at ${job.company}`);
          })
          .catch((cause: unknown) => {
            toast.error(errorMessage(cause));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <DownloadIcon className="size-4" />
      {busy ? "Importing…" : "Import this posting"}
    </Button>
  );
}

export default ImportPostingButton;
