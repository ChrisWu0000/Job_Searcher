import { Badge } from "@/components/ui/badge";
import type { ExperienceEntry, ResumeSelection } from "@/types/resume";
import { entryDates } from "./bankUtils";

export interface SelectionPanelProps {
  selection: ResumeSelection;
  entries: ExperienceEntry[];
}

export function SelectionPanel({ selection, entries }: SelectionPanelProps) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-sm">Selection</h3>
      {selection.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No entries were selected.</p>
      ) : null}
      <ul className="space-y-2">
        {selection.entries.map((choice) => {
          const entry = byId.get(choice.experienceId);
          return (
            <li key={choice.experienceId} className="rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-sm">{entry?.title ?? choice.experienceId}</span>
                <span className="text-muted-foreground text-xs">
                  {[entry?.organization, entry ? entryDates(entry) : undefined]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <ul className="mt-1 space-y-1.5">
                {choice.bullets.map((bullet) => {
                  const original = entry?.bullets.find((item) => item.id === bullet.bulletId);
                  return (
                    <li key={bullet.bulletId} className="text-sm">
                      <span className="flex flex-wrap items-start gap-2">
                        <span className="flex-1">{bullet.text}</span>
                        {bullet.rewritten ? (
                          <Badge variant="secondary" className="text-[10px]">
                            rewritten
                          </Badge>
                        ) : null}
                      </span>
                      {bullet.rewritten && original && original.text !== bullet.text ? (
                        <span className="block text-muted-foreground text-xs">{original.text}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {selection.skills.length > 0 ? (
        <div className="rounded-md border px-3 py-2">
          <h4 className="font-medium text-sm">Skills</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {selection.skills.map((skill) => (
              <li key={skill.groupId} className="text-muted-foreground">
                {skill.items.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default SelectionPanel;
