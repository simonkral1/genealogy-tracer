import { describe, it, expect } from 'vitest';
import { searchWikidataEntity, queryWikidataWorks } from './wikidata';

/**
 * Integration tests that hit real Wikidata API
 * Run with: npm test -- wikidata.integration.test.ts
 *
 * These tests verify that our SPARQL queries and entity search
 * work against the live Wikidata endpoint.
 */
describe('Wikidata Integration (Live API)', () => {
  it('should find entity for well-known concept "freedom"', async () => {
    const entityId = await searchWikidataEntity('freedom');
    expect(entityId).toBeTruthy();
    expect(entityId).toMatch(/^Q\d+$/); // Should be Q followed by numbers
  }, 10000); // 10s timeout for API call

  it('should return works array with proper structure', async () => {
    // Q2979 is the Wikidata ID for "liberty" concept
    // Note: Not all concepts have works, so we verify structure rather than requiring results
    const works = await queryWikidataWorks('Q2979');

    expect(Array.isArray(works)).toBe(true);
    // If works exist, verify they have the correct structure
    if (works.length > 0) {
      expect(works[0]).toHaveProperty('title');
      expect(works[0]).toHaveProperty('author');
      expect(works[0]).toHaveProperty('year');
      expect(works[0]).toHaveProperty('wikidataUrl');
    }
  }, 10000); // 10s timeout for SPARQL query

  it('should handle concept with no works gracefully', async () => {
    // Q123 is a minimal entity unlikely to have many works
    const works = await queryWikidataWorks('Q123');
    expect(Array.isArray(works)).toBe(true);
  }, 10000);

  it('should return null for nonexistent concept', async () => {
    const entityId = await searchWikidataEntity('xyznonexistentconceptabc123');
    expect(entityId).toBeNull();
  }, 10000);
});
