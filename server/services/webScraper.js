'use strict';
// =============================================================================
// PRODUCTION WEB SCRAPER — webScraper.js
// =============================================================================
// Async, multi-engine search with parallel page fetching, score-based content
// extraction, query-type-aware answer synthesis, and comprehensive fallbacks.
// Designed for 24/7 uptime on Render free tier.
// =============================================================================

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { URL } = require('url');
const http = require('http');
const https = require('https');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  http: {
    pageTimeout: 8000,       // 8s per page fetch
    searchTimeout: 12000,    // 12s for search engine queries
    maxResponseSize: 2 * 1024 * 1024,  // 2MB max
    maxConcurrent: 5,        // parallel page fetches
  },
  modes: {
    default:  { maxPages: 7,  sentencesPerPiece: 6,  maxLength: 8000,  bullet: false },
    detailed: { maxPages: 10, sentencesPerPiece: 12, maxLength: 15000, bullet: false },
    concise:  { maxPages: 4,  sentencesPerPiece: 3,  maxLength: 3000,  bullet: true },
  },
  content: {
    maxLen: 15000,
    minLen: 50,
    minSentence: 18,
    maxSentence: 500,
  },
};

// =============================================================================
// ROTATING USER-AGENTS
// =============================================================================

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
];

let _uaIdx = Math.floor(Math.random() * USER_AGENTS.length);
function rotateUA() { return USER_AGENTS[_uaIdx++ % USER_AGENTS.length]; }

// =============================================================================
// CONNECTION-POOLING HTTP AGENTS
// =============================================================================

const keepAliveHttpAgent  = new http.Agent({ keepAlive: true, maxSockets: 15, timeout: 30000 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 15, timeout: 30000, rejectUnauthorized: false });

function getAgent(parsedURL) {
  return parsedURL.protocol === 'https:' ? keepAliveHttpsAgent : keepAliveHttpAgent;
}

// Exported so server.js can destroy on shutdown
function destroyAgents() {
  try { keepAliveHttpAgent.destroy(); } catch (_) {}
  try { keepAliveHttpsAgent.destroy(); } catch (_) {}
}

// =============================================================================
// ASYNC HTTP CLIENT — with retry, timeout, size-limit
// =============================================================================

async function fetchPage(url, opts = {}) {
  const timeout  = opts.timeout  || CONFIG.http.pageTimeout;
  const retries  = opts.retries != null ? opts.retries : 1;
  const maxSize  = opts.maxSize  || CONFIG.http.maxResponseSize;
  const hdrs     = opts.headers  || {};

  const headers = {
    'User-Agent': rotateUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    ...hdrs,
  };

  const fetchOpts = { timeout, headers, compress: true, follow: 5, size: maxSize, agent: getAgent };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, fetchOpts);
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        return null;
      }
      return await res.text();
    } catch (err) {
      if (attempt < retries) { await sleep(1200 * (attempt + 1)); continue; }
      return null;
    }
  }
  return null;
}

async function fetchJSON(url, opts = {}) {
  const text = await fetchPage(url, {
    ...opts,
    headers: { 'Accept': 'application/json,*/*;q=0.8', ...(opts.headers || {}) },
  });
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

// =============================================================================
// UTILITIES
// =============================================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(tag, msg) { console.log(`[${tag}] ${msg}`); }

function cleanText(t) {
  return t.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; }
}

const STOP_WORDS = new Set([
  'what','is','are','how','does','do','the','a','an','in','of','to','for','and',
  'or','but','with','about','can','will','should','would','could','why','when',
  'where','who','which','has','have','had','was','were','been','be','this','that',
  'these','those','it','its','my','your','our','their','me','you','us','them','on',
  'at','by','from','up','out','if','not','no','so','just','than','too','very',
  'also','as','into','through','between','after','before','during','explain',
  'tell','give','define','describe','please','make','need','want','much','many',
]);

function extractKeywords(query) {
  const words = query.toLowerCase().replace(/[?!.,;:'"()]/g, '').split(/\s+/);
  const kw = words.filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return kw.length > 0 ? kw : words.filter(w => w.length > 1);
}

function isCaptchaPage(html) {
  if (!html) return false;
  // Real content pages are large; captcha/block pages are small
  if (html.length > 25000) return false;
  const l = html.toLowerCase();
  const blockPatterns = [
    'unusual traffic from your',
    'are you a robot',
    'verify you are human',
    'complete the security check',
    'automated requests from your',
    'please solve this captcha',
    'captcha challenge',
    'access denied',
    'request blocked',
    'your ip has been',
  ];
  return blockPatterns.some(p => l.includes(p));
}

// Concurrency limiter (like p-limit)
function createLimiter(concurrency) {
  let running = 0;
  const queue = [];
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        running++;
        try { resolve(await fn()); }
        catch (err) { reject(err); }
        finally { running--; if (queue.length > 0) queue.shift()(); }
      };
      running < concurrency ? run() : queue.push(run);
    });
  };
}

