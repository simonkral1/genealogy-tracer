# Genealogy Tracer - Chrome Extension

A Chrome extension that traces the intellectual genealogy of concepts and ideas using AI. Select any text on a webpage and instantly discover its origins, related concepts, evolution, and open questions.

## 🚀 How to Use

1. **Install the Extension**
   - Download `genealogy-tracer-extension.zip` from the releases
   - Go to `chrome://extensions/` in Chrome
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked" and select the unzipped folder

2. **Trace Any Concept**
   - **Method 1:** Select text on any webpage → Right-click → "Trace Genealogy"
   - **Method 2:** Select text → Press `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac)
   - **Method 3:** Select text → Click the extension icon in your toolbar

3. **Explore Results**
   - View the intellectual genealogy with sources and years
   - Click "Trace this" on any result to dive deeper
   - Use "Copy All" to save your research
   - Explore open questions for further investigation

## ✨ Features

- **Instant Results**: AI-powered genealogy tracing in seconds
- **Smart Caching**: Previously traced concepts load instantly
- **Deep Exploration**: Trace related concepts with one click
- **Source Links**: Direct links to original sources when available
- **Research Export**: Copy formatted results for your notes
- **Open Questions**: Discover gaps in knowledge to explore further

## 🎯 Perfect For

- **Students** researching essay topics
- **Academics** exploring intellectual history
- **Writers** understanding concept origins
- **Curious minds** wanting to understand ideas deeply

## 🔧 Technical Details

The extension connects to a Cloudflare Worker that processes your queries using advanced AI models to trace intellectual genealogies across history.

**Privacy**: Your selections are only sent to our secure processing endpoint. No data is stored permanently.

## 📦 Installation from Source

If you want to install from source code:

```bash
# Clone this repository
git clone https://github.com/your-username/genealogy-ai.git
cd genealogy-ai

# Extension files are ready in the dist/ folder
# Follow the installation steps above using the dist/ folder
```

## 🤝 Contributing

Contributions welcome! See the technical documentation in the `trace-worker/` directory for backend details.

## 📄 License

MIT License - See LICENSE file for details 