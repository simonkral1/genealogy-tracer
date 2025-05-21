/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// CORS pre‑flight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				},
			});
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		let query: string | undefined;
		try {
			const body = (await request.json()) as { query?: string };
			query = body.query;
		} catch (e) {
			return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		if (!query) {
			return new Response(JSON.stringify({ error: 'Missing "query" field' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// 1‑hop Wikipedia search (cheap & fast)
		const wikiURL =
			'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
			encodeURIComponent(query) +
			'&format=json&origin=*';
		const wikiRes = await fetch(wikiURL);
		const wikiJson = (await wikiRes.json()) as any;
		const titles = wikiJson.query.search.slice(0, 5).map((i: any) => i.title);

		// Prompt LLM to craft a concise genealogy list
		const prompt = `Act as a critical historian and genealogist in the spirit of Nietzsche and Foucault. Your task is to analyze the concept "${query}".
Leverage your broad knowledge base and the integrated web search tool to unearth foundational texts, thinkers, pivotal moments, and relevant events.
Go beyond mainstream narratives to uncover potential power dynamics, historical contingencies, and subjugated knowledges that have shaped this concept.

Construct a five-item genealogy. Each item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

Guidelines for the genealogy:
1. Prioritize historically influential sources, ideas, or events.
2. Arrange items chronologically.
3. Ensure each item offers a unique perspective or marks a significant development.
4. Use precise language. For URLs, provide direct links to relevant primary sources, academic articles, or comprehensive encyclopedic entries discovered through web search or your knowledge. Cite web search results appropriately.
5. You may use the provided Wikipedia titles as a starting point for your investigation: ${titles.join(", ")}.

After the genealogy, provide two distinct sections:

First, a "Critique of Genealogy / Methodological Blind Spots":
This critique should reflect a deep understanding of genealogical method. Instead of generic points, focus on:
- What power structures might this genealogy (even if critically constructed) still inadvertently reinforce?
- What voices or perspectives (e.g., non-Western, subaltern, dissident) remain marginalized or unaddressed, even with web search?
- What are the limitations of the available sources (including those found via web search) in painting a complete picture?
- Are there unexamined assumptions or epistemological biases in the way the concept is typically framed or in the sources encountered?
This critique should be concise and actionable for further, deeper inquiry.

Second, identify one or two "Open Questions" about the core concept "${query}":
These should be fundamental, still-debated, or unresolved questions that point towards future research or critical reflection, potentially stemming from the methodological blind spots identified. List them as bullet points.

Your final output must be structured exactly as follows, removing numbering for genealogy items:
<genealogy>
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

Critique of Genealogy / Methodological Blind Spots: [Your identified critique/blind spot text here]

Open Questions:
- [Open Question 1 text here]
- [Open Question 2 text here (if applicable)]
</genealogy>

Ensure that your final output contains only the content within the <genealogy> tags, without any additional commentary or explanations.`;

		const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': (env as any)["ANTHROPIC_API_KEY"],
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: 'claude-3-7-sonnet-latest',
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 2048,
				tools: [{
					"type": "web_search_20250305",
					"name": "web_search"
				}],
				thinking: {
					"type": "enabled",
					"budget_tokens": 1024
				}
			}),
		});

		const llmJson = (await llmRes.json()) as any;
		let rawGenealogyContent = '';
		if (llmJson.content && Array.isArray(llmJson.content)) {
			const textBlock = llmJson.content.find((block: any) => block.type === 'text');
			if (textBlock) {
				rawGenealogyContent = textBlock.text;
			}
		}
		
		if (!rawGenealogyContent && llmJson.content?.[0]?.text) {
		    rawGenealogyContent = llmJson.content?.[0]?.text;
		}
		
		if (!rawGenealogyContent) {
		    console.error("Error extracting content from LLM response:", JSON.stringify(llmJson, null, 2));
		    rawGenealogyContent = '<genealogy>Error: Could not extract content from LLM response.</genealogy>';
		}

		const genealogy_items: { title: string; year: string; url: string; claim: string }[] = [];
		let critique_of_genealogy = 'Not identified';
		const open_questions: string[] = [];

		const genealogyMatch = rawGenealogyContent.match(/<genealogy>([\s\S]*?)<\/genealogy>/);

		if (genealogyMatch && genealogyMatch[1]) {
			const content = genealogyMatch[1].trim();
			const lines = content.split('\n');
			const itemRegex = /^(.*?)\s\((.*?)\)\s\[\[(.*?)\]\]\s—\s(.*?)$/;
			let readingOpenQuestions = false;

			for (const line of lines) {
				if (line.startsWith('Critique of Genealogy / Methodological Blind Spots:')) {
					critique_of_genealogy = line.substring('Critique of Genealogy / Methodological Blind Spots:'.length).trim();
					readingOpenQuestions = false; // Stop reading open questions if we encounter this line again
				} else if (line.startsWith('Open Questions:')) {
					readingOpenQuestions = true;
				} else if (readingOpenQuestions && line.startsWith('- ')) {
					open_questions.push(line.substring(2).trim());
				} else if (!readingOpenQuestions) {
					const match = line.match(itemRegex);
					if (match) {
						genealogy_items.push({
							title: match[1].trim(),
							year: match[2].trim(),
							url: match[3].trim(),
							claim: match[4].trim(),
						});
					}
				}
			}
		}

		// Basic fallback if parsing fails for some reason but there was content
		if (genealogy_items.length === 0 && !critique_of_genealogy.startsWith('Not identified') && open_questions.length === 0 && rawGenealogyContent) {
			// This condition might need refinement. 
			// If everything is empty despite raw content, it indicates a major parsing failure.
			// Consider setting a specific error message or logging.
			critique_of_genealogy = "Failed to parse structured content from LLM."; 
		}

		return new Response(JSON.stringify({ genealogy_items, critique_of_genealogy, open_questions }), {
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
			},
		});
	},
} satisfies ExportedHandler<Env>;
