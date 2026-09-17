import { ChevronDownIcon, StarIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type DocumentRequirement,
  documentRequirementLabels,
  documentRequirements,
  useUiStore,
} from "@/stores/ui";
import type { JobStatus, WorkArrangement } from "@/types/job";
import type { ScoreVerdict } from "@/types/scoring";

const statuses: JobStatus[] = ["new", "skipped", "interested", "queued", "applied", "error"];
const verdicts: ScoreVerdict[] = ["apply", "maybe", "skip"];
const arrangements: WorkArrangement[] = ["remote", "hybrid", "in-person"];

function MultiSelect<TValue extends string>({
  label,
  options,
  selected,
  optionLabel,
  onToggle,
}: {
  label: string;
  options: TValue[];
  selected: TValue[];
  optionLabel?: (value: TValue) => string;
  onToggle: (next: TValue[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          {selected.length > 0 ? (
            <span className="rounded bg-primary px-1.5 text-primary-foreground text-xs">
              {selected.length}
            </span>
          ) : null}
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-auto">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">No values yet</p>
        ) : null}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={selected.includes(option)}
            onSelect={(event) => {
              event.preventDefault();
            }}
            onCheckedChange={(checked) => {
              onToggle(
                checked ? [...selected, option] : selected.filter((value) => value !== option),
              );
            }}
          >
            {optionLabel ? optionLabel(option) : option}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NumberFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
}) {
  return (
    <Input
      className="w-28"
      inputMode="numeric"
      aria-label={label}
      placeholder={label}
      value={value === undefined ? "" : String(value)}
      onChange={(event) => {
        const parsed = Number.parseInt(event.target.value, 10);
        onChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
    />
  );
}

export interface JobFiltersBarProps {
  countries: string[];
  visibleCount: number;
  totalCount: number;
  trailing?: ReactNode;
}

export function JobFiltersBar({
  countries,
  visibleCount,
  totalCount,
  trailing,
}: JobFiltersBarProps) {
  const filters = useUiStore((store) => store.filters);
  const setFilter = useUiStore((store) => store.setFilter);
  const resetFilters = useUiStore((store) => store.resetFilters);
  const interestedOnly = filters.statuses.length === 1 && filters.statuses[0] === "interested";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={filters.search}
        placeholder="Search company, title, location, notes"
        className="w-72"
        onChange={(event) => {
          setFilter("search", event.target.value);
        }}
      />

      <Button
        variant={interestedOnly ? "secondary" : "outline"}
        size="sm"
        aria-pressed={interestedOnly}
        onClick={() => {
          setFilter("statuses", interestedOnly ? [] : ["interested"]);
        }}
      >
        <StarIcon className={interestedOnly ? "size-4 fill-current" : "size-4"} />
        Interested
      </Button>

      <MultiSelect
        label="Status"
        options={statuses}
        selected={filters.statuses}
        onToggle={(next) => {
          setFilter("statuses", next);
        }}
      />
      <MultiSelect
        label="Verdict"
        options={verdicts}
        selected={filters.verdicts}
        onToggle={(next) => {
          setFilter("verdicts", next);
        }}
      />
      <MultiSelect
        label="Country"
        options={countries}
        selected={filters.countries}
        onToggle={(next) => {
          setFilter("countries", next);
        }}
      />
      <MultiSelect
        label="Arrangement"
        options={arrangements}
        selected={filters.arrangements}
        onToggle={(next) => {
          setFilter("arrangements", next);
        }}
      />
      <MultiSelect<DocumentRequirement>
        label="Docs"
        options={documentRequirements}
        selected={filters.requiredDocuments}
        optionLabel={(value) => documentRequirementLabels[value]}
        onToggle={(next) => {
          setFilter("requiredDocuments", next);
        }}
      />

      <NumberFilter
        label="Months"
        value={filters.durationMonths}
        onChange={(next) => {
          setFilter("durationMonths", next);
        }}
      />
      <NumberFilter
        label="Min score"
        value={filters.minScore}
        onChange={(next) => {
          setFilter("minScore", next);
        }}
      />
      <NumberFilter
        label="Min likelihood"
        value={filters.minLikelihood}
        onChange={(next) => {
          setFilter("minLikelihood", next);
        }}
      />

      <div className="flex items-center gap-2">
        <Switch
          id="filter-closing"
          checked={filters.deadlineWithinHours === 24}
          onCheckedChange={(checked) => {
            setFilter("deadlineWithinHours", checked ? 24 : undefined);
          }}
        />
        <Label className="text-xs" htmlFor="filter-closing">
          Closing in 24h
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="filter-new"
          checked={filters.onlyNew}
          onCheckedChange={(checked) => {
            setFilter("onlyNew", checked);
          }}
        />
        <Label className="text-xs" htmlFor="filter-new">
          New only
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="filter-no-waterloo"
          checked={filters.excludeWaterloo}
          onCheckedChange={(checked) => {
            setFilter("excludeWaterloo", checked);
          }}
        />
        <Label className="text-xs" htmlFor="filter-no-waterloo">
          No Waterloo
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="filter-skip-verdicts"
          checked={filters.showSkipVerdicts}
          onCheckedChange={(checked) => {
            setFilter("showSkipVerdicts", checked);
          }}
        />
        <Label className="text-xs" htmlFor="filter-skip-verdicts">
          Show skip verdicts
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="filter-auto-filtered"
          checked={filters.onlyAutoFiltered}
          onCheckedChange={(checked) => {
            setFilter("onlyAutoFiltered", checked);
            if (checked) setFilter("verdicts", []);
          }}
        />
        <Label className="text-xs" htmlFor="filter-auto-filtered">
          Automatically filtered
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="filter-unscored"
          checked={filters.onlyUnscored}
          onCheckedChange={(checked) => {
            setFilter("onlyUnscored", checked);
          }}
        />
        <Label className="text-xs" htmlFor="filter-unscored">
          Unscored only
        </Label>
      </div>

      <Button variant="ghost" size="sm" onClick={resetFilters}>
        <XIcon className="size-4" />
        Reset
      </Button>

      <span className="ml-auto text-muted-foreground text-sm">
        {visibleCount} of {totalCount} jobs
      </span>
      {trailing}
    </div>
  );
}

export default JobFiltersBar;
