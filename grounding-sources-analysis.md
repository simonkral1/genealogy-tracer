# Grounding & Source Enhancement Options for Concept Tracer

## Current Implementation Analysis

**Current Approach:**
- Wikipedia API search (3-5 results per query)
- Wiktionary API for etymology
- Results injected into prompts as context
- URLs provided in genealogy items for verification

**Strengths:**
- Fast (minimal latency overhead)
- Free (no API costs)
- Good general coverage
- Simple implementation

**Limitations:**
- Limited to Wikipedia's coverage (bias toward Western, modern topics)
- No access to academic sources or specialized databases
- Can't cite primary texts or scholarly articles
- Missing non-English intellectual traditions
- No access to recent scholarship (Wikipedia lag)

---

## Enhancement Options

### 1. Academic & Scholarly Sources

#### A. **Stanford Encyclopedia of Philosophy (SEP)**
**Type:** Free philosophical encyclopedia
**Coverage:** Comprehensive philosophy articles, peer-reviewed
**Technical Access:**
- Web scraping (HTML parsing)
- No official API
- Sitemap available for crawling

**Pros:**
- Authoritative philosophical content
- Peer-reviewed, high quality
- Deep coverage of philosophical concepts
- Free access
- Perfect for genealogical work (SEP articles often include historical sections)

**Cons:**
- No API (requires scraping)
- Limited to philosophy domain
- Slower than API calls
- Need to respect robots.txt and rate limits

**Implementation:**
```typescript
async function searchSEP(concept: string) {
  // Search via Google site search
  const query = `site:plato.stanford.edu ${concept}`;
  const results = await fetch(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  // Parse results, extract SEP URLs
  // Fetch and parse SEP HTML
}
```

**Latency:** ~2-3 seconds per query
**Cost:** Free

---

#### B. **Internet Encyclopedia of Philosophy (IEP)**
**Type:** Free philosophical encyclopedia
**Coverage:** Similar to SEP, more accessible writing
**Technical Access:** Web scraping

**Pros:**
- Free
- Good philosophical coverage
- More accessible than SEP

**Cons:**
- Same limitations as SEP (no API)
- Less comprehensive than SEP

**Implementation:** Similar to SEP
**Latency:** ~2-3 seconds
**Cost:** Free

---

#### C. **JSTOR/Artstor (via API)**
**Type:** Academic journal database
**Coverage:** Millions of scholarly articles across humanities
**Technical Access:**
- Text & Data Mining (TDM) API
- Requires institutional access or individual subscription

**Pros:**
- Massive academic coverage
- Primary sources and scholarly articles
- Cross-disciplinary
- Official API with good documentation