// Jaccard similarity for deduplication
function sentenceSimilar(a, b) {
  const s1 = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const s2 = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (s1.size < 3 || s2.size < 3) return false;
  let inter = 0;
  for (const w of s1) if (s2.has(w)) inter++;
  return inter / (s1.size + s2.size - inter) > 0.55;
}

// =============================================================================
// SEARCH ENGINE 1 — DuckDuckGo HTML (PRIMARY — most reliable)
// =============================================================================

async function searchDDGHTML(query, maxResults = 15) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  log('Search', `DDG-HTML: "${query}"`);
  const html = await fetchPage(url, { timeout: CONFIG.http.searchTimeout, retries: 2 });
  if (!html || html.length < 300 || isCaptchaPage(html)) {
    log('Search', 'DDG-HTML: no results or blocked');
    return [];
  }

  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('.result, .web-result').each(function () {
    if (results.length >= maxResults) return false;
    const $el = $(this);
    let linkEl = $el.find('.result__a, .result-link').first();
    if (!linkEl.length) linkEl = $el.find('a[href]').first();
    let href = (linkEl.attr('href') || '').trim();
    const title = linkEl.text().trim();

    // Decode DDG redirect
    if (href.includes('uddg=')) {
      try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch (_) {}
    }
    if (!href || !href.startsWith('http') || href.includes('duckduckgo.com')) return;
    if (seen.has(href)) return;
    seen.add(href);

    let snippet = $el.find('.result__snippet, .result-snippet').text().trim();
    if (!snippet) snippet = $el.find('.result__body, .result-body').text().trim();

    if (title && title.length > 2) {
      results.push({ title, url: href, snippet: snippet || '', engine: 'duckduckgo' });
    }
  });

  log('Search', `DDG-HTML: ${results.length} results`);
  return results;
}

// =============================================================================
// SEARCH ENGINE 2 — DuckDuckGo Lite (SECONDARY — simpler, harder to block)
// =============================================================================

async function searchDDGLite(query, maxResults = 10) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  log('Search', `DDG-Lite: "${query}"`);
  const html = await fetchPage(url, { timeout: CONFIG.http.searchTimeout, retries: 1 });
  if (!html || html.length < 200 || isCaptchaPage(html)) return [];

  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  // DDG Lite uses table-based layout
  $('a.result-link, table a[href*="http"]').each(function () {
    if (results.length >= maxResults) return false;
    let href = ($(this).attr('href') || '').trim();
    const title = $(this).text().trim();

    if (href.includes('uddg=')) {
      try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch (_) {}
    }
    if (!href.startsWith('http') || href.includes('duckduckgo.com')) return;
    if (seen.has(href)) return;
    seen.add(href);

    if (title && title.length > 2) {
      results.push({ title, url: href, snippet: '', engine: 'ddg-lite' });
    }
  });

  // Try to match snippets
  const snippetEls = $('td.result-snippet, .result-snippet');
  snippetEls.each(function (i) {
    if (i < results.length) results[i].snippet = $(this).text().trim();
  });

  log('Search', `DDG-Lite: ${results.length} results`);
  return results;
}

// =============================================================================
// SEARCH ENGINE 3 — Bing (TERTIARY — moderately reliable from servers)
// =============================================================================

async function searchBing(query, maxResults = 10) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}&setlang=en`;
  log('Search', `Bing: "${query}"`);
  const html = await fetchPage(url, { timeout: CONFIG.http.searchTimeout, retries: 1 });
  if (!html || html.length < 500 || isCaptchaPage(html)) return [];

  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('li.b_algo, .b_algo').each(function () {
    if (results.length >= maxResults) return false;
    const $el = $(this);
    const linkEl = $el.find('h2 a, a').first();
    const href = (linkEl.attr('href') || '').trim();
    if (!href.startsWith('http') || href.includes('bing.com') || href.includes('microsoft.com/bing')) return;
    if (seen.has(href)) return;
    seen.add(href);

    const title = linkEl.text().trim();
    const snippet = $el.find('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4').text().trim();

    if (title && title.length > 2) {
      results.push({ title, url: href, snippet: snippet || '', engine: 'bing' });
    }
  });

  log('Search', `Bing: ${results.length} results`);
  return results;
}

// =============================================================================
// SEARCH ENGINE 4 — Google (LAST RESORT — often blocked from server IPs)
// =============================================================================

async function searchGoogle(query, maxResults = 10) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}&hl=en`;
  log('Search', `Google: "${query}"`);
  const html = await fetchPage(url, { timeout: CONFIG.http.searchTimeout, retries: 0 });
  if (!html || html.length < 500 || isCaptchaPage(html)) return [];

  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $('div.g, div[data-sokoban-container]').each(function () {
    if (results.length >= maxResults) return false;
    const $el = $(this);
    const linkEl = $el.find('a').first();
    let href = (linkEl.attr('href') || '').trim();

    if (href.includes('/url?q=')) {
      try { href = decodeURIComponent(href.split('/url?q=')[1].split('&')[0]); } catch (_) {}
    }
    if (!href.startsWith('http') || href.includes('google.com') || href.includes('google.co')) return;
    if (seen.has(href)) return;
    seen.add(href);

    let title = $el.find('h3').first().text().trim();
    if (!title) title = linkEl.text().trim();
    const snippet = $el.find('.VwiC3b, [data-sncf], .IsZvec, .s3v9rd').text().trim() ||
      $el.find('span').filter(function () { return $(this).text().length > 30; }).first().text().trim();

    if (title && title.length > 3) {
      results.push({ title, url: href, snippet: snippet || '', engine: 'google' });
    }
  });

  log('Search', `Google: ${results.length} results`);
  return results;
}

