// utils.js - Utility functions
class Utils {
  static countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
  
  static isInternalLink(href, baseUrl) {
    try {
      const linkHost = new URL(href).hostname;
      const baseHost = new URL(baseUrl).hostname;
      return linkHost === baseHost || href.startsWith('/') || href.startsWith('#');
    } catch {
      return href.startsWith('/') || href.startsWith('#');
    }
  }
  
  static extractKeywords(text) {
    const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
                       'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 
                       'should', 'could', 'can', 'may', 'might', 'of', 'in', 'on', 
                       'at', 'to', 'for', 'from', 'by', 'with', 'about', 'as', 'or', 'and'];
    
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const wordFreq = {};
    
    words.forEach(word => {
      if (!stopWords.includes(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({
        word,
        count,
        density: ((count / words.length) * 100).toFixed(2)
      }));
  }
  
  static extractSchemas(doc) {
    const schemas = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const schema = JSON.parse(script.textContent);
        schemas.push(schema);
      } catch (e) {
        console.warn('Failed to parse schema:', e);
      }
    });
    return schemas;
  }
  
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  static formatUrl(url) {
    return url.startsWith('http') ? url : 'https://' + url;
  }
}

window.Utils = Utils;