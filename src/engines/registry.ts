import type { ObservableEngine } from "./Engine";

export type EngineKind = "sync" | "score" | "apply" | "resume";

export type RegisteredEngine = ObservableEngine<never>;

export type EngineSnapshot = {
  [TKind in EngineKind]?: RegisteredEngine;
};

class EngineRegistry {
  private snapshot: EngineSnapshot = {};
  private readonly listeners = new Set<() => void>();

  get<TProgress>(kind: EngineKind): ObservableEngine<TProgress> | undefined {
    return this.snapshot[kind];
  }

  set<TProgress>(kind: EngineKind, engine: ObservableEngine<TProgress>): void {
    const erased = engine as RegisteredEngine;
    if (this.snapshot[kind] === erased) return;
    this.snapshot = { ...this.snapshot, [kind]: erased };
    this.notify();
  }

  clear(kind: EngineKind): void {
    if (this.snapshot[kind] === undefined) return;
    const next = { ...this.snapshot };
    delete next[kind];
    this.snapshot = next;
    this.notify();
  }

  clearAll(): void {
    if (Object.keys(this.snapshot).length === 0) return;
    this.snapshot = {};
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshot;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export const engineRegistry = new EngineRegistry();