// =============================================================================
// SEARCH ENGINE 5 — SearXNG Public Instances (AGGREGATED — JSON API)
// =============================================================================

const SEARXNG_INSTANCES = [
  'https://search.sapti.me',
  'https://priv.au',
  'https://searx.be',
  'https://search.ononoki.org',
  'https://searx.tiekoetter.com',
  'https://search.mdosch.de',
  'https://searx.info',
  'https://etsi.me',
];

async function searchSearXNG(query, maxResults = 10) {
  // Shuffle and try up to 3 instances
  const instances = [...SEARXNG_INSTANCES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(3, instances.length); i++) {
    const base = instances[i];
    const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;
    log('Search', `SearXNG [${base}]`);
    try {
      const data = await fetchJSON(url, { timeout: 8000, retries: 0 });
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        const results = data.results
          .filter(r => r.url && r.title && r.url.startsWith('http'))
          .slice(0, maxResults)
          .map(r => ({ title: r.title, url: r.url, snippet: r.content || '', engine: 'searxng' }));
        if (results.length > 0) {
          log('Search', `SearXNG: ${results.length} results from ${base}`);
          return results;
        }
      }
    } catch (_) { /* try next instance */ }
  }
  log('Search', 'SearXNG: no results from any instance');
  return [];
}

// =============================================================================
// SUPPLEMENTARY: DDG Instant Answer API
// =============================================================================

async function getDDGInstantAnswer(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJSON(url, { timeout: 6000, retries: 1 });
  if (!data) return null;

  const answer = data.AbstractText || data.Abstract || data.Answer || '';
  const source = data.AbstractSource || data.AnswerType || '';
  const absUrl = data.AbstractURL || '';

  if (answer && answer.length > 30) {
    return { answer, source, url: absUrl };
  }

  // Check infobox
  if (data.Infobox && data.Infobox.content && data.Infobox.content.length > 0) {
    const info = data.Infobox.content
      .filter(c => c.label && c.value)
      .map(c => `${c.label}: ${c.value}`)
      .join('. ');
    if (info.length > 30) return { answer: info, source: 'DuckDuckGo Infobox', url: absUrl };
  }

  // Check related topics
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    const relatedText = data.RelatedTopics
      .filter(t => t.Text && t.Text.length > 20)
      .slice(0, 3)
      .map(t => t.Text)
      .join(' ');
    if (relatedText.length > 30) return { answer: relatedText, source: 'DuckDuckGo', url: absUrl || `https://duckduckgo.com/?q=${encodeURIComponent(query)}` };
  }

  return null;
}

// =============================================================================
// SUPPLEMENTARY: Wikipedia REST API
// =============================================================================

