// macOS/iOS use Cmd where Windows/Linux use Ctrl. Only used for *labels*: the
// Run shortcut itself accepts either modifier on every platform (see
// RunControls), so a wrong guess here can never break the shortcut.
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function runShortcutLabel(): { symbol: string; text: string } {
  return isApplePlatform() ? { symbol: '⌘↵', text: 'Cmd + Enter' } : { symbol: '⌃↵', text: 'Ctrl + Enter' };
}
