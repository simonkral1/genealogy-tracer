# Wikidata SPARQL Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Wikidata SPARQL queries to supplement Wikipedia search with structured chronological data about works, authors, and intellectual relationships.

**Architecture:** Add parallel Wikidata queries to the existing /stream endpoint that fetch structured entity data (works about concepts, publication dates, authors, influenced-by relationships). Results are merged with Wikipedia titles and passed to Claude's prompt, enriching genealogies with verified chronological and relational data. Implementation uses Wikidata's public SPARQL endpoint (free, no API key required) with proper error handling and fallbacks.

**Tech Stack:**
- Wikidata Query Service (SPARQL endpoint): https://query.wikidata.org/sparql
- Wikidata Entity Search API: https://www.wikidata.org/w/api.php
- TypeScript (Cloudflare Workers environment)
- Vitest (testing framework)

---

## Task 1: Create Wikidata Module with Type Definitions

**Files:**
- Create: `trace-worker/red-heart-d66e/src/wikidata.ts`
- Create: `trace-worker/red-heart-d66e/src/wikidata.test.ts`

**Step 1: Write type definitions and test structure**

Create `trace-worker/red-heart-d66e/src/wikidata.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: FAIL with "Cannot find module './wikidata'"

**Step 3: Create minimal type definitions**

Create `trace-worker/red-heart-d66e/src/wikidata.ts`:

```typescript
/**
 * Wikidata SPARQL integration for enriching genealogies with structured data
 */

export interface WikidataWork {
  title: string;
  author: string;
  year: string;
  wikidataUrl: string;
}

export interface WikidataEntity {
  id: string;
  label: string;
  description?: string;
}

/**
 * Search for a Wikidata entity by concept name
 * Returns entity ID (e.g., "Q123") or null if not found
 */
export async function searchWikidataEntity(concept: string): Promise<string | null> {
  return null;
}

/**
 * Query Wikidata for works about a specific entity
 * Returns array of works with metadata
 */
export async function queryWikidataWorks(entityId: string): Promise<WikidataWork[]> {
  return [];
}
```

**Step 4: Run test to verify correct failures**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: Tests run but fail on assertions (entity search returns null, works query returns empty array)

**Step 5: Commit**

```bash
git add src/wikidata.ts src/wikidata.test.ts
git commit -m "feat: add Wikidata types and test scaffolding"
```

---

## Task 2: Implement Entity Search

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/wikidata.ts`

**Step 1: Implement searchWikidataEntity function**

Update `trace-worker/red-heart-d66e/src/wikidata.ts`:

```typescript
/**
 * Search for a Wikidata entity by concept name
 * Returns entity ID (e.g., "Q123") or null if not found
 */
export async function searchWikidataEntity(concept: string): Promise<string | null> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(concept)}&language=en&format=json&origin=*`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
      }
    });

    if (!response.ok) {
      console.error(`Wikidata entity search failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { search: WikidataEntity[] };

    if (!data.search || data.search.length === 0) {
      return null;
    }

    // Return the first matching entity ID
    return data.search[0].id;
  } catch (error) {
    console.error('Wikidata entity search error:', error);
    return null;
  }
}
```

**Step 2: Run tests to verify entity search works**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: Entity search tests PASS, works query tests still FAIL

**Step 3: Commit**

```bash
git add src/wikidata.ts
git commit -m "feat: implement Wikidata entity search"
```

---

## Task 3: Implement SPARQL Works Query

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/wikidata.ts`

**Step 1: Implement queryWikidataWorks function**

Update `trace-worker/red-heart-d66e/src/wikidata.ts`:

```typescript
interface SPARQLBinding {
  workLabel?: { value: string };
  date?: { value: string };
  authorLabel?: { value: string };
  work?: { value: string };
}

interface SPARQLResponse {
  results: {
    bindings: SPARQLBinding[];
  };
}

/**
 * Query Wikidata for works about a specific entity
 * Returns array of works with metadata
 */
export async function queryWikidataWorks(entityId: string): Promise<WikidataWork[]> {
  try {
    // SPARQL query to find works about this concept
    const sparqlQuery = `
      SELECT ?work ?workLabel ?date ?authorLabel WHERE {
        ?work wdt:P921 wd:${entityId} .  # main subject is the concept
        OPTIONAL { ?work wdt:P577 ?date . }  # publication date
        OPTIONAL { ?work wdt:P50 ?authorLabel . }  # author
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      ORDER BY ?date
      LIMIT 20
    `;

    const queryUrl = 'https://query.wikidata.org/sparql?query=' +
                     encodeURIComponent(sparqlQuery);

    const response = await fetch(queryUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
      }
    });

    if (!response.ok) {
      console.error(`Wikidata SPARQL query failed: ${response.status}`);
      return [];
    }

    const data = await response.json() as SPARQLResponse;

    if (!data.results || !data.results.bindings) {
      return [];
    }

    // Parse bindings into WikidataWork objects
    return data.results.bindings
      .filter(binding => binding.workLabel?.value) // Must have a title
      .map(binding => ({
        title: binding.workLabel!.value,
        author: binding.authorLabel?.value || 'Unknown',
        year: binding.date?.value?.substring(0, 4) || 'Unknown',
        wikidataUrl: binding.work?.value || ''
      }));

  } catch (error) {
    console.error('Wikidata SPARQL query error:', error);
    return [];
  }
}
```

**Step 2: Run tests to verify all tests pass**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/wikidata.ts
git commit -m "feat: implement Wikidata SPARQL works query"
```

---

## Task 4: Add Integration Tests with Real API

**Files:**
- Create: `trace-worker/red-heart-d66e/src/wikidata.integration.test.ts`

**Step 1: Write integration test file**

Create `trace-worker/red-heart-d66e/src/wikidata.integration.test.ts`:

```typescript
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

  it('should return works about freedom concept', async () => {
    // Q3200035 is the Wikidata ID for "freedom" concept
    const works = await queryWikidataWorks('Q3200035');

    expect(works.length).toBeGreaterThan(0);
    expect(works[0]).toHaveProperty('title');
    expect(works[0]).toHaveProperty('author');
    expect(works[0]).toHaveProperty('year');
    expect(works[0]).toHaveProperty('wikidataUrl');
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
```

**Step 2: Run integration tests**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.integration.test.ts`

Expected: All integration tests PASS (hitting real Wikidata API)

**Step 3: Commit**

```bash
git add src/wikidata.integration.test.ts
git commit -m "test: add Wikidata integration tests with live API"
```

---

## Task 5: Create Combined Search Function

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/wikidata.ts`
- Modify: `trace-worker/red-heart-d66e/src/wikidata.test.ts`

**Step 1: Add test for combined search**

Add to `trace-worker/red-heart-d66e/src/wikidata.test.ts`:

```typescript
describe('getWikidataContext', () => {
  it('should return empty array when entity not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ search: [] })
    } as Response);

    const result = await getWikidataContext('nonexistent');
    expect(result).toEqual([]);
  });

  it('should return works when entity found', async () => {
    global.fetch = vi
      .fn()
      // First call: entity search
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          search: [{ id: 'Q123', label: 'Freedom' }]
        })
      } as Response)
      // Second call: SPARQL query
      .mockResolvedValueOnce({
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

    const result = await getWikidataContext('freedom');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('On Liberty');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: FAIL with "getWikidataContext is not defined"

**Step 3: Implement getWikidataContext**

Add to `trace-worker/red-heart-d66e/src/wikidata.ts`:

```typescript
/**
 * Main function: Get Wikidata context for a concept
 * Combines entity search + works query into single call
 * Returns empty array on any failure (graceful degradation)
 */