async function getWikipediaSummary(query) {
  // Try the query directly, then keywords
  const attempts = [query, extractKeywords(query).join('_')];
  for (const attempt of attempts) {
    const encoded = encodeURIComponent(attempt.replace(/ /g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const data = await fetchJSON(url, { timeout: 5000, retries: 0 });
    if (data && data.extract && data.extract.length > 40) {
      return {
        title: data.title || attempt,
        content: data.extract,
        description: data.description || '',
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`,
      };
    }
  }
  return null;
}

// =============================================================================
// PAGE SCRAPING — fetch and extract content from any URL
// =============================================================================

const SKIP_EXTENSIONS = ['.pdf','.jpg','.jpeg','.png','.gif','.svg','.mp4','.mp3','.zip','.exe','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.rar','.7z'];
const BLOCKED_DOMAINS = ['facebook.com','instagram.com','twitter.com','x.com','linkedin.com','pinterest.com','tiktok.com','snapchat.com','discord.com','telegram.org'];

async function scrapePage(url, timeoutMs) {
  if (!timeoutMs) timeoutMs = CONFIG.http.pageTimeout;

  const urlLower = url.toLowerCase();
  for (const ext of SKIP_EXTENSIONS) {
    if (urlLower.includes(ext)) return null;
  }

  const domain = extractDomain(url);
  for (const bd of BLOCKED_DOMAINS) {
    if (domain.includes(bd)) return null;
  }

  const html = await fetchPage(url, { timeout: timeoutMs, retries: 1 });
  if (!html || html.length < 200 || isCaptchaPage(html)) return null;

  try {
    return extractContent(html, url);
  } catch (err) {
    log('Scrape', `Extract error for ${extractDomain(url)}: ${err.message}`);
    return null;
  }
}

// =============================================================================
// CONTENT EXTRACTION — score-based readability algorithm
// =============================================================================

function extractContent(html, url) {
  const $ = cheerio.load(html);

  // ---- STEP 1: Strip noise elements ----
  $('script,style,nav,footer,header,aside,iframe,noscript,form,svg,video,audio,canvas,template,select,button,input,textarea').remove();
  $(
    '.sidebar,.nav,.menu,.footer,.header,.ad,.advertisement,.social,.share,.comments,' +
    '.comment,.cookie,.popup,.modal,.newsletter,.subscribe,.related-posts,.recommended,' +
    '.promo,.banner,.widget,.breadcrumb,.pagination,.toc,.table-of-contents,' +
    '[role="navigation"],[role="banner"],[role="complementary"],[aria-hidden="true"],' +
    '.skip-link,.screen-reader-text,.visually-hidden'
  ).remove();

  // ---- STEP 2: Try JSON-LD structured data (cleanest source) ----
  let jsonLDContent = '';
  $('script[type="application/ld+json"]').each(function () {
    try {
      let obj = JSON.parse($(this).html());
      if (Array.isArray(obj)) obj = obj[0];
      if (obj && obj['@graph']) obj = obj['@graph'].find(g => g.articleBody || g.text) || obj;
      const body = obj.articleBody || obj.text || '';
      if (body.length > jsonLDContent.length) jsonLDContent = body;
    } catch (_) {}
  });
  if (jsonLDContent.length > 200) {
    const content = cleanText(jsonLDContent).substring(0, CONFIG.content.maxLen);
    return {
      title: getTitle($),
      description: getDescription($),
      content,
      headings: getHeadings($),
      listItems: getListItems($),
      url,
    };
  }

  // ---- STEP 3: Try priority CSS selectors ----
  const SELECTORS = [
    // Article / Blog
    'article', '[role="main"]', 'main',
    '.post-content', '.article-content', '.article-body', '.article__body',
    '.entry-content', '.content-body', '.story-body', '.post-body',
    '.page-content', '.text-content', '.blog-content',
    // Q&A
    '.s-prose', '.answer-body', '.post-text', '.question-body', '.AnswerContent',
    // Docs / Wiki
    '.markdown-body', '.documentation-content', '.doc-content',
    '.mw-parser-output', '#mw-content-text',
    '#content', '#main-content',
    // News
    '.article-text', '.story-content', '.news-content', '.body-content',
    '.field-body', '.article__content', '.story-text',
    // How-to / Knowledge
    '.how-to-content', '.tutorial-content', '.guide-content', '.answer', '.explanation',
    // Generic
    '.content', '.post', '.text', '#article', '#post-content',
    '[itemprop="articleBody"]', '[itemprop="text"]',
  ];

  let bestContent = '';
  for (const sel of SELECTORS) {
    const els = $(sel);
    if (!els.length) continue;
    let best = '';
    els.each(function () {
      const t = $(this).text().trim();
      if (t.length > best.length) best = t;
    });
    if (best.length > 100 && best.length > bestContent.length) {
      bestContent = best;
      break; // Take the first matching selector with good content
    }
  }

  // ---- STEP 4: Score-based block extraction (readability) ----
  if (bestContent.length < 200) {
    bestContent = scoreAndExtractBlocks($) || bestContent;
  }

  // ---- STEP 5: Fallback to body text ----
  if (bestContent.length < 100) {
    bestContent = $('body').text().trim();
  }

  bestContent = cleanText(bestContent);
  if (bestContent.length > CONFIG.content.maxLen) {
    bestContent = bestContent.substring(0, CONFIG.content.maxLen);
  }

  if (bestContent.length < CONFIG.content.minLen) return null;

  return {
    title: getTitle($),
    description: getDescription($),
    content: bestContent,
    headings: getHeadings($),
    listItems: getListItems($),
    url,
  };
}

/**
 * Score-based content block extraction (simplified Readability algorithm)
 * Scores each block element by text density, paragraph count, link ratio, and class signals.
 */
function scoreAndExtractBlocks($) {
  const candidates = [];

  $('div, section, article, main, td').each(function () {
    const el = $(this);
    const text = el.text().trim();
    if (text.length < 100) return;

    let score = 0;

    // Text length (log scale)
    score += Math.log2(Math.max(text.length, 1)) * 2;

    // Paragraph density
    const pCount = el.find('p').length;
    score += Math.min(pCount * 3, 30);

    // Link density (negative — high link density = navigation)
    const linkText = el.find('a').text().trim().length;
    const linkDensity = linkText / (text.length || 1);
    score -= linkDensity * 50;

    // Positive class/id signals
    const clsId = ((el.attr('class') || '') + ' ' + (el.attr('id') || '')).toLowerCase();
    if (/article|content|post|body|text|entry|main|story|prose|wiki|answer/.test(clsId)) score += 15;
    if (/sidebar|nav|menu|footer|header|ad|comment|widget|related|social|cookie|banner|promo/.test(clsId)) score -= 25;

    // Heading presence
    score += Math.min(el.find('h1,h2,h3').length * 2, 8);

    // Penalize very short blocks
    if (text.length < 200) score -= 5;

    candidates.push({ text, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  return (candidates.length > 0 && candidates[0].score > 5) ? candidates[0].text : null;
}

function getTitle($) {
  return (
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    $('h1').first().text().trim() ||
    ''
  ).substring(0, 200);
}

function getDescription($) {
  return cleanText(
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || ''
  ).substring(0, 400);
}

function getHeadings($) {
  const h = [];
  $('h1,h2,h3').each(function () {
    const t = $(this).text().trim();
    if (t.length > 3 && t.length < 150 && h.length < 25) h.push(t);
  });
  return h;
}

function getListItems($) {
  const items = [];
  $('li, dt, dd').each(function () {
    const t = $(this).text().trim();
    if (t.length > 15 && t.length < 300 && items.length < 25) items.push(t);
  });
  return items;
}

// =============================================================================
// QUERY TYPE DETECTION
// =============================================================================

function detectQueryType(query) {
  const q = query.toLowerCase().trim();
  if (/^(what|define|who|meaning)\b/.test(q) || /\bis\b.*\?$/.test(q)) return 'definition';
  if (/^how (to|do|can|should|does)/.test(q)) return 'howto';
  if (/\bvs\b|\bversus\b|\bcompare|\bdifference between\b/.test(q)) return 'comparison';
  if (/^(when|where|did|was)\b/.test(q)) return 'factual';
  if (/^(best|top|recommend)\b/.test(q) || /\bbest\b|\btop \d+/.test(q)) return 'list';
  if (/latest|recent|news|update|current|202[4-9]/.test(q)) return 'current';
  if (/^why\b/.test(q)) return 'explanation';
  return 'general';
}

// =============================================================================
// ANSWER SYNTHESIS — query-type-aware, deduplicated, cited
// =============================================================================

function synthesizeAnswer(query, contentPieces, mode) {
  if (!mode) mode = 'default';
  if (contentPieces.length === 0) return 'No relevant content found for this query.';

  const cfg = CONFIG.modes[mode] || CONFIG.modes.default;
  const queryType = detectQueryType(query);
  const queryTokens = extractKeywords(query);

  // Sort by priority (instant answers first, then scraped pages, then snippets)
  contentPieces.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // ---- Collect and score ALL sentences from all pieces ----
  const allScoredSentences = [];

  for (let i = 0; i < contentPieces.length; i++) {
    const piece = contentPieces[i];
    const raw = piece.content || '';
    if (raw.length < 20) continue;

    // Split into sentences
    const sentences = raw
      .split(/(?<=[.!?])\s+|(?<=\n)\s*/)
      .map(s => s.trim())
      .filter(s => s.length >= CONFIG.content.minSentence && s.length <= CONFIG.content.maxSentence);

    for (let j = 0; j < sentences.length; j++) {
      const sentence = sentences[j];
      const lower = sentence.toLowerCase();
      let score = 0;

      // --- Query relevance ---
      let matchCount = 0;
      for (const token of queryTokens) {
        if (lower.includes(token)) { score += 3; matchCount++; }
      }
      // Bonus for matching most query terms
      if (queryTokens.length > 0 && matchCount / queryTokens.length > 0.6) score += 4;

      // --- Query-type-specific boosts ---
      if (queryType === 'definition') {
        if (/\bis a\b|\bare\b|\brefers to\b|\bdefined as\b|\bmeans\b|\bknown as\b|\bis the\b/.test(sentence)) score += 5;
      } else if (queryType === 'howto') {
        if (/step|method|process|guide|you can|you should|first|then|next|finally/.test(lower)) score += 4;
        if (/^\d+[.)]\s/.test(sentence)) score += 3;
      } else if (queryType === 'comparison') {
        if (/however|while|whereas|unlike|compared|difference|better|worse|advantage|disadvantage/.test(lower)) score += 4;
      } else if (queryType === 'list') {
        if (/^\d+[.)]\s|^[-•]\s|best|top|recommended|popular/.test(sentence)) score += 3;
      } else if (queryType === 'current') {
        if (/202[4-9]|latest|recently|announced|released|updated|new /.test(lower)) score += 4;
      } else if (queryType === 'explanation') {
        if (/because|reason|due to|caused by|result of|therefore|since/.test(lower)) score += 4;
      }

      // --- General quality signals ---
      if (/according to|research|study|found that|shows? that|reported|announced|revealed/.test(lower)) score += 2;
      if (/\d{4}|since \d|in \d/.test(sentence)) score += 1.5;
      if (/\d+(\.\d+)?%|\$[\d,]+|\d+ (million|billion|trillion)/.test(sentence)) score += 2.5;
      if (/first|largest|most|key|significant|important|major|primary/.test(lower)) score += 1;
      if (/because|therefore|as a result|this means|for example|such as|including/.test(lower)) score += 1.5;

      // --- Position bonus ---
      if (j < 3) score += 2;
      if (j < 8) score += 1;

      // --- Source priority bonus ---
      score += (piece.priority || 0) * 0.5;

      // --- Penalties ---
      if (/cookie|privacy policy|terms of (service|use)|subscribe|sign up|log in|click here|advertisement|accept all|consent/.test(lower)) score -= 20;
      if (/\|\s*\||\{\{|\}\}|function\(|var |const |class /.test(sentence)) score -= 15;
      if (sentence.split(' ').length < 4) score -= 5;

      if (score > 0) {
        allScoredSentences.push({
          text: sentence,
          score,
          sourceIndex: piece.sourceIndex,
          pieceIndex: i,
          position: j,
        });
      }
    }
  }

  // Sort all sentences globally by score
  allScoredSentences.sort((a, b) => b.score - a.score);

  // ---- Select top sentences with diversity and deduplication ----
  const selected = [];
  const usedSources = {};
  const maxTotal = cfg.sentencesPerPiece * Math.min(contentPieces.length, cfg.maxPages);

  for (const s of allScoredSentences) {
    if (selected.length >= maxTotal) break;

    // Dedup: check similarity with already-selected
    let isDup = false;
    for (const sel of selected) {
      if (sentenceSimilar(s.text, sel.text)) { isDup = true; break; }
    }
    if (isDup) continue;

    // Source diversity: don't take too many from one source
    const srcCount = usedSources[s.sourceIndex] || 0;
    if (srcCount >= cfg.sentencesPerPiece) continue;

    selected.push(s);
    usedSources[s.sourceIndex] = srcCount + 1;
  }

  if (selected.length === 0 && contentPieces.length > 0) {
    // Fallback: just take the first content piece's text
    const fb = (contentPieces[0].content || '').substring(0, 500).trim();
    if (fb) return fb + ` [${contentPieces[0].sourceIndex}]`;
    return 'Could not extract relevant information. Please check the sources below.';
  }

  // ---- Format the answer ----
  // Group selected sentences by source for coherence
  const grouped = {};
  for (const s of selected) {
    if (!grouped[s.sourceIndex]) grouped[s.sourceIndex] = [];
    grouped[s.sourceIndex].push(s);
  }

  // Sort sentences within each group by original position
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => a.position - b.position);
  }

  // Build paragraphs
  const paragraphs = [];

  if (mode === 'detailed') {
    paragraphs.push(`## ${query}\n`);
  }

  // First, output sentences from highest-priority source
  const sourceOrder = Object.keys(grouped).sort((a, b) => {
    const maxA = Math.max(...grouped[a].map(s => s.score));
    const maxB = Math.max(...grouped[b].map(s => s.score));
    return maxB - maxA;
  });

  for (const srcIdx of sourceOrder) {
    const sentences = grouped[srcIdx];
    const texts = sentences.map(s => s.text);

    if (cfg.bullet) {
      paragraphs.push(texts.map(t => `• ${t}`).join('\n') + ` [${srcIdx}]`);
    } else {
      if (mode === 'detailed') {
        // Add a sub-heading from the source piece
        const piece = contentPieces.find(p => p.sourceIndex === Number(srcIdx));
        const heading = piece?.headings?.[0] || piece?.description || '';
        if (heading && heading.length > 5 && heading.length < 100) {
          paragraphs.push(`### ${heading}`);
        }
      }
      paragraphs.push(texts.join(' ') + ` [${srcIdx}]`);
    }
  }

  // Add list items if query is a list type and we have them
  if (queryType === 'list' || queryType === 'howto') {
    const listItems = [];
    for (const piece of contentPieces.slice(0, 3)) {
      if (piece.listItems) {
        for (const item of piece.listItems.slice(0, 8)) {
          if (item.length > 15 && !listItems.some(li => sentenceSimilar(li, item))) {
            listItems.push(item);
          }
        }
      }
    }
    if (listItems.length > 2) {
      paragraphs.push('\n**Key Points:**');
      paragraphs.push(listItems.slice(0, 8).map(li => `• ${li}`).join('\n'));
    }
  }

  // Footer
  if (mode === 'detailed' && paragraphs.length > 2) {
    paragraphs.push('\n---');
    paragraphs.push(`*Compiled from ${Object.keys(grouped).length} sources across the web.*`);
  }
  if (mode === 'concise') {
    paragraphs.push('\n*Concise summary — select Default or Detailed mode for more information.*');
  }

  let result = paragraphs.join('\n\n');

  // Enforce length limit
  if (result.length > cfg.maxLength) {
    result = result.substring(0, cfg.maxLength);
    const lastPeriod = result.lastIndexOf('.');
    if (lastPeriod > cfg.maxLength * 0.7) result = result.substring(0, lastPeriod + 1);
  }

  return result || 'Could not generate an answer. Please check the sources below.';
}

// =============================================================================
// RELATED QUESTIONS GENERATOR
// =============================================================================

function generateRelatedQuestions(query, contentPieces) {
  const related = [];
  const seen = new Set();
  const qLower = query.toLowerCase();

  const JUNK = /cookie|privacy|subscribe|sign up|menu|navigation|external links|references|see also|further reading|contents|edit|advertisement|trending|popular|footer|header|sidebar|share|comment|log in|register|search|home|about us|contact|disclaimer|skip to/i;

  for (const piece of contentPieces) {
    for (const heading of (piece.headings || [])) {
      const h = heading.trim();
      if (h.length < 8 || h.length > 80) continue;
      if (h.toLowerCase() === qLower || seen.has(h.toLowerCase())) continue;
      if (JUNK.test(h)) continue;
      seen.add(h.toLowerCase());
      related.push(h);
    }
  }

  // Add keyword-based variants
  const kwStr = extractKeywords(query).join(' ');
  if (kwStr.length > 2) {
    const variants = [
      `What is ${kwStr}?`,
      `${kwStr} explained in detail`,
      `Latest news about ${kwStr}`,
      `${kwStr} examples and use cases`,
      `${kwStr} vs alternatives`,
    ];
    for (const v of variants) {
      if (!seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); related.push(v); }
    }
  }

  return related.slice(0, 6);
}

// =============================================================================
// MAIN SEARCH ORCHESTRATOR
// =============================================================================

async function webSearch(query, mode) {
  if (!mode) mode = 'default';
  const startTime = Date.now();
  log('WebSearch', `=== "${query}" (mode: ${mode}) ===`);

  const cfg = CONFIG.modes[mode] || CONFIG.modes.default;
  const seenUrls = new Set();
  let allResults = [];

  // Helper: merge search results without duplicates
  function merge(newResults) {
    for (const r of newResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  // ================================================================
  // PHASE 1: MULTI-ENGINE SEARCH (cascading with parallel fallbacks)
  // ================================================================

  // Primary: DDG HTML (most reliable)
  const ddgResults = await searchDDGHTML(query, 15);
  merge(ddgResults);

  // If DDG returned few results, try secondary engines in parallel
  if (allResults.length < 6) {
    log('WebSearch', `Only ${allResults.length} from DDG, trying fallbacks...`);
    const [liteRes, bingRes] = await Promise.allSettled([
      searchDDGLite(query, 10),
      searchBing(query, 10),
    ]);
    if (liteRes.status === 'fulfilled') merge(liteRes.value);
    if (bingRes.status === 'fulfilled') merge(bingRes.value);
  }

  // If still insufficient, try SearXNG and Google in parallel
  if (allResults.length < 4) {
    log('WebSearch', `Still only ${allResults.length}, trying SearXNG + Google...`);
    const [searxRes, googleRes] = await Promise.allSettled([
      searchSearXNG(query, 10),
      searchGoogle(query, 10),
    ]);
    if (searxRes.status === 'fulfilled') merge(searxRes.value);
    if (googleRes.status === 'fulfilled') merge(googleRes.value);
  }

  log('WebSearch', `Total search results: ${allResults.length}`);

  // ================================================================
  // PHASE 2: INSTANT ANSWER (parallel with page scraping)
  // ================================================================

  const instantPromise = getDDGInstantAnswer(query);

  // ================================================================
  // PHASE 3: PARALLEL PAGE SCRAPING
  // ================================================================

  const sources = [];
  const contentPieces = [];
  const limit = createLimiter(CONFIG.http.maxConcurrent);

  // Select pages to scrape (skip blocked domains, use snippet as fallback)
  const toScrape = [];
  const snippetOnly = [];

  for (const r of allResults) {
    const domain = extractDomain(r.url);
    let blocked = false;
    for (const bd of BLOCKED_DOMAINS) {
      if (domain.includes(bd)) { blocked = true; break; }
    }
    if (blocked) {
      if (r.snippet && r.snippet.length > 25) snippetOnly.push(r);
    } else if (toScrape.length < cfg.maxPages) {
      toScrape.push(r);
    } else if (r.snippet && r.snippet.length > 25) {
      snippetOnly.push(r);
    }
  }

  // Scrape pages in parallel
  log('WebSearch', `Scraping ${toScrape.length} pages in parallel...`);
  const scrapePromises = toScrape.map((result, idx) =>
    limit(async () => {
      log('Scrape', `[${idx + 1}/${toScrape.length}] ${extractDomain(result.url)}`);
      const data = await scrapePage(result.url, CONFIG.http.pageTimeout);
      return { result, data };
    })
  );

  const scrapeResults = await Promise.allSettled(scrapePromises);

  // Process scraped pages
  for (const sr of scrapeResults) {
    if (sr.status !== 'fulfilled') continue;
    const { result, data } = sr.value;
    const srcIdx = sources.length + 1;

    if (data && data.content && data.content.length > CONFIG.content.minLen) {
      sources.push({ name: extractDomain(result.url), url: result.url, title: data.title || result.title, index: srcIdx });
      contentPieces.push({
        content: data.content,
        sourceIndex: srcIdx,
        headings: data.headings || [],
        description: data.description || result.snippet || '',
        listItems: data.listItems || [],
        priority: 5,
      });
    } else if (result.snippet && result.snippet.length > 25) {
      sources.push({ name: extractDomain(result.url), url: result.url, title: result.title, index: srcIdx });
      contentPieces.push({
        content: result.snippet,
        sourceIndex: srcIdx,
        headings: [],
        description: result.snippet,
        priority: 2,
      });
    }
  }

  // Add snippet-only sources
  for (const r of snippetOnly.slice(0, 3)) {
    const srcIdx = sources.length + 1;
    sources.push({ name: extractDomain(r.url), url: r.url, title: r.title, index: srcIdx });
    contentPieces.push({ content: r.snippet, sourceIndex: srcIdx, headings: [], priority: 1 });
  }

  // ================================================================
  // PHASE 4: INSTANT ANSWER + WIKIPEDIA SUPPLEMENT
  // ================================================================

  // Get instant answer result (was running in parallel)
  const instant = await instantPromise;
  if (instant && instant.answer && instant.answer.length > 30) {
    const iaUrl = instant.url || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    if (!seenUrls.has(iaUrl)) {
      const srcIdx = sources.length + 1;
      sources.unshift({ name: extractDomain(iaUrl), url: iaUrl, title: instant.source || 'Quick Answer', index: srcIdx });
      contentPieces.unshift({ content: instant.answer, sourceIndex: srcIdx, headings: [], priority: 10 });
      // Re-index all sources
      sources.forEach((s, i) => { s.index = i + 1; });
      contentPieces.forEach((p, i) => { if (p === contentPieces[0]) p.sourceIndex = 1; });
    }
  }

  // Wikipedia supplement if we have very few content pieces
  if (contentPieces.length < 3) {
    const wiki = await getWikipediaSummary(query);
    if (wiki && wiki.content && wiki.content.length > 30 && !seenUrls.has(wiki.url)) {
      const srcIdx = sources.length + 1;
      sources.push({ name: 'en.wikipedia.org', url: wiki.url, title: wiki.title, index: srcIdx });
      contentPieces.push({ content: wiki.content, sourceIndex: srcIdx, headings: [], description: wiki.description, priority: 6 });
      log('WebSearch', `Added Wikipedia: ${wiki.title}`);
    }
  }

  log('WebSearch', `Content: ${contentPieces.length} pieces from ${sources.length} sources`);

  // ================================================================
  // PHASE 5: SYNTHESIZE ANSWER
  // ================================================================

  if (sources.length === 0) {
    log('WebSearch', 'No results found');
    return {
      answer: `No results found for "${query}". Try rephrasing your search or using different keywords.`,
      sources: [],
      related: generateRelatedQuestions(query, []),
      title: query,
    };
  }

  // Re-index sources sequentially
  sources.forEach((s, i) => { s.index = i + 1; });
  // Update content piece source references
  const sourceUrlToIdx = {};
  for (const s of sources) sourceUrlToIdx[s.url] = s.index;
  // Content pieces already have sourceIndex set correctly from above

  const answer = synthesizeAnswer(query, contentPieces, mode);
  const related = generateRelatedQuestions(query, contentPieces);

  const elapsed = Date.now() - startTime;
  log('WebSearch', `Done in ${elapsed}ms — answer: ${answer.length} chars`);

  return { answer, sources, related, title: query };
}

// =============================================================================
// INSTANT ANSWER — Quick endpoint for fast answers
// =============================================================================

async function instantAnswer(query) {
  const [ddg, wiki] = await Promise.allSettled([
    getDDGInstantAnswer(query),
    getWikipediaSummary(query),
  ]);

  const ddgResult = ddg.status === 'fulfilled' ? ddg.value : null;
  const wikiResult = wiki.status === 'fulfilled' ? wiki.value : null;

  if (ddgResult) {
    return {
      answer: ddgResult.answer,
      source: ddgResult.source,
      url: ddgResult.url,
      wikipedia: wikiResult ? { title: wikiResult.title, summary: wikiResult.content.substring(0, 300), url: wikiResult.url } : null,
    };
  }

  if (wikiResult) {
    return {
      answer: wikiResult.content,
      source: 'Wikipedia',
      url: wikiResult.url,
      wikipedia: { title: wikiResult.title, summary: wikiResult.content.substring(0, 300), url: wikiResult.url },
    };
  }

  return { answer: null, source: null, url: null, wikipedia: null };
}

// =============================================================================
// SCRAPE URL — Scrape a single URL and return extracted content
// =============================================================================

async function scrapeUrl(url) {
  const data = await scrapePage(url, 12000);
  if (!data) return { error: 'Could not extract content from this URL.' };
  return data;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = { webSearch, instantAnswer, scrapeUrl, scrapePage, destroyAgents };
