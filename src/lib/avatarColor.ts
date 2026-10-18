/**
 * Generate a deterministic avatar color pair for a given userId.
 * Uses a simple string hash to map to hue, then returns OKLCH colors
 * with consistent lightness, chroma, and the hashed hue.
 */
export function avatarColorFor(userId: string): { bg: string; ink: string } {
  // Generate a simple hash from the userId string
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Map hash to hue range [0, 360)
  const hue = Math.abs(hash) % 360;

  return {
    bg: `oklch(0.8 0.14 ${hue})`,
    ink: `oklch(0.22 0.05 ${hue})`,
  };
}
