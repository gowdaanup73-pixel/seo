// config.js - Configuration constants
const CONFIG = {
  // API Keys — key is stored in the OPENROUTER_API_KEY Vercel environment variable.
  // This file is the unused modular layer; the active code reads the key server-side only.
  OPENROUTER_API_KEY: process?.env?.OPENROUTER_API_KEY ?? '',
  OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',

  
  // CORS Proxy
  CORS_PROXY: 'https://api.allorigins.win/raw?url=',
  
  // DNS Validation
  DNS_API: 'https://dns.google/resolve?name=',
  
  // Screenshot Services
  SCREENSHOT_SERVICES: [
    'https://image.thum.io/get/width/800/crop/600/noanimate/',
    'https://api.apiflash.com/v1/urltoimage?access_key=DEMO&url=',
    'https://shot.screenshotapi.net/screenshot?token=DEMO&url='
  ],
  
  // Scoring Weights
  SCORING: {
    onPage: { 
      max: 40, 
      weights: { 
        title: 15, 
        titleLength: 5, 
        metaDesc: 10, 
        metaDescLength: 5, 
        h1: 5
      } 
    },
    technical: { 
      max: 30, 
      weights: { 
        https: 10, 
        viewport: 10, 
        h1Single: 5, 
        wordCount: 5 
      } 
    },
    content: { 
      max: 20, 
      weights: { 
        wordCountMin: 5, 
        wordCountOptimal: 5, 
        h2Tags: 5, 
        base: 5 
      } 
    },
    links: { 
      max: 10, 
      weights: { 
        linkCount: 5, 
        linkCountHigh: 5 
      } 
    }
  },
  
  // Optimal Ranges
  OPTIMAL: {
    titleLength: { min: 30, max: 60 },
    metaDescLength: { min: 120, max: 160 },
    wordCount: { min: 300, optimal: 600 },
    linkCount: { min: 5, optimal: 10 }
  },
  
  // Colors
  COLORS: {
    primary: '#14b8a6',
    darkBg: '#0f172a',
    darkCard: '#1e293b',
    scoreGreen: '#10b981',
    scoreBlue: '#3b82f6',
    scoreOrange: '#f97316',
    scoreRed: '#ef4444'
  }
};

window.CONFIG = CONFIG;