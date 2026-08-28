# Street Coders - SEO Analyzer Codebase Findings

A comprehensive audit of the SEO analyzer codebase reveals the following structure and functionality.

---

## 1. Tech Stack & Dependencies
- **Frontend**: Clean HTML5, CSS3, Tailwind CSS (via CDN in `index.html`), vanilla ES6 JavaScript.
- **Dependencies**: `@vercel/speed-insights` in `package.json`, suggesting Vercel hosting integration.
- **Serverless/Backend**: None. The app is entirely serverless and client-side, running directly in the browser.

---

## 2. Structure & Architecture
The project files present two concurrent implementations:
1. **Monolithic (`app.js`)**: A single-file implementation containing all crawler, validator, UI, chatbot, and analysis logic. This is the **active** file imported by `index.html` (`<script src="app.js"></script>`).
2. **Modular (Unused/Under Construction)**: Individual files containing class-based definitions (`config.js`, `domainValidator.js`, `utils.js`, `webCrawler.js`, `seoAnalyzer.js`, `recommendations.js`, `ui.js`, `aiChatbot.js`). These are not currently referenced in `index.html`.
3. **Styles**: `style.css` contains an unused "Perplexity Design System" (CSS variables, custom layouts) but is not linked in `index.html` (which uses Tailwind CDN and inline `<style>`).

---

## 3. Frontend & UI
- **Branding**: "Street Coders" branding.
- **Theme**: Supports light/dark mode via HTML class switching (`.dark` / `.light`).
- **Interactive UI Components**:
  - Main URL input bar and search trigger.
  - Overall SEO score circle and detailed category rings (OnPage, Technical, Content, Link).
  - Overall Analysis breakdown pie chart (generated via dynamically drawing paths on `<svg>`).
  - Actionable recommendations card list with priority tags (High/Medium/Low), impact, copyable fix instructions, and a "Mark as Completed" button.
  - Web Preview container using thum.io screenshots.
  - In-memory analysis history list.
  - Custom floating AI chatbot window (bottom-right).

---

## 4. Backend / API Integrations
Since there is no backend server, the application relies on the following public/external APIs:
- **DNS Domain Validation**: Google DNS resolve API (`https://dns.google/resolve?name=${hostname}&type=A`) to check domain existence.
- **Web Crawling**: fetches real HTML content of target URLs using the Allorigins CORS proxy (`https://api.allorigins.win/raw?url=...`).
- **SEO AI Chatbot**: OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`) using the `openai/gpt-3.5-turbo` model and a hardcoded token.
- **Preview System**: thum.io URL-to-image API (`https://image.thum.io/get/width/800/crop/600/noanimate/...`).

---

## 5. SEO & Scoring Logic
The analyzer evaluates crawled page data against 4 categories (max score: 100):
- **OnPage (40 pts)**: Title presence/length, meta description presence/length, H1 presence.
- **Technical (30 pts)**: HTTPS check, mobile viewport, single H1 count, word count > 300.
- **Content (20 pts)**: Word count minimums/optimals, H2 presence, base content score.
- **Links (10 pts)**: Link count (>5 or >10).

---

## 6. Data Storage & Persistence
- Currently uses purely in-memory storage (`appState` object in `app.js`).
- Contains a comment indicating `localStorage` is blocked/disabled inside the sandboxed preview/run environment.
- History limit set to last 10 analyzed domains.

---

## 7. Deploy Config
- Default deployment config matches Vercel (indicated by `package.json` dependencies). No custom deployment files (like `vercel.json` or `.github/workflows`) are configured.
