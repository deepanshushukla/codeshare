import { describe, expect, test } from 'vitest';
import { generateSessionId } from './randomId';

describe('generateSessionId', () => {
  test('defaults to a 10-character lowercase-alphanumeric id', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[a-z0-9]{10}$/);
  });

  test('respects a custom length', () => {
    expect(generateSessionId(4)).toHaveLength(4);
  });

  test('produces different ids across calls', () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});
