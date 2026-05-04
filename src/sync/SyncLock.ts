export class SyncLock {
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  async runExclusive<T>(task: () => Promise<T>): Promise<T | null> {
    if (this.running) return null;
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }
}