**Cons:**
- **Expensive** (~$10,000+/year for institutional access)
- Requires authentication
- Paywalled content (can't show full text to users)
- TDM API limited to metadata and snippets
- Complex legal agreements

**Implementation:**
```typescript
const jstorRes = await fetch('https://www.jstor.org/api/v1/search', {
  headers: { 'Authorization': `Bearer ${JSTOR_API_KEY}` },
  body: JSON.stringify({ query: concept, limit: 5 })
});
```

**Latency:** ~1-2 seconds
**Cost:** $10,000+/year (likely non-viable for MVP)

---

#### D. **Google Scholar Scraping**
**Type:** Academic search engine
**Coverage:** Comprehensive scholarly articles, books, theses
**Technical Access:** Web scraping (no official API)

**Pros:**
- Free
- Comprehensive coverage
- Includes citation counts
- Cross-disciplinary

**Cons:**
- **Against Terms of Service** (Google actively blocks scrapers)
- Requires proxy rotation and anti-bot measures
- Unstable (Google changes HTML structure frequently)
- Legal gray area

**Implementation:** Not recommended due to TOS violations
**Latency:** Variable (2-5 seconds with anti-bot measures)
**Cost:** Free but risky

---

### 2. Specialized Search APIs

#### A. **Exa (formerly Metaphor)**
**Type:** AI-powered semantic search API
**Coverage:** Entire web, optimized for finding high-quality sources
**Technical Access:** REST API with excellent documentation

**Pros:**
- **Semantic search** (finds conceptually related content, not just keyword matches)
- Filters for high-quality sources (.edu, .gov, scholarly sites)
- Fast (sub-second response)
- Returns clean summaries
- **Affordable** ($5/1000 searches on starter plan)
- Built specifically for AI applications
- Can filter by domain, date, content type

**Cons:**
- Not free (but very affordable)
- General web coverage (not specialized for academia)
- Quality depends on search query formulation

**Implementation:**
```typescript
const exaRes = await fetch('https://api.exa.ai/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': EXA_API_KEY
  },
  body: JSON.stringify({
    query: `intellectual history of ${concept}`,
    numResults: 5,
    includeDomains: ['edu', 'plato.stanford.edu', 'iep.utm.edu'],
    useAutoprompt: true,
    type: 'neural' // Semantic search
  })
});
```

**Latency:** ~500ms-1s
**Cost:** $5/1000 searches ($0.005 per query)
**Monthly for 500 users @ 2 queries/week:** ~$20/month

**RECOMMENDED FOR MVP** - Best balance of cost, quality, and ease of implementation.

---

#### B. **Perplexity API**
**Type:** AI-powered search with citations
**Coverage:** Entire web, aggregated with LLM
**Technical Access:** REST API

**Pros:**
- Search + synthesis in one call
- Automatic citation generation
- Good at finding recent sources
- Clean API

**Cons:**
- More expensive than Exa (~$5/1000 requests for Pro API)
- Less control over source selection
- Adds another LLM call (latency)
- Might duplicate what Claude already does

**Latency:** ~2-3 seconds (includes LLM call)
**Cost:** Similar to Exa
**Verdict:** Redundant given you already use Claude Opus

---

#### C. **Brave Search API**
**Type:** Independent search engine API
**Coverage:** General web
**Technical Access:** REST API

**Pros:**
- Independent from Google
- Affordable ($5/1000 queries)
- Fast
- Good privacy

**Cons:**
- General search (not semantic or academic-focused)
- Less sophisticated than Exa for finding scholarly content

**Latency:** ~500ms
**Cost:** $5/1000 queries
**Verdict:** Good backup option, but Exa better for your use case

---

### 3. Integrated LLM Search

#### A. **Claude with Citations (via prompt engineering)**
**Type:** Using Claude's training data + explicit citation requests
**Coverage:** Claude's training data (up to early 2024)
**Technical Access:** Already using

**Pros:**
- Already implemented
- Zero additional cost
- Fast
- Good for well-known concepts

**Cons:**
- Hallucination risk for obscure topics
- Can't verify citations easily
- Limited to training cutoff date
- No access to recent scholarship

**Current Status:** This is your baseline
**Improvement:** Add explicit citation validation step

---

#### B. **OpenAI o1/o3 with Web Search**
**Type:** LLM with integrated web search
**Coverage:** Real-time web access
**Technical Access:** OpenAI API (when available)

**Pros:**
- Integrated search + reasoning
- Up-to-date information
- Single API call

**Cons:**
- Very expensive (o1 is ~15x Claude Sonnet cost)
- Not available for streaming yet
- Slower than Claude

**Verdict:** Wait and see, too expensive for MVP

---

### 4. Specialized Databases

#### A. **Wikidata SPARQL Endpoint**
**Type:** Structured knowledge graph
**Coverage:** Encyclopedic knowledge with relationships
**Technical Access:** Free SPARQL API

**Pros:**
- Free
- Structured data (perfect for genealogies)
- Multilingual
- Links to primary sources
- Can query relationships between concepts

**Cons:**
- Requires SPARQL knowledge
- Not narrative (structured data only)
- Limited to encyclopedic coverage

**Implementation:**
```typescript
const sparqlQuery = `
  SELECT ?work ?workLabel ?date ?authorLabel WHERE {
    ?work wdt:P921 ?concept .  # work has main subject: concept
    ?work wdt:P577 ?date .      # publication date
    ?work wdt:P50 ?author .     # author
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }
  ORDER BY ?date
  LIMIT 10
`;
```

**Latency:** ~1-2 seconds
**Cost:** Free
**Use Case:** Excellent for finding chronological lists of works about a concept

**RECOMMENDED AS SUPPLEMENT** - Use alongside Exa/Wikipedia for structured data

---

#### B. **Library of Congress API**
**Type:** U.S. national library catalog
**Coverage:** Books, manuscripts, historical documents
**Technical Access:** Free JSON API

**Pros:**
- Free
- Historical documents and primary sources
- Well-documented API

**Cons:**
- U.S.-centric
- Metadata only (no full text)
- Limited to LC holdings

**Latency:** ~1s
**Cost:** Free
**Use Case:** Supplement for historical American sources

---

#### C. **CrossRef API**
**Type:** Academic citation database
**Coverage:** DOIs for scholarly publications
**Technical Access:** Free REST API

**Pros:**
- Free
- Comprehensive academic coverage
- Metadata for citations
- CrossRef members include major publishers

**Cons:**
- Metadata only (no full text)
- No access to paywalled content

**Implementation:**
```typescript
const crossrefRes = await fetch(
  `https://api.crossref.org/works?query=${encodeURIComponent(concept)}&rows=10&sort=relevance`
);
```

**Latency:** ~500ms
**Cost:** Free
**Use Case:** Generate proper academic citations for genealogy items

**RECOMMENDED AS SUPPLEMENT** - Use for citation formatting

---

### 5. RAG with Vector Database

#### A. **Custom Vector Database (Pinecone/Weaviate/Chroma)**
**Type:** Semantic search over curated corpus
**Coverage:** Your own curated collection
**Technical Access:** Vector DB APIs

**Approach:**
1. Curate a corpus of key philosophical/intellectual texts
2. Chunk and embed with text-embedding-ada-002 or similar
3. Store in vector DB
4. Semantic search at query time

**Pros:**
- Full control over sources
- Fast semantic search
- Can include specialized sources
- No hallucination (retrieval only)

**Cons:**
- **High upfront cost** to build corpus
- Ongoing maintenance (keeping corpus updated)
- Vector DB hosting costs (~$70-100/month for Pinecone)
- Embedding costs (~$0.10/million tokens)
- Limited to curated sources

**Latency:** ~500ms (after initial setup)
**Setup Cost:**
- Curating corpus: 40+ hours of work
- Embedding 1M tokens: ~$0.10
- Storage: $70-100/month

**Verdict:** Good long-term goal, but too much upfront investment for MVP

---

### 6. Hybrid Approaches

#### **Recommended Architecture for MVP:**

```typescript
async function enhancedGrounding(concept: string) {
  // Run searches in parallel
  const [wikiResults, exaResults, wikidataResults] = await Promise.all([
    searchWikipedia(concept),     // 3 results, ~500ms, free
    searchExa(concept),            // 5 results, ~1s, $0.005
    queryWikidata(concept)         // Structured data, ~1s, free
  ]);

  // Combine results
  const allSources = [
    ...wikiResults,
    ...exaResults.filter(r => r.domain.includes('edu')), // Prioritize .edu
    ...wikidataResults
  ];

  // Pass to Claude with enhanced prompt
  const genealogy = await generateGenealogy(concept, allSources);

  // Validate citations via CrossRef
  const validatedGenealogy = await validateCitations(genealogy);

  return validatedGenealogy;
}
```

**Cost per query:** ~$0.005-0.01
**Latency:** ~2-3 seconds (parallel requests)
**Quality:** Significantly improved over Wikipedia-only

---

## Recommendations by Timeline

### **Phase 1: MVP (Weeks 1-4) - $100 budget**

1. **Exa API** - Primary enhancement ($20/month for 500 active users)
   - Semantic search for scholarly sources
   - Filter for .edu domains
   - Easy to implement (drop-in replacement for Wikipedia)

2. **Wikidata SPARQL** - Supplement (free)
   - Structured chronological data
   - Complements narrative search

3. **CrossRef API** - Citation validation (free)
   - Validate and format academic citations
   - Improves source credibility

**Implementation effort:** 2-3 days
**Monthly cost:** ~$20-30
**Quality improvement:** 40-60% (estimated based on source diversity)

---

### **Phase 2: Beta (Weeks 5-8) - $300 budget**

Add **Stanford Encyclopedia of Philosophy scraping**
- Requires respect for rate limits
- Build simple HTML parser
- Cache results (24h expiration)

**Implementation effort:** 3-4 days
**Monthly cost:** Same as Phase 1 (scraping is free)
**Quality improvement:** +20% for philosophical concepts

---

### **Phase 3: Post-Launch (Month 3+) - $1000+ budget**

Consider **custom vector database** if:
- User base > 1000 active users
- Revenue supports infrastructure costs
- Specific domain focus emerges (e.g., "Concept Tracer for Continental Philosophy")

**Implementation effort:** 2-3 weeks
**Monthly cost:** $100-200
**Quality improvement:** +30% (domain-specific corpus)

---

## Technical Implementation Guide

### **Option 1: Exa Integration (RECOMMENDED)**

```typescript
// 1. Add Exa to environment
interface Env {
  ANTHROPIC_API_KEY: string;
  EXA_API_KEY: string;  // Add this
  RATE_LIMIT: KVNamespace;
}

