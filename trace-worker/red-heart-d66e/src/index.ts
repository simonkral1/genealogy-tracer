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

// Define Env interface if you have bindings in wrangler.toml (like ANTHROPIC_API_KEY as a secret)
interface Env {
	ANTHROPIC_API_KEY: string;
	// If you were using Cloudflare AI bindings for Anthropic:
	// AI: any; 
}

export default {
	async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
		const url = new URL(request.url);

		// CORS pre-flight for /trace, /stream, /expand, and /reinterpret
		if ((url.pathname === '/trace' || url.pathname === '/stream' || url.pathname === '/expand' || url.pathname === '/reinterpret') && request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		// Streaming endpoint
		if (url.pathname === '/stream' && request.method === 'POST') {
			try {
				const query = await request.text();
				if (!query) {
					return new Response(JSON.stringify({ error: 'Missing query text' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				// Create a streaming response
				const stream = new ReadableStream({
					async start(controller) {
						try {
							// Send initial status
							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Querying Wikipedia"}\n\n`));

							// Wikipedia search
							const wikiURL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
								encodeURIComponent(query) + '&format=json&origin=*&srlimit=3';
							const wikiRes = await fetch(wikiURL);
							const wikiJson = (await wikiRes.json()) as any;
							const titles = wikiJson.query.search.slice(0, 3).map((i: any) => i.title);

							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Processing genealogy"}\n\n`));

							// Prepare prompt
							const prompt = `You are a brilliant intellectual historian tracing the genealogy of "${query}" with scholarly precision and creative insight.

Construct a five-item genealogy revealing how this concept emerged, transformed, and continues to evolve. Each item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Guidelines:
1. Focus on works that fundamentally shifted how people understood this concept
2. Arrange chronologically, showing intellectual evolution and ruptures
3. Each claim should reveal what made that work revolutionary for its time
4. URLs should link to primary sources, key texts, or authoritative encyclopedic entries
Wikipedia references available: ${titles.join(", ")}

After the genealogy, provide "Open Questions": 1-2 fundamental questions that remain unresolved and actively debated today about "${query}".

Format your response exactly as:
<genealogy>
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Open Questions:
- [Question 1]
- [Question 2]
</genealogy>`;

							// Inform client that we are about to call the language model
							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Calling Claude"}\n\n`));

							// Call Anthropic API with streaming
							const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
							const anthropicApiKey = env.ANTHROPIC_API_KEY;

							if (!anthropicApiKey) {
								controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"Anthropic API key not set"}\n\n`));
								controller.close();
								return;
							}

							const llmRes = await fetch(anthropicApiUrl, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'x-api-key': anthropicApiKey,
									'anthropic-version': '2023-06-01',
								},
								body: JSON.stringify({
									model: 'claude-opus-4-20250514',
									messages: [{ role: 'user', content: prompt }],
									max_tokens: 1500,
									stream: true
								}),
							});

							if (!llmRes.ok) {
								const errorBody = await llmRes.text();
								console.error('Claude API error:', llmRes.status);
								controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"AI service error: ${llmRes.status}"}\n\n`));
								controller.close();
								return;
							}

							// Process Claude's streaming response
							const reader = llmRes.body!.getReader();
							const decoder = new TextDecoder();
							let buffer = '';
							let accumulator = '';
							let readingQuestions = false;
							const processedItems = new Set();
							const processedQuestions = new Set();

							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;

									buffer += decoder.decode(value, { stream: true });
									const lines = buffer.split('\n');
									buffer = lines.pop() || ''; // Keep incomplete line in buffer

									for (const line of lines) {
										if (line.startsWith('data: ')) {
											try {
												const data = JSON.parse(line.slice(6));
												
												if (data.type === 'content_block_delta' && data.delta?.text) {
													accumulator += data.delta.text;
													
													// Check for questions section first
													if (accumulator.toLowerCase().includes('open questions:') && !readingQuestions) {
														readingQuestions = true;
														controller.enqueue(new TextEncoder().encode(`data: {"type":"section","section":"questions"}\n\n`));
													}
													
													// Parse genealogy items (only if not in questions section)
													if (!readingQuestions) {
														// Look for complete genealogy items in the accumulator
														// Match format: "Title (Year) [[URL]] — Claim"
														const itemPattern = /([^(\n]+)\s*\(([^)]+)\)\s*\[\[([^\]]+)\]\]\s*—\s*([^.\n]+(?:\.[^.\n]*)?)\./g;
														let match;
														while ((match = itemPattern.exec(accumulator)) !== null) {
															const [fullMatch, title, year, url, claim] = match;
															const itemKey = `${title.trim()}_${year.trim()}`;
															
															if (!processedItems.has(itemKey) && 
																title.trim().length > 5 && 
																claim.trim().length > 10) {
																processedItems.add(itemKey);
																
																const item = {
																	type: "genealogy_item",
																	title: title.trim(),
																	year: year.trim(),
																	url: url.trim(),
																	claim: claim.trim()
																};
																
																controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(item)}\n\n`));
															}
														}
													}
													
													// Parse questions (only if in questions section)
													if (readingQuestions) {
														// Split into lines and look for proper question format
														const lines = accumulator.split('\n');
														for (const line of lines) {
															const trimmedLine = line.trim();
															
															// Only match lines that start with "- " and contain a question mark
															if (trimmedLine.startsWith('- ') && trimmedLine.includes('?')) {
																const questionText = trimmedLine.substring(2).trim(); // Remove "- " prefix
																
																// Filter for valid questions
																if (questionText.length > 30 && 
																	questionText.length < 400 && 
																	questionText.endsWith('?') &&
																	!questionText.includes('[[') && 
																	!questionText.includes('—') &&
																	!questionText.includes('(') &&
																	!questionText.toLowerCase().includes('thereby') && // Common in genealogy descriptions
																	!questionText.toLowerCase().includes('establishing') && // Common in genealogy descriptions
																	!questionText.toLowerCase().includes('demonstrat') && // Common in genealogy descriptions
																	questionText.split(' ').length > 8 && // Must be substantial
																	!processedQuestions.has(questionText)) {
																	
																	processedQuestions.add(questionText);
																	controller.enqueue(new TextEncoder().encode(`data: {"type":"question","text":"${questionText.replace(/"/g, '\\"')}"}\n\n`));
																}
															}
														}
													}
												}
											} catch (parseError) {
												// Ignore parsing errors in streaming
											}
										}
									}
								}
							} finally {
								reader.releaseLock();
							}

							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Finalizing results"}\n\n`));
							controller.enqueue(new TextEncoder().encode(`data: {"type":"complete"}\n\n`));
							controller.close();

						} catch (error: any) {
							console.error('Streaming error:', error);
							controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"${error.message}"}\n\n`));
							controller.close();
						}
					}
				});

				return new Response(stream, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive',
						'Access-Control-Allow-Origin': '*',
					},
				});

			} catch (e: any) {
				console.error('Worker error during /stream:', e);
				return new Response(JSON.stringify({ error: "Worker processing error", details: e.message }), {
					status: 500,
					headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
				});
			}
		}

		if (url.pathname === '/trace' && request.method === 'POST') {
			// Keep existing /trace endpoint for backward compatibility
			try {
				const startTime = Date.now();
				console.log(`[TIMING] Request started at: ${startTime}`);

				const query = await request.text(); // Expecting plain text query
				if (!query) {
					return new Response(JSON.stringify({ error: 'Missing query text' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				// Streamlined Wikipedia search (reduced to 3 results for speed)
				const wikiStartTime = Date.now();
				const wikiURL =
					'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
					encodeURIComponent(query) +
					'&format=json&origin=*&srlimit=3'; // Reduced from 5 to 3 for speed
				const wikiRes = await fetch(wikiURL);
				const wikiJson = (await wikiRes.json()) as any;
				const titles = wikiJson.query.search.slice(0, 3).map((i: any) => i.title);
				const wikiEndTime = Date.now();
				console.log(`[TIMING] Wikipedia search took: ${wikiEndTime - wikiStartTime}ms`);

				// Optimized prompt for speed while maintaining quality
				const prompt = `You are a brilliant intellectual historian tracing the genealogy of "${query}" with scholarly precision and creative insight.

Construct a five-item genealogy revealing how this concept emerged, transformed, and continues to evolve. Each item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Guidelines:
1. Focus on works that fundamentally shifted how people understood this concept
2. Arrange chronologically, showing intellectual evolution and ruptures
3. Each claim should reveal what made that work revolutionary for its time
4. URLs should link to primary sources, key texts, or authoritative encyclopedic entries
Wikipedia references available: ${titles.join(", ")}

After the genealogy, provide "Open Questions": 1-2 fundamental questions that remain unresolved and actively debated today about "${query}".

Format your response exactly as:
<genealogy>
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Open Questions:
- [Question 1]
- [Question 2]
</genealogy>`;

				// Using direct fetch to Anthropic API with optimized settings
				const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
				const anthropicApiKey = env.ANTHROPIC_API_KEY;

				if (!anthropicApiKey) {
					console.error("ANTHROPIC_API_KEY is not set in worker environment variables.");
					return new Response("Server configuration error: Anthropic API key not set.", { 
						status: 500, 
						headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } 
					});
				}
				
				const claudeStartTime = Date.now();
				console.log(`[TIMING] Starting Claude API call at: ${claudeStartTime}`);
				
				const llmRes = await fetch(anthropicApiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': anthropicApiKey,
						'anthropic-version': '2023-06-01',
					},
					body: JSON.stringify({
						model: 'claude-opus-4-20250514', // Updated to user-specified model
						messages: [{ role: 'user', content: prompt }],
						max_tokens: 1500, // Reduced from 2048 for faster response
					}),
				});

				const claudeEndTime = Date.now();
				console.log(`[TIMING] Claude API call completed: ${claudeEndTime - claudeStartTime}ms`);

				if (!llmRes.ok) {
					const errorBody = await llmRes.text();
					console.error(`Anthropic API Error (${llmRes.status}): ${errorBody}`);
					return new Response(`Error from AI service: ${llmRes.statusText}. Details: ${errorBody}`, { 
						status: llmRes.status, 
						headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } 
					});
				}

				const processingStartTime = Date.now();
				const llmJson = (await llmRes.json()) as any;
				
				let rawGenealogyContent = '';
				if (llmJson.content && Array.isArray(llmJson.content) && llmJson.content.length > 0) {
					const textBlock = llmJson.content.find((block: any) => block.type === 'text');
					if (textBlock && textBlock.text) {
						rawGenealogyContent = textBlock.text;
					} else if (llmJson.content[0].type === 'text' && llmJson.content[0].text) {
						 // Fallback for slightly different structures if the first block is text
						 rawGenealogyContent = llmJson.content[0].text;
					}
				}

				if (!rawGenealogyContent) {
						console.error("Error extracting content from LLM response (truncated):", JSON.stringify(llmJson).slice(0, 200));
						return new Response("Error: Could not extract content from LLM response.", { 
							status: 500, 
							headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } 
						});
				}
				
				// Extract content within <genealogy> tags
				const genealogyMatch = rawGenealogyContent.match(/<genealogy>([\s\S]*?)<\/genealogy>/);
				const finalContent = genealogyMatch && genealogyMatch[1] ? genealogyMatch[1].trim() : rawGenealogyContent.trim();

				const processingEndTime = Date.now();
				const totalTime = processingEndTime - startTime;
				
				console.log(`[TIMING] Response processing took: ${processingEndTime - processingStartTime}ms`);
				console.log(`[TIMING] BREAKDOWN - Total: ${totalTime}ms | Wikipedia: ${wikiEndTime - wikiStartTime}ms | Claude API: ${claudeEndTime - claudeStartTime}ms | Processing: ${processingEndTime - processingStartTime}ms`);

				// Add timing info to the response
				const timingInfo = `\n\n--- TIMING BREAKDOWN ---\nTotal time: ${totalTime}ms\nWikipedia search: ${wikiEndTime - wikiStartTime}ms\nClaude API call: ${claudeEndTime - claudeStartTime}ms\nResponse processing: ${processingEndTime - processingStartTime}ms\nCloudflare overhead: ${totalTime - (wikiEndTime - wikiStartTime) - (claudeEndTime - claudeStartTime) - (processingEndTime - processingStartTime)}ms`;

				return new Response(finalContent + timingInfo, {
					headers: { 
						'Content-Type': 'text/plain; charset=utf-8',
						'Access-Control-Allow-Origin': '*' 
					},
				});

			} catch (e: any) {
				console.error('Worker error during /trace:', e);
				return new Response(JSON.stringify({ error: "Worker processing error", details: e.message }), {
					status: 500,
					headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
				});
			}
		}

		// New /expand endpoint for detailed analysis of genealogy items
		if (url.pathname === '/expand' && request.method === 'POST') {
			try {
				const requestData = await request.json() as { title?: string; year?: string; claim?: string };
				const { title, year, claim } = requestData;
				
				if (!title || !year || !claim) {
					return new Response(JSON.stringify({ error: 'Missing required fields: title, year, claim' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				const prompt = `You are tasked with explaining a significant work in intellectual history. Your goal is to make this explanation clear, concise, and accessible to a general audience. Here are the details of the work you need to explain:

<title>${title}</title>
<year>${year}</year>
<claim>${claim}</claim>

Your task is to explain this work in simple, clear terms. Focus on the claim provided above. Write an explanation that adheres to the following guidelines:

1. Length: Your explanation should be exactly 3-4 sentences, with a total word count under 100.
2. Content: Address the following points in your explanation:
   a. Why this work was important when it was published
   b. What new idea or approach it introduced
   c. How it influenced later thinking
   d. Why it still matters today

3. Writing style:
   - Use clear, straightforward language that anyone can understand
   - Be direct and to the point
   - Avoid jargon or overly technical terms
   - If you must use a complex term, briefly explain it

4. Structure your explanation to flow logically from the work's initial importance to its lasting impact.

Remember, your primary goal is to make this complex idea accessible to a general audience. Prioritize clarity and simplicity in your explanation.

Your final output should be just the explanation, without any additional commentary or meta-discussion. Present your explanation within <explanation> tags.`;

				// Call Anthropic API
				const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
				const anthropicApiKey = env.ANTHROPIC_API_KEY;

				if (!anthropicApiKey) {
					return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				const llmRes = await fetch(anthropicApiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': anthropicApiKey,
						'anthropic-version': '2023-06-01',
					},
					body: JSON.stringify({
						model: 'claude-opus-4-20250514',
						messages: [{ role: 'user', content: prompt }],
						max_tokens: 800,
					}),
				});

				if (!llmRes.ok) {
					const errorBody = await llmRes.text();
					console.error('Claude API error:', llmRes.status, errorBody);
					return new Response(JSON.stringify({ error: `AI service error: ${llmRes.status}` }), {
						status: 500,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				const llmJson = (await llmRes.json()) as any;
				
				let expandedContent = '';
				if (llmJson.content && Array.isArray(llmJson.content) && llmJson.content.length > 0) {
					const textBlock = llmJson.content.find((block: any) => block.type === 'text');
					if (textBlock && textBlock.text) {
						expandedContent = textBlock.text.trim();
					}
				}

				if (!expandedContent) {
					return new Response(JSON.stringify({ error: 'Failed to generate expanded content' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				return new Response(JSON.stringify({ content: expandedContent }), {
					headers: { 
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*' 
					},
				});

			} catch (e: any) {
				console.error('Worker error during /expand:', e);
				return new Response(JSON.stringify({ error: 'Expand processing error', details: e.message }), {
					status: 500,
					headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
				});
			}
		}

		// New /reinterpret endpoint for alternative genealogy
		if (url.pathname === '/reinterpret' && request.method === 'POST') {
			try {
				const requestData = await request.json() as { 
					query: string; 
					existingGenealogy: Array<{title: string; year: string; claim: string; url?: string}> 
				};
				const { query, existingGenealogy } = requestData;
				
				if (!query || !existingGenealogy || !Array.isArray(existingGenealogy)) {
					return new Response(JSON.stringify({ error: 'Missing required fields: query and existingGenealogy array' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
					});
				}

				// Create a streaming response
				const stream = new ReadableStream({
					async start(controller) {
						try {
							// Send initial status
							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Searching for alternative perspectives"}\n\n`));

							// Wikipedia search for fresh sources
							const wikiURL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
								encodeURIComponent(query) + '&format=json&origin=*&srlimit=5';
							const wikiRes = await fetch(wikiURL);
							const wikiJson = (await wikiRes.json()) as any;
							const titles = wikiJson.query.search.slice(0, 5).map((i: any) => i.title);

							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Consulting alternative sources"}\n\n`));

							// Format existing genealogy for the prompt
							const existingItems = existingGenealogy.map((item, index) => 
								`${index + 1}. ${item.title} (${item.year}) — ${item.claim}`
							).join('\n');

							// Prepare reinterpretation prompt
							const prompt = `You are a brilliant intellectual historian providing a REINTERPRETATION of the concept "${query}".

I will show you the ORIGINAL GENEALOGY that was previously constructed, and you need to offer a fresh perspective on the same concept by exploring different aspects, traditions, or intellectual lineages.

ORIGINAL GENEALOGY:
${existingItems}

Your task: Acknowledge the original genealogy above, then provide a REINTERPRETATION that:
1. Offers a different lens or framework for understanding "${query}"
2. Explores alternative intellectual traditions, geographic regions, or disciplinary approaches  
3. Highlights marginalized voices, counter-narratives, or competing interpretations
4. Shows different historical trajectories or influences
5. Considers non-Western, feminist, critical, or alternative theoretical frameworks
6. May include popular culture, social movements, or non-academic contributions

Begin your response with a brief acknowledgment of the original genealogy (1-2 sentences), then provide your alternative 5-item genealogy.

Each genealogy item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Wikipedia references available: ${titles.join(", ")}

After the genealogy, provide "Open Questions": 1-2 fundamental questions about "${query}" that this alternative perspective raises.

Format your response exactly as:
<genealogy>
The original genealogy traced ${query} through [brief summary]. Here's an alternative perspective:

[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]
[TITLE] ([YEAR]) [[URL]] — [SPECIFIC_INSIGHT_OR_PARADIGM_SHIFT]

Open Questions:
- [Question 1]
- [Question 2]
</genealogy>`;

							// Inform client that we are about to call the language model
							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Generating alternative genealogy"}\n\n`));

							// Call Anthropic API with streaming
							const anthropicApiUrl = 'https://api.anthropic.com/v1/messages';
							const anthropicApiKey = env.ANTHROPIC_API_KEY;

							if (!anthropicApiKey) {
								controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"Anthropic API key not set"}\n\n`));
								controller.close();
								return;
							}

							const llmRes = await fetch(anthropicApiUrl, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'x-api-key': anthropicApiKey,
									'anthropic-version': '2023-06-01',
								},
								body: JSON.stringify({
									model: 'claude-opus-4-20250514',
									messages: [{ role: 'user', content: prompt }],
									max_tokens: 1500,
									stream: true
								}),
							});

							if (!llmRes.ok) {
								const errorBody = await llmRes.text();
								console.error('Claude API error:', llmRes.status);
								controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"AI service error: ${llmRes.status}"}\n\n`));
								controller.close();
								return;
							}

							// Process Claude's streaming response (same logic as /stream endpoint)
							const reader = llmRes.body!.getReader();
							const decoder = new TextDecoder();
							let buffer = '';
							let accumulator = '';
							let readingQuestions = false;
							const processedItems = new Set();
							const processedQuestions = new Set();

							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;

									buffer += decoder.decode(value, { stream: true });
									const lines = buffer.split('\n');
									buffer = lines.pop() || '';

									for (const line of lines) {
										if (line.startsWith('data: ')) {
											try {
												const data = JSON.parse(line.slice(6));
												
												if (data.type === 'content_block_delta' && data.delta?.text) {
													accumulator += data.delta.text;
													
													// Check for questions section first
													if (accumulator.toLowerCase().includes('open questions:') && !readingQuestions) {
														readingQuestions = true;
														controller.enqueue(new TextEncoder().encode(`data: {"type":"section","section":"questions"}\n\n`));
													}
													
													// Parse genealogy items (only if not in questions section)
													if (!readingQuestions) {
														const itemPattern = /([^(\n]+)\s*\(([^)]+)\)\s*\[\[([^\]]+)\]\]\s*—\s*([^.\n]+(?:\.[^.\n]*)?)\./g;
														let match;
														while ((match = itemPattern.exec(accumulator)) !== null) {
															const [fullMatch, title, year, url, claim] = match;
															const itemKey = `${title.trim()}_${year.trim()}`;
															
															if (!processedItems.has(itemKey) && 
																title.trim().length > 5 && 
																claim.trim().length > 10) {
																processedItems.add(itemKey);
																
																const item = {
																	type: "genealogy_item",
																	title: title.trim(),
																	year: year.trim(),
																	url: url.trim(),
																	claim: claim.trim()
																};
																
																controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(item)}\n\n`));
															}
														}
													}
													
													// Parse questions (only if in questions section)
													if (readingQuestions) {
														const lines = accumulator.split('\n');
														for (const line of lines) {
															const trimmedLine = line.trim();
															
														if (trimmedLine.startsWith('- ') && trimmedLine.includes('?')) {
																const questionText = trimmedLine.substring(2).trim();
																
																if (questionText.length > 30 && 
																	questionText.length < 400 && 
																	!processedQuestions.has(questionText.toLowerCase())) {
																	processedQuestions.add(questionText.toLowerCase());
																	
																	const question = {
																		type: "question",
																		text: questionText
																	};
																	
																	controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(question)}\n\n`));
																}
															}
														}
													}
												}
											} catch (e) {
												// Skip malformed JSON
											}
										}
									}
								}
							} finally {
								reader.releaseLock();
							}

							// Send completion signal
							controller.enqueue(new TextEncoder().encode(`data: {"type":"complete"}\n\n`));
							controller.close();

						} catch (error: any) {
							console.error('Reinterpret streaming error:', error);
							controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"${error.message || 'Unknown error occurred'}"}\n\n`));
							controller.close();
						}
					}
				});

				return new Response(stream, {
					headers: {
						'Content-Type': 'text/plain; charset=utf-8',
						'Access-Control-Allow-Origin': '*',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive',
					},
				});

			} catch (e: any) {
				console.error('Worker error during /reinterpret:', e);
				return new Response(JSON.stringify({ error: 'Reinterpret processing error', details: e.message }), {
					status: 500,
					headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
				});
			}
		}

		if (url.pathname === '/') {
			return new Response('Genealogy AI Trace Worker is running. Use the /trace endpoint with POST for full response, /stream for streaming, /expand for detailed analysis, or /reinterpret for alternative genealogies.', {
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		return new Response('Not found. Use /trace with POST, /stream with POST, /expand with POST, /reinterpret with POST, or visit the root /.', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
