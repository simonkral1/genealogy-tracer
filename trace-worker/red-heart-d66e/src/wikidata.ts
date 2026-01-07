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

/**
 * Query Wikidata for works about a specific entity
 * Returns array of works with metadata
 */
export async function queryWikidataWorks(entityId: string): Promise<WikidataWork[]> {
  return [];
}
