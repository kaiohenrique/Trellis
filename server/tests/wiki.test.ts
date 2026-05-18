import { describe, expect, it } from 'vitest';
import { extractWikilinks, renderWikilinks, uniqueLinkTargets } from '../core/wiki.js';

describe('wiki helpers', () => {
  it('extracts simple wikilinks', () => {
    const links = extractWikilinks('See [[react-pattern]] and [[chain-of-thought|CoT]].');
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ target: 'react-pattern', label: undefined });
    expect(links[1]).toMatchObject({ target: 'chain-of-thought', label: 'CoT' });
  });

  it('renders wikilinks to markdown links', () => {
    const out = renderWikilinks('check [[langchain|LangChain]] and [[autogen]]');
    expect(out).toBe('check [LangChain](/wiki/langchain) and [autogen](/wiki/autogen)');
  });

  it('returns unique link targets in order', () => {
    const targets = uniqueLinkTargets('[[a]] [[b]] [[a|alt]] [[c]]');
    expect(targets).toEqual(['a', 'b', 'c']);
  });

  it('ignores invalid wikilink shapes', () => {
    const links = extractWikilinks('this [is] not [[ a wikilink');
    expect(links).toHaveLength(0);
  });
});
