import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import type { Constraint, ConstraintKind } from "@/types/preferences";

const weights = [1, 2, 3, 4, 5];

function swap(constraints: Constraint[], index: number, target: number): Constraint[] {
  if (target < 0 || target >= constraints.length) return constraints;
  const next = [...constraints];
  const moved = next[index];
  const displaced = next[target];
  if (!moved || !displaced) return constraints;
  next[index] = displaced;
  next[target] = moved;
  return next;
}

function nextConstraintId(constraints: Constraint[]): string {
  let index = constraints.length + 1;
  const taken = new Set(constraints.map((constraint) => constraint.id));
  while (taken.has(`custom-${index}`)) index += 1;
  return `custom-${index}`;
}

export interface ConstraintListProps {
  constraints: Constraint[];
  onChange: (constraints: Constraint[]) => void;
}

export function ConstraintList({ constraints, onChange }: ConstraintListProps) {
  const update = (index: number, patch: Partial<Constraint>) => {
    onChange(
      constraints.map((constraint, position) =>
        position === index ? { ...constraint, ...patch } : constraint,
      ),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Constraints</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onChange([
              ...constraints,
              { id: nextConstraintId(constraints), text: "", kind: "soft", weight: 3 },
            ]);
          }}
        >
          <PlusIcon className="size-4" />
          Add constraint
        </Button>
      </div>

      <ul className="space-y-2">
        {constraints.map((constraint, index) => (
          <li
            key={constraint.id}
            className="flex flex-wrap items-center gap-2 rounded-md border p-2"
          >
            <span className="w-28 shrink-0 truncate font-mono text-muted-foreground text-xs">
              {constraint.id}
            </span>
            <Input
              className="min-w-64 flex-1"
              value={constraint.text}
              placeholder="Say it the way you would say it out loud"
              onChange={(event) => {
                update(index, { text: event.target.value });
              }}
            />
            <Select
              value={constraint.kind}
              onValueChange={(next) => {
                update(index, { kind: next as ConstraintKind });
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hard">hard</SelectItem>
                <SelectItem value="soft">soft</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(constraint.weight)}
              disabled={constraint.kind === "hard"}
              onValueChange={(next) => {
                update(index, { weight: Number.parseInt(next, 10) });
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weights.map((weight) => (
                  <SelectItem key={weight} value={String(weight)}>
                    weight {weight}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move constraint up"
              onClick={() => {
                onChange(swap(constraints, index, index - 1));
              }}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Move constraint down"
              onClick={() => {
                onChange(swap(constraints, index, index + 1));
              }}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Remove constraint"
              onClick={() => {
                onChange(constraints.filter((_, position) => position !== index));
              }}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ConstraintList;
