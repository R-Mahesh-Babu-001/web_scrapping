const cheerio = require('cheerio');
const { execSync } = require('child_process');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function curlGet(url, timeoutSec) {
  if (!timeoutSec) timeoutSec = 10;
  try {
    var result = execSync(
      'curl -sL --compressed --max-time ' + timeoutSec +
      ' -H "User-Agent: ' + USER_AGENT + '"' +
      ' -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"' +
      ' -H "Accept-Language: en-US,en;q=0.9"' +
      ' -H "Accept-Encoding: gzip, deflate"' +
      ' -H "DNT: 1"' +
      ' -H "Connection: keep-alive"' +
      ' -H "Upgrade-Insecure-Requests: 1"' +
      ' "' + url.replace(/"/g, '\\"') + '"',
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, timeout: (timeoutSec + 5) * 1000 }
    );
    return result;
  } catch (err) {
    console.log('[curlGet] Failed for ' + url + ': ' + (err.message || '').substring(0, 80));
    return null;
  }
}

function extractKeywords(query) {
  var stopWords = ['what', 'is', 'are', 'how', 'does', 'do', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'or', 'but', 'with', 'about', 'can', 'will', 'should', 'would', 'could', 'why', 'when', 'where', 'who', 'which', 'has', 'have', 'had', 'was', 'were', 'been', 'be', 'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our', 'their', 'me', 'you', 'us', 'them', 'on', 'at', 'by', 'from', 'up', 'out', 'if', 'not', 'no', 'so', 'just', 'than', 'too', 'very', 'also', 'as', 'into', 'through', 'between', 'after', 'before', 'during', 'explain', 'tell', 'give', 'define', 'describe'];
  var words = query.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/);
  var keywords = words.filter(function (w) { return w.length > 1 && stopWords.indexOf(w) === -1; });
  return keywords.length > 0 ? keywords.join(' ') : query;
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function extractDomain(url) {
  try { var p = new URL(url); return p.hostname.replace(/^www\./, ''); } catch (e) { return url; }
}

// ============================================================
// SEARCH ENGINES - Multiple sources for comprehensive results
// ============================================================

/**
 * Search DuckDuckGo HTML - PRIMARY SEARCH
 * Scrapes actual web results from DuckDuckGo
 */
function searchDDGHTML(query, maxResults) {
  if (!maxResults) maxResults = 12;
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://html.duckduckgo.com/html/?q=' + encodedQuery;
  console.log('[Search] DDG HTML: "' + query + '"');
  var html = curlGet(url, 15);
  if (!html || html.length < 200) return [];

  var $ = cheerio.load(html);
  var results = [];
  var seen = {};

  // DDG HTML has .result elements
  $('.result, .web-result').each(function (i, el) {
    if (results.length >= maxResults) return false;
    var $el = $(el);
    var linkEl = $el.find('.result__a, .result-link, a.result__url').first();
    if (!linkEl.length) linkEl = $el.find('a').first();

    var href = linkEl.attr('href') || '';
    var title = linkEl.text().trim();

    // Decode DDG redirect URLs
    if (href.indexOf('uddg=') !== -1) {
      try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch (e) {}
    }
    if (!href || href.indexOf('http') !== 0) return;
    if (href.indexOf('duckduckgo.com') !== -1) return;
    if (seen[href]) return;
    seen[href] = true;

    var snippet = $el.find('.result__snippet, .result-snippet').text().trim();
    if (!snippet) snippet = $el.find('.result__body, .result-body').text().trim();

    if (title) {
      results.push({ title: title, url: href, snippet: snippet || '' });
    }
  });

  console.log('[Search] DDG HTML found ' + results.length + ' results');
  return results;
}

/**
 * Search via Google scraping (fallback)
 */
