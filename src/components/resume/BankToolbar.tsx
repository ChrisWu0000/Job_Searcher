import { DownloadIcon, UploadIcon, UserRoundCheckIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { getProfile, saveExperiences, saveProfile, saveResumeSettings } from "@/lib/db/repo";
import type { ResumeBank } from "@/lib/resume/contracts";
import { bankToPlainText } from "@/lib/resume/plaintext";
import { exportBank, parseBankFile } from "./bankIo";

export interface BankToolbarProps {
  bank: ResumeBank;
}

export function BankToolbar({ bank }: BankToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const plainText = bankToPlainText(bank);

  const importFile = (file: File) => {
    setBusy(true);
    void file
      .text()
      .then(async (text) => {
        const parsed = parseBankFile(text);
        await saveExperiences(parsed.entries);
        if (parsed.skillGroups.length > 0) {
          await saveResumeSettings({ ...bank.settings, skillGroups: parsed.skillGroups });
        }
        toast.success(
          `Imported ${parsed.entries.length} entries and ${parsed.skillGroups.length} skill groups`,
        );
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const useForScoring = () => {
    setBusy(true);
    void getProfile()
      .then(async (profile) => {
        await saveProfile({ ...profile, resumeText: plainText });
        toast.success(
          "Scoring resume replaced with the bank. Existing scores keep their profile version; only unscored jobs use the new one.",
        );
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            exportBank({ entries: bank.entries, skillGroups: bank.settings.skillGroups });
            toast.success(`Saved ${bank.entries.length} entries as JSON`);
          }}
        >
          <DownloadIcon className="size-4" />
          Export bank
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          <UploadIcon className="size-4" />
          Import bank
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) importFile(file);
          }}
        />

        <Button size="sm" variant="outline" disabled={busy} onClick={useForScoring}>
          <UserRoundCheckIcon className="size-4" />
          Use as scoring resume
        </Button>
      </div>

      <details className="rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-muted-foreground text-sm">
          Preview the plain text the scorer would see ({plainText.length} characters)
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs">
          {plainText}
        </pre>
      </details>
    </div>
  );
}

export default BankToolbar;
