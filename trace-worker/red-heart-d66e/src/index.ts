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

		// CORS pre-flight for /trace and /stream
		if ((url.pathname === '/trace' || url.pathname === '/stream') && request.method === 'OPTIONS') {
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
							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Searching Wikipedia..."}\n\n`));

							// Wikipedia search
							const wikiURL = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
								encodeURIComponent(query) + '&format=json&origin=*&srlimit=3';
							const wikiRes = await fetch(wikiURL);
							const wikiJson = (await wikiRes.json()) as any;
							const titles = wikiJson.query.search.slice(0, 3).map((i: any) => i.title);

							controller.enqueue(new TextEncoder().encode(`data: {"type":"status","message":"Generating genealogy..."}\n\n`));

							// Prepare prompt
							const prompt = `Act as a critical historian and genealogist in the spirit of Nietzsche and Foucault. Analyze the concept "${query}".

Construct a five-item genealogy. Each item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

Guidelines:
1. Prioritize historically influential sources, ideas, or events.
2. Arrange items chronologically.
3. Ensure each item offers a unique perspective or marks a significant development.
4. For URLs, provide direct links to relevant primary sources, academic articles, or encyclopedic entries.
5. Wikipedia titles for reference: ${titles.join(", ")}.

After the genealogy, provide:

"Open Questions": List 1-2 fundamental, still-debated questions about "${query}".

Format your output exactly as:
<genealogy>
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

Open Questions:
- [Question 1]
- [Question 2]
</genealogy>`;

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
									model: 'claude-sonnet-4-20250514',
									messages: [{ role: 'user', content: prompt }],
									max_tokens: 1500,
									stream: true
								}),
							});

							if (!llmRes.ok) {
								const errorBody = await llmRes.text();
								console.error('Claude API error:', errorBody);
								controller.enqueue(new TextEncoder().encode(`data: {"type":"error","message":"AI service error: ${errorBody}"}\n\n`));
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
														// Look for complete questions ending with punctuation
														const questionPattern = /-\s*([^?\n]+\?)/g;
														let questionMatch;
														while ((questionMatch = questionPattern.exec(accumulator)) !== null) {
															const questionText = questionMatch[1].trim();
															
															// Filter out partial questions and genealogy remnants
															if (questionText.length > 20 && 
																!questionText.includes('[[') && 
																!questionText.includes('—') &&
																!processedQuestions.has(questionText)) {
																
																processedQuestions.add(questionText);
																controller.enqueue(new TextEncoder().encode(`data: {"type":"question","text":"${questionText.replace(/"/g, '\\"')}"}\n\n`));
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
				const prompt = `Act as a critical historian and genealogist in the spirit of Nietzsche and Foucault. Analyze the concept "${query}".

Construct a five-item genealogy. Each item should follow this format:
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

Guidelines:
1. Prioritize historically influential sources, ideas, or events.
2. Arrange items chronologically.
3. Ensure each item offers a unique perspective or marks a significant development.
4. For URLs, provide direct links to relevant primary sources, academic articles, or encyclopedic entries.
5. Wikipedia titles for reference: ${titles.join(", ")}.

After the genealogy, provide:

"Open Questions": List 1-2 fundamental, still-debated questions about "${query}".

Format your output exactly as:
<genealogy>
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]
[TITLE] ([YEAR]) [[URL]] — [ONE_LINE_CLAIM]

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
						model: 'claude-sonnet-4-20250514', // Updated to user-specified model
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
						console.error("Error extracting content from LLM response:", JSON.stringify(llmJson, null, 2));
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

		if (url.pathname === '/') {
			return new Response('Genealogy AI Trace Worker is running. Use the /trace endpoint with POST for full response or /stream for streaming.', {
				headers: { 'Content-Type': 'text/plain' },
			});
		}

		return new Response('Not found. Use /trace with POST or /stream with POST or visit the root /.', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
