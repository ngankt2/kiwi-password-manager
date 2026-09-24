import type { Settings } from './settings';

export class AutoLockPolicy {
  private backgroundAt: number | null = null;
  private lastActivity: number;
  private armed = true;
  constructor(private settings: Settings, private readonly lock: () => void, private readonly now = Date.now) { this.lastActivity = now(); }
  configure(settings: Settings) { this.settings = settings; }
  reset() {
    this.armed = true;
    this.lastActivity = this.now();
    if (this.backgroundAt !== null) this.backgroundAt = this.now();
  }
  activity() { if (this.backgroundAt === null) this.lastActivity = this.now(); }
  background() {
    // Blur, hide and minimize can describe the same departure. Only the first
    // event starts the deadline; later events must never extend it.
    this.backgroundAt ??= this.now();
    this.tick();
  }
  foreground() {
    if (this.backgroundAt === null) return;
    // Check the wall-clock deadline before accepting new activity, including
    // when a browser or the operating system suspended JavaScript timers.
    this.tick();
    this.backgroundAt = null;
    this.activity();
  }
  tick() {
    const limit = this.backgroundAt === null ? this.settings.autoLockSeconds : this.settings.backgroundLockSeconds;
    const since = this.backgroundAt ?? this.lastActivity;
    if (this.armed && limit >= 0 && this.now() - since >= limit * 1000) {
      this.armed = false;
      this.lock();
    }
  }
  deviceLocked() { this.armed = false; this.lock(); }
}
