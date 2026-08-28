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

  const { message, auditData } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }

  let systemPrompt = 
    'You are an expert SEO assistant helping users optimize their websites. ' +
    'Provide clear, actionable SEO advice. Keep responses concise and helpful.';

  if (auditData) {
    systemPrompt += `\n\nHere is the real SEO audit data for the user's website (${auditData.url}):
- Overall Score: ${auditData.scores?.total || 0}/100
  * On-Page SEO: ${auditData.scores?.onPage || 0}/40
  * Technical SEO: ${auditData.scores?.technical || 0}/30
  * Content Quality: ${auditData.scores?.content || 0}/20
  * Link Density: ${auditData.scores?.links || 0}/10
- Metadata:
  * Title tag: "${auditData.title || 'Missing'}"
  * Meta description: "${auditData.metaDesc || 'Missing'}"
- Headings:
  * H1 count: ${auditData.h1Count}
  * H2 count: ${auditData.h2Count}
- Images & Links:
  * Total images: ${auditData.imageCount}
  * Images missing alt attribute: ${auditData.imagesWithoutAlt}
  * Total links: ${auditData.linkCount}
- Content:
  * Word count: ${auditData.wordCount}
  * Viewport meta tag present: ${auditData.hasViewport ? 'Yes' : 'No'}
- Crawlability:
  * robots.txt found: ${auditData.robots?.found ? 'Yes' : 'No'}
  * robots.txt blocks all search engines: ${auditData.robots?.disallowsAll ? 'Yes' : 'No'}
  * robots.txt references Sitemap: ${auditData.robots?.hasSitemap ? 'Yes' : 'No'}

Instructions:
1. Reference the actual numbers and findings listed above when responding to the user. Be specific (e.g. mention "your page has ${auditData.imagesWithoutAlt} images missing alt text" instead of generic advice like "improve your images").
2. Structure recommendations using these exact sections:
   - **CRITICAL**: Immediate high priority fixes (such as missing title tag, insecure HTTP, missing viewport, zero H1s, or word count < 300).
   - **HIGH**: Actionable items with large impact.
   - **MEDIUM**: Important fixes (such as suboptimal title/description length, multiple H1 tags).
   - **LOW**: Small optimizations.
3. Explain why each issue matters and give a concrete, plain-language fix.
4. If the user asks a general question, answer it but relate it back to their specific audit values.`;
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
            content: systemPrompt
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
