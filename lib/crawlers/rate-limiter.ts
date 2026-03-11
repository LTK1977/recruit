export class RateLimiter {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 2000) {
    this.minIntervalMs = minIntervalMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

export const globalRateLimiter = new RateLimiter(2000);
