import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ExperienceKind, experienceKindLabels } from "@/types/resume";
import { swapAt } from "./bankUtils";

export interface SectionOrderEditorProps {
  sectionOrder: ExperienceKind[];
  sectionTitles: Record<string, string>;
  onOrderChange: (order: ExperienceKind[]) => void;
  onTitlesChange: (titles: Record<string, string>) => void;
}

export function SectionOrderEditor({
  sectionOrder,
  sectionTitles,
  onOrderChange,
  onTitlesChange,
}: SectionOrderEditorProps) {
  return (
    <div className="space-y-2">
      <Label>Sections</Label>
      <p className="text-muted-foreground text-xs">
        Order and heading of each section in the rendered resume.
      </p>
      <ul className="space-y-2">
        {sectionOrder.map((kind, index) => (
          <li key={kind} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <span className="w-24 shrink-0 truncate text-muted-foreground text-xs">
              {experienceKindLabels[kind]}
            </span>
            <Input
              className="min-w-48 flex-1"
              value={sectionTitles[kind] ?? experienceKindLabels[kind]}
              onChange={(event) => {
                onTitlesChange({ ...sectionTitles, [kind]: event.target.value });
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move section up"
              onClick={() => {
                onOrderChange(swapAt(sectionOrder, index, index - 1));
              }}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move section down"
              onClick={() => {
                onOrderChange(swapAt(sectionOrder, index, index + 1));
              }}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SectionOrderEditor;
