# 🏔️ Terra Incognita — Topographic SEO Intelligence Platform

[![License](https://img.shields.io/badge/License-MIT-stone?style=for-the-badge)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20ES6%2B-stone?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Three.js](https://img.shields.io/badge/3D%20Engine-Three.js-2d635e?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Vercel Serverless](https://img.shields.io/badge/Backend-Vercel%20Serverless-1c1b18?style=for-the-badge&logo=vercel)](https://vercel.com/)

A distinctive, production-quality SEO intelligence platform featuring an interactive 3D mountain landscape. Built with sculptural aesthetics inspired by architectural visualization, geological surveys, and precision instrumentation.

---

## ✨ Signature Features

- **🏔️ Interactive 3D Mountain Landscape**: Procedurally generated 3D terrain visualizing site architecture, crawlability, on-page health, and link watersheds. Summit elevation dynamically deforms to reflect real crawl scores.
- **📍 Real Data Issue Beacons**: Interactive monoliths placed directly onto geological ridges. Hovering or clicking markers reveals contextual diagnostics with one-click navigation to code prescriptions.
- **🧭 Geological Camera Controls**: Summit Vantage, Ridge Profile, and Orthographic survey presets with smooth interpolation and inertia rotation.
- **🎨 Terra Incognita Design System**: Handcrafted editorial palette featuring warm mineral ivory, charcoal typography, forest green signals, oxidized copper highlights, restrained amber warnings, and muted stone grey contours.
- **🛡️ SSRF & Security Hardening**:
  - Full CIDR filtering across IPv4 and IPv6 (loopback, private, link-local, multicast, CGNAT, AWS/GCP metadata `169.254.169.254`).
  - Pre-flight DNS resolution and socket-level IP pinning to prevent DNS rebinding attacks.
  - Manual, validated redirect traversal (max 5 hops).
  - Strict 8-second fetch timeouts and 5MB body size caps.
  - Per-IP sliding-window rate limiting.
- **📄 Editorial PDF Export**: Generate styled, client-ready A4 executive audit reports directly in the browser (powered by `jsPDF`).
- **💾 Survey Archive**: Persistent local history of inspected domains with quick re-survey actions.
- **♿ Inclusive & Accessible**: Native `prefers-reduced-motion` compliance and an automatic 2D topographic contour elevation profile fallback when WebGL is unavailable.

---

## 🛠️ Architecture

- **Frontend**: Vanilla ES6+ JS, HTML5, Three.js, Tailwind CSS
- **3D Engine**: Procedural mesh deformation, elevation shaders, raycasting markers (`terrain.js`)
- **Backend / Serverless**: Node.js ESM Vercel Serverless APIs:
  - `/api/analyze`: SSRF-hardened web crawler and JSDOM DOM parser
  - `/api/preview`: Validated website screenshot proxy via `thum.io`
- **Security Utilities**: `api/_security.js` (IP bitwise checks, DNS pinning, rate limiter)
- **Test Suite**: Native Node.js test runner (`node --test`)

---

## 💻 Local Setup & Development

### Prerequisites
- Node.js (v18+)

### Setup Steps
1. **Clone & Switch to Branch**:
   ```bash
   git clone https://github.com/gowdaanup73-pixel/seo.git
   cd seo
   git checkout feature/interactive-terrain-ui
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

4. **Start Development Server**:
   ```bash
   npm start
   # Server runs at http://localhost:3000
   ```
