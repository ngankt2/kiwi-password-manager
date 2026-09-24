export interface ClipboardPort {
  supportsOwnership: boolean;
  write(value: string, seconds: number): Promise<string | null>;
  clearIfOwned(token: string): Promise<boolean>;
}

export class SecureClipboard {
  private token: string | null = null;
  private expires = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly port: ClipboardPort, private readonly now = Date.now) {}
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.catch(() => undefined).then(action);
    this.queue = result;
    return result;
  }
  copy(value: string, seconds = 30): Promise<{ autoClears: boolean }> {
    const generation = ++this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation) return { autoClears: false };
      if (this.timer) clearTimeout(this.timer);
      const token = await this.port.write(value, seconds);
      if (generation !== this.generation) {
        if (token) await this.port.clearIfOwned(token);
        return { autoClears: false };
      }
      this.token = token;
      this.expires = seconds > 0 ? this.now() + seconds * 1000 : 0;
      if (token && this.expires) this.timer = setTimeout(() => { void this.clear().catch(() => undefined); }, seconds * 1000);
      return { autoClears: this.port.supportsOwnership && seconds > 0 };
    });
  }
  async resume() { if (this.expires && this.now() >= this.expires) await this.clear(); }
  clear() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    return this.enqueue(async () => {
      const token = this.token; this.token = null; this.expires = 0;
      if (token) return this.port.clearIfOwned(token);
      return false;
    });
  }
}
