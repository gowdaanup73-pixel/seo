// seoAnalyzer.js - Calculate SEO scores from crawled data
class SEOAnalyzer {
  analyze(crawlData) {
    console.log('📊 Starting SEO analysis on real crawled data...');
    
    const scores = {
      onPage: this.calculateOnPageScore(crawlData),
      technical: this.calculateTechnicalScore(crawlData),
      content: this.calculateContentScore(crawlData),
      links: this.calculateLinksScore(crawlData)
    };
    
    scores.total = scores.onPage + scores.technical + scores.content + scores.links;
    
    console.log('✅ Analysis complete:', scores);
    return scores;
  }
  
  calculateOnPageScore(data) {
    let score = 0;
    const w = CONFIG.SCORING.onPage.weights;
    
    // Title checks
    if (data.title && data.title !== 'Missing') {
      score += w.title;
      if (data.titleLength >= CONFIG.OPTIMAL.titleLength.min && 
          data.titleLength <= CONFIG.OPTIMAL.titleLength.max) {
        score += w.titleLength;
      }
    }
    
    // Meta description checks
    if (data.metaDescription && data.metaDescription !== 'Missing') {
      score += w.metaDesc;
      if (data.metaDescriptionLength >= CONFIG.OPTIMAL.metaDescLength.min && 
          data.metaDescriptionLength <= CONFIG.OPTIMAL.metaDescLength.max) {
        score += w.metaDescLength;
      }
    }
    
    // H1 checks
    if (data.h1Count > 0) score += w.h1;
    
    return Math.min(score, CONFIG.SCORING.onPage.max);
  }
  
  calculateTechnicalScore(data) {
    let score = 0;
    const w = CONFIG.SCORING.technical.weights;
    
    if (data.isHttps) score += w.https;
    if (data.viewport) score += w.viewport;
    if (data.h1Count === 1) score += w.h1Single;
    if (data.wordCount > 300) score += w.wordCount;
    
    return Math.min(score, CONFIG.SCORING.technical.max);
  }
  
  calculateContentScore(data) {
    let score = 0;
    const w = CONFIG.SCORING.content.weights;
    
    if (data.wordCount >= CONFIG.OPTIMAL.wordCount.min) score += w.wordCountMin;
    if (data.wordCount >= CONFIG.OPTIMAL.wordCount.optimal) score += w.wordCountOptimal;
    if (data.h2Count > 0) score += w.h2Tags;
    score += w.base; // Base content score
    
    return Math.min(score, CONFIG.SCORING.content.max);
  }
  
  calculateLinksScore(data) {
    let score = 0;
    const w = CONFIG.SCORING.links.weights;
    
    if (data.totalLinks >= CONFIG.OPTIMAL.linkCount.min) score += w.linkCount;
    if (data.totalLinks >= CONFIG.OPTIMAL.linkCount.optimal) score += w.linkCountHigh;
    
    return Math.min(score, CONFIG.SCORING.links.max);
  }
}

window.SEOAnalyzer = SEOAnalyzer;