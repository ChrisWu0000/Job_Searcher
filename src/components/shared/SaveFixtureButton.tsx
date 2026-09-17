import { CameraIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "./download";
import { captureCurrentPageFixture } from "./fixtures";
import { formatBytes } from "./format";

export interface SaveFixtureButtonProps {
  variant?: "default" | "outline";
  onSaved?: () => void;
}

export function SaveFixtureButton({ variant = "outline", onSaved }: SaveFixtureButtonProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void captureCurrentPageFixture()
          .then((result) => {
            toast.success(`Saved a ${result.kind} fixture (${formatBytes(result.bytes)})`);
            onSaved?.();
          })
          .catch((cause: unknown) => {
            toast.error(errorMessage(cause));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <CameraIcon className="size-4" />
      {busy ? "Capturing…" : "Save page as fixture"}
    </Button>
  );
}

export default SaveFixtureButton;
