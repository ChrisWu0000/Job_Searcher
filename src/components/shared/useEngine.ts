import { useEffect, useState, useSyncExternalStore } from "react";
import type { EngineState, LogEvent, ObservableEngine } from "@/engines/Engine";
import { type EngineKind, engineRegistry } from "@/engines/registry";

export type { EngineKind, ObservableEngine };

export interface EngineView<TProgress> {
  state: EngineState;
  progress: TProgress | undefined;
  logs: LogEvent[];
  lastError: Error | undefined;
}

const maxRetainedLogs = 50;

function snapshot<TProgress>(
  engine: ObservableEngine<TProgress> | undefined,
): EngineView<TProgress> {
  return {
    state: engine?.state ?? "idle",
    progress: engine?.progress,
    logs: [],
    lastError: engine?.lastError,
  };
}

export function useEngine<TProgress>(
  engine: ObservableEngine<TProgress> | undefined,
): EngineView<TProgress> {
  const [view, setView] = useState<EngineView<TProgress>>(() => snapshot(engine));

  useEffect(() => {
    setView(snapshot(engine));
    if (!engine) return;
    const unsubscribeState = engine.onState((state) => {
      setView((current) => ({ ...current, state, lastError: engine.lastError }));
    });
    const unsubscribeProgress = engine.onProgress((progress) => {
      setView((current) => ({ ...current, progress }));
    });
    const unsubscribeLog = engine.onLog((event) => {
      setView((current) => ({
        ...current,
        logs: [...current.logs, event].slice(-maxRetainedLogs),
      }));
    });
    return () => {
      unsubscribeState();
      unsubscribeProgress();
      unsubscribeLog();
    };
  }, [engine]);

  return view;
}

export function useRegisteredEngine<TProgress>(
  kind: EngineKind,
): ObservableEngine<TProgress> | undefined {
  return useSyncExternalStore(
    (onStoreChange) => engineRegistry.subscribe(onStoreChange),
    () => engineRegistry.get<TProgress>(kind),
    () => undefined,
  );
}
