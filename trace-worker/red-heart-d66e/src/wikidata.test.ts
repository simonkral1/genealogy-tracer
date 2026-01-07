import { describe, it, expect, vi } from 'vitest';
import { searchWikidataEntity, queryWikidataWorks, WikidataWork } from './wikidata';

describe('Wikidata Integration', () => {
  describe('searchWikidataEntity', () => {
    it('should return null when no entity found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ search: [] })
      } as Response);

      const result = await searchWikidataEntity('nonexistent concept xyz');
      expect(result).toBeNull();
    });

    it('should return entity ID when found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          search: [{ id: 'Q123', label: 'Freedom' }]
        })
      } as Response);

      const result = await searchWikidataEntity('freedom');
      expect(result).toBe('Q123');
    });
  });

  describe('queryWikidataWorks', () => {
    it('should return empty array when query fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      } as Response);

      const result = await queryWikidataWorks('Q123');
      expect(result).toEqual([]);
    });

    it('should parse SPARQL results correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: {
            bindings: [
              {
                workLabel: { value: 'On Liberty' },
                date: { value: '1859-01-01T00:00:00Z' },
                authorLabel: { value: 'John Stuart Mill' },
                work: { value: 'http://www.wikidata.org/entity/Q123456' }
              }
            ]
          }
        })
      } as Response);

      const result = await queryWikidataWorks('Q123');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        title: 'On Liberty',
        author: 'John Stuart Mill',
        year: '1859',
        wikidataUrl: 'http://www.wikidata.org/entity/Q123456'
      });
    });
  });
});
