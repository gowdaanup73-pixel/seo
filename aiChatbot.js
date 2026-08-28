// aiChatbot.js - AI chatbot integration
class AIChatbot {
  constructor() {
    this.apiKey = CONFIG.OPENROUTER_API_KEY;
    this.apiUrl = CONFIG.OPENROUTER_URL;
    this.chatOpen = false;
  }
  
  async sendMessage(userMessage) {
    console.log('🤖 Sending message to AI:', userMessage);
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.href,
          'X-Title': 'Street Coders SEO Analyzer'
        },
        body: JSON.stringify({
          model: 'openai/gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert SEO assistant helping users optimize their websites. Provide clear, actionable SEO advice. Keep responses concise and helpful.'
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });
      
      const data = await response.json();
      
      if (data.choices && data.choices[0]) {
        console.log('✅ AI response received');
        return data.choices[0].message.content;
      } else {
        throw new Error('Invalid API response');
      }
    } catch (error) {
      console.error('❌ AI API Error:', error);
      return 'Sorry, I encountered an error. Please try again.';
    }
  }
  
  toggleChat() {
    this.chatOpen = !this.chatOpen;
    const chatWindow = document.getElementById('chat-window');
    const toggleBtn = document.getElementById('chat-toggle-btn');
    
    if (this.chatOpen) {
      chatWindow.classList.add('active');
      chatWindow.style.display = 'flex';
      toggleBtn.style.transform = 'scale(0)';
    } else {
      chatWindow.classList.remove('active');
      chatWindow.style.display = 'none';
      toggleBtn.style.transform = 'scale(1)';
    }
  }
}

window.AIChatbot = AIChatbot;