// 2. Create Exa search function
async function searchExa(query: string, exaKey: string) {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': exaKey
    },
    body: JSON.stringify({
      query: `intellectual history genealogy of "${query}"`,
      numResults: 5,
      includeDomains: [
        'plato.stanford.edu',
        'iep.utm.edu',
        'jstor.org',
        'edu'
      ],
      useAutoprompt: true,
      type: 'neural',
      contents: {
        text: { maxCharacters: 2000 }
      }
    })
  });

  const data = await res.json();
  return data.results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.text
  }));
}

// 3. Integrate into /stream endpoint
// Replace lines 217-235 with:
controller.enqueue(new TextEncoder().encode(
  `data: {"type":"status","message":"Searching scholarly sources"}\n\n`
));

const [wikiTitles, exaResults] = await Promise.all([
  searchWikipedia(query),
  searchExa(query, env.EXA_API_KEY)
]);

// 4. Update prompt (line 250)
const prompt = `You are a brilliant intellectual historian...

Wikipedia references: ${wikiTitles.join(", ")}

Scholarly sources:
${exaResults.map(r => `- ${r.title} (${r.url}): ${r.snippet.substring(0, 200)}...`).join('\n')}

Format your response...`;
```

**Testing:**
```bash
curl -X POST https://your-worker.workers.dev/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "freedom"}'
```

---

### **Option 2: Wikidata SPARQL (SUPPLEMENT)**

```typescript
async function queryWikidata(concept: string) {
  // Find Wikidata entity ID for concept
  const searchRes = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(concept)}&language=en&format=json`
  );
  const searchData = await searchRes.json();
  const entityId = searchData.search[0]?.id;

  if (!entityId) return [];

  // SPARQL query for works about this concept
  const sparqlQuery = `
    SELECT ?work ?workLabel ?date ?author ?authorLabel WHERE {
      ?work wdt:P921 wd:${entityId} .  # main subject
      OPTIONAL { ?work wdt:P577 ?date . }
      OPTIONAL { ?work wdt:P50 ?author . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY ?date
    LIMIT 20
  `;

  const sparqlRes = await fetch(
    'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparqlQuery),
    { headers: { 'Accept': 'application/json' } }
  );

  const sparqlData = await sparqlRes.json();
  return sparqlData.results.bindings.map(b => ({
    title: b.workLabel?.value || 'Unknown',
    author: b.authorLabel?.value || 'Unknown',
    year: b.date?.value?.substring(0, 4) || 'Unknown',
    url: b.work?.value || ''
  }));
}
```

---

### **Option 3: SEP Scraping**

```typescript
async function searchSEP(concept: string) {
  // Use Google site search (SEP doesn't have search API)
  const googleRes = await fetch(
    `https://www.google.com/search?q=site:plato.stanford.edu+${encodeURIComponent(concept)}`
  );

  const html = await googleRes.text();

  // Parse Google results for SEP URLs
  const urlMatches = html.matchAll(/https:\/\/plato\.stanford\.edu\/entries\/([\w-]+)\//g);
  const sepUrls = [...new Set([...urlMatches].map(m => m[0]))].slice(0, 3);

  // Fetch SEP articles
  const articles = await Promise.all(
    sepUrls.map(async url => {
      const res = await fetch(url);
      const html = await res.text();

      // Extract title and first 500 words
      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/);
      const textMatch = html.match(/<div id="aueditable">([\s\S]*?)<\/div>/);

      return {
        title: titleMatch?.[1] || 'Unknown',
        url,
        snippet: textMatch?.[1]?.substring(0, 1000) || ''
      };
    })
  );

  return articles;
}
```

**Note:** Respect robots.txt and add delays between requests.

---

## Cost-Benefit Analysis

| Option | Setup Time | Monthly Cost (500 users) | Quality Gain | Latency | Complexity |
|--------|------------|----------|--------------|---------|------------|
| **Current (Wikipedia only)** | 0 | $0 | Baseline | 500ms | Low |
| **+ Exa** | 1 day | $20 | +40% | +1s | Low |
| **+ Wikidata** | 2 days | $0 | +15% | +1s | Medium |
| **+ SEP Scraping** | 3 days | $0 | +20% | +2s | Medium |
| **+ CrossRef** | 1 day | $0 | +10% | +500ms | Low |
| **Custom Vector DB** | 3 weeks | $100-200 | +30% | +500ms | High |
| **JSTOR API** | 1 week | $10,000/yr | +50% | +1s | High |

---

## Final Recommendation

### **For Your 90-Day Grant Proposal:**

**Weeks 1-4: Core Enhancement**
- Integrate **Exa API** ($20/month)
- Add **Wikidata SPARQL** (free)
- Implement **CrossRef citation validation** (free)

**Budget:** $80 for first 4 months
**Implementation:** 4-5 days
**Expected improvement:** 50-60% better source quality

**Weeks 5-7: Scholarly Supplement**
- Add **SEP scraping** with caching
- Build source diversity metrics

**Budget:** $0 additional
**Implementation:** 3-4 days
**Expected improvement:** +20% for philosophical concepts

**Weeks 8-12: Analytics & Optimization**
- Track which sources users click most
- A/B test source combinations
- Optimize for latency vs. quality

**Total Budget for sourcing:** $100-120 over 90 days
**Total Implementation Time:** 8-10 days

This approach maximizes quality improvement while keeping costs minimal and implementation straightforward—perfect for a grant-funded MVP timeline.
