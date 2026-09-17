import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { prettyJson, stringifyValue } from "@/components/shared/format";
import JsonBlock from "@/components/shared/JsonBlock";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, type TableName } from "@/lib/db/db";
import { primaryKeyField, relationsFrom, relationsPointingTo } from "@/lib/db/relations";
import { useUiStore } from "@/stores/ui";
import PromptViewer from "./PromptViewer";

export type RecordValue = Record<string, unknown>;

const collapseLimit = 240;

function FieldValue({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof value === "string" ? value : prettyJson(value);
  const isLong = text.length > collapseLimit;
  const shown = isLong && !expanded ? `${text.slice(0, collapseLimit)}…` : text;

  return (
    <div className="min-w-0">
      <p className="whitespace-pre-wrap break-words font-mono text-xs">{shown || "—"}</p>
      {isLong ? (
        <Button
          size="sm"
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "Collapse" : `Expand (${text.length} chars)`}
        </Button>
      ) : null}
    </div>
  );
}

function RelatedRow({ table, record }: { table: TableName; record: RecordValue }) {
  const openInspectorTarget = useUiStore((store) => store.openInspectorTarget);
  const keyField = primaryKeyField(table);
  const id = stringifyValue(record[keyField]);

  return (
    <li className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
      <Button
        size="sm"
        variant="link"
        className="h-auto shrink-0 p-0 font-mono text-xs"
        onClick={() => {
          openInspectorTarget({ table, id });
        }}
      >
        {id || "(no id)"}
      </Button>
      <span className="truncate text-muted-foreground text-xs">{stringifyValue(record)}</span>
    </li>
  );
}

function RelatedSection({ table, record }: { table: TableName; record: RecordValue }) {
  const keyField = primaryKeyField(table);
  const recordKey = stringifyValue(record[keyField]);

  const children = useLiveQuery(async () => {
    const groups: { label: string; table: TableName; rows: RecordValue[] }[] = [];
    for (const relation of relationsPointingTo(table)) {
      const value = record[relation.toField];
      if (value === undefined || value === null) continue;
      const rows = await db
        .table<RecordValue>(relation.fromTable)
        .where(relation.fromField)
        .equals(value as string | number)
        .toArray();
      groups.push({ label: relation.label, table: relation.fromTable, rows });
    }
    return groups;
  }, [table, recordKey]);

  const parents = useLiveQuery(async () => {
    const groups: { label: string; table: TableName; rows: RecordValue[] }[] = [];
    for (const relation of relationsFrom(table)) {
      const value = record[relation.fromField];
      if (value === undefined || value === null) continue;
      const row = await db.table<RecordValue>(relation.toTable).get(value as string | number);
      groups.push({
        label: relation.label,
        table: relation.toTable,
        rows: row ? [row] : [],
      });
    }
    return groups;
  }, [table, recordKey]);

  const groups = [...(parents ?? []), ...(children ?? [])];

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">No declared relations for this table.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={`${group.label}-${group.table}`}>
          <p className="mb-1 font-medium text-sm">
            {group.label}
            <span className="ml-2 text-muted-foreground text-xs">
              {group.table} · {group.rows.length}
            </span>
          </p>
          {group.rows.length === 0 ? (
            <p className="text-muted-foreground text-xs">Nothing found.</p>
          ) : (
            <ul>
              {group.rows.map((row) => (
                <RelatedRow
                  key={stringifyValue(row[primaryKeyField(group.table)])}
                  table={group.table}
                  record={row}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export interface RecordViewProps {
  table: TableName;
  record: RecordValue;
  showRelated?: boolean;
}

export function RecordView({ table, record, showRelated = true }: RecordViewProps) {
  const entries = Object.entries(record);
  const prompt = typeof record.prompt === "string" ? record.prompt : undefined;
  const rawResponse = typeof record.rawResponse === "string" ? record.rawResponse : undefined;
  const hasPrompt = table === "jobScores" && prompt !== undefined && rawResponse !== undefined;

  return (
    <Tabs defaultValue="fields" className="w-full">
      <TabsList>
        <TabsTrigger value="fields">Fields</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
        {showRelated ? <TabsTrigger value="related">Related</TabsTrigger> : null}
        {hasPrompt ? <TabsTrigger value="prompt">Prompt</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="fields">
        <dl className="divide-y rounded-md border">
          {entries.map(([key, value]) => (
            <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="font-medium text-muted-foreground text-xs">{key}</dt>
              <dd className="min-w-0">
                <FieldValue value={value} />
              </dd>
            </div>
          ))}
        </dl>
      </TabsContent>

      <TabsContent value="json">
        <JsonBlock text={prettyJson(record)} />
      </TabsContent>

      {showRelated ? (
        <TabsContent value="related">
          <RelatedSection table={table} record={record} />
        </TabsContent>
      ) : null}

      {hasPrompt && prompt !== undefined && rawResponse !== undefined ? (
        <TabsContent value="prompt">
          <PromptViewer prompt={prompt} rawResponse={rawResponse} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export default RecordView;
