type Handler<T> = (payload: T) => void;

/** Small typed event emitter. Handler errors are isolated from each other. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    (this.handlers[event] ??= new Set()).add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers[event]?.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const handler of [...(this.handlers[event] ?? [])]) {
      try {
        handler(payload);
      } catch (e) {
        queueMicrotask(() => {
          throw e;
        });
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