function searchGoogle(query, maxResults) {
  if (!maxResults) maxResults = 10;
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://www.google.com/search?q=' + encodedQuery + '&num=' + maxResults + '&hl=en';
  console.log('[Search] Google: "' + query + '"');

  var html = curlGet(url, 12);
  if (!html || html.length < 500) return [];

  var $ = cheerio.load(html);
  var results = [];
  var seen = {};

  $('div.g, div[data-sokoban-container]').each(function (i, el) {
    if (results.length >= maxResults) return false;
    var $el = $(el);
    var linkEl = $el.find('a').first();
    var href = linkEl.attr('href') || '';

    if (href.indexOf('/url?q=') !== -1) {
      try { href = decodeURIComponent(href.split('/url?q=')[1].split('&')[0]); } catch (e) {}
    }
    if (!href || href.indexOf('http') !== 0) return;
    if (href.indexOf('google.com') !== -1) return;
    if (seen[href]) return;
    seen[href] = true;

    var title = $el.find('h3').first().text().trim();
    if (!title) title = linkEl.text().trim();
    var snippet = $el.find('.VwiC3b, [data-sncf], .IsZvec, .s3v9rd').text().trim();
    if (!snippet) snippet = $el.find('span').filter(function () { return $(this).text().length > 30; }).first().text().trim();

    if (title && title.length > 3) {
      results.push({ title: title, url: href, snippet: snippet || '' });
    }
  });

  console.log('[Search] Google found ' + results.length + ' results');
  return results;
}

/**
 * Search via Bing scraping (fallback)
 */
function searchBing(query, maxResults) {
  if (!maxResults) maxResults = 10;
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://www.bing.com/search?q=' + encodedQuery + '&count=' + maxResults;
  console.log('[Search] Bing: "' + query + '"');

  var html = curlGet(url, 12);
  if (!html || html.length < 500) return [];

  var $ = cheerio.load(html);
  var results = [];
  var seen = {};

  $('li.b_algo, .b_algo').each(function (i, el) {
    if (results.length >= maxResults) return false;
    var $el = $(el);
    var linkEl = $el.find('h2 a, a').first();
    var href = linkEl.attr('href') || '';
    if (!href || href.indexOf('http') !== 0) return;
    if (href.indexOf('bing.com') !== -1 || href.indexOf('microsoft.com/bing') !== -1) return;
    if (seen[href]) return;
    seen[href] = true;

    var title = linkEl.text().trim();
    var snippet = $el.find('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4').text().trim();

    if (title && title.length > 3) {
      results.push({ title: title, url: href, snippet: snippet || '' });
    }
  });

  console.log('[Search] Bing found ' + results.length + ' results');
  return results;
}

/**
 * DuckDuckGo Instant Answer API for quick facts
 */
function getDDGInstantAnswer(query) {
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://api.duckduckgo.com/?q=' + encodedQuery + '&format=json&no_html=1&skip_disambig=1';
  var body = curlGet(url, 8);
  if (!body) return null;
  try { return JSON.parse(body); } catch (e) { return null; }
}

/**
 * Wikipedia summary for supplementary info
 */
function getWikipediaSummary(title) {
  var encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
  var url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodedTitle;
  var body = curlGet(url, 6);
  if (!body) return null;
  try {
    var data = JSON.parse(body);
    if (data.extract && data.extract.length > 30) {
      return {
        title: data.title || title,
        content: data.extract,
        description: data.description || '',
        url: (data.content_urls && data.content_urls.desktop) ? data.content_urls.desktop.page : ('https://en.wikipedia.org/wiki/' + encodedTitle),
      };
    }
    return null;
  } catch (e) { return null; }
}


// ============================================================
// WEB PAGE SCRAPER - Universal content extraction
// ============================================================

/**
 * Scrape a web page and extract its main content
 */
function scrapePage(url, timeoutSec) {
  if (!timeoutSec) timeoutSec = 8;

  // Skip URLs that are unlikely to have useful text content
  var skipPatterns = ['.pdf', '.jpg', '.png', '.gif', '.mp4', '.mp3', '.zip', '.exe', '.doc', '.xls'];
  var urlLower = url.toLowerCase();
  for (var s = 0; s < skipPatterns.length; s++) {
    if (urlLower.indexOf(skipPatterns[s]) !== -1) return null;
  }

  var html = curlGet(url, timeoutSec);
  if (!html || html.length < 200) return null;
  return extractContent(html, url);
}

/**
 * Extract main content from HTML
 * Handles articles, blogs, docs, forums, Q&A sites, etc.
 */