export async function getWikidataContext(concept: string): Promise<WikidataWork[]> {
  try {
    // Step 1: Find entity ID for concept
    const entityId = await searchWikidataEntity(concept);

    if (!entityId) {
      return [];
    }

    // Step 2: Query works about that entity
    const works = await queryWikidataWorks(entityId);

    return works;
  } catch (error) {
    console.error('Wikidata context fetch error:', error);
    return [];
  }
}
```

**Step 4: Update exports**

Add to end of `trace-worker/red-heart-d66e/src/wikidata.ts`:

```typescript
// Export the main function for use in worker
export { getWikidataContext };
```

**Step 5: Run tests to verify they pass**

Run: `cd trace-worker/red-heart-d66e && npm test -- wikidata.test.ts`

Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/wikidata.ts src/wikidata.test.ts
git commit -m "feat: add getWikidataContext convenience function"
```

---

## Task 6: Integrate into /stream Endpoint

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/index.ts`

**Step 1: Import Wikidata module**

Add to top of `trace-worker/red-heart-d66e/src/index.ts` (after other imports):

```typescript
import { getWikidataContext, type WikidataWork } from './wikidata';
```

**Step 2: Add parallel Wikidata fetch in /stream endpoint**

Find the Wikipedia search section (around line 214-235) and replace with:

```typescript
controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Querying knowledge sources"}\n\n`));

// Fetch Wikipedia and Wikidata in parallel
const [wikiResults, wikidataResults] = await Promise.all([
  // Wikipedia search (existing)
  (async () => {
    const wikiURL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&format=json&origin=*&srlimit=3';
    let titles: string[] = [];
    try {
      const wikiRes = await fetch(wikiURL, {
        headers: {
          'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
        }
      });
      const wikiText = await wikiRes.text();
      let wikiJson: any = { query: { search: [] } };
      try {
        wikiJson = JSON.parse(wikiText);
      } catch {}
      titles = (wikiJson?.query?.search ?? []).slice(0, 3).map((i: any) => i.title);
    } catch (e) {
      titles = [];
    }
    return titles;
  })(),

  // Wikidata query (new)
  getWikidataContext(query)
]);

const titles = wikiResults;
const wikidataWorks = wikidataResults;
```

**Step 3: Update prompt to include Wikidata works**

Find the prompt construction (around line 240) and update the references section:

```typescript
const prompt = `You are a brilliant intellectual historian tracing the genealogy of "${query}" with scholarly precision and creative insight.

Construct a five-item genealogy revealing how this concept emerged, transformed, and continues to evolve.

Guidelines:
1. Focus on works that fundamentally shifted how people understood this concept
2. Arrange chronologically, showing intellectual evolution and ruptures
3. Each explanation should reveal what made that work revolutionary for its time
4. Keep each explanation under 80 words - be concise and impactful
5. URLs should link to primary sources, key texts, or authoritative encyclopedic entries

Wikipedia references available: ${titles.join(", ")}

${wikidataWorks.length > 0 ? `
Structured data from Wikidata (chronologically ordered works about "${query}"):
${wikidataWorks.slice(0, 10).map((w: WikidataWork) =>
  `- ${w.title} (${w.year}) by ${w.author}`
).join('\n')}
` : ''}

Format your response using XML tags for easy parsing:
```

**Step 4: Test manually with curl**

Run:
```bash
cd trace-worker/red-heart-d66e
npm run dev
```

In another terminal:
```bash
curl -X POST http://localhost:8787/stream \
  -H "Content-Type: application/json" \
  -d '{"query":"freedom"}' \
  -N
```

Expected: Stream events including "Querying knowledge sources" status, followed by genealogy items

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: integrate Wikidata into /stream endpoint"
```

---

## Task 7: Add Wikidata to /reinterpret Endpoint

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/index.ts`

**Step 1: Add Wikidata query to /reinterpret endpoint**

Find the /reinterpret endpoint (around line 856-877) and update Wikipedia search section:

```typescript
controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Searching for alternative perspectives"}\n\n`));

