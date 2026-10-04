interface Deletable {
  delete(): void;
  isDeleted?(): boolean;
}

let live = 0;

/** Number of tracked OpenCV objects not yet released. Used by the soak test. */
export function liveMatCount(): number {
  return live;
}

/**
 * Tracks OpenCV objects so they are always released, including when an
 * exception is thrown halfway through a pipeline.
 */
export class MatScope {
  private items: Deletable[] = [];

  track<T extends Deletable>(item: T): T {
    this.items.push(item);
    live++;
    return item;
  }

  /** Stops tracking an object so it outlives the scope. The caller must delete it. */
  release<T extends Deletable>(item: T): T {
    const i = this.items.indexOf(item);
    if (i >= 0) {
      this.items.splice(i, 1);
      live--;
    }
    return item;
  }

  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      try {
        if (!item.isDeleted?.()) item.delete();
      } catch {
        // Already freed; nothing else to do.
      }
      live--;
    }
    this.items = [];
  }
}

/** Runs `fn` with a scope that is disposed on every code path. */
export function withScope<R>(fn: (scope: MatScope) => R): R {
  const scope = new MatScope();
  try {
    return fn(scope);
  } finally {
    scope.dispose();
  }
}
