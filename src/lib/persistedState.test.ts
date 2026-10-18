import { flushPersisted, readPersisted, writePersisted } from './persistedState';
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

  it('flushPersisted writes a pending patch immediately, without the timer', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ room: 'abcd-1234' }));
    writePersisted({ theme: 'paper' });
    expect(readPersisted()).toEqual({ room: 'abcd-1234' }); // still in-flight

    flushPersisted(); // no advanceTimersByTime
    expect(readPersisted()).toEqual({ room: 'abcd-1234', theme: 'paper' });
  });

  it('flushPersisted is a no-op when nothing is pending', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ room: 'abcd-1234' }));
    expect(() => flushPersisted()).not.toThrow();
    expect(readPersisted()).toEqual({ room: 'abcd-1234' });
  });

  it('forces a write after maxWait even if calls keep resetting the debounce', () => {
    // Every call is 300ms apart -- inside the 400ms debounce -- so the idle
    // timer never elapses on its own and without a maxWait ceiling nothing
    // would ever be written.
    writePersisted({ n: 0 });
    for (let i = 1; i <= 6; i += 1) {
      vi.advanceTimersByTime(300);
      writePersisted({ n: i });
    }
    // t = 1800ms: still nothing committed.
    expect(readPersisted()).toEqual({});

    // Crossing t = 2000ms (2000ms after the FIRST unflushed call) forces it.
    vi.advanceTimersByTime(300);
    expect(readPersisted()).toEqual({ n: 6 });
  });
});
