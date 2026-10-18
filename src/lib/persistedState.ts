const STORAGE_KEY = 'codeshare.v2';
const DEBOUNCE_MS = 400;
// Ceiling on how long a patch can sit unwritten. The 400ms timer resets on
// every call, so a continuous stream of calls (e.g. a keystroke-per-call
// editor persisting `code`) would never let it elapse and nothing would ever
// reach localStorage. Once 2000ms have passed since the first unflushed call
// of the current batch, write regardless of incoming calls.
const MAX_WAIT_MS = 2000;

let pendingPatch: Record<string, unknown> = {};
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
// Timestamp of the first call in the current unflushed batch, or null when
// there is nothing pending.
let batchStartedAt: number | null = null;

export function readPersisted(): Record<string, unknown> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }
    return JSON.parse(stored) as Record<string, unknown>;
  } catch {
    // Return {} on missing key, invalid JSON, or thrown storage access
    return {};
  }
}

// The single place the merge+write happens -- shared by the debounce timer,
// the maxWait ceiling, and flushPersisted().
function commitPending(): void {
  try {
    // Merge the pending patch into the current stored blob and write it back
    const current = readPersisted();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...pendingPatch }));
  } catch {
    // Silently fail on storage access error
  }
  pendingPatch = {};
  timeoutHandle = null;
  batchStartedAt = null;
}

export function writePersisted(patch: Record<string, unknown>): void {
  // Merge the patch into the pending patch
  pendingPatch = { ...pendingPatch, ...patch };

  const now = Date.now();
  if (batchStartedAt === null) {
    batchStartedAt = now;
  }

  // Clear any existing timeout
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
  }

  // Normally wait out the 400ms idle debounce, but never let the batch sit
  // longer than MAX_WAIT_MS past its first call.
  const remainingMaxWait = Math.max(0, batchStartedAt + MAX_WAIT_MS - now);
  const delay = Math.min(DEBOUNCE_MS, remainingMaxWait);

  timeoutHandle = setTimeout(commitPending, delay);
}

// Writes any pending patch immediately instead of waiting out the debounce.
// Call this when the page is about to go away (pagehide) -- otherwise a patch
// still inside the debounce window is lost outright, not merely stale.
export function flushPersisted(): void {
  if (timeoutHandle === null) {
    return;
  }
  clearTimeout(timeoutHandle);
  commitPending();
}
