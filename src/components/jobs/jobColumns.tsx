import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { deadlineTone, deadlineToneClasses, formatDeadline } from "@/components/shared/format";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import InterestedButton from "./InterestedButton";
import { DocumentIcons, NewBadge, ScoreBadge, StatusBadge, VerdictBadge } from "./JobBadges";
import { type JobRow, jobDeadline } from "./jobRows";

export const jobTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowSelectionFeature,
  columnSizingFeature,
});

export type JobTableFeatures = typeof jobTableFeatures;

const helper = createColumnHelper<JobTableFeatures, JobRow>();

export const jobColumns = helper.columns([
  helper.display({
    id: "select",
    size: 44,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        aria-label="Select all rows"
        onCheckedChange={() => {
          table.toggleAllRowsSelected();
        }}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        aria-label={`Select ${row.original.job.title}`}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onCheckedChange={() => {
          row.toggleSelected();
        }}
      />
    ),
  }),
  helper.display({
    id: "interested",
    header: () => <span className="sr-only">Interested</span>,
    size: 48,
    cell: ({ row }) => <InterestedButton job={row.original.job} />,
  }),
  helper.accessor((row) => (row.autoFilterReason ? undefined : row.score?.score), {
    id: "score",
    header: "Score",
    size: 72,
    sortUndefined: "last",
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  helper.accessor((row) => (row.autoFilterReason ? undefined : row.score?.likelihood), {
    id: "likelihood",
    header: "Likelihood",
    size: 92,
    sortUndefined: "last",
    cell: (info) => <ScoreBadge score={info.getValue()} />,
  }),
  helper.accessor((row) => row.verdict, {
    id: "verdict",
    header: "Verdict",
    size: 96,
    sortUndefined: "last",
    cell: (info) => <VerdictBadge verdict={info.getValue()} />,
  }),
  helper.accessor((row) => row.job.company, {
    id: "company",
    header: "Company",
    size: 200,
    cell: (info) => <span className="truncate font-medium">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.autoFilterReason, {
    id: "autoFilterReason",
    header: "Automatic filter reason",
    size: 320,
    cell: (info) => (
      <span className="truncate text-muted-foreground" title={info.getValue()}>
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  helper.accessor((row) => row.job.title, {
    id: "title",
    header: "Title",
    size: 280,
    cell: (info) => (
      <span className="flex min-w-0 items-center gap-2">
        {info.row.original.isNew ? <NewBadge /> : null}
        <span className="truncate">{info.getValue()}</span>
      </span>
    ),
  }),
  helper.accessor((row) => row.job.location, {
    id: "location",
    header: "Location",
    size: 180,
    cell: (info) => <span className="truncate">{info.getValue() || "—"}</span>,
  }),
  helper.accessor((row) => row.job.arrangement, {
    id: "arrangement",
    header: "Arrangement",
    size: 116,
    sortUndefined: "last",
    cell: (info) => <span className="capitalize">{info.getValue() ?? "—"}</span>,
  }),
  helper.accessor((row) => row.job.durationMonths, {
    id: "duration",
    header: "Duration",
    size: 92,
    sortUndefined: "last",
    cell: (info) => {
      const months = info.getValue();
      return <span className="tabular-nums">{months === undefined ? "—" : `${months} mo`}</span>;
    },
  }),
  helper.accessor((row) => row.job.compensation, {
    id: "pay",
    header: "Pay",
    size: 150,
    sortUndefined: "last",
    cell: (info) => <span className="truncate">{info.getValue() || "—"}</span>,
  }),
  helper.accessor((row) => jobDeadline(row.job), {
    id: "deadline",
    header: "Deadline",
    size: 140,
    sortUndefined: "last",
    cell: (info) => {
      const deadline = info.getValue();
      return (
        <span className={cn("truncate", deadlineToneClasses[deadlineTone(deadline)])}>
          {formatDeadline(deadline)}
        </span>
      );
    },
  }),
  helper.display({
    id: "documents",
    header: "Docs",
    size: 96,
    cell: ({ row }) => <DocumentIcons job={row.original.job} />,
  }),
  helper.accessor((row) => row.job.status, {
    id: "status",
    header: "Status",
    size: 110,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  helper.accessor((row) => row.job.openings, {
    id: "openings",
    header: "Openings",
    size: 88,
    sortUndefined: "last",
    cell: (info) => <span className="tabular-nums">{info.getValue() ?? "—"}</span>,
  }),
]);
