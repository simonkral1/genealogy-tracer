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
