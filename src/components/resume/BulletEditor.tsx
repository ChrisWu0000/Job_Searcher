import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ExperienceBullet } from "@/types/resume";
import { joinList, splitList, swapAt } from "./bankUtils";

export interface BulletEditorProps {
  bullets: ExperienceBullet[];
  onChange: (bullets: ExperienceBullet[]) => void;
}

export function BulletEditor({ bullets, onChange }: BulletEditorProps) {
  const update = (index: number, patch: Partial<ExperienceBullet>) => {
    onChange(bullets.map((bullet, at) => (at === index ? { ...bullet, ...patch } : bullet)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Bullets</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onChange([
              ...bullets,
              { id: `bullet-${crypto.randomUUID()}`, text: "", tags: [], pinned: false },
            ]);
          }}
        >
          <PlusIcon className="size-4" />
          Add bullet
        </Button>
      </div>

      {bullets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No bullets yet. A tailored resume can only pick from what you write here.
        </p>
      ) : null}

      <ul className="space-y-2">
        {bullets.map((bullet, index) => (
          <li key={bullet.id} className="space-y-2 rounded-md border p-2">
            <Textarea
              rows={2}
              value={bullet.text}
              placeholder="Built X that did Y, cutting Z by 40%"
              onChange={(event) => {
                update(index, { text: event.target.value });
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-48 flex-1"
                value={joinList(bullet.tags)}
                placeholder="Tags, comma separated (backend, react, ml)"
                onChange={(event) => {
                  update(index, { tags: splitList(event.target.value) });
                }}
              />
              <div className="flex items-center gap-2">
                <Switch
                  id={`bullet-pinned-${bullet.id}`}
                  checked={bullet.pinned}
                  onCheckedChange={(checked) => {
                    update(index, { pinned: checked });
                  }}
                />
                <Label htmlFor={`bullet-pinned-${bullet.id}`} className="text-xs">
                  Always include
                </Label>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move bullet up"
                onClick={() => {
                  onChange(swapAt(bullets, index, index - 1));
                }}
              >
                <ArrowUpIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Move bullet down"
                onClick={() => {
                  onChange(swapAt(bullets, index, index + 1));
                }}
              >
                <ArrowDownIcon className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove bullet"
                onClick={() => {
                  onChange(bullets.filter((_, at) => at !== index));
                }}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default BulletEditor;