function extractContent(html, url) {
  var $ = cheerio.load(html);

  // Remove noise elements
  $('script, style, nav, footer, header, aside, iframe, noscript, form, svg, img, video, audio, canvas, template').remove();
  $('.sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, .social, .share, .comments, .comment, .cookie, .popup, .modal, .newsletter, .subscribe, .related-posts, .recommended, .promo, .banner, .widget, .breadcrumb, .pagination, [role="navigation"], [role="banner"], [role="complementary"], [aria-hidden="true"]').remove();

  var mainContent = '';

  // Priority selectors for main content (broadened for all site types)
  var selectors = [
    // Articles & Blog posts
    'article', '[role="main"]', 'main',
    '.post-content', '.article-content', '.article-body', '.article__body',
    '.entry-content', '.content-body', '.story-body', '.post-body',
    '.page-content', '.text-content', '.blog-content', '.blog-post',
    // Q&A sites (StackOverflow, Quora, Reddit)
    '.s-prose', '.answer-body', '.post-text', '.question-body',
    '.AnswerContent', '.qu-content',
    '.Post', '._1qeIAgB0cPwnLhDF9XSiJM',
    // Documentation sites
    '.markdown-body', '.documentation-content', '.doc-content',
    '.content-wrapper', '#content', '#main-content',
    // Wiki
    '.mw-parser-output', '#mw-content-text',
    // News sites
    '.article-text', '.story-content', '.news-content', '.body-content',
    '.field-body', '.article__content', '.story-text',
    // Knowledge bases / How-to
    '.how-to-content', '.tutorial-content', '.guide-content',
    '.answer', '.explanation',
    // Generic
    '.content', '.post', '.text', '#article', '#post-content',
    '[itemprop="articleBody"]', '[itemprop="text"]',
  ];

  for (var i = 0; i < selectors.length; i++) {
    var el = $(selectors[i]);
    if (el.length > 0) {
      var bestEl = el.first();
      var bestLen = 0;
      el.each(function (idx, e) {
        var text = $(e).text().trim();
        if (text.length > bestLen) {
          bestLen = text.length;
          bestEl = $(e);
        }
      });
      if (bestLen > 80) {
        mainContent = bestEl.text();
        break;
      }
    }
  }

  // Fallback to body
  if (mainContent.trim().length < 100) {
    mainContent = $('body').text();
  }

  mainContent = cleanText(mainContent);

  // Keep up to 10KB for better coverage
  if (mainContent.length > 10000) mainContent = mainContent.substring(0, 10000);

  var title = $('title').text().trim() ||
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') || '';

  var description = $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') || '';

  var headings = [];
  $('h1, h2, h3').each(function (idx, el) {
    var text = $(el).text().trim();
    if (text.length > 3 && text.length < 200) headings.push(text);
  });

  var listItems = [];
  $('li, dt, dd').each(function (idx, el) {
    var text = $(el).text().trim();
    if (text.length > 15 && text.length < 300 && listItems.length < 20) {
      listItems.push(text);
    }
  });

  return {
    title: cleanText(title),
    description: cleanText(description),
    content: mainContent,
    headings: headings.slice(0, 20),
    listItems: listItems,
    url: url
  };
}


// ============================================================
// MAIN SEARCH FUNCTION - Search everywhere, scrape everything
// ============================================================

