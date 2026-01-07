# Wikidata SPARQL Integration

## Overview

This module integrates Wikidata's SPARQL query service to enrich concept genealogies with structured scholarly metadata. It discovers academic works (papers, books, articles) that focus on specific concepts.

## Architecture

### Components

1. **Entity Search** (`searchWikidataEntity`)
   - Searches for Wikidata entities by concept name
   - Uses Wikidata's entity search API
   - Returns entity ID (e.g., "Q123") or null

2. **SPARQL Query** (`queryWikidataWorks`)
   - Queries for works about a specific entity
   - Uses Wikidata's SPARQL endpoint
   - Returns structured work metadata

3. **Main Interface** (`getWikidataContext`)
   - Combines search + query into single call
   - Graceful degradation on failures
   - Returns empty array on errors

### Data Flow

```
concept (string)
  |
  v
searchWikidataEntity()
  |
  v
entity ID (Q123)
  |
  v
queryWikidataWorks()
  |
  v
WikidataWork[]
```

## Usage

### Basic Usage

```typescript
import { getWikidataContext } from './wikidata';

const works = await getWikidataContext('freedom');
// Returns: WikidataWork[] with papers about freedom
```

### Response Format

```typescript
interface WikidataWork {
  title: string;        // Work title
  author: string;       // Author name (or "Unknown")
  year: string;         // Publication year (or "Unknown")
  wikidataUrl: string;  // Wikidata entity URL
}
```

### Example Response

```typescript
[
  {
    title: "On Liberty",
    author: "John Stuart Mill",
    year: "1859",
    wikidataUrl: "http://www.wikidata.org/entity/Q333634"
  }
]
```

## Implementation Details

### SPARQL Query

The module uses this SPARQL query to find works:

```sparql
SELECT ?work ?workLabel ?date ?authorLabel WHERE {
  ?work wdt:P921 wd:Q123 .  # main subject is the concept
  OPTIONAL { ?work wdt:P577 ?date . }  # publication date
  OPTIONAL { ?work wdt:P50 ?authorLabel . }  # author
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?date
LIMIT 20
```

### Error Handling

- All functions return gracefully on errors (null or empty array)
- Network failures are logged but don't throw
- Invalid responses are handled safely
- Rate limits respected via User-Agent header

### Performance

- Entity search: ~200-500ms
- SPARQL query: ~500-1000ms
- Total latency: ~700-1500ms per concept
- Results limited to 20 works per concept

## Testing

### Unit Tests

Mock external APIs to test logic:

```bash
npm test src/wikidata.test.ts
```

### Integration Tests

Test against live Wikidata API:

```bash
npm test src/wikidata.integration.test.ts
```

**Note:** Integration tests make real API calls and will fail without network access.

## API Endpoints Used

1. **Entity Search**
   - Endpoint: `https://www.wikidata.org/w/api.php`
   - Action: `wbsearchentities`
   - Rate limit: Respects User-Agent header

2. **SPARQL Query**
   - Endpoint: `https://query.wikidata.org/sparql`
   - Format: JSON
   - Rate limit: ~60 queries/minute recommended

## Future Enhancements

Potential improvements:

1. **Caching** - Cache entity IDs and SPARQL results
2. **Batch Queries** - Query multiple concepts in parallel
3. **Extended Metadata** - Add citations, DOIs, abstracts
4. **Filtering** - Filter by publication type, date range
5. **Ranking** - Score works by relevance or citations
6. **Fallbacks** - Try alternative entity matches if first fails

## Troubleshooting

### Common Issues

**No results returned:**
- Concept may not exist in Wikidata
- Concept may have no scholarly works tagged
- Check entity search returns valid ID

**Slow queries:**
- SPARQL endpoint may be under load
- Consider implementing caching
- Check network latency

**Rate limiting:**
- Reduce query frequency
- Implement backoff strategy
- Cache results aggressively

## References

- [Wikidata API Documentation](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [SPARQL Tutorial](https://www.wikidata.org/wiki/Wikidata:SPARQL_tutorial)
- [Wikidata Property List](https://www.wikidata.org/wiki/Wikidata:List_of_properties)