// Fetch alternative sources in parallel
const [wikiResults, wikidataResults] = await Promise.all([
  // Wikipedia search
  (async () => {
    let titles: string[] = [];
    try {
      const wikiURL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
        encodeURIComponent(query) + '&format=json&origin=*&srlimit=5';
      const wikiRes = await fetch(wikiURL, {
        headers: {
          'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
        }
      });
      const wikiText = await wikiRes.text();
      let wikiJson: any = { query: { search: [] } };
      try {
        wikiJson = JSON.parse(wikiText);
      } catch {}
      titles = (wikiJson?.query?.search ?? []).slice(0, 5).map((i: any) => i.title);
    } catch (e) {
      titles = [];
    }
    return titles;
  })(),

  // Wikidata query
  getWikidataContext(query)
]);

const titles = wikiResults;
const wikidataWorks = wikidataResults;
```

**Step 2: Update /reinterpret prompt**

Find the reinterpret prompt (around line 884-897) and add Wikidata section:

```typescript
const prompt = `You are a brilliant intellectual historian providing an ALTERNATIVE GENEALOGY of the concept "${query}".

Here is the ORIGINAL GENEALOGY that was previously constructed:
${existingItems}

Your task: Create a completely different 5-item genealogy that explores alternative aspects, traditions, or intellectual lineages of the same concept. Focus on different approaches, geographic regions, disciplinary perspectives, or historical trajectories.

Guidelines:
- Each explanation should be under 80 words - be concise and impactful
- Focus on works that offer genuinely different perspectives from the original genealogy

Wikipedia references available: ${titles.join(", ")}

${wikidataWorks.length > 0 ? `
Additional chronological sources from Wikidata:
${wikidataWorks.slice(0, 10).map((w: WikidataWork) =>
  `- ${w.title} (${w.year}) by ${w.author}`
).join('\n')}
` : ''}

Format your response using XML tags for easy parsing:
```

**Step 3: Test reinterpret endpoint**

Run:
```bash
curl -X POST http://localhost:8787/reinterpret \
  -H "Content-Type: application/json" \
  -d '{
    "query": "freedom",
    "existingGenealogy": [
      {"title": "Two Treatises of Government", "year": "1689", "claim": "Locke established freedom as natural right"}
    ]
  }' \
  -N
```

Expected: Alternative genealogy stream with Wikidata-informed results

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add Wikidata to /reinterpret endpoint"
```

---

## Task 8: Add Error Handling and Logging

**Files:**
- Modify: `trace-worker/red-heart-d66e/src/wikidata.ts`

**Step 1: Add detailed logging**

Update all functions in `trace-worker/red-heart-d66e/src/wikidata.ts` to include timing logs:

```typescript
export async function searchWikidataEntity(concept: string): Promise<string | null> {
  const startTime = Date.now();
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(concept)}&language=en&format=json&origin=*`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
      }
    });

    if (!response.ok) {
      console.error(`Wikidata entity search failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as { search: WikidataEntity[] };

    if (!data.search || data.search.length === 0) {
      console.log(`[Wikidata] No entity found for "${concept}" (${Date.now() - startTime}ms)`);
      return null;
    }

    const entityId = data.search[0].id;
    console.log(`[Wikidata] Found entity ${entityId} for "${concept}" (${Date.now() - startTime}ms)`);
    return entityId;
  } catch (error) {
    console.error(`[Wikidata] Entity search error for "${concept}":`, error);
    return null;
  }
}

