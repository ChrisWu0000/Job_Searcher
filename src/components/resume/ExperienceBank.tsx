import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/shared/download";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadResumeBank, nextExperienceOrder, saveExperience } from "@/lib/db/repo";
import { useUiStore } from "@/stores/ui";
import {
  type ExperienceKind,
  experienceKindLabels,
  experienceKinds,
  type ResumeSettings,
} from "@/types/resume";
import BankToolbar from "./BankToolbar";
import { newExperienceEntry } from "./bankUtils";
import ExperienceEditor from "./ExperienceEditor";
import ExperienceRow from "./ExperienceRow";
import SkillGroupsEditor from "./SkillGroupsEditor";

function sectionKinds(settings: ResumeSettings): ExperienceKind[] {
  const ordered = settings.sectionOrder.filter((kind) => experienceKinds.includes(kind));
  const rest = experienceKinds.filter((kind) => !ordered.includes(kind));
  return [...ordered, ...rest];
}

export function ExperienceBank() {
  const selectExperience = useUiStore((store) => store.selectExperience);
  const bank = useLiveQuery(() => loadResumeBank(), []);

  if (!bank) return <p className="text-muted-foreground text-sm">Loading experience bank…</p>;

  const addEntry = (kind: ExperienceKind) => {
    void nextExperienceOrder()
      .then(async (order) => {
        const created = await saveExperience(newExperienceEntry(kind, order));
        selectExperience(created.id);
      })
      .catch((cause: unknown) => {
        toast.error(errorMessage(cause));
      });
  };

  const kinds = sectionKinds(bank.settings);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-muted-foreground text-sm">
          This bank is the only source a tailored resume may draw from. The model picks and reorders
          what is written here and may reword a bullet, but anything it invents is checked against
          your facts and reverted.
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <PlusIcon className="size-4" />
              Add entry
              <ChevronDownIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {kinds.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() => {
                  addEntry(kind);
                }}
              >
                {experienceKindLabels[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <BankToolbar bank={bank} />

      {bank.entries.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
          The bank is empty. Add an entry, or import a bank you exported earlier.
        </p>
      ) : null}

      {kinds.map((kind) => {
        const entries = bank.entries
          .filter((entry) => entry.kind === kind)
          .sort((left, right) => left.order - right.order);
        if (entries.length === 0) return null;
        return (
          <section key={kind} className="space-y-2">
            <h2 className="font-medium text-sm">
              {bank.settings.sectionTitles[kind] ?? experienceKindLabels[kind]}
              <span className="ml-2 text-muted-foreground text-xs">{entries.length}</span>
            </h2>
            <ul className="space-y-2">
              {entries.map((entry) => (
                <ExperienceRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        );
      })}

      <SkillGroupsEditor settings={bank.settings} />

      <ExperienceEditor />
    </div>
  );
}

export default ExperienceBank;
