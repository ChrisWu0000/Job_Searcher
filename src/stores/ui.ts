import { create } from "zustand";
import type { EngineState } from "@/engines/Engine";
import type { TableName } from "@/lib/db/db";
import type { JobStatus, PageKind, WorkArrangement } from "@/types/job";
import type { EngineName, LogLevel } from "@/types/run";
import type { ScoreVerdict } from "@/types/scoring";

export type NavTab = "jobs" | "queue" | "resume" | "sync" | "inspector" | "settings";

export const navTabs: NavTab[] = ["jobs", "queue", "resume", "sync", "inspector", "settings"];

export type ResumeView = "saved" | "bank" | "template" | "tailored";

export type DocumentRequirement = "resume" | "coverLetter" | "gradeReport" | "prescreen";

export const documentRequirements: DocumentRequirement[] = [
  "resume",
  "coverLetter",
  "gradeReport",
  "prescreen",
];

export const documentRequirementLabels: Record<DocumentRequirement, string> = {
  resume: "Resume",
  coverLetter: "Cover letter",
  gradeReport: "Grade report",
  prescreen: "Prescreen questions",
};

export interface JobFilters {
  search: string;
  statuses: JobStatus[];
  verdicts: ScoreVerdict[];
  countries: string[];
  arrangements: WorkArrangement[];
  minScore?: number;
  minLikelihood?: number;
  durationMonths?: number;
  deadlineWithinHours?: number;
  requiredDocuments: DocumentRequirement[];
  onlyUnscored: boolean;
  onlyNew: boolean;
  showSkipVerdicts: boolean;
  onlyAutoFiltered: boolean;
  excludeWaterloo: boolean;
}

export const emptyJobFilters: JobFilters = {
  search: "",
  statuses: [],
  verdicts: [],
  countries: [],
  arrangements: [],
  requiredDocuments: [],
  onlyUnscored: false,
  onlyNew: false,
  showSkipVerdicts: false,
  onlyAutoFiltered: false,
  excludeWaterloo: false,
};

export interface EngineUiState {
  state: EngineState;
  label?: string;
  completed: number;
  total: number;
  runId?: number;
  startedAt?: string;
  lastError?: string;
}

export const idleEngineUiState: EngineUiState = { state: "idle", completed: 0, total: 0 };

export interface EventLogFilters {
  runId?: number;
  level?: LogLevel;
  engine?: EngineName;
  search: string;
}

export type InspectorView = "tables" | "events" | "captured";

export interface WaterlooWorksPage {
  kind: PageKind;
  jobId?: string;
  url?: string;
  at: string;
}

export interface InspectorTarget {
  table: TableName;
  id: string;
}

export interface SyncOptions {
  forceRefresh: boolean;
  maxPages?: number;
}

export interface ApplyOptions {
  stopOnFailure: boolean;
}

export interface UiStore {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;

  selectedJobId?: string;
  selectJob: (jobId: string | undefined) => void;

  jobDetailOpen: boolean;
  setJobDetailOpen: (open: boolean) => void;

  filters: JobFilters;
  setFilter: <TKey extends keyof JobFilters>(key: TKey, value: JobFilters[TKey]) => void;
  resetFilters: () => void;

  engines: Record<EngineName, EngineUiState>;
  setEngineUi: (engine: EngineName, patch: Partial<EngineUiState>) => void;
  resetEngineUi: (engine: EngineName) => void;

  inspectorView: InspectorView;
  setInspectorView: (view: InspectorView) => void;
  inspectorTable: TableName;
  setInspectorTable: (table: TableName) => void;
  inspectorRecordId?: string;
  setInspectorRecordId: (id: string | undefined) => void;
  inspectorTarget?: InspectorTarget;
  openInspectorTarget: (target: InspectorTarget) => void;
  clearInspectorTarget: () => void;
  eventLogFilters: EventLogFilters;
  setEventLogFilters: (patch: Partial<EventLogFilters>) => void;

  resumeView: ResumeView;
  setResumeView: (view: ResumeView) => void;
  selectedExperienceId?: string;
  selectExperience: (id: string | undefined) => void;
  selectedTailoredResumeId?: string;
  openTailoredResume: (id: string | undefined) => void;

  syncOptions: SyncOptions;
  setSyncOption: <TKey extends keyof SyncOptions>(key: TKey, value: SyncOptions[TKey]) => void;

  applyOptions: ApplyOptions;
  setApplyOption: <TKey extends keyof ApplyOptions>(key: TKey, value: ApplyOptions[TKey]) => void;

  waterlooWorksPage?: WaterlooWorksPage;
  setWaterlooWorksPage: (page: WaterlooWorksPage) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  activeTab: "jobs",
  setActiveTab: (tab) => {
    set({ activeTab: tab });
  },

  selectJob: (jobId) => {
    set({ selectedJobId: jobId, jobDetailOpen: jobId !== undefined });
  },

  jobDetailOpen: false,
  setJobDetailOpen: (open) => {
    set({ jobDetailOpen: open });
  },

  filters: emptyJobFilters,
  setFilter: (key, value) => {
    set((current) => ({ filters: { ...current.filters, [key]: value } }));
  },
  resetFilters: () => {
    set({ filters: emptyJobFilters });
  },

  engines: {
    sync: idleEngineUiState,
    score: idleEngineUiState,
    apply: idleEngineUiState,
    resume: idleEngineUiState,
    system: idleEngineUiState,
  },
  setEngineUi: (engine, patch) => {
    set((current) => ({
      engines: { ...current.engines, [engine]: { ...current.engines[engine], ...patch } },
    }));
  },
  resetEngineUi: (engine) => {
    set((current) => ({ engines: { ...current.engines, [engine]: idleEngineUiState } }));
  },

  inspectorView: "tables",
  setInspectorView: (view) => {
    set({ inspectorView: view });
  },
  inspectorTable: "jobs",
  setInspectorTable: (table) => {
    set({ inspectorTable: table, inspectorRecordId: undefined });
  },
  setInspectorRecordId: (id) => {
    set({ inspectorRecordId: id });
  },
  openInspectorTarget: (target) => {
    set({ activeTab: "inspector", inspectorTarget: target });
  },
  clearInspectorTarget: () => {
    set({ inspectorTarget: undefined });
  },
  eventLogFilters: { search: "" },
  setEventLogFilters: (patch) => {
    set((current) => ({ eventLogFilters: { ...current.eventLogFilters, ...patch } }));
  },

  resumeView: "saved",
  setResumeView: (view) => {
    set({ resumeView: view });
  },
  selectExperience: (id) => {
    set({ selectedExperienceId: id });
  },
  openTailoredResume: (id) => {
    set({
      selectedTailoredResumeId: id,
      ...(id === undefined ? {} : { activeTab: "resume", resumeView: "tailored" }),
    });
  },

  syncOptions: { forceRefresh: false },
  setSyncOption: (key, value) => {
    set((current) => ({ syncOptions: { ...current.syncOptions, [key]: value } }));
  },

  applyOptions: { stopOnFailure: false },
  setApplyOption: (key, value) => {
    set((current) => ({ applyOptions: { ...current.applyOptions, [key]: value } }));
  },

  setWaterlooWorksPage: (page) => {
    set({ waterlooWorksPage: page });
  },
}));
