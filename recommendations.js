// recommendations.js - Generate SEO recommendations
class RecommendationGenerator {
  generate(result) {
    console.log('💡 Generating recommendations from analysis...');
    
    const recs = [];
    
    // Meta Description - High Priority
    if (!result.metaDescription || result.metaDescription === 'Missing') {
      recs.push({
        priority: 'high',
        title: 'Add Meta Description',
        time: '10-15 min',
        description: 'Your website is missing a meta description, which is crucial for search engine results. A well-crafted meta description acts as a "sales pitch" in search results, directly impacting your click-through rate (CTR). Search engines like Google display this 150-160 character snippet below your page title, making it one of the first things potential visitors see.',
        impact: ['Increases click-through rates by 5-15%', 'Improves search result appearance', 'Helps search engines understand page content', 'Influences social media shares'],
        steps: [
          'Open your HTML file or CMS settings',
          'Locate the &lt;head&gt; section',
          'Add the meta description tag',
          'Write compelling 150-160 character description',
          'Include primary keywords naturally'
        ],
        code: `&lt;meta name="description" \n      content="Discover expert SEO tips and \n      strategies to boost your website ranking. \n      Improve visibility, traffic, and conversions \n      with proven techniques."&gt;`,
        bestPractices: [
          'Keep it between 150-160 characters (optimal length)',
          'Include your primary keyword near the beginning',
          'Write for humans, not just search engines',
          'Make it unique for each page',
          'Include a call-to-action when appropriate',
          'Avoid duplicate descriptions across pages'
        ]
      });
    }
    
    // Title Tag - High Priority
    if (!result.title || result.title === 'Missing') {
      recs.push({
        priority: 'high',
        title: 'Add Title Tag',
        time: '5-10 min',
        description: 'Your page is missing a title tag, which is one of the most important on-page SEO elements. The title tag appears in search engine results, browser tabs, and social media shares. Without it, search engines cannot properly index your page, and users won\'t understand what your page is about before clicking.',
        impact: ['Critical for search engine ranking', 'First impression in search results', 'Improves click-through rate by 20-30%', 'Required for social media sharing'],
        steps: [
          'Open your HTML file',
          'Find the &lt;head&gt; section',
          'Add a &lt;title&gt; tag',
          'Write a descriptive 50-60 character title',
          'Include your primary keyword'
        ],
        code: `&lt;title&gt;SEO Tips &amp; Strategies | Boost Your Rankings - YourBrand&lt;/title&gt;`,
        bestPractices: [
          'Keep between 50-60 characters for optimal display',
          'Put important keywords first',
          'Include your brand name at the end',
          'Make each page title unique',
          'Avoid keyword stuffing',
          'Write compelling, clickable titles'
        ]
      });
    } else if (result.titleLength < 30) {
      recs.push({
        priority: 'medium',
        title: 'Expand Title Tag Length',
        time: '5 min',
        description: `Your title tag is only ${result.titleLength} characters, which is too short to be effective. Search engines display up to 60 characters in search results, and you\'re not utilizing this valuable space. A longer, more descriptive title can significantly improve your click-through rate and provide better context to both users and search engines.`,
        impact: ['Better use of SERP real estate', 'Improved keyword targeting', 'Higher click-through rates', 'More descriptive for users'],
        steps: [
          'Review your current title: "' + result.title + '"',
          'Add descriptive keywords',
          'Expand to 50-60 characters',
          'Test the appearance in Google SERP simulator'
        ],
        code: null,
        bestPractices: [
          'Aim for 50-60 characters total',
          'Include primary and secondary keywords',
          'Make it compelling and clickable',
          'Add your brand name if space allows'
        ]
      });
    }
    
    // H1 Tag - High Priority
    if (result.h1Count === 0) {
      recs.push({
        priority: 'high',
        title: 'Add H1 Heading Tag',
        time: '5 min',
        description: 'Your page is missing an H1 tag, which is essential for proper page structure and SEO. The H1 tag tells both users and search engines what the main topic of your page is. Without it, search engines have difficulty understanding your content hierarchy, which can negatively impact your rankings.',
        impact: ['Improves content structure', 'Helps search engines understand page topic', 'Better accessibility for screen readers', 'Increases relevance for target keywords'],
        steps: [
          'Identify the main heading on your page',
          'Wrap it in an &lt;h1&gt; tag',
          'Ensure it includes your primary keyword',
          'Use only ONE H1 per page'
        ],
        code: `&lt;h1&gt;Complete Guide to SEO Optimization in 2025&lt;/h1&gt;`,
        bestPractices: [
          'Use only one H1 tag per page',
          'Include your primary keyword',
          'Make it descriptive and compelling',
          'Keep it between 20-70 characters',
          'Place it prominently near the top of the page'
        ]
      });
    } else if (result.h1Count > 1) {
      recs.push({
        priority: 'medium',
        title: 'Use Only One H1 Tag',
        time: '10 min',
        description: `Your page has ${result.h1Count} H1 tags, but SEO best practices recommend using only one H1 per page. Multiple H1 tags confuse search engines about which heading is the main topic of your page. This dilutes the SEO value and can harm your rankings. Convert additional H1 tags to H2 or H3 tags to maintain proper content hierarchy.`,
        impact: ['Clearer content hierarchy', 'Better search engine understanding', 'Improved page structure', 'Stronger focus on main keyword'],
        steps: [
          'Identify all H1 tags on your page',
          'Choose the most important one as your main H1',
          'Convert others to H2 or H3 tags',
          'Verify the hierarchy makes sense'
        ],
        code: null,
        bestPractices: [
          'Always use exactly one H1 per page',
          'Use H2 for major sections',
          'Use H3 for subsections',
          'Maintain logical hierarchy (H1 → H2 → H3)',
          'Don\'t skip heading levels'
        ]
      });
    }
    
    // Content Length - Medium Priority
    if (result.wordCount < 300) {
      recs.push({
        priority: 'medium',
        title: 'Increase Content Length',
        time: '30-60 min',
        description: `Your page currently has only ${result.wordCount} words, which is significantly below the recommended minimum of 600-1000 words for good SEO performance. Longer, comprehensive content tends to rank better in search results because it provides more value to users and more opportunities to target relevant keywords naturally.`,
        impact: ['Better search rankings', 'More keyword opportunities', 'Higher user engagement', 'Increased authority'],
        steps: [
          'Research your topic thoroughly',
          'Add detailed explanations and examples',
          'Include relevant statistics and data',
          'Add FAQ sections',
          'Expand on key points'
        ],
        code: null,
        bestPractices: [
          'Aim for at least 600-1000 words',
          'Focus on quality over quantity',
          'Break content into scannable sections',
          'Use bullet points and lists',
          'Add relevant images and media',
          'Answer user questions thoroughly'
        ]
      });
    }
    
    // H2 Headings - Low Priority
    if (result.h2Count === 0) {
      recs.push({
        priority: 'low',
        title: 'Add H2 Subheadings',
        time: '15-20 min',
        description: 'Your page lacks H2 subheadings, which are important for organizing content and improving readability. Subheadings break up long text, make content scannable, and help search engines understand your content structure. They also provide additional opportunities to include relevant keywords naturally.',
        impact: ['Better content organization', 'Improved readability', 'Enhanced user experience', 'Additional keyword opportunities'],
        steps: [
          'Identify major sections in your content',
          'Add descriptive H2 tags for each section',
          'Include relevant keywords where appropriate'
        ],
        code: `&lt;h2&gt;Why SEO Matters for Your Business&lt;/h2&gt;\n&lt;p&gt;Content about SEO importance...&lt;/p&gt;\n\n&lt;h2&gt;Top SEO Strategies for 2025&lt;/h2&gt;\n&lt;p&gt;Content about strategies...&lt;/p&gt;`,
        bestPractices: [
          'Use H2 for major sections',
          'Make headings descriptive',
          'Include keywords naturally',
          'Keep headings concise',
          'Maintain logical flow'
        ]
      });
    }
    
    // HTTPS - High Priority
    if (!result.url.startsWith('https')) {
      recs.push({
        priority: 'high',
        title: 'Enable HTTPS Security',
        time: '30-60 min',
        description: 'Your website is not using HTTPS, which means the connection is not secure. HTTPS is a confirmed Google ranking factor, and modern browsers display "Not Secure" warnings for HTTP sites. This damages user trust, reduces conversions, and negatively impacts your search rankings. Enabling HTTPS is essential for any modern website.',
        impact: ['Improved security and user trust', 'Better search engine rankings', 'Required for modern web features', 'Increased conversion rates'],
        steps: [
          'Purchase or obtain a free SSL certificate (Let\'s Encrypt)',
          'Install the SSL certificate on your server',
          'Update all internal links to HTTPS',
          'Set up 301 redirects from HTTP to HTTPS',
          'Update your sitemap and robots.txt'
        ],
        code: null,
        bestPractices: [
          'Use free Let\'s Encrypt certificates',
          'Enable HSTS (HTTP Strict Transport Security)',
          'Update all internal links',
          'Check for mixed content warnings',
          'Monitor certificate expiration'
        ]
      });
    }
    
    // Internal Links - Low Priority
    if (result.totalLinks < 5) {
      recs.push({
        priority: 'low',
        title: 'Add More Internal Links',
        time: '15-20 min',
        description: `Your page has only ${result.totalLinks} links. Internal linking is crucial for SEO as it helps search engines discover and index your content, distributes page authority, and improves user navigation. A well-structured internal linking strategy keeps users on your site longer and helps search engines understand your site\'s information architecture.`,
        impact: ['Better site structure', 'Improved crawlability', 'Enhanced user navigation', 'Distributed page authority'],
        steps: [
          'Identify related pages on your site',
          'Add contextual links within content',
          'Use descriptive anchor text'
        ],
        code: `&lt;p&gt;Learn more about &lt;a href="/seo-tips"&gt;advanced SEO techniques&lt;/a&gt; \nto improve your rankings.&lt;/p&gt;`,
        bestPractices: [
          'Use descriptive anchor text',
          'Link to relevant pages only',
          'Aim for 3-5 internal links per page',
          'Avoid over-optimization',
          'Link to both new and important pages'
        ]
      });
    }
    
    // Schema Markup - Low Priority
    if (!result.hasSchema) {
      recs.push({
        priority: 'low',
        title: 'Add Schema Markup',
        time: '20-30 min',
        description: 'Schema markup (structured data) helps search engines better understand your content and can result in rich snippets in search results. Rich snippets can include ratings, prices, availability, and other information that makes your listing stand out, potentially increasing click-through rates by 20-30%.',
        impact: ['Rich snippets in search results', 'Enhanced SERP appearance', 'Better search engine understanding', 'Increased click-through rates'],
        steps: [
          'Identify appropriate schema type (Article, Product, etc.)',
          'Use Google\'s Structured Data Markup Helper',
          'Add JSON-LD script to your page',
          'Test with Google\'s Rich Results Test'
        ],
        code: `&lt;script type="application/ld+json"&gt;\n{\n  "@context": "https://schema.org",\n  "@type": "Article",\n  "headline": "Your Article Title",\n  "author": {\n    "@type": "Person",\n    "name": "Author Name"\n  },\n  "datePublished": "2025-10-29"\n}\n&lt;/script&gt;`,
        bestPractices: [
          'Use JSON-LD format (Google recommended)',
          'Choose the most specific schema type',
          'Test with Google\'s validation tools',
          'Keep markup up to date',
          'Include all required properties'
        ]
      });
    }
    
    console.log('✅ Generated', recs.length, 'recommendations');
    return recs;
  }
}

window.RecommendationGenerator = RecommendationGenerator;