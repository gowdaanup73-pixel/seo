// ui.js - UI manipulation and rendering
class UIManager {
  constructor() {
    this.circumference = 2 * Math.PI * 45;
  }
  
  showLoading() {
    document.getElementById('loading-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
  }
  
  hideLoading() {
    document.getElementById('loading-section').classList.add('hidden');
  }
  
  showResults() {
    document.getElementById('results-section').classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }
  
  resetCircles() {
    document.querySelectorAll('.progress-circle').forEach(circle => {
      circle.style.strokeDashoffset = this.circumference;
    });
  }
  
  updateScores(scores) {
    console.log('🎨 Updating UI with scores:', scores);
    
    // Update overall score
    document.getElementById('overall-score').textContent = `${scores.total}/100`;
    
    // OnPage score
    this.updateCircleScore('onpage', scores.onPage, 40);
    
    // Technical score
    this.updateCircleScore('technical', scores.technical, 30);
    
    // Content score
    this.updateCircleScore('content', scores.content, 20);
    
    // Link score
    this.updateCircleScore('link', scores.links, 10);
    
    // Final score
    const finalPercent = (scores.total / 100) * 100;
    const finalOffset = this.circumference - (finalPercent / 100) * this.circumference;
    document.getElementById('final-score-text').textContent = scores.total;
    setTimeout(() => {
      document.getElementById('final-circle').style.strokeDashoffset = finalOffset;
    }, 500);
  }
  
  updateCircleScore(name, score, maxScore) {
    const percent = (score / maxScore) * 100;
    const offset = this.circumference - (percent / 100) * this.circumference;
    document.getElementById(`score-${name}`).textContent = score;
    setTimeout(() => {
      document.getElementById(`circle-${name}`).style.strokeDashoffset = offset;
    }, 100);
  }
  
  updateQuickStats(data) {
    document.getElementById('stats-title').textContent = data.title || 'Missing';
    document.getElementById('stats-desc').textContent = data.metaDescription || 'Missing';
    document.getElementById('stats-h1').textContent = data.h1Count;
    document.getElementById('stats-words').textContent = data.wordCount;
    document.getElementById('stats-images').textContent = data.imageCount;
    document.getElementById('stats-links').textContent = data.totalLinks;
    document.getElementById('stats-https').textContent = data.isHttps ? '✓' : '✗';
    document.getElementById('stats-keywords').textContent = data.topKeywords.length;
  }
  
  renderPieChart(scores) {
    const svg = document.getElementById('pie-chart-svg');
    const legend = document.getElementById('pie-chart-legend');
    
    const data = [
      { label: 'OnPage', value: scores.onPage, color: '#3b82f6', max: 40 },
      { label: 'Technical', value: scores.technical, color: '#10b981', max: 30 },
      { label: 'Content', value: scores.content, color: '#f97316', max: 20 },
      { label: 'Link', value: scores.links, color: '#ef4444', max: 10 }
    ];
    
    let total = data.reduce((sum, d) => sum + d.value, 0);
    let currentAngle = 0;
    
    svg.innerHTML = '';
    legend.innerHTML = '';
    
    data.forEach(item => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;
      
      // Create pie slice
      const x1 = 100 + 80 * Math.cos((currentAngle - 90) * Math.PI / 180);
      const y1 = 100 + 80 * Math.sin((currentAngle - 90) * Math.PI / 180);
      const x2 = 100 + 80 * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
      const y2 = 100 + 80 * Math.sin((currentAngle + angle - 90) * Math.PI / 180);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`);
      path.setAttribute('fill', item.color);
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
      
      currentAngle += angle;
      
      // Create legend item
      const legendItem = document.createElement('div');
      legendItem.className = 'flex items-center gap-3';
      legendItem.innerHTML = `
        <div class="w-4 h-4 rounded" style="background: ${item.color}"></div>
        <span class="text-gray-700 dark:text-gray-300 font-medium">${item.label}: ${item.value}/${item.max} (${percentage.toFixed(1)}%)</span>
      `;
      legend.appendChild(legendItem);
    });
  }
  
  renderRecommendations(recommendations) {
    const container = document.getElementById('recommendations-list');
    container.innerHTML = '';
    
    const priorityStyles = {
      high: { color: 'border-red-500', badge: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400', emoji: '🔴' },
      medium: { color: 'border-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400', emoji: '🟠' },
      low: { color: 'border-green-500', badge: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400', emoji: '🟢' }
    };
    
    recommendations.forEach((rec, index) => {
      const card = document.createElement('div');
      card.className = 'recommendation-card bg-white dark:bg-darkCard rounded-2xl shadow-lg p-6 hover:shadow-xl transition';
      
      const style = priorityStyles[rec.priority];
      card.classList.add(style.color, 'border-l-4');
      
      let html = `
        <div class="flex items-start justify-between mb-4">
          <span class="px-3 py-1 ${style.badge} text-xs font-bold rounded-full uppercase">
            ${style.emoji} ${rec.priority} Priority
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">⏱️ ${rec.time}</span>
        </div>
        
        <h5 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
          ${rec.title}
        </h5>
        
        <p class="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
          ${rec.description}
        </p>
        
        <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <p class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">📊 Impact:</p>
          <ul class="text-sm text-blue-800 dark:text-blue-400 space-y-1">
            ${rec.impact.map(item => `<li>• ${item}</li>`).join('')}
          </ul>
        </div>
        
        <div class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
          <p class="text-sm font-semibold text-gray-900 dark:text-white mb-3">🔧 How to Fix:</p>
          <ol class="text-sm text-gray-700 dark:text-gray-300 space-y-2">
            ${rec.steps.map((step, i) => `<li><strong>${i + 1}.</strong> ${step}</li>`).join('')}
          </ol>
        </div>
      `;
      
      if (rec.code) {
        html += `
          <div class="bg-gray-900 dark:bg-slate-950 rounded-lg p-4 mb-4">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-mono text-gray-400">HTML</p>
              <button onclick="window.copyCode(this)" class="text-xs text-primary-400 hover:text-primary-300">
                Copy
              </button>
            </div>
            <pre class="text-sm text-green-400 font-mono overflow-x-auto"><code>${rec.code}</code></pre>
          </div>
        `;
      }
      
      if (rec.bestPractices && rec.bestPractices.length > 0) {
        html += `
          <details class="mb-4">
            <summary class="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition">
              💡 Best Practices &amp; Tips
            </summary>
            <ul class="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-2 pl-4">
              ${rec.bestPractices.map(tip => `<li>• ${tip}</li>`).join('')}
            </ul>
          </details>
        `;
      }
      
      html += `
        <button onclick="window.markCompleted(this)" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition">
          Mark as Completed ✓
        </button>
      `;
      
      card.innerHTML = html;
      container.appendChild(card);
      
      setTimeout(() => {
        card.classList.add('is-visible');
      }, 100 * index);
    });
  }
  
  async loadScreenshot(url) {
    const img = document.getElementById('web-preview-img');
    const loading = document.getElementById('preview-loading');
    
    loading.style.display = 'flex';
    img.style.display = 'none';
    
    const cleanUrl = Utils.formatUrl(url);
    const screenshotUrl = `${CONFIG.SCREENSHOT_SERVICES[0]}${encodeURIComponent(cleanUrl)}`;
    
    try {
      const testImg = new Image();
      await new Promise((resolve, reject) => {
        testImg.onload = resolve;
        testImg.onerror = reject;
        testImg.src = screenshotUrl;
        setTimeout(reject, 10000);
      });
      
      img.src = screenshotUrl;
      img.style.display = 'block';
      loading.style.display = 'none';
    } catch (e) {
      loading.innerHTML = `
        <div class="text-center">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <p class="text-gray-500 dark:text-gray-400">Screenshot not available</p>
          <a href="${cleanUrl}" target="_blank" class="text-primary-600 dark:text-primary-500 hover:underline mt-2 inline-block">Visit website →</a>
        </div>
      `;
    }
  }
  
  showErrorModal(errorMessage, domain) {
    const modal = document.getElementById('error-modal');
    const errorMsg = document.getElementById('error-message');
    const errorDomain = document.getElementById('error-domain');
    
    errorMsg.textContent = errorMessage;
    errorDomain.textContent = domain || 'Unknown domain';
    
    modal.classList.remove('hidden');
  }
  
  addMessageToChat(message, sender) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    
    if (sender === 'user') {
      messageDiv.className = 'flex justify-end';
      messageDiv.innerHTML = `
        <div class="bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white p-3 rounded-2xl rounded-tr-none max-w-[80%]">
          <p class="text-sm">${Utils.escapeHtml(message)}</p>
        </div>
      `;
    } else {
      messageDiv.className = 'flex gap-2';
      messageDiv.innerHTML = `
        <div class="bg-primary-500 text-white p-3 rounded-2xl rounded-tl-none max-w-[80%]">
          <p class="text-sm">${Utils.escapeHtml(message)}</p>
        </div>
      `;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  
  showTypingIndicator() {
    const messagesDiv = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'flex gap-2';
    typingDiv.innerHTML = `
      <div class="bg-primary-500 text-white p-3 rounded-2xl rounded-tl-none">
        <div class="flex gap-1">
          <span class="w-2 h-2 bg-white rounded-full animate-bounce"></span>
          <span class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
          <span class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
        </div>
      </div>
    `;
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  
  removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }
}

window.UIManager = UIManager;