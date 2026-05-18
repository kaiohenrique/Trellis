import { describe, expect, it } from 'vitest';
import { toTsQuery } from '../core/graph.js';

describe('toTsQuery', () => {
  it('builds a prefix-matched AND query from words', () => {
    expect(toTsQuery('react agents')).toBe('react:* & agents:*');
  });

  it('strips special characters', () => {
    expect(toTsQuery("o'reilly, please!")).toBe('o:* & reilly:* & please:*');
  });

  it('falls back to a safe placeholder for empty input', () => {
    expect(toTsQuery('   ')).toBe('a:*');
  });

  it('lower-cases tokens', () => {
    expect(toTsQuery('ReAct Pattern')).toBe('react:* & pattern:*');
  });
});
