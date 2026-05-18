// Wiki helpers — wikilink extraction and rendering preparation.

// Matches [[node-id]] or [[node-id|Label]]
const WIKILINK_RE = /\[\[([a-zA-Z0-9_\-]+)(?:\|([^\]]+))?\]\]/g;

export interface ParsedWikilink {
  target: string;
  label?: string;
  start: number;
  end: number;
}

export function extractWikilinks(body: string): ParsedWikilink[] {
  const out: ParsedWikilink[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    out.push({
      target: m[1],
      label: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

// Replace [[id]] / [[id|Label]] with [Label](/wiki/id) for downstream markdown rendering.
export function renderWikilinks(body: string): string {
  return body.replace(WIKILINK_RE, (_full, id: string, label?: string) => {
    const text = label ?? id;
    return `[${text}](/wiki/${id})`;
  });
}

// Distinct outgoing wikilink targets, in order of first appearance.
export function uniqueLinkTargets(body: string): string[] {
  const links = extractWikilinks(body);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of links) {
    if (!seen.has(l.target)) {
      seen.add(l.target);
      out.push(l.target);
    }
  }
  return out;
}
