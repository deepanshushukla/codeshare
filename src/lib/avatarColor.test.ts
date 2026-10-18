import { expect, it } from 'vitest';
import { avatarColorFor } from './avatarColor';

it('is deterministic for the same userId', () => {
  expect(avatarColorFor('user-123')).toEqual(avatarColorFor('user-123'));
});

it('varies across different userIds', () => {
  const colors = new Set(['a', 'b', 'c', 'd'].map((id) => avatarColorFor(id).bg));
  expect(colors.size).toBeGreaterThan(1);
});
