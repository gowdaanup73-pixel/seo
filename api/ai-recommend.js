// api/ai-recommend.js
// Vercel serverless function — proxies AI chat messages to OpenRouter.
// The API key is read from the OPENROUTER_API_KEY environment variable set in
// the Vercel dashboard; it is never shipped to the client.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'AI service is not configured' });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://streetcoders.dev',
        'X-Title': 'Street Coders SEO Analyzer'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert SEO assistant helping users optimize their websites. ' +
              'Provide clear, actionable SEO advice. Keep responses concise and helpful.'
          },
          {
            role: 'user',
            content: message.trim()
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('OpenRouter error:', upstream.status, errText);
      return res.status(502).json({ error: 'Upstream AI service error' });
    }

    const data = await upstream.json();

    if (!data.choices || !data.choices[0]) {
      return res.status(502).json({ error: 'Invalid response from AI service' });
    }

    return res.status(200).json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error('ai-recommend handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
