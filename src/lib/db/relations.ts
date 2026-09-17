import type { TableName } from "./db";

export interface Relation {
  label: string;
  fromTable: TableName;
  fromField: string;
  toTable: TableName;
  toField: string;
  cardinality: "one" | "many";
}

export const relations: Relation[] = [
  {
    label: "scores",
    fromTable: "jobScores",
    fromField: "jobId",
    toTable: "jobs",
    toField: "id",
    cardinality: "many",
  },
  {
    label: "application",
    fromTable: "applications",
    fromField: "jobId",
    toTable: "jobs",
    toField: "id",
    cardinality: "one",
  },
  {
    label: "captured html",
    fromTable: "capturedHtml",
    fromField: "jobId",
    toTable: "jobs",
    toField: "id",
    cardinality: "many",
  },
  {
    label: "tailored resumes",
    fromTable: "tailoredResumes",
    fromField: "jobId",
    toTable: "jobs",
    toField: "id",
    cardinality: "many",
  },
  {
    label: "events",
    fromTable: "events",
    fromField: "runId",
    toTable: "runs",
    toField: "id",
    cardinality: "many",
  },
];

export function relationsPointingTo(table: TableName): Relation[] {
  return relations.filter((relation) => relation.toTable === table);
}

export function relationsFrom(table: TableName): Relation[] {
  return relations.filter((relation) => relation.fromTable === table);
}

export function primaryKeyField(table: TableName): string {
  switch (table) {
    case "jobs":
    case "jobScores":
      return "id";
    case "applications":
      return "jobId";
    case "savedAnswers":
      return "questionHash";
    case "runs":
    case "events":
    case "capturedHtml":
      return "id";
    case "preferences":
    case "experiences":
    case "resumeSettings":
    case "tailoredResumes":
      return "id";
  }
}
