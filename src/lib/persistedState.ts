const STORAGE_KEY = 'codeshare.v2';
const DEBOUNCE_MS = 400;

let pendingPatch: Record<string, unknown> = {};
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

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

export function writePersisted(patch: Record<string, unknown>): void {
  // Merge the patch into the pending patch
  pendingPatch = { ...pendingPatch, ...patch };

  // Clear any existing timeout
  if (timeoutHandle !== null) {
    clearTimeout(timeoutHandle);
  }

  // Schedule a write 400ms later
  timeoutHandle = setTimeout(() => {
    try {
      // Read the current blob from storage
      const current = readPersisted();
      // Merge pending patch into current
      const merged = { ...current, ...pendingPatch };
      // Write merged blob back
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Silently fail on storage access error
    }
    // Clear pending patch and timeout handle
    pendingPatch = {};
    timeoutHandle = null;
  }, DEBOUNCE_MS);
}
