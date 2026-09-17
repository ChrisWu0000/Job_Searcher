import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { stringifyValue, truncate } from "@/components/shared/format";
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
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/db/db";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import type { EngineEvent, EngineName, LogLevel } from "@/types/run";
import RecordView from "./RecordView";

const tailLimit = 500;
const anyValue = "any";

const levels: LogLevel[] = ["debug", "info", "warn", "error"];
const engines: EngineName[] = ["sync", "score", "apply", "resume", "system"];

const levelClasses: Record<LogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

export function EventLog() {
  const filters = useUiStore((store) => store.eventLogFilters);
  const setFilters = useUiStore((store) => store.setEventLogFilters);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  const events = useLiveQuery(
    () => db.events.orderBy("id").reverse().limit(tailLimit).toArray(),
    [],
  );

  const needle = filters.search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = events ?? [];
    return rows.filter((event) => {
      if (filters.runId !== undefined && event.runId !== filters.runId) return false;
      if (filters.level !== undefined && event.level !== filters.level) return false;
      if (filters.engine !== undefined && event.engine !== filters.engine) return false;
      if (needle.length === 0) return true;
      return `${event.message} ${stringifyValue(event.data)}`.toLowerCase().includes(needle);
    });
  }, [events, filters.runId, filters.level, filters.engine, needle]);

  useEffect(() => {
    if (!follow) return;
    listRef.current?.scrollTo({ top: 0 });
  }, [follow]);

  const selected = filtered.find((event) => event.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="event-run">
            Run id
          </Label>
          <Input
            id="event-run"
            className="w-28"
            inputMode="numeric"
            value={filters.runId === undefined ? "" : String(filters.runId)}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              setFilters({ runId: Number.isNaN(parsed) ? undefined : parsed });
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Level</Label>
          <Select
            value={filters.level ?? anyValue}
            onValueChange={(next) => {
              setFilters({ level: next === anyValue ? undefined : (next as LogLevel) });
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={anyValue}>Any level</SelectItem>
              {levels.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Engine</Label>
          <Select
            value={filters.engine ?? anyValue}
            onValueChange={(next) => {
              setFilters({ engine: next === anyValue ? undefined : (next as EngineName) });
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={anyValue}>Any engine</SelectItem>
              {engines.map((engine) => (
                <SelectItem key={engine} value={engine}>
                  {engine}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs" htmlFor="event-search">
            Search
          </Label>
          <Input
            id="event-search"
            className="w-64"
            value={filters.search}
            placeholder="Message or data"
            onChange={(event) => {
              setFilters({ search: event.target.value });
            }}
          />
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Switch id="event-follow" checked={follow} onCheckedChange={setFollow} />
          <Label className="text-xs" htmlFor="event-follow">
            Follow
          </Label>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="mb-1"
          onClick={() => {
            setFilters({ runId: undefined, level: undefined, engine: undefined, search: "" });
          }}
        >
          Clear
        </Button>

        <span className="mb-2 ml-auto text-muted-foreground text-sm">{filtered.length} events</span>
      </div>

      <div ref={listRef} className="h-[45vh] overflow-auto rounded-md border font-mono text-xs">
        {filtered.length === 0 ? (
          <p className="p-3 text-muted-foreground">No events yet.</p>
        ) : (
          filtered.map((event: EngineEvent) => (
            <button
              type="button"
              key={event.id ?? `${event.at}-${event.message}`}
              className={cn(
                "flex w-full items-baseline gap-2 border-b px-3 py-1 text-left hover:bg-accent/50",
                event.id === selectedId && "bg-accent",
                levelClasses[event.level],
              )}
              onClick={() => {
                setSelectedId(event.id);
              }}
            >
              <span className="shrink-0 text-muted-foreground">{event.at.slice(11, 23)}</span>
              <span className="w-14 shrink-0 text-muted-foreground">{event.engine}</span>
              <span className="w-12 shrink-0 text-muted-foreground">
                {event.runId === undefined ? "—" : `#${event.runId}`}
              </span>
              <span className="truncate">{truncate(event.message, 200)}</span>
            </button>
          ))
        )}
      </div>

      {selected ? (
        <RecordView table="events" record={selected} />
      ) : (
        <p className="text-muted-foreground text-sm">Select an event to inspect it.</p>
      )}
    </div>
  );
}

export default EventLog;