function webSearch(query, mode) {
  if (!mode) mode = 'default';
  console.log('[WebScraper] === Searching: "' + query + '" (mode: ' + mode + ') ===');

  var allSearchResults = [];
  var seenUrls = {};

  // ---------------------------------------------------------
  // STEP 1: Search multiple engines for real web results
  // ---------------------------------------------------------

  // Primary: DuckDuckGo HTML (most reliable, no captcha)
  var ddgResults = searchDDGHTML(query, 12);
  for (var d = 0; d < ddgResults.length; d++) {
    if (!seenUrls[ddgResults[d].url]) {
      seenUrls[ddgResults[d].url] = true;
      ddgResults[d].engine = 'duckduckgo';
      allSearchResults.push(ddgResults[d]);
    }
  }

  // Secondary: Google (may get captchas but worth trying)
  if (allSearchResults.length < 8) {
    var googleResults = searchGoogle(query, 10);
    for (var g = 0; g < googleResults.length; g++) {
      if (!seenUrls[googleResults[g].url]) {
        seenUrls[googleResults[g].url] = true;
        googleResults[g].engine = 'google';
        allSearchResults.push(googleResults[g]);
      }
    }
  }

  // Tertiary: Bing
  if (allSearchResults.length < 6) {
    var bingResults = searchBing(query, 8);
    for (var b = 0; b < bingResults.length; b++) {
      if (!seenUrls[bingResults[b].url]) {
        seenUrls[bingResults[b].url] = true;
        bingResults[b].engine = 'bing';
        allSearchResults.push(bingResults[b]);
      }
    }
  }

  console.log('[WebScraper] Total unique search results: ' + allSearchResults.length);

  // ---------------------------------------------------------
  // STEP 2: Quick facts from DDG Instant Answer API
  // ---------------------------------------------------------
  var ddgData = getDDGInstantAnswer(query);
  var instantAnswer = '';
  var instantUrl = '';
  var instantSource = '';

  if (ddgData) {
    instantAnswer = ddgData.Abstract || ddgData.AbstractText || ddgData.Answer || '';
    instantUrl = ddgData.AbstractURL || '';
    instantSource = ddgData.AbstractSource || '';
  }

  // ---------------------------------------------------------
  // STEP 3: Scrape actual web pages for full content
  // ---------------------------------------------------------
  var sources = [];
  var contentPieces = [];

  // Add instant answer as first content piece if available
  if (instantAnswer && instantAnswer.length > 40) {
    var mainUrl = instantUrl || 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
    sources.push({ name: extractDomain(mainUrl), url: mainUrl, title: instantSource || 'Quick Answer', index: 1 });
    contentPieces.push({ content: instantAnswer, sourceIndex: 1, headings: [], priority: 10 });
  }

  // Determine how many pages to scrape based on mode
  var maxScrape = { default: 6, detailed: 10, concise: 4 };
  var scrapeLimit = maxScrape[mode] || 6;
  var scraped = 0;

  // Sites that tend to block scrapers
  var blockedDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'pinterest.com', 'tiktok.com'];

  for (var r = 0; r < allSearchResults.length && scraped < scrapeLimit; r++) {
    var result = allSearchResults[r];
    var pageUrl = result.url;
    var domain = extractDomain(pageUrl);

    var isBlocked = false;
    for (var bl = 0; bl < blockedDomains.length; bl++) {
      if (domain.indexOf(blockedDomains[bl]) !== -1) { isBlocked = true; break; }
    }
    if (isBlocked) {
      if (result.snippet && result.snippet.length > 30) {
        var sidx = sources.length + 1;
        sources.push({ name: domain, url: pageUrl, title: result.title, index: sidx });
        contentPieces.push({ content: result.snippet, sourceIndex: sidx, headings: [], priority: 1 });
      }
      continue;
    }

    console.log('[WebScraper] Scraping [' + (scraped + 1) + '/' + scrapeLimit + ']: ' + result.title.substring(0, 60));

    var pageData = scrapePage(pageUrl, 8);
    if (pageData && pageData.content && pageData.content.length > 60) {
      scraped++;
      var srcIndex = sources.length + 1;
      sources.push({
        name: domain,
        url: pageUrl,
        title: pageData.title || result.title,
        index: srcIndex
      });
      contentPieces.push({
        content: pageData.content,
        sourceIndex: srcIndex,
        headings: pageData.headings || [],
        description: pageData.description || result.snippet || '',
        listItems: pageData.listItems || [],
        priority: 5
      });
    } else if (result.snippet && result.snippet.length > 30) {
      scraped++;
      var snipIdx = sources.length + 1;
      sources.push({ name: domain, url: pageUrl, title: result.title, index: snipIdx });
      contentPieces.push({
        content: result.snippet,
        sourceIndex: snipIdx,
        headings: [],
        description: result.snippet,
        priority: 2
      });
    }
  }

  // ---------------------------------------------------------
  // STEP 4: Supplement with Wikipedia for factual queries
  // ---------------------------------------------------------
  if (contentPieces.length < 3) {
    var keywords = extractKeywords(query);
    var wikiSummary = getWikipediaSummary(keywords);
    if (wikiSummary && wikiSummary.content && wikiSummary.content.length > 30) {
      if (!seenUrls[wikiSummary.url]) {
        var wikiIdx = sources.length + 1;
        sources.push({ name: 'en.wikipedia.org', url: wikiSummary.url, title: wikiSummary.title, index: wikiIdx });
        contentPieces.push({
          content: wikiSummary.content,
          sourceIndex: wikiIdx,
          headings: [],
          description: wikiSummary.description || '',
          priority: 4
        });
        console.log('[WebScraper] Added Wikipedia: ' + wikiSummary.title);
      }
    }
  }

  console.log('[WebScraper] Final: ' + contentPieces.length + ' content pieces from ' + sources.length + ' sources');

  // ---------------------------------------------------------
  // STEP 5: Handle no results
  // ---------------------------------------------------------
  if (sources.length === 0) {
    return {
      answer: 'I could not find relevant results for "' + query + '". Please try rephrasing your search or using different keywords.',
      sources: [],
      related: [],
      title: 'No Results Found'
    };
  }

  // ---------------------------------------------------------
  // STEP 6: Synthesize answer from all collected content
  // ---------------------------------------------------------
  var answer = synthesizeAnswer(query, contentPieces, mode);
  var related = generateRelatedQuestions(query, contentPieces);

  return { answer: answer, sources: sources, related: related, title: query };
}