export async function queryWikidataWorks(entityId: string): Promise<WikidataWork[]> {
  const startTime = Date.now();
  try {
    const sparqlQuery = `
      SELECT ?work ?workLabel ?date ?authorLabel WHERE {
        ?work wdt:P921 wd:${entityId} .
        OPTIONAL { ?work wdt:P577 ?date . }
        OPTIONAL { ?work wdt:P50 ?authorLabel . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      ORDER BY ?date
      LIMIT 20
    `;

    const queryUrl = 'https://query.wikidata.org/sparql?query=' +
                     encodeURIComponent(sparqlQuery);

    const response = await fetch(queryUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ConceptTracer/1.0 (contact: simon.kral99@gmail.com)'
      }
    });

    if (!response.ok) {
      console.error(`[Wikidata] SPARQL query failed for ${entityId}: ${response.status}`);
      return [];
    }

    const data = await response.json() as SPARQLResponse;

    if (!data.results || !data.results.bindings) {
      console.log(`[Wikidata] No works found for entity ${entityId} (${Date.now() - startTime}ms)`);
      return [];
    }

    const works = data.results.bindings
      .filter(binding => binding.workLabel?.value)
      .map(binding => ({
        title: binding.workLabel!.value,
        author: binding.authorLabel?.value || 'Unknown',
        year: binding.date?.value?.substring(0, 4) || 'Unknown',
        wikidataUrl: binding.work?.value || ''
      }));

    console.log(`[Wikidata] Found ${works.length} works for entity ${entityId} (${Date.now() - startTime}ms)`);
    return works;

  } catch (error) {
    console.error(`[Wikidata] SPARQL query error for ${entityId}:`, error);
    return [];
  }
}

export async function getWikidataContext(concept: string): Promise<WikidataWork[]> {
  const startTime = Date.now();
  try {
    const entityId = await searchWikidataEntity(concept);

    if (!entityId) {
      return [];
    }

    const works = await queryWikidataWorks(entityId);

    console.log(`[Wikidata] Total context fetch for "${concept}": ${works.length} works (${Date.now() - startTime}ms)`);
    return works;
  } catch (error) {
    console.error(`[Wikidata] Context fetch error for "${concept}":`, error);
    return [];
  }
}
```

**Step 2: Run tests to ensure logging doesn't break functionality**

Run: `cd trace-worker/red-heart-d66e && npm test`

Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/wikidata.ts
git commit -m "feat: add detailed logging to Wikidata queries"
```

---

## Task 9: Add Documentation

**Files:**
- Create: `trace-worker/red-heart-d66e/docs/wikidata-integration.md`

**Step 1: Create documentation file**

Create `trace-worker/red-heart-d66e/docs/wikidata-integration.md`:

