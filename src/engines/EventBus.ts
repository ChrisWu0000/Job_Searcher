export type EventPayloadMap = Record<string, unknown>;

export type EventHandler<TPayload> = (payload: TPayload) => void;

export class EventBus<TEvents extends EventPayloadMap> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<never>>>();

  on<TName extends keyof TEvents>(event: TName, handler: EventHandler<TEvents[TName]>): () => void {
    const existing = this.handlers.get(event) ?? new Set<EventHandler<never>>();
    existing.add(handler as EventHandler<never>);
    this.handlers.set(event, existing);
    return () => {
      this.off(event, handler);
    };
  }

  once<TName extends keyof TEvents>(
    event: TName,
    handler: EventHandler<TEvents[TName]>,
  ): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  off<TName extends keyof TEvents>(event: TName, handler: EventHandler<TEvents[TName]>): void {
    const existing = this.handlers.get(event);
    if (!existing) return;
    existing.delete(handler as EventHandler<never>);
    if (existing.size === 0) this.handlers.delete(event);
  }

  emit<TName extends keyof TEvents>(event: TName, payload: TEvents[TName]): void {
    const existing = this.handlers.get(event);
    if (!existing) return;
    for (const handler of [...existing]) {
      (handler as EventHandler<TEvents[TName]>)(payload);
    }
  }

  listenerCount<TName extends keyof TEvents>(event: TName): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
