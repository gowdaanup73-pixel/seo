# Streetcoders SEO

> See your website from a higher ground.

Most SEO tools feel like bloated Excel spreadsheets stuffed into a dashboard. **Streetcoders SEO** was built out of frustration with that—it is a fast, clean, and tactile website audit tool that cuts through the noise and shows you what actually matters for search visibility.

Type in any public URL, pick a scan mode (or run a head-to-head competitor audit), and get a real-time technical breakdown, a Google SERP simulator, performance estimates, and a clean list of prioritized fixes you can actually hand to an engineer.

---

## What It Does

- **Real-Time Website Crawler & Audit**  
  Spiders your target page, parses its semantic structure, checks technical headers, and calculates an objective **0–100 SEO Health Score** weighted across four core disciplines: On-Page (40%), Technical (30%), Content Depth (20%), and Link Architecture (10%).

- **Google SERP Snippet Simulator**  
  Shows you how your page actually renders in Google Search results on desktop and mobile. Includes live character counters for your `<title>` (30–60 chars) and `<meta name="description">` (110–160 chars) so you know if your snippets are getting truncated before you deploy.

- **Core Crawler Directives Matrix**  
  Instant pass/warn/fail badges for the foundational signals crawlers look for:
  - SSL / TLS encryption & transport security
  - Responsive mobile viewport configuration
  - Canonical URL references (preventing duplicate content penalties)
  - `robots.txt` & XML sitemap availability
  - Semantic `<h1>` hierarchy (flags missing or multiple H1 tags)
  - OpenGraph social cards (`og:title`, `og:description`, `og:image`)

- **Competitor Compare Mode**  
  Run your site head-to-head against a competitor. Compares technical health, content volume, internal link equity, and response speeds in a side-by-side scoreboard with gap analysis.

- **Live Viewport Preview**  
  Generates an interactive desktop screenshot of the audited site wrapped in clean browser chrome with SSL status badges and external visit shortcuts.

- **Deep Analysis Tabs**  
  - **Category Breakdown**: Dynamic SVG donut chart with point-by-point distribution.
  - **Quick Stats**: Metadata lengths, word count, image alt coverage, text-to-code density.
  - **Backlinks Architecture**: Total discovered links, internal vs. external ratios, and `rel="nofollow"` balance.
  - **Performance & Web Vitals**: Real measured TTFB along with estimated Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and First Input Delay (FID).
  - **Recommendations**: Prioritized, actionable fix cards with copyable code snippets and rationale.

- **Client-Ready PDF Report Export**  
  One-click browser export that generates a clean, executive-ready PDF audit report complete with scores, vitals, and prioritized action items.

- **Crafted Editorial Aesthetic & Themes**  
  Handcrafted typography and palette (warm mineral paper, dark mode charcoal, muted forest green, and copper accents). Switches seamlessly between light and dark modes with a single click.

---

## Under the Hood

We deliberately avoided massive modern frontend build pipelines (no webpack, no vite, no massive `node_modules` just to serve client state). The frontend is pure, predictable **Vanilla ES6+ JavaScript, semantic HTML5, and bespoke CSS**.

```
seo/
├── api/
│   ├── _security.js      # SSRF defense, CIDR bitwise filtering, DNS pinning, rate limiter
│   ├── analyze.js        # Serverless audit engine, DOM parser, scoring math
│   └── preview.js        # Screenshot proxy with SSRF validation
├── assets/               # Brand assets & references
├── tests/
│   ├── analyze.test.js   # API endpoint regression tests
│   ├── security.test.js  # SSRF bitwise IPv4/IPv6 tests & rate limiter validation
│   ├── terrain.test.js   # Fallback & model integrity tests
│   └── ui_integrity.test.js # DOM structure & security assertion suite
├── index.html            # Main dashboard markup
├── styles.css            # Complete design system & responsive layout
├── app.js                # Client state, audit orchestrator, and UI controllers
└── server.js             # Local development server
```

### Security First (SSRF & Rebinding Defense)
Web crawlers that fetch arbitrary user-supplied URLs are notorious targets for Server-Side Request Forgery (SSRF). Streetcoders SEO implements strict pre-flight protection in `api/_security.js`:
- Bitwise CIDR blocking for all private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- Blocks cloud metadata endpoints (`169.254.169.254`, GCP/AWS metadata).
- Full IPv6 validation (loopback `::1`, link-local `fe80::/10`, IPv4-mapped `::ffff:0:0/96`).
- Pre-flight DNS resolution with socket-level IP pinning so attackers can't bypass checks via DNS rebinding.
- Strict 8-second fetch timeouts and response size caps to prevent memory exhaustion.
- Per-IP sliding window rate limiting.

---

## Quick Start

### Prerequisites
- Node.js 18 or higher
- npm

### 1. Clone & install
```bash
git clone https://github.com/gowdaanup73-pixel/seo.git
cd seo
npm install
```

### 2. Run the automated test suite
The project uses Node's native test runner (`node --test`), so tests run in ~1.5 seconds without needing Jest or Mocha:
```bash
npm test
```
All 19 tests verify API safety, SSRF bitwise blocking, scoring accuracy, and DOM integrity.

### 3. Start the dev server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Running Scans

1. **Quick Test**: Click any of the chips next to **Quick Run** (`github.com`, `vercel.com`, `stripe.com`, `ycombinator`) to immediately trigger an audit.
2. **Custom Scan**: Paste any URL (`https://yourdomain.com`) into the input box and hit `Enter` or click `→`.
3. **Compare**: Select **Competitor Compare**, enter both your website and your rival's URL, and see the head-to-head score differential.

---

## License

MIT © [gowdaanup73-pixel](https://github.com/gowdaanup73-pixel). Feel free to use, modify, and build upon this project.
