# Genealogy Tracer

A bookmarklet and Cloudflare Worker to trace the genealogy of concepts and ideas, inspired by truth-seeking principles.

## Project Structure

-   `genealogy-tracer-demo.js`: The JavaScript bookmarklet code.
-   `trace-worker/`: Contains the Cloudflare Worker code.
    -   `red-heart-d66e/src/index.ts`: The primary TypeScript source for the worker.
    -   (Optionally, include `wrangler.toml` here if you have one and want to share it)

## How it Works

This project uses a browser bookmarklet to send a selected term to a Cloudflare Worker. The worker then queries an AI model to generate a "genealogy" of the term, including its origins, related concepts, critiques, and open questions. This information is then displayed back to the user in the browser.

## Setup & Usage

### 1. Cloudflare Worker (Optional - If you want to deploy your own)

If you want to deploy your own instance of the Cloudflare worker:

1.  You'll need a Cloudflare account.
2.  Navigate to the `trace-worker/red-heart-d66e/` directory. The source code is in `src/index.ts`.
3.  Use the Cloudflare Wrangler CLI to deploy this worker. (Refer to Cloudflare Worker documentation for detailed steps).
4.  Once deployed, Cloudflare will provide you with a unique URL for your worker (e.g., `https://your-worker-name.your-username.workers.dev`). **Copy this URL.**

### 2. Bookmarklet Installation

1.  **Copy the Bookmarklet Code:**
    The full JavaScript code for the bookmarklet is in `genealogy-tracer-demo.js`. Copy the entire content of this file.

2.  **Update the WORKER_URL (If you deployed your own Worker):**
    *   Paste the copied bookmarklet code into a text editor.
    *   Find the line: `let WORKER_URL='https://red-heart-d66e.simon-kral99.workers.dev/trace';`
    *   **If you deployed your own worker in Step 1:** Change the URL to your own worker's URL.
    *   **If you want to use the default public worker (provided for demo purposes):** You can leave the URL as is. Be aware that this public worker may have usage limitations or could be taken offline.

3.  **Create a New Bookmark in Your Browser:**
    *   **Name:** "Genealogy Trace" (or similar)
    *   **URL/Location:** Paste the (potentially modified) single line of JavaScript code. Ensure it's all on one line.

4.  **How to Use:**
    *   Select some text on any webpage.
    *   Click your "Genealogy Trace" bookmark.
    *   A popup will display the trace.

## License

(Consider adding a LICENSE file and specifying it here, e.g., MIT License) 