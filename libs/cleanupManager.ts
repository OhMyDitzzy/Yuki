import type { FSWatcher } from 'chokidar';

export class CleanupManager {
  private intervals: Set<NodeJS.Timeout> = new Set();
  private timeouts: Set<NodeJS.Timeout> = new Set();
  private watchers: Set<FSWatcher> = new Set();
  private cleanupHandlers: Set<() => void | Promise<void>> = new Set();
  private isShuttingDown: boolean = false;

  addInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  addTimeout(timeout: NodeJS.Timeout): void {
    this.timeouts.add(timeout);
  }

  addWatcher(watcher: FSWatcher): void {
    this.watchers.add(watcher);
  }

  addCleanupHandler(handler: () => void | Promise<void>): void {
    this.cleanupHandlers.add(handler);
  }

  removeInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  /**
   * Remove specific watcher when no longer needed
   */
  removeWatcher(watcher: FSWatcher): void {
    watcher.close();
    this.watchers.delete(watcher);
  }

  async cleanup(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();

    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    await Promise.allSettled(
      Array.from(this.watchers).map(watcher => {
        return new Promise<void>(resolve => {
          watcher.close();
          resolve();
        });
      })
    );
    this.watchers.clear();

    await Promise.allSettled(
      Array.from(this.cleanupHandlers).map(handler => handler())
    );
    this.cleanupHandlers.clear();
  }

  getStats() {
    return {
      intervals: this.intervals.size,
      timeouts: this.timeouts.size,
      watchers: this.watchers.size,
      handlers: this.cleanupHandlers.size
    };
  }
}