// ============================================================
// ANSWER SYNTHESIS
// ============================================================

function synthesizeAnswer(query, contentPieces, mode) {
  if (!mode) mode = 'default';
  if (contentPieces.length === 0) return 'No relevant content found.';

  var queryTokens = query.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2; });

  // Sort content pieces by priority
  contentPieces.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });

  var config = {
    default:  { maxSentences: 5,  maxPieces: 6,  maxLength: 8000,  bulletMode: false },
    detailed: { maxSentences: 10, maxPieces: 10, maxLength: 15000, bulletMode: false },
    concise:  { maxSentences: 3,  maxPieces: 3,  maxLength: 2500,  bulletMode: true }
  };
  var cfg = config[mode] || config['default'];

  var paragraphs = [];
  var usedSentences = {};
  var piecesUsed = 0;

  if (mode === 'detailed') {
    paragraphs.push('## ' + query);
  }

  for (var i = 0; i < contentPieces.length && piecesUsed < cfg.maxPieces; i++) {
    var piece = contentPieces[i];
    var content = piece.content || '';
    var srcIdx = piece.sourceIndex;
    if (!content || content.length < 25) continue;
    piecesUsed++;

    var sentences = content.split(/(?<=[.!?])\s+/).filter(function (s) {
      return s.length > 20 && s.length < 600;
    });

    var scored = sentences.map(function (sentence, idx) {
      var lower = sentence.toLowerCase();
      var score = 0;

      // Query term matches
      for (var t = 0; t < queryTokens.length; t++) {
        if (lower.indexOf(queryTokens[t]) !== -1) score += 3;
      }

      // Definitional patterns
      if (/is a |are |refers to|defined as|means |known as|is the /i.test(sentence)) score += 3;

      // Factual/informative patterns
      if (/according to|research|study|found that|shows that|reported|stated|announced|revealed/i.test(sentence)) score += 2;
      if (/in \d{4}|since \d{4}|\d{4}[-\u2013]\d{4}/i.test(sentence)) score += 1.5;
      if (/\d+(\.\d+)?%|\$[\d,]+|\d+ (million|billion|trillion)/i.test(sentence)) score += 2;
      if (/first|largest|most|best|top|leading|major|important|significant|key/i.test(sentence)) score += 1;

      // Explanatory patterns
      if (/because|therefore|as a result|this means|for example|such as|including/i.test(sentence)) score += 1.5;
      if (/however|although|despite|while|unlike|on the other hand/i.test(sentence)) score += 1;

      // How-to / instructional
      if (/steps?|method|process|guide|tutorial|instructions|to do this|you can|you should/i.test(sentence)) score += 2;

      // Position bonus
      if (idx < 5) score += 1;
      if (idx < 2) score += 1;

      // Penalize garbage
      if (/cookie|privacy policy|terms of service|subscribe|sign up|log in|click here|advertisement|accept all/i.test(sentence)) score -= 10;
      if (/\|\s*\||\{\{|\}\}/.test(sentence)) score -= 5;

      return { sentence: sentence.trim(), score: score };
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    var topN = (i === 0) ? cfg.maxSentences : Math.max(2, Math.floor(cfg.maxSentences / 2));
    var selected = [];
    for (var k = 0; k < scored.length && selected.length < topN; k++) {
      if (scored[k].score <= 0) continue;
      var sentKey = scored[k].sentence.substring(0, 80).toLowerCase();
      if (usedSentences[sentKey]) continue;
      usedSentences[sentKey] = true;
      selected.push(scored[k].sentence);
    }

    if (selected.length > 0) {
      var text;
      if (cfg.bulletMode) {
        text = selected.map(function (s) { return '- ' + s; }).join('\n') + ' [' + srcIdx + ']';
      } else if (mode === 'detailed') {
        var heading = (piece.description || (piece.headings && piece.headings[0]) || '');
        if (heading && heading.length > 5 && heading.length < 80) {
          paragraphs.push('### ' + heading);
        }
        text = selected.join(' ') + ' [' + srcIdx + ']';
      } else {
        text = selected.join(' ') + ' [' + srcIdx + ']';
      }
      paragraphs.push(text);
    } else if (content.length > 50 && piecesUsed <= 2) {
      var maxIntro = mode === 'concise' ? 200 : (mode === 'detailed' ? 600 : 400);
      var firstPara = content.substring(0, maxIntro).trim();
      if (firstPara.lastIndexOf('.') > 50) {
        firstPara = firstPara.substring(0, firstPara.lastIndexOf('.') + 1);
      }
      if (cfg.bulletMode) {
        paragraphs.push('- ' + firstPara + ' [' + srcIdx + ']');
      } else {
        paragraphs.push(firstPara + ' [' + srcIdx + ']');
      }
    }
  }

  if (paragraphs.length === 0 && contentPieces.length > 0) {
    var first = contentPieces[0];
    var fallbackLen = mode === 'concise' ? 200 : 500;
    var fallbackText = (first.content || '').substring(0, fallbackLen).trim();
    if (fallbackText) paragraphs.push(fallbackText + ' [' + first.sourceIndex + ']');
  }

  if (mode === 'detailed' && paragraphs.length > 2) {
    paragraphs.push('---');
    paragraphs.push('*Detailed response compiled from ' + piecesUsed + ' sources across the web.*');
  }
  if (mode === 'concise') {
    paragraphs.push('\n*Concise summary \u2014 select Default or Detailed for more information.*');
  }

  var result = paragraphs.join('\n\n') || 'Could not generate a detailed answer. Please check the sources below.';

  if (result.length > cfg.maxLength) {
    result = result.substring(0, cfg.maxLength);
    var lastPeriod = result.lastIndexOf('.');
    if (lastPeriod > cfg.maxLength * 0.7) {
      result = result.substring(0, lastPeriod + 1);
    }
  }

  return result;
}


// ============================================================
// RELATED QUESTIONS
// ============================================================

function generateRelatedQuestions(query, contentPieces) {
  var related = [];
  var seen = {};
  var queryLower = query.toLowerCase();

  var junkPatterns = ['cookie', 'privacy', 'subscribe', 'sign up', 'menu', 'navigation', 'external links', 'references', 'see also', 'further reading', 'contents', 'edit', 'advertisement', 'related', 'trending', 'popular', 'footer', 'header', 'sidebar', 'share', 'comment', 'log in', 'register', 'search', 'home', 'about us', 'contact', 'disclaimer'];

  for (var i = 0; i < contentPieces.length; i++) {
    var headings = contentPieces[i].headings || [];
    for (var h = 0; h < headings.length; h++) {
      var heading = headings[h].trim();
      var hLower = heading.toLowerCase();

      if (heading.length < 8 || heading.length > 80) continue;
      if (hLower === queryLower || seen[hLower]) continue;

      var isJunk = false;
      for (var j = 0; j < junkPatterns.length; j++) {
        if (hLower.indexOf(junkPatterns[j]) !== -1) { isJunk = true; break; }
      }
      if (isJunk) continue;

      seen[hLower] = true;
      related.push(heading);
    }

    var desc = contentPieces[i].description || '';
    if (desc.length > 10 && desc.length < 60 && !seen[desc.toLowerCase()]) {
      seen[desc.toLowerCase()] = true;
      related.push(desc);
    }
  }

  var keywords = extractKeywords(query);
  if (keywords.length > 2) {
    var variants = [
      keywords + ' explained',
      keywords + ' latest updates',
      keywords + ' history and background',
      keywords + ' examples',
      keywords + ' vs alternatives'
    ];
    for (var v = 0; v < variants.length; v++) {
      if (!seen[variants[v].toLowerCase()]) {
        related.push(variants[v]);
      }
    }
  }

  return related.slice(0, 5);
}

module.exports = { webSearch: webSearch, scrapePage: scrapePage };
