// Login brute-force throttle (TDD 6, open item 8): after MAX_FAILURES failed logins from one
// client within WINDOW_MS, further attempts get 429 until the window ends. A success clears it.
// shortcut: in memory, so per serverless instance (Fluid Compute reuses instances, which keeps it
// useful); move to a DB or KV counter if more than one person ever uses the app.
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

export class LoginThrottle {
  private readonly failures = new Map<
    string,
    { count: number; until: number }
  >();

  constructor(private readonly now: () => number = Date.now) {}

  // Seconds to wait, or 0 when the client may try.
  retryAfter(key: string) {
    const f = this.failures.get(key);
    if (!f || f.until <= this.now()) return 0;
    return f.count >= MAX_FAILURES
      ? Math.ceil((f.until - this.now()) / 1000)
      : 0;
  }

  fail(key: string) {
    const f = this.failures.get(key);
    if (!f || f.until <= this.now()) {
      this.failures.set(key, { count: 1, until: this.now() + WINDOW_MS });
    } else {
      f.count++;
    }
    // Keeps the map small: drop expired entries now and then.
    if (this.failures.size > 1000) {
      for (const [k, v] of this.failures)
        if (v.until <= this.now()) this.failures.delete(k);
    }
  }

  succeed(key: string) {
    this.failures.delete(key);
  }
}
