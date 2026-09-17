import { useLiveQuery } from "dexie-react-hooks";
import { SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getExperience, saveExperience } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import {
  type ExperienceEntry,
  type ExperienceKind,
  experienceKindLabels,
  experienceKinds,
} from "@/types/resume";
import BulletEditor from "./BulletEditor";
import { joinList, splitLines, splitList } from "./bankUtils";

type OptionalField = "organization" | "location" | "startDate" | "endDate" | "link";

const optionalFields: { key: OptionalField; label: string; placeholder: string }[] = [
  { key: "organization", label: "Organization", placeholder: "Company, school, or club" },
  { key: "location", label: "Location", placeholder: "Waterloo, ON" },
  { key: "startDate", label: "Start", placeholder: "May 2025" },
  { key: "endDate", label: "End", placeholder: "Aug 2025" },
  { key: "link", label: "Link", placeholder: "https://github.com/you/project" },
];

function sameEntry(left: ExperienceEntry, right: ExperienceEntry): boolean {
  return JSON.stringify({ ...left, updatedAt: "" }) === JSON.stringify({ ...right, updatedAt: "" });
}

function EditorBody({ entry, onClose }: { entry: ExperienceEntry; onClose: () => void }) {
  const [draft, setDraft] = useState<ExperienceEntry>(entry);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(entry);
  }, [entry]);

  const dirty = !sameEntry(draft, entry);

  const patch = (values: Partial<ExperienceEntry>) => {
    setDraft({ ...draft, ...values });
  };

  const patchOptional = (key: OptionalField, value: string) => {
    const next = { ...draft };
    if (value.length === 0) delete next[key];
    else next[key] = value;
    setDraft(next);
  };

  const save = () => {
    setSaving(true);
    void saveExperience(draft)
      .then((saved) => {
        setDraft(saved);
        toast.success("Entry saved");
        onClose();
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <>
      <SheetHeader className="pb-2">
        <SheetTitle className="pr-8 text-base leading-snug">
          {draft.title.trim().length > 0 ? draft.title : "Untitled entry"}
        </SheetTitle>
        <SheetDescription>
          {experienceKindLabels[draft.kind]} · only facts and bullets written here can reach a
          tailored resume.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Button size="sm" disabled={!dirty || saving} onClick={save}>
          <SaveIcon className="size-4" />
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {dirty ? <span className="text-amber-600 text-xs dark:text-amber-400">Unsaved</span> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="entry-kind">Kind</Label>
            <Select
              value={draft.kind}
              onValueChange={(next) => {
                patch({ kind: next as ExperienceKind });
              }}
            >
              <SelectTrigger id="entry-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {experienceKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {experienceKindLabels[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-title">Title</Label>
            <Input
              id="entry-title"
              value={draft.title}
              placeholder="Software Engineer Intern"
              onChange={(event) => {
                patch({ title: event.target.value });
              }}
            />
          </div>

          {optionalFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`entry-${field.key}`}>{field.label}</Label>
              <Input
                id={`entry-${field.key}`}
                value={draft[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(event) => {
                  patchOptional(field.key, event.target.value);
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="entry-technologies">Technologies</Label>
          <Input
            id="entry-technologies"
            value={joinList(draft.technologies)}
            placeholder="TypeScript, Postgres, Kubernetes"
            onChange={(event) => {
              patch({ technologies: splitList(event.target.value) });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="entry-facts">
            Facts the model may use: metrics, scope, outcomes, team size…
          </Label>
          <Textarea
            id="entry-facts"
            rows={4}
            value={draft.facts.join("\n")}
            placeholder={"One fact per line\nCut p95 latency from 900ms to 120ms\nTeam of 5"}
            onChange={(event) => {
              patch({ facts: splitLines(event.target.value) });
            }}
          />
          <p className="text-muted-foreground text-xs">
            Anything not written here or in a bullet is treated as fabricated and reverted.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="entry-pinned"
            checked={draft.pinned}
            onCheckedChange={(checked) => {
              patch({ pinned: checked });
            }}
          />
          <Label htmlFor="entry-pinned">Always include</Label>
        </div>

        <Separator />

        <BulletEditor
          bullets={draft.bullets}
          onChange={(bullets) => {
            patch({ bullets });
          }}
        />
      </div>
    </>
  );
}

export function ExperienceEditor() {
  const selectedExperienceId = useUiStore((store) => store.selectedExperienceId);
  const selectExperience = useUiStore((store) => store.selectExperience);

  const entry = useLiveQuery(
    () => (selectedExperienceId === undefined ? undefined : getExperience(selectedExperienceId)),
    [selectedExperienceId],
  );

  const close = () => {
    selectExperience(undefined);
  };

  return (
    <Sheet
      open={selectedExperienceId !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        {entry ? (
          <EditorBody key={entry.id} entry={entry} onClose={close} />
        ) : (
          <div className="p-6">
            <SheetHeader>
              <SheetTitle>Loading entry…</SheetTitle>
              <SheetDescription>Pick an entry from the bank to edit it.</SheetDescription>
            </SheetHeader>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ExperienceEditor;
