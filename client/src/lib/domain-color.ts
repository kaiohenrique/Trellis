// Deterministic color derived from a domain id, used when a domain has no
// explicit `color` set. Same input always yields the same hue/saturation/lightness.
//
// Pair of values returned:
//   - fg: a saturated mid-light color for badge text and graph nodes
//   - bg: a very pale tint of the same hue for badge background

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function hashedColor(id: string): string {
  const hue = hashString(id) % 360;
  return `hsl(${hue}, 55%, 38%)`;
}

// Given an explicit hex color (or null/undefined), return { fg, bg } values
// suitable for a domain badge. fg = the color itself; bg = a very pale tint.
export function domainBadgeColors(color: string | null | undefined, id: string): { fg: string; bg: string } {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    // Build a 12% pale tint by mixing the color with white.
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.88);
    const bg = `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    return { fg: color, bg };
  }
  const hue = hashString(id) % 360;
  return {
    fg: `hsl(${hue}, 55%, 38%)`,
    bg: `hsl(${hue}, 70%, 96%)`,
  };
}
