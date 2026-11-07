export type SessionType = 'web' | 'react';

export function isSessionType(value: string): value is SessionType {
  return value === 'web' || value === 'react';
}
