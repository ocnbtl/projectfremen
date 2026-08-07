import type { ClockHealth, HybridLogicalClock } from "./types";

const MAX_COUNTER = 2_147_483_647;
const CLOCK_WARNING_MS = 2 * 60 * 1000;
const CLOCK_BLOCK_MS = 15 * 60 * 1000;

export function compareHlc(left: HybridLogicalClock, right: HybridLogicalClock): number {
  if (left.wallMs !== right.wallMs) return left.wallMs < right.wallMs ? -1 : 1;
  if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
  return left.deviceId.localeCompare(right.deviceId);
}

export function tickHlc(
  previous: HybridLogicalClock | null,
  deviceId: string,
  physicalWallMs = Date.now()
): HybridLogicalClock {
  if (!Number.isSafeInteger(physicalWallMs) || physicalWallMs < 0) throw new Error("Physical clock value is invalid");
  if (!previous || physicalWallMs > previous.wallMs) return { wallMs: physicalWallMs, counter: 0, deviceId };
  if (previous.counter >= MAX_COUNTER) return { wallMs: previous.wallMs + 1, counter: 0, deviceId };
  return { wallMs: previous.wallMs, counter: previous.counter + 1, deviceId };
}

export function receiveHlc(
  local: HybridLogicalClock | null,
  remote: HybridLogicalClock,
  deviceId: string,
  physicalWallMs = Date.now()
): HybridLogicalClock {
  const localWall = local?.wallMs ?? 0;
  const wallMs = Math.max(physicalWallMs, localWall, remote.wallMs);
  let counter = 0;
  if (local && wallMs === local.wallMs && wallMs === remote.wallMs) counter = Math.max(local.counter, remote.counter) + 1;
  else if (local && wallMs === local.wallMs) counter = local.counter + 1;
  else if (wallMs === remote.wallMs) counter = remote.counter + 1;
  if (counter > MAX_COUNTER) return { wallMs: wallMs + 1, counter: 0, deviceId };
  return { wallMs, counter, deviceId };
}

export function serializeHlc(clock: HybridLogicalClock): string {
  return `${clock.wallMs.toString().padStart(16, "0")}-${clock.counter.toString().padStart(10, "0")}-${clock.deviceId}`;
}

export function parseHlc(value: string): HybridLogicalClock | null {
  const match = /^(\d{16})-(\d{10})-([A-Za-z0-9-]{8,80})$/.exec(value);
  if (!match) return null;
  const wallMs = Number(match[1]);
  const counter = Number(match[2]);
  return Number.isSafeInteger(wallMs) && Number.isSafeInteger(counter)
    ? { wallMs, counter, deviceId: match[3] }
    : null;
}

export function assessClockHealth(localWallMs: number, serverDateHeader: string | null): ClockHealth {
  const serverWallMs = serverDateHeader ? Date.parse(serverDateHeader) : Number.NaN;
  const observedAt = new Date(localWallMs).toISOString();
  if (!Number.isFinite(serverWallMs)) {
    return {
      state: "warning",
      observedAt,
      localWallMs,
      serverWallMs: localWallMs,
      skewMs: 0,
      adjustedWallMs: localWallMs,
      orderingSafe: false,
      reason: "Server time is unavailable. Offline edits remain ordered by the last HLC and device counter until reconnection."
    };
  }
  const skewMs = localWallMs - serverWallMs;
  const magnitude = Math.abs(skewMs);
  if (magnitude >= CLOCK_BLOCK_MS) {
    return {
      state: "blocked",
      observedAt,
      localWallMs,
      serverWallMs,
      skewMs,
      adjustedWallMs: serverWallMs,
      orderingSafe: true,
      reason: "Device time differs from server time by at least 15 minutes. Ordering is corrected with authenticated server time; fix the device clock before relying on long offline periods."
    };
  }
  if (magnitude >= CLOCK_WARNING_MS) {
    return {
      state: "warning",
      observedAt,
      localWallMs,
      serverWallMs,
      skewMs,
      adjustedWallMs: serverWallMs,
      orderingSafe: true,
      reason: "Device time differs from server time by at least 2 minutes. Ordering is corrected with authenticated server time."
    };
  }
  return {
    state: "healthy",
    observedAt,
    localWallMs,
    serverWallMs,
    skewMs,
    adjustedWallMs: serverWallMs,
    orderingSafe: true,
    reason: "Device and server clocks are within the expected two-minute window."
  };
}
