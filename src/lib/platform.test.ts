import { afterEach, describe, expect, test, vi } from 'vitest';
import { isApplePlatform, runShortcutLabel } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPlatform(platform: string) {
  vi.stubGlobal('navigator', { ...navigator, platform, userAgentData: undefined });
}

describe('platform', () => {
  test('detects macOS and iOS as Apple platforms', () => {
    stubPlatform('MacIntel');
    expect(isApplePlatform()).toBe(true);
    stubPlatform('iPad');
    expect(isApplePlatform()).toBe(true);
  });

  test('treats Windows/Linux as non-Apple', () => {
    stubPlatform('Win32');
    expect(isApplePlatform()).toBe(false);
    stubPlatform('Linux x86_64');
    expect(isApplePlatform()).toBe(false);
  });

  test('labels the Run shortcut with Cmd on a Mac and Ctrl elsewhere', () => {
    stubPlatform('MacIntel');
    expect(runShortcutLabel()).toEqual({ symbol: '⌘↵', text: 'Cmd + Enter' });
    stubPlatform('Win32');
    expect(runShortcutLabel()).toEqual({ symbol: '⌃↵', text: 'Ctrl + Enter' });
  });
});
