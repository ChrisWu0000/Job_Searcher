import { useLiveQuery } from "dexie-react-hooks";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { discardFixture, downloadFixture } from "@/components/shared/fixtures";
import { formatBytes, formatDateTime, truncate } from "@/components/shared/format";
import SaveFixtureButton from "@/components/shared/SaveFixtureButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCapturedHtml } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import type { CapturedHtml } from "@/types/capture";

const previewLength = 4000;

function CaptureRow({ capture }: { capture: CapturedHtml }) {
  const [open, setOpen] = useState(false);
  const openInspectorTarget = useUiStore((store) => store.openInspectorTarget);

  return (
    <li className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{capture.kind}</Badge>
        <Badge variant="outline">{capture.source}</Badge>
        <span className="text-muted-foreground text-xs">{formatDateTime(capture.at)}</span>
        {capture.step ? <span className="font-mono text-xs">{capture.step}</span> : null}
        {capture.jobId ? (
          <span className="text-muted-foreground text-xs">job {capture.jobId}</span>
        ) : null}
        <span className="text-muted-foreground text-xs">{formatBytes(capture.html.length)}</span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen((current) => !current);
            }}
          >
            {open ? "Hide HTML" : "Show HTML"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              downloadFixture(capture);
            }}
          >
            <DownloadIcon className="size-4" />
            Download
          </Button>
          {capture.id === undefined ? null : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                openInspectorTarget({ table: "capturedHtml", id: String(capture.id) });
              }}
            >
              Record
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete capture"
            onClick={() => {
              void discardFixture(capture).catch((cause: unknown) => {
                toast.error(errorMessage(cause));
              });
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      {capture.url ? <p className="truncate text-muted-foreground text-xs">{capture.url}</p> : null}

      {open ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {truncate(capture.html, previewLength)}
        </pre>
      ) : null}
    </li>
  );
}

export function CapturedHtmlPanel() {
  const captures = useLiveQuery(() => listCapturedHtml(), []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SaveFixtureButton />
        <p className="text-muted-foreground text-xs">
          Captures the current WaterlooWorks page with scripts, styles, field values, emails, phone
          numbers, and your name stripped, downloads it, and keeps a copy here.
        </p>
      </div>

      {captures === undefined ? (
        <p className="text-muted-foreground text-sm">Loading captures…</p>
      ) : captures.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No pages captured yet. Content-script errors save one automatically.
        </p>
      ) : (
        <ul className="rounded-md border px-3">
          {captures.map((capture) => (
            <CaptureRow key={capture.id ?? capture.at} capture={capture} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default CapturedHtmlPanel;
