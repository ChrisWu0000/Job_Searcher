import { useLiveQuery } from "dexie-react-hooks";
import { DownloadIcon, ExternalLinkIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { downloadText, errorMessage, timestampedFileName } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { loadResumeBank, saveResumeSettings } from "@/lib/db/repo";
import { masterSelection, renderResume } from "@/lib/resume/latex";
import { defaultLatexSnippets, type ResumeSettings } from "@/types/resume";
import { openInOverleaf } from "./overleaf";
import SectionOrderEditor from "./SectionOrderEditor";
import SnippetFields from "./SnippetFields";

function comparable(settings: ResumeSettings): string {
  const { version: _version, updatedAt: _updatedAt, skillGroups: _skillGroups, ...rest } = settings;
  return JSON.stringify(rest);
}

export function TemplateEditor() {
  const bank = useLiveQuery(() => loadResumeBank(), []);
  const [draft, setDraft] = useState<ResumeSettings | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const settings = bank?.settings;

  useEffect(() => {
    setDraft((current) => current ?? settings);
  }, [settings]);

  const entries = useMemo(() => bank?.entries ?? [], [bank]);

  const preview = useMemo(() => {
    if (!draft) return { latex: "", error: undefined as string | undefined };
    const previewBank = { entries, settings: draft };
    try {
      return {
        latex: renderResume({ bank: previewBank, selection: masterSelection(previewBank) }),
        error: undefined,
      };
    } catch (cause) {
      return { latex: "", error: errorMessage(cause) };
    }
  }, [draft, entries]);

  if (!bank || !draft || !settings) {
    return <p className="text-muted-foreground text-sm">Loading template…</p>;
  }

  const dirty = comparable(draft) !== comparable(settings);

  const patch = (values: Partial<ResumeSettings>) => {
    setDraft({ ...draft, ...values });
  };

  const save = () => {
    setSaving(true);
    void saveResumeSettings({ ...draft, skillGroups: settings.skillGroups })
      .then((saved) => {
        setDraft(saved);
        toast.success("Template saved");
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <SaveIcon className="size-4" />
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              patch({ snippets: defaultLatexSnippets });
            }}
          >
            <RotateCcwIcon className="size-4" />
            Reset snippets to default
          </Button>
          {dirty ? (
            <span className="text-amber-600 text-xs dark:text-amber-400">Unsaved changes</span>
          ) : null}
        </div>

        <p className="text-muted-foreground text-sm">
          Snippets are plain LaTeX with <span className="font-mono">{"<<placeholder>>"}</span>{" "}
          markers. Everything outside a marker is copied through untouched.
        </p>

        <SnippetFields
          snippets={draft.snippets}
          onChange={(snippets) => {
            patch({ snippets });
          }}
        />

        <Separator />

        <SectionOrderEditor
          sectionOrder={draft.sectionOrder}
          sectionTitles={draft.sectionTitles}
          onOrderChange={(sectionOrder) => {
            patch({ sectionOrder });
          }}
          onTitlesChange={(sectionTitles) => {
            patch({ sectionTitles });
          }}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="skills-title">Skills heading</Label>
            <Input
              id="skills-title"
              value={draft.skillsTitle}
              onChange={(event) => {
                patch({ skillsTitle: event.target.value });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-bullets">Max bullets per entry</Label>
            <Input
              id="max-bullets"
              type="number"
              min={1}
              value={draft.maxBulletsPerEntry}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                patch({ maxBulletsPerEntry: Number.isNaN(parsed) ? 1 : Math.max(1, parsed) });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-entries">Max entries per section</Label>
            <Input
              id="max-entries"
              type="number"
              min={1}
              value={draft.maxEntriesPerSection}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                patch({ maxEntriesPerSection: Number.isNaN(parsed) ? 1 : Math.max(1, parsed) });
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tailoring-instructions">Tailoring instructions</Label>
          <Textarea
            id="tailoring-instructions"
            rows={4}
            value={draft.tailoringInstructions}
            placeholder="Extra guidance for the model, e.g. emphasize backend work"
            onChange={(event) => {
              patch({ tailoringInstructions: event.target.value });
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">Master preview</span>
          <span className="text-muted-foreground text-xs">
            every entry in the bank, rendered with this template
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={preview.error !== undefined}
            onClick={() => {
              downloadText(
                timestampedFileName("master-resume", "tex"),
                preview.latex,
                "text/x-tex",
              );
            }}
          >
            <DownloadIcon className="size-4" />
            Download master .tex
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={preview.error !== undefined}
            onClick={() => {
              openInOverleaf(preview.latex);
            }}
          >
            <ExternalLinkIcon className="size-4" />
            Open in Overleaf
          </Button>
        </div>

        {preview.error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
            {preview.error}
          </p>
        ) : (
          <pre className="max-h-[40rem] overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
            {preview.latex}
          </pre>
        )}
      </div>
    </div>
  );
}

export default TemplateEditor;
