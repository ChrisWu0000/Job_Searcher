import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveResumeSettings } from "@/lib/db/repo";
import type { ResumeSettings, SkillGroup } from "@/types/resume";
import { joinList, splitList, swapAt } from "./bankUtils";

export interface SkillGroupsEditorProps {
  settings: ResumeSettings;
}

export function SkillGroupsEditor({ settings }: SkillGroupsEditorProps) {
  const [groups, setGroups] = useState<SkillGroup[]>(settings.skillGroups);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGroups(settings.skillGroups);
  }, [settings.skillGroups]);

  const dirty = JSON.stringify(groups) !== JSON.stringify(settings.skillGroups);

  const update = (index: number, patch: Partial<SkillGroup>) => {
    setGroups(groups.map((group, at) => (at === index ? { ...group, ...patch } : group)));
  };

  const save = () => {
    setSaving(true);
    void saveResumeSettings({ ...settings, skillGroups: groups })
      .then(() => {
        toast.success("Skill groups saved");
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <section className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Skills</Label>
          <p className="text-muted-foreground text-xs">
            Grouped exactly as they appear in the skills section of the resume.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setGroups([...groups, { id: `skills-${crypto.randomUUID()}`, name: "", items: [] }]);
            }}
          >
            <PlusIcon className="size-4" />
            Add group
          </Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>
            <SaveIcon className="size-4" />
            Save skills
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {groups.map((group, index) => (
          <li key={group.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <Input
              className="w-44"
              value={group.name}
              placeholder="Languages"
              onChange={(event) => {
                update(index, { name: event.target.value });
              }}
            />
            <Input
              className="min-w-64 flex-1"
              value={joinList(group.items)}
              placeholder="TypeScript, Python, Go"
              onChange={(event) => {
                update(index, { items: splitList(event.target.value) });
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move skill group up"
              onClick={() => {
                setGroups(swapAt(groups, index, index - 1));
              }}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move skill group down"
              onClick={() => {
                setGroups(swapAt(groups, index, index + 1));
              }}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove skill group"
              onClick={() => {
                setGroups(groups.filter((_, at) => at !== index));
              }}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No skill groups yet. Add one to give the model a vocabulary it may reorder.
        </p>
      ) : null}
    </section>
  );
}

export default SkillGroupsEditor;
