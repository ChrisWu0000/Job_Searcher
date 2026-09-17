import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseEngine, type EngineState, type LogEvent } from "@/engines/Engine";
import { EventBus } from "@/engines/EventBus";
import { db, tableNames } from "@/lib/db/db";
import { sleep } from "@/lib/time";
import type { EngineName, RunKind } from "@/types/run";

interface CountProgress {
  completed: number;
  total: number;
}

class CountingEngine extends BaseEngine<CountProgress> {
  readonly engine: EngineName = "sync";
  readonly runKind: RunKind = "sync";
  completed = 0;

  constructor(private readonly total: number) {
    super();
  }

  protected override runSummary(): Record<string, unknown> {
    return { completed: this.completed };
  }

  protected async execute(): Promise<void> {
    for (let step = 0; step < this.total; step += 1) {
      await this.assertRunning();
      this.completed += 1;
      this.emitProgress({ completed: this.completed, total: this.total });
      await sleep(1);
    }
    await this.log("info", "counted everything");
  }
}

class FailingEngine extends BaseEngine<CountProgress> {
  readonly engine: EngineName = "score";
  readonly runKind: RunKind = "score";

  protected async execute(): Promise<void> {
    throw new Error("upstream refused the request");
  }
}

async function whenRunning(engine: CountingEngine): Promise<void> {
  await vi.waitFor(() => {
    expect(engine.completed).toBeGreaterThan(0);
  });
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
});

describe("EventBus", () => {
  it("delivers payloads to every subscriber and unsubscribes cleanly", () => {
    const bus = new EventBus<{ tick: number }>();
    const seen: number[] = [];
    const unsubscribe = bus.on("tick", (value) => seen.push(value));
    bus.on("tick", (value) => seen.push(value * 10));

    bus.emit("tick", 1);
    expect(seen).toEqual([1, 10]);
    expect(bus.listenerCount("tick")).toBe(2);

    unsubscribe();
    bus.emit("tick", 2);
    expect(seen).toEqual([1, 10, 20]);

    bus.clear();
    bus.emit("tick", 3);
    expect(seen).toEqual([1, 10, 20]);
  });

  it("fires a once handler a single time", () => {
    const bus = new EventBus<{ done: string }>();
    const seen: string[] = [];
    bus.once("done", (value) => seen.push(value));
    bus.emit("done", "first");
    bus.emit("done", "second");
    expect(seen).toEqual(["first"]);
  });
});

describe("BaseEngine", () => {
  it("records a run, emits progress, and finishes", async () => {
    const engine = new CountingEngine(3);
    const states: EngineState[] = [];
    const progress: CountProgress[] = [];
    engine.onState((state) => states.push(state));
    engine.onProgress((value) => progress.push(value));

    await engine.start();

    expect(progress).toHaveLength(3);
    expect(states).toEqual(["running", "stopped"]);
    expect(engine.state).toBe("stopped");

    const runs = await db.runs.toArray();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("done");
    expect(runs[0]?.summary).toEqual({ completed: 3 });
    expect(await db.events.count()).toBe(2);
  });

  it("stops between steps and marks the run stopped", async () => {
    const engine = new CountingEngine(50);
    const running = engine.start();
    await whenRunning(engine);
    engine.stop();
    await running;

    expect(engine.completed).toBeLessThan(50);
    expect(engine.state).toBe("stopped");
    expect((await db.runs.toArray())[0]?.status).toBe("stopped");
  });

  it("holds at a pause gate until resumed", async () => {
    const engine = new CountingEngine(50);
    const running = engine.start();
    await whenRunning(engine);
    engine.pause();
    const pausedAt = engine.completed;
    await sleep(15);
    expect(engine.state).toBe("paused");
    expect(engine.completed).toBeLessThanOrEqual(pausedAt + 1);

    engine.resume();
    await vi.waitFor(() => {
      expect(engine.completed).toBeGreaterThan(pausedAt);
    });
    engine.stop();
    await running;
  });

  it("captures a failure without throwing to the caller", async () => {
    const engine = new FailingEngine();
    const logs: LogEvent[] = [];
    engine.onLog((event) => logs.push(event));

    await engine.start();

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toBe("upstream refused the request");
    expect(logs.some((entry) => entry.level === "error")).toBe(true);
    const run = (await db.runs.toArray())[0];
    expect(run?.status).toBe("failed");
    expect(run?.summary).toMatchObject({ error: "upstream refused the request" });
  });
});
