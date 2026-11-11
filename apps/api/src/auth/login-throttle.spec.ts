import { LoginThrottle, MAX_FAILURES, WINDOW_MS } from './login-throttle.js';

describe('LoginThrottle', () => {
  let t = 0;
  const throttle = () => new LoginThrottle(() => t);
  beforeEach(() => {
    t = 1_000_000;
  });

  it('blocks after the maximum failures until the window ends', () => {
    const lt = throttle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) lt.fail('ip');
    expect(lt.retryAfter('ip')).toBe(0);
    lt.fail('ip');
    expect(lt.retryAfter('ip')).toBe(WINDOW_MS / 1000);
    expect(lt.retryAfter('other')).toBe(0);
    t += WINDOW_MS;
    expect(lt.retryAfter('ip')).toBe(0);
  });

  it('starts a new window after expiry and clears on success', () => {
    const lt = throttle();
    for (let i = 0; i < MAX_FAILURES; i++) lt.fail('ip');
    t += WINDOW_MS;
    lt.fail('ip');
    expect(lt.retryAfter('ip')).toBe(0);
    for (let i = 0; i < MAX_FAILURES; i++) lt.fail('ip');
    expect(lt.retryAfter('ip')).toBeGreaterThan(0);
    lt.succeed('ip');
    expect(lt.retryAfter('ip')).toBe(0);
  });
});
