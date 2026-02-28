type LoginRateState = {
  failedAttempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const stateByKey = new Map<string, LoginRateState>();

function normalizeKey(input: string): string {
  const value = input.trim();
  return value || "unknown";
}

function getNow() {
  return Date.now();
}

function cleanupOldEntries(now: number) {
  for (const [key, value] of stateByKey.entries()) {
    const stale = now - value.windowStartedAt > LOGIN_WINDOW_MS * 3;
    const blockExpired = value.blockedUntil <= now;
    if (stale && blockExpired) {
      stateByKey.delete(key);
    }
  }
}

export function checkLoginAllowance(keyInput: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = getNow();
  cleanupOldEntries(now);

  const key = normalizeKey(keyInput);
  const current = stateByKey.get(key);
  if (!current || current.blockedUntil <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000))
  };
}

export function recordLoginResult(keyInput: string, success: boolean): void {
  const now = getNow();
  const key = normalizeKey(keyInput);
  const current = stateByKey.get(key);

  if (success) {
    stateByKey.delete(key);
    return;
  }

  if (!current) {
    stateByKey.set(key, {
      failedAttempts: 1,
      windowStartedAt: now,
      blockedUntil: 0
    });
    return;
  }

  if (now - current.windowStartedAt > LOGIN_WINDOW_MS) {
    current.failedAttempts = 1;
    current.windowStartedAt = now;
    current.blockedUntil = 0;
    stateByKey.set(key, current);
    return;
  }

  current.failedAttempts += 1;
  if (current.failedAttempts >= LOGIN_MAX_FAILURES) {
    current.blockedUntil = now + LOGIN_BLOCK_MS;
    current.failedAttempts = 0;
    current.windowStartedAt = now;
  }

  stateByKey.set(key, current);
}
