const cheerio = require('cheerio');
const { execSync } = require('child_process');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

function curlGet(url, timeoutSec) {
  if (!timeoutSec) timeoutSec = 8;
  try {
    var result = execSync(
      'curl -sL --max-time ' + timeoutSec +
      ' -H "User-Agent: ' + USER_AGENT + '"' +
      ' -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"' +
      ' -H "Accept-Language: en-US,en;q=0.9"' +
      ' "' + url.replace(/"/g, '\\\\"') + '"',
      { encoding: 'utf-8', maxBuffer: 3 * 1024 * 1024, timeout: (timeoutSec + 3) * 1000 }
    );
    return result;
  } catch (err) {
    console.log('[curlGet] Failed for ' + url + ': ' + (err.message || '').substring(0, 80));
    return null;
  }
}

function extractKeywords(query) {
  var stopWords = ['what', 'is', 'are', 'how', 'does', 'do', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'or', 'but', 'with', 'about', 'can', 'will', 'should', 'would', 'could', 'why', 'when', 'where', 'who', 'which', 'has', 'have', 'had', 'was', 'were', 'been', 'be', 'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our', 'their', 'me', 'you', 'us', 'them', 'on', 'at', 'by', 'from', 'up', 'out', 'if', 'not', 'no', 'so', 'just', 'than', 'too', 'very', 'also', 'as', 'into', 'through', 'between', 'after', 'before', 'during', 'explain', 'tell', 'give', 'define', 'describe', 'best', 'compare', 'fix', 'solve', 'recommendations'];
  var words = query.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/);
  var keywords = words.filter(function (w) { return w.length > 1 && stopWords.indexOf(w) === -1; });
  return keywords.length > 0 ? keywords.join(' ') : query;
}

function getDDGInstantAnswer(query) {
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://api.duckduckgo.com/?q=' + encodedQuery + '&format=json&no_html=1&skip_disambig=1';
  var body = curlGet(url, 10);
  if (!body) return null;
  try { return JSON.parse(body); } catch (e) { return null; }
}

function searchWikipedia(query, limit) {
  if (!limit) limit = 5;
  var keywords = extractKeywords(query);
  var encodedQuery = encodeURIComponent(keywords);
  var url = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' + encodedQuery + '&limit=' + limit + '&format=json';
  var body = curlGet(url, 8);
  if (!body) return [];
  try {
    var data = JSON.parse(body);
    var titles = data[1] || [];
    var descriptions = data[2] || [];
    var urls = data[3] || [];
    var results = [];
    for (var i = 0; i < titles.length; i++) {
      results.push({ title: titles[i], snippet: descriptions[i] || '', url: urls[i] || '' });
    }
    return results;
  } catch (e) { return []; }
}

function getWikipediaSummary(title) {
  var encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
  var url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodedTitle;
  var body = curlGet(url, 6);
  if (!body) return null;
  try {
    var data = JSON.parse(body);
    if (data.extract) {
      return {
        title: data.title || title,
        content: data.extract || '',
        description: data.description || '',
        url: (data.content_urls && data.content_urls.desktop) ? data.content_urls.desktop.page : ('https://en.wikipedia.org/wiki/' + encodedTitle),
      };
    }
    return null;
  } catch (e) { return null; }
}

function searchDDGHTML(query) {
  var encodedQuery = encodeURIComponent(query);
  var url = 'https://html.duckduckgo.com/html/?q=' + encodedQuery;
  console.log('[WebScraper] DDG HTML search fallback for: "' + query + '"');
  var html = curlGet(url, 12);
  if (!html || html.length < 200) return [];
  var $ = cheerio.load(html);
  var results = [];
  var seen = {};
  $('.result__a, .result-link').each(function(i, el) {
    if (results.length >= 8) return false;
    var href = $(el).attr('href') || '';
    var title = $(el).text().trim();
    // DDG redirects: extract actual URL from uddg param
    if (href.indexOf('uddg=') !== -1) {
      try { href = decodeURIComponent(href.split('uddg=')[1].split('&')[0]); } catch(e) {}
    }
    if (!href || href.indexOf('http') !== 0) return;
    if (href.indexOf('duckduckgo.com') !== -1) return;
    if (seen[href]) return;
    seen[href] = true;
    var snippet = '';
    var parent = $(el).closest('.result, .links_main');
    if (parent.length) {
      snippet = parent.find('.result__snippet, .result-snippet').text().trim();
    }
    results.push({ title: title, url: href, snippet: snippet });
  });
  console.log('[WebScraper] DDG HTML found ' + results.length + ' web results');
  return results;
}

