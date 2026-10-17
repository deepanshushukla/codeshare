import { readPersisted, writePersisted } from './persistedState';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('persistedState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns {} when nothing is stored', () => {
    expect(readPersisted()).toEqual({});
  });

  it('returns {} for corrupt JSON instead of throwing', () => {
    localStorage.setItem('codeshare.v2', '{not json');
    expect(readPersisted()).toEqual({});
  });

  it('merges a patch into the existing blob after the debounce fires', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ room: 'abcd-1234' }));
    writePersisted({ theme: 'paper' });
    vi.advanceTimersByTime(400);
    expect(readPersisted()).toEqual({ room: 'abcd-1234', theme: 'paper' });
  });

  it('coalesces two rapid patches into one merged write', () => {
    writePersisted({ theme: 'paper' });
    writePersisted({ hue: 'jade' });
    vi.advanceTimersByTime(400);
    expect(readPersisted()).toEqual({ theme: 'paper', hue: 'jade' });
  });

  it('does not reflect an in-flight patch until the debounce commits it', () => {
    writePersisted({ theme: 'paper' });
    expect(readPersisted()).toEqual({}); // not yet flushed to localStorage
    vi.advanceTimersByTime(400);
    expect(readPersisted()).toEqual({ theme: 'paper' });
  });
});
