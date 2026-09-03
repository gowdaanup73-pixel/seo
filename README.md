# 🚀 Street Coders - AI-Powered SEO Analyzer

[![Live Demo](https://img.shields.io/badge/Demo-Live%20on%20Vercel-teal?style=for-the-badge)](https://streetcoders-seo-analyzer.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Vercel Serverless](https://img.shields.io/badge/Backend-Vercel%20Serverless-black?style=for-the-badge&logo=vercel)](https://vercel.com/)

A fast, highly interactive, and beautiful SEO audit platform that analyzes websites in real-time, compiles actionable checklists, displays live site screenshot previews, and provides prioritized, context-aware AI recommendations via an integrated chatbot.

---

## 🔗 Live Application
Deploy Link: [https://streetcoders-seo-analyzer.vercel.app/](https://streetcoders-seo-analyzer.vercel.app/)

---

## ✨ Features

- **⚡ Parallel Audits**: Check domain health (via Google DNS) and scrape page contents simultaneously. A strict 8-second fetch timeout guarantees fast responses.
- **🎨 Interactive Data Visualizations**: Overall score indicator and category rings (On-Page, Technical, Content, and Links) dynamically rendered, highlighting deductions.
- **📋 Actionable Recommendations**: Issues are grouped into **Critical Issues** (failed high priority), **Improvements Needed** (failed low/medium priority), and **Passed Checks** cards. Includes copies for one-click CSS/HTML code fixes.
- **🤖 Contextual AI Chatbot Assistant**: Embedded OpenRouter AI chatbot. It is fed with live site statistics (exact word count, missing alt tag counts, meta description status) to avoid generic boilerplate advice.
- **💾 Offline Caching Layer**: In-memory caching on Vercel Serverless (1-hour TTL for page crawls, 24-hour TTL for previews and AI chats). Cache hits load instantly in under 15ms.
- **📄 Downloadable PDF Reports**: Compile and download styled, client-ready A4 PDF reports (powered by `jsPDF`) containing audit breakdowns, points deductions, metrics, and chat history.
- **🕒 Persistent Analysis History**: Browser `localStorage` stores the last 20 analyzed domains complete with favicon/screenshots, scores, timestamps, click-to-load/reload logic, and delete options.
- **📱 Fully Responsive Layout**: Responsive breakpoints designed to scale card columns, chatbot cards, and radial rings from narrow mobile devices (<640px) to desktops.
- **🛡️ SSRF & Error Guards**: Robust server-side security checks block private IP ranges (like `192.168.x.x`), parse malformed URLs, and capture connection resets, bot blocks (403), or unreachable domains.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Vanilla ES6+ JS, HTML5, Tailwind CSS (via CDN)
- **Backend / Serverless**: Node.js ESM Vercel Serverless APIs (`/api/analyze`, `/api/preview`, `/api/ai-recommend`)
- **Third-Party APIs**:
  - **DNS Resolution**: Google DNS API (`https://dns.google/resolve`)
  - **AI Chatbot**: OpenRouter completions endpoint (`openai/gpt-3.5-turbo`)
  - **Screenshots**: Proxied `thum.io` image generator (secured server-side)
- **PDF Generation**: Client-side `jsPDF` integration

---

## 💻 Local Setup & Development

Because Vercel CLI locally requires interactive OAuth credentials, the project includes a custom dev server to run and debug Vercel Serverless functions locally.

### Prerequisites
Make sure you have Node.js (v18+) installed.

### Setup Steps
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/gowdaanup73-pixel/seo.git
   cd seo
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Set your OpenRouter API key:
   - **Windows (PowerShell)**:
     ```powershell
     $env:OPENROUTER_API_KEY="your_api_key_here"
     ```
   - **Linux / macOS (Bash)**:
     ```bash
     export OPENROUTER_API_KEY="your_api_key_here"
     ```

4. **Launch Local Server**:
   ```bash
   node dev-server.js
   ```
   Open `http://localhost:3000` in your browser.

   > ⚠️ **You must use `dev-server.js`** — it is the only server that serves
   > static files **and** proxies `/api/*` requests to the Vercel-style
   > serverless handlers in `api/`. Alternatives will **not** work:
   >
   > | Command | Problem |
   > |---|---|
   > | `npx serve` | Static-only file server — all `/api/*` routes return **404**. |
   > | `vercel dev` | Requires interactive OAuth login to the Vercel dashboard. |

---

## 📁 Repository Structure
```
├── api/
│   ├── ai-recommend.js  # OpenRouter proxy, data payload inject, 24h caching
│   ├── analyze.js       # DNS validation, page content scraper, JSDOM parser
│   └── preview.js       # SSRF-guarded thum.io screenshot proxying
├── dev-server.js        # Local dev server — static files + API route proxy
├── app.js               # Client-side state layer, calculations, PDF export, history
├── index.html           # Main visual shell & CSS components layout
├── package.json         # Node metadata & Vercel package imports
└── README.md            # You are here!
```

---

## 📄 License
This project is licensed under the MIT License.
