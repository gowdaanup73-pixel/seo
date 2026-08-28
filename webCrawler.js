// webCrawler.js - REAL web crawling and data extraction
class WebCrawler {
  constructor() {
    this.corsProxy = CONFIG.CORS_PROXY;
    this.timeout = 30000; // 30 seconds
  }
  
  async crawlWebsite(url) {
    console.log('🕷️ Starting REAL web crawl for:', url);
    console.log('⚡ This is NOT simulated - fetching actual HTML...');
    
    try {
      // Add https:// if not present
      const fullUrl = Utils.formatUrl(url);
      
      // Fetch HTML via CORS proxy - REAL FETCH!
      const proxyUrl = this.corsProxy + encodeURIComponent(fullUrl);
      console.log('📡 Fetching from CORS proxy:', proxyUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const startTime = Date.now();
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml'
        }
      });
      
      clearTimeout(timeoutId);
      const loadTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log('✅ HTML fetched successfully!');
      console.log('📊 Response size:', html.length, 'characters');
      console.log('⏱️ Load time:', loadTime, 'ms');
      
      // Parse HTML with DOMParser - REAL PARSING!
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      console.log('✅ HTML parsed with DOMParser');
      
      // Extract all data from REAL DOM
      const data = await this.extractData(doc, fullUrl, loadTime);
      console.log('✅ Data extraction complete from real DOM!');
      console.log('📋 Extracted data summary:', {
        title: data.title.substring(0, 50),
        images: data.imageCount,
        links: data.totalLinks,
        words: data.wordCount,
        h1Tags: data.h1Count
      });
      
      return { success: true, data, html };
      
    } catch (error) {
      console.error('❌ Crawl failed:', error);
      return { 
        success: false, 
        error: error.message,
        data: null 
      };
    }
  }
  
  async extractData(doc, url, loadTime) {
    console.log('🔍 Extracting SEO data from real DOM...');
    
    const data = {
      url: url,
      timestamp: new Date().toISOString(),
      loadTime: loadTime,
      
      // Title - extracted from real DOM
      title: doc.querySelector('title')?.textContent.trim() || '',
      titleLength: (doc.querySelector('title')?.textContent || '').length,
      
      // Meta tags - extracted from real DOM
      metaDescription: doc.querySelector('meta[name="description"]')?.content || '',
      metaDescriptionLength: (doc.querySelector('meta[name="description"]')?.content || '').length,
      metaKeywords: doc.querySelector('meta[name="keywords"]')?.content || '',
      
      // Open Graph - extracted from real DOM
      ogTitle: doc.querySelector('meta[property="og:title"]')?.content || '',
      ogDescription: doc.querySelector('meta[property="og:description"]')?.content || '',
      ogImage: doc.querySelector('meta[property="og:image"]')?.content || '',
      
      // Headings - extracted from real DOM
      h1: Array.from(doc.querySelectorAll('h1')).map(h => h.textContent.trim()),
      h2: Array.from(doc.querySelectorAll('h2')).map(h => h.textContent.trim()),
      h3: Array.from(doc.querySelectorAll('h3')).map(h => h.textContent.trim()),
      h1Count: doc.querySelectorAll('h1').length,
      h2Count: doc.querySelectorAll('h2').length,
      h3Count: doc.querySelectorAll('h3').length,
      
      // Images - extracted from real DOM
      images: Array.from(doc.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt || '',
        hasAlt: !!img.alt
      })),
      imageCount: doc.querySelectorAll('img').length,
      imagesWithAlt: doc.querySelectorAll('img[alt]:not([alt=""])').length,
      imagesWithoutAlt: doc.querySelectorAll('img:not([alt]), img[alt=""]').length,
      
      // Links - extracted from real DOM
      links: Array.from(doc.querySelectorAll('a[href]')).map(a => ({
        href: a.href,
        text: a.textContent.trim(),
        isInternal: Utils.isInternalLink(a.href, url),
        isExternal: !Utils.isInternalLink(a.href, url)
      })),
      totalLinks: doc.querySelectorAll('a[href]').length,
      internalLinks: Array.from(doc.querySelectorAll('a[href]')).filter(a => 
        Utils.isInternalLink(a.href, url)
      ).length,
      externalLinks: Array.from(doc.querySelectorAll('a[href]')).filter(a => 
        !Utils.isInternalLink(a.href, url)
      ).length,
      
      // Content - extracted from real DOM
      bodyText: doc.body?.textContent || '',
      wordCount: Utils.countWords(doc.body?.textContent || ''),
      paragraphs: doc.querySelectorAll('p').length,
      
      // Technical - extracted from real DOM
      canonical: doc.querySelector('link[rel="canonical"]')?.href || '',
      viewport: doc.querySelector('meta[name="viewport"]')?.content || '',
      charset: doc.querySelector('meta[charset]')?.getAttribute('charset') || '',
      language: doc.documentElement?.lang || '',
      
      // Schema/Structured Data - extracted from real DOM
      schemas: Utils.extractSchemas(doc),
      hasSchema: doc.querySelectorAll('script[type="application/ld+json"]').length > 0,
      
      // Security
      isHttps: url.startsWith('https://')
    };
    
    // Extract keywords from real content
    data.keywords = Utils.extractKeywords(data.bodyText);
    data.topKeywords = data.keywords.slice(0, 10).map(k => [k.word, k.count]);
    
    console.log('📊 Real data extracted:', {
      title: data.title.substring(0, 50) + '...',
      images: data.imageCount,
      links: data.totalLinks,
      words: data.wordCount,
      keywords: data.keywords.length,
      h1Count: data.h1Count,
      hasSchema: data.hasSchema
    });
    
    return data;
  }
}

window.WebCrawler = WebCrawler;