```markdown
# Wikidata Integration

## Overview

Concept Tracer integrates Wikidata's structured knowledge graph to supplement Wikipedia search results with verified chronological data about works, authors, and intellectual relationships.

## How It Works

1. **Entity Search**: When a user queries a concept (e.g., "freedom"), we first search Wikidata's entity database to find the corresponding Wikidata ID (e.g., Q3200035)

2. **SPARQL Query**: Using the entity ID, we run a SPARQL query against Wikidata's query service to find:
   - Works that have this concept as their main subject (P921)
   - Publication dates (P577)
   - Authors (P50)

3. **Merge with Wikipedia**: Results are merged with Wikipedia titles and passed to Claude's prompt, enriching genealogies with:
   - Chronological ordering of works
   - Author attribution
   - Links to Wikidata entities

## Example Query

For concept "freedom":

```sparql
SELECT ?work ?workLabel ?date ?authorLabel WHERE {
  ?work wdt:P921 wd:Q3200035 .  # main subject: freedom
  OPTIONAL { ?work wdt:P577 ?date . }
  OPTIONAL { ?work wdt:P50 ?authorLabel . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?date
LIMIT 20
```

## API Endpoints Used

1. **Entity Search**: `https://www.wikidata.org/w/api.php?action=wbsearchentities`
   - Free, no API key required
   - Returns entity IDs matching search term

2. **SPARQL Query**: `https://query.wikidata.org/sparql`
   - Free, public endpoint
   - Returns structured data in JSON format

## Error Handling

All Wikidata functions gracefully degrade:
- If entity not found → returns empty array, continues with Wikipedia only
- If SPARQL query fails → returns empty array, continues with Wikipedia only
- If network error → logs error, continues with Wikipedia only

This ensures Wikidata enhances but never blocks genealogy generation.

## Performance

- Entity search: ~300-500ms
- SPARQL query: ~500-800ms
- Total overhead: ~1-1.5 seconds (queries run in parallel with Wikipedia)

## Testing

### Unit Tests
```bash
npm test -- wikidata.test.ts
```

### Integration Tests (Live API)
```bash
npm test -- wikidata.integration.test.ts
```

### Manual Testing
```bash
# Start dev server
npm run dev

# Test /stream endpoint
curl -X POST http://localhost:8787/stream \
  -H "Content-Type: application/json" \
  -d '{"query":"freedom"}' \
  -N

# Check logs for Wikidata timing info
```

## Future Enhancements

- Query for "influenced by" relationships (P737)
- Include "part of" relationships for philosophical movements (P361)
- Add language variants beyond English
- Cache Wikidata results in KV store
- Add Wikidata entity links in frontend UI
```

**Step 2: Commit**

```bash
mkdir -p trace-worker/red-heart-d66e/docs
git add trace-worker/red-heart-d66e/docs/wikidata-integration.md
git commit -m "docs: add Wikidata integration documentation"
```

---

## Task 10: Update README

**Files:**
- Modify: `README.md` (if exists at repo root)

**Step 1: Check if README exists**

Run: `ls -la README.md`

**Step 2: Create or update README section**

If README exists, add a "Data Sources" section:

```markdown
## Data Sources

Concept Tracer enriches genealogies by querying multiple knowledge sources in parallel:

### Wikipedia
- General encyclopedic coverage
- 3-5 results per query
- Provides article titles and summaries

### Wikidata
- Structured knowledge graph
- SPARQL queries for chronological work data
- Includes authors, publication dates, and relationships
- Free public API with no key required

All sources are queried in parallel to minimize latency. If any source fails, the system gracefully continues with available data.

For implementation details, see [Wikidata Integration Docs](trace-worker/red-heart-d66e/docs/wikidata-integration.md).
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Wikidata as data source"
```

---

## Task 11: Deploy and Test Production

**Files:**
- None (deployment only)

**Step 1: Run full test suite**

Run: `cd trace-worker/red-heart-d66e && npm test`

Expected: All tests PASS

**Step 2: Deploy to Cloudflare**

Run: `cd trace-worker/red-heart-d66e && npm run deploy`

Expected: Successful deployment message with worker URL

**Step 3: Test production endpoint**

Run:
```bash
curl -X POST https://red-heart-d66e.simon-kral.workers.dev/stream \
  -H "Content-Type: application/json" \
  -d '{"query":"truth"}' \
  -N
```

Expected: Streaming genealogy with Wikidata-enriched results

**Step 4: Check Cloudflare logs**

Visit: https://dash.cloudflare.com/workers

Navigate to: red-heart-d66e → Logs

Expected: See `[Wikidata]` log entries showing successful queries

**Step 5: Document deployment**

```bash
git tag -a v1.1.0 -m "Add Wikidata SPARQL integration"
git push origin v1.1.0
```

---

## Success Criteria

- [ ] All unit tests pass (`npm test -- wikidata.test.ts`)
- [ ] All integration tests pass (`npm test -- wikidata.integration.test.ts`)
- [ ] /stream endpoint returns Wikidata-enriched results
- [ ] /reinterpret endpoint uses Wikidata context
- [ ] Graceful degradation when Wikidata unavailable
- [ ] Logs show Wikidata query timing
- [ ] Documentation complete
- [ ] Deployed to production successfully

---

## Rollback Plan

If Wikidata integration causes issues:

```bash
# Revert the integration commits
git revert HEAD~5..HEAD

# Redeploy
cd trace-worker/red-heart-d66e
npm run deploy
```

Or temporarily disable by wrapping getWikidataContext calls:

```typescript
const wikidataWorks = []; // Disable Wikidata temporarily
// const wikidataWorks = await getWikidataContext(query);
```

---

## Estimated Time

- Task 1-3: 30 minutes (types + basic functions)
- Task 4-5: 20 minutes (tests + combined function)
- Task 6-7: 30 minutes (endpoint integration)
- Task 8-9: 20 minutes (logging + docs)
- Task 10-11: 15 minutes (deploy + test)

**Total: ~2 hours**