function scrapePage(url, timeoutSec) {
  if (!timeoutSec) timeoutSec = 6;
  var html = curlGet(url, timeoutSec);
  if (!html || html.length < 200) return null;
  return extractContent(html, url);
}

function extractContent(html, url) {
  var $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside, iframe, noscript, form, button, svg, img, video, audio, .sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, .social, .share, .comments, .cookie, .popup, .modal, .newsletter').remove();
  var mainContent = '';
  var selectors = ['article', 'main', '.post-content', '.article-content', '.article-body', '.entry-content', '.content-body', '.story-body', '.post-body', '.page-content', '.mw-parser-output', '#mw-content-text'];
  for (var i = 0; i < selectors.length; i++) {
    var el = $(selectors[i]);
    if (el.length > 0) { mainContent = el.first().text(); break; }
  }
  if (mainContent.trim().length < 100) mainContent = $('body').text();
  mainContent = cleanText(mainContent);
  if (mainContent.length > 6000) mainContent = mainContent.substring(0, 6000);
  var title = $('title').text().trim() || $('h1').first().text().trim() || '';
  var description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
  var headings = [];
  $('h1, h2, h3').each(function (idx, el) {
    var text = $(el).text().trim();
    if (text.length > 3 && text.length < 200) headings.push(text);
  });
  return { title: cleanText(title), description: cleanText(description), content: mainContent, headings: headings.slice(0, 15), url: url };
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function extractDomain(url) {
  try { var p = new URL(url); return p.hostname.replace(/^www\\./, ''); } catch (e) { return url; }
}

function webSearch(query, mode) {
  if (!mode) mode = 'default';
  console.log('[WebScraper] Searching for: "' + query + '" (mode: ' + mode + ')');

  var ddgData = getDDGInstantAnswer(query);
  var wikiResults = searchWikipedia(query, 6);

  var abstractText = '';
  var abstractUrl = '';
  var abstractSource = '';

  if (ddgData) {
    abstractText = ddgData.Abstract || ddgData.AbstractText || '';
    abstractUrl = ddgData.AbstractURL || '';
    abstractSource = ddgData.AbstractSource || '';
  }

  console.log('[WebScraper] DDG abstract: ' + (abstractText ? abstractText.length + ' chars' : 'none') + ', Wiki results: ' + wikiResults.length);

  var sources = [];
  var seenUrls = {};
  var contentPieces = [];

  if (abstractText && abstractText.length > 30) {
    var mainUrl = abstractUrl || 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
    sources.push({ name: extractDomain(mainUrl), url: mainUrl, title: abstractSource || 'DuckDuckGo', index: 1 });
    seenUrls[mainUrl] = true;
    contentPieces.push({ content: abstractText, sourceIndex: 1, headings: [] });
  }

  for (var i = 0; i < wikiResults.length && sources.length < 6; i++) {
    var wr = wikiResults[i];
    if (seenUrls[wr.url]) continue;
    console.log('[WebScraper] Getting Wikipedia summary: ' + wr.title);
    var summary = getWikipediaSummary(wr.title);
    if (summary && summary.content && summary.content.length > 30) {
      var idx = sources.length + 1;
      sources.push({ name: 'en.wikipedia.org', url: summary.url || wr.url, title: summary.title || wr.title, index: idx });
      seenUrls[summary.url || wr.url] = true;
      contentPieces.push({ content: summary.content, sourceIndex: idx, headings: [], description: summary.description });
    }
  }

  if (ddgData && ddgData.RelatedTopics) {
    var topics = ddgData.RelatedTopics.filter(function (t) { return t.Text && t.FirstURL && t.FirstURL.indexOf('/c/') === -1; });
    for (var j = 0; j < topics.length && sources.length < 8; j++) {
      var topic = topics[j];
      var topicPath = topic.FirstURL.replace('https://duckduckgo.com/', '');
      var topicName = decodeURIComponent(topicPath).replace(/_/g, ' ');
      var wikiUrl = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(topicName.replace(/ /g, '_'));
      if (seenUrls[wikiUrl]) continue;
      console.log('[WebScraper] Getting related topic: ' + topicName);
      var topicSummary = getWikipediaSummary(topicName);
      if (topicSummary && topicSummary.content && topicSummary.content.length > 30) {
        var tidx = sources.length + 1;
        sources.push({ name: 'en.wikipedia.org', url: topicSummary.url || wikiUrl, title: topicSummary.title || topicName, index: tidx });
        seenUrls[topicSummary.url || wikiUrl] = true;
        contentPieces.push({ content: topicSummary.content, sourceIndex: tidx, headings: [], description: topicSummary.description || topic.Text });
      }
    }
  }

  if (abstractUrl && contentPieces.length < 2) {
    console.log('[WebScraper] Scraping abstract URL for more content...');
    var scraped = scrapePage(abstractUrl, 8);
    if (scraped && scraped.content.length > 100) {
      if (contentPieces.length > 0) {
        contentPieces[0].content = scraped.content;
        contentPieces[0].headings = scraped.headings || [];
      } else {
        sources.push({ name: extractDomain(abstractUrl), url: abstractUrl, title: scraped.title || query, index: 1 });
        contentPieces.push({ content: scraped.content, sourceIndex: 1, headings: scraped.headings || [] });
      }
    }
  }

  // Fallback: DDG HTML web search when no results from APIs
  if (sources.length === 0 || contentPieces.length === 0) {
    console.log('[WebScraper] No API results, trying DDG HTML search fallback...');
    var ddgResults = searchDDGHTML(query);
    for (var d = 0; d < ddgResults.length && sources.length < 6; d++) {
      var ddgr = ddgResults[d];
      if (seenUrls[ddgr.url]) continue;
      console.log('[WebScraper] Scraping: ' + ddgr.title.substring(0, 50));
      var scrapedPage = scrapePage(ddgr.url, 8);
      if (scrapedPage && scrapedPage.content && scrapedPage.content.length > 80) {
        var sidx = sources.length + 1;
        sources.push({ name: extractDomain(ddgr.url), url: ddgr.url, title: scrapedPage.title || ddgr.title, index: sidx });
        seenUrls[ddgr.url] = true;
        contentPieces.push({ content: scrapedPage.content, sourceIndex: sidx, headings: scrapedPage.headings || [], description: ddgr.snippet || scrapedPage.description });
      } else if (ddgr.snippet && ddgr.snippet.length > 30) {
        // Use snippet as fallback content
        var sidx2 = sources.length + 1;
        sources.push({ name: extractDomain(ddgr.url), url: ddgr.url, title: ddgr.title, index: sidx2 });
        seenUrls[ddgr.url] = true;
        contentPieces.push({ content: ddgr.snippet, sourceIndex: sidx2, headings: [], description: ddgr.snippet });
      }
    }
  }

  if (sources.length === 0) {
    return { answer: 'I could not find relevant results for "' + query + '". Please try rephrasing your search.', sources: [], related: [], title: 'No Results Found' };
  }

  console.log('[WebScraper] Building answer from ' + contentPieces.length + ' content pieces, ' + sources.length + ' sources');

  var answer = synthesizeAnswer(query, contentPieces, mode);
  var related = generateRelatedQuestions(query, contentPieces);

  return { answer: answer, sources: sources, related: related, title: query };
}

function synthesizeAnswer(query, contentPieces, mode) {
  if (!mode) mode = 'default';
  if (contentPieces.length === 0) return 'No relevant content found.';
  var queryTokens = query.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2; });
  var paragraphs = [];
  var usedContent = {};

  // Mode-specific settings
  var config = {
    default: { topPrimary: 4, topSecondary: 2, maxPieces: 6, maxLength: 6000, format: 'paragraph' },
    detailed: { topPrimary: 8, topSecondary: 5, maxPieces: 10, maxLength: 12000, format: 'detailed' },
    concise:  { topPrimary: 2, topSecondary: 1, maxPieces: 3, maxLength: 2000, format: 'concise' }
  };
  var cfg = config[mode] || config['default'];

  // For detailed mode, add a heading
  if (mode === 'detailed') {
    paragraphs.push('## ' + query);
  }

  var piecesUsed = 0;

  for (var i = 0; i < contentPieces.length && piecesUsed < cfg.maxPieces; i++) {
    var piece = contentPieces[i];
    var content = piece.content || '';
    var srcIdx = piece.sourceIndex;
    if (!content || content.length < 30) continue;
    piecesUsed++;

    var sentences = content.split(/(?<=[.!?])\s+/).filter(function (s) { return s.length > 25 && s.length < 500; });

    var scored = sentences.map(function (sentence) {
      var lower = sentence.toLowerCase();
      var score = 0;
      for (var t = 0; t < queryTokens.length; t++) {
        if (lower.indexOf(queryTokens[t]) !== -1) score += 2;
      }
      if (/\d/.test(sentence)) score += 0.5;
      if (/is a |are |refers to|defined as|means |known as/i.test(sentence)) score += 2;
      if (/according to|research|study|found that|shows that|developed|created|designed/i.test(sentence)) score += 1;
      if (/however|although|despite|while|unlike/i.test(sentence)) score += 0.5;
      return { sentence: sentence, score: score };
    });

    scored.sort(function (a, b) { return b.score - a.score; });

    var topCount = (i === 0) ? cfg.topPrimary : cfg.topSecondary;
    var topSentences = scored.filter(function (s) { return s.score > 0; }).slice(0, topCount);

    if (topSentences.length > 0) {
      if (mode === 'concise') {
        // Concise: bullet points
        var bullets = topSentences.map(function (s) { return '- ' + s.sentence.trim(); });
        var text = bullets.join('\n') + ' [' + srcIdx + ']';
        var key = text.substring(0, 60);
        if (!usedContent[key]) {
          usedContent[key] = true;
          paragraphs.push(text);
        }
      } else if (mode === 'detailed') {
        // Detailed: sub-headings per source + full text
        var sourceName = piece.description || '';
        var heading = sourceName ? '### ' + sourceName : '';
        var text = topSentences.map(function (s) { return s.sentence; }).join(' ');
        var key = text.substring(0, 60);
        if (!usedContent[key]) {
          usedContent[key] = true;
          if (heading) paragraphs.push(heading);
          paragraphs.push(text + ' [' + srcIdx + ']');
        }
      } else {
        // Default
        var text = topSentences.map(function (s) { return s.sentence; }).join(' ');
        var key = text.substring(0, 60);
        if (!usedContent[key]) {
          usedContent[key] = true;
          paragraphs.push(text + ' [' + srcIdx + ']');
        }
      }
    } else if (i === 0 && content.length > 50) {
      var maxIntro = mode === 'concise' ? 200 : (mode === 'detailed' ? 600 : 400);
      var firstPara = content.substring(0, maxIntro).trim();
      if (firstPara.lastIndexOf('.') > 50) {
        firstPara = firstPara.substring(0, firstPara.lastIndexOf('.') + 1);
      }
      if (mode === 'concise') {
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

  // For detailed mode, add a summary divider
  if (mode === 'detailed' && paragraphs.length > 2) {
    paragraphs.push('---');
    paragraphs.push('*This is a detailed response compiled from ' + piecesUsed + ' sources.*');
  }

  // For concise mode, add a note
  if (mode === 'concise') {
    paragraphs.push('\n*Concise summary — select Default or Detailed for more information.*');
  }

  return paragraphs.join('\n\n') || 'Could not generate a detailed answer. Please check the sources below.';
}

function generateRelatedQuestions(query, contentPieces) {
  var related = [];
  var seen = {};
  var queryLower = query.toLowerCase();

  // Extract meaningful topics from content headings
  for (var i = 0; i < contentPieces.length; i++) {
    var headings = contentPieces[i].headings || [];
    for (var h = 0; h < headings.length; h++) {
      var heading = headings[h].trim();
      var hLower = heading.toLowerCase();
      if (heading.length > 8 && heading.length < 80 &&
        hLower.indexOf('cookie') === -1 && hLower.indexOf('privacy') === -1 &&
        hLower.indexOf('subscribe') === -1 && hLower.indexOf('sign up') === -1 &&
        hLower.indexOf('menu') === -1 && hLower.indexOf('navigation') === -1 &&
        hLower.indexOf('external links') === -1 && hLower.indexOf('references') === -1 &&
        hLower.indexOf('see also') === -1 && hLower.indexOf('further reading') === -1 &&
        hLower.indexOf('contents') === -1 && hLower.indexOf('edit') === -1 &&
        hLower.indexOf('advertisement') === -1 && hLower.indexOf('related') === -1 &&
        hLower.indexOf('trending') === -1 && hLower.indexOf('popular') === -1 &&
        hLower !== queryLower && !seen[hLower]) {
        seen[hLower] = true;
        related.push(heading);
      }
    }
    // Use descriptions directly as topics
    var desc = contentPieces[i].description || '';
    if (desc.length > 10 && desc.length < 60 && !seen[desc.toLowerCase()]) {
      seen[desc.toLowerCase()] = true;
      related.push(desc);
    }
  }

  // Add query-based follow-ups
  var keywords = extractKeywords(query);
  if (keywords.length > 2) {
    related.push(keywords + ' explained');
    related.push(keywords + ' latest updates');
    related.push(keywords + ' history and background');
  }
  return related.slice(0, 5);
}

module.exports = { webSearch: webSearch, scrapePage: scrapePage };
