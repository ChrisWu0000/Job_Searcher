import { DownloadIcon, TrashIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadJson, errorMessage, timestampedFileName } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { db, tableNames } from "@/lib/db/db";
import { exportAllAsJson, importAll } from "@/lib/db/export";

export function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Label>Data</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void exportAllAsJson()
              .then((json) => {
                downloadJson(timestampedFileName("wwpp-backup"), json);
                toast.success("Exported every table as JSON");
              })
              .catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
          }}
        >
          <DownloadIcon className="size-4" />
          Export all
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          <UploadIcon className="size-4" />
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file
              .text()
              .then((text) => importAll(JSON.parse(text) as unknown))
              .then((counts) => {
                const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
                toast.success(`Imported ${total} rows`);
              })
              .catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
          }}
        />

        <Button
          size="sm"
          variant="destructive"
          onClick={() => {
            setConfirmOpen(true);
          }}
        >
          <TrashIcon className="size-4" />
          Delete all data
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Exports contain every table except the API key, which never leaves chrome.storage.local.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete every local record?</DialogTitle>
            <DialogDescription>
              Jobs, scores, applications, saved answers, runs, events, and preferences are all
              cleared. Export a backup first if you want to keep them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void Promise.all(tableNames.map((name) => db.table(name).clear()))
                  .then(() => {
                    setConfirmOpen(false);
                    toast.success("Deleted every local record");
                  })
                  .catch((cause: unknown) => {
                    toast.error(errorMessage(cause));
                  });
              }}
            >
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DataSection;
