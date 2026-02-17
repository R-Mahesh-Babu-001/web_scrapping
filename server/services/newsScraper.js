const cheerio = require('cheerio');
const { execSync } = require('child_process');

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

function curlGet(url, timeoutSec) {
  if (!timeoutSec) timeoutSec = 10;
  try {
    var result = execSync(
      'curl -sL --max-time ' + timeoutSec +
      ' -H "User-Agent: ' + USER_AGENT + '"' +
      ' -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"' +
      ' -H "Accept-Language: en-IN,en;q=0.9,hi;q=0.8"' +
      ' "' + url.replace(/"/g, '\\\\"') + '"',
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, timeout: (timeoutSec + 5) * 1000 }
    );
    return result;
  } catch (err) {
    console.log('[NewsScraper] curlGet failed for ' + url + ': ' + (err.message || '').substring(0, 80));
    return null;
  }
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ============================================================
// NDTV News
// ============================================================
function scrapeNDTV() {
  console.log('[NewsScraper] Scraping NDTV...');
  var html = curlGet('https://www.ndtv.com/latest', 12);
  if (!html) return [];
  var $ = cheerio.load(html);
  var articles = [];

  $('.news_Ede').each(function(i, el) {
    if (articles.length >= 5) return false;
    var $el = $(el);
    var title = $el.find('.newsHdng a').text().trim() || $el.find('h2 a').text().trim();
    var link = $el.find('a').first().attr('href') || '';
    var snippet = $el.find('.newsCont').text().trim() || $el.find('p').first().text().trim();
    var time = $el.find('.posted-by span').text().trim() || $el.find('time').text().trim() || '';
    if (title && title.length > 10) {
      articles.push({ title: cleanText(title), snippet: cleanText(snippet).substring(0, 300), url: link, time: time, source: 'NDTV' });
    }
  });

  // Fallback selector
  if (articles.length === 0) {
    $('h2 a, .story__title a, .newsHdng a').each(function(i, el) {
      if (articles.length >= 5) return false;
      var title = $(el).text().trim();
      var link = $(el).attr('href') || '';
      if (title.length > 15 && link.startsWith('http')) {
        articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'NDTV' });
      }
    });
  }

  console.log('[NewsScraper] NDTV: ' + articles.length + ' articles');
  return articles;
}

// ============================================================
// Times of India
// ============================================================
function scrapeTOI() {
  console.log('[NewsScraper] Scraping Times of India...');
  var html = curlGet('https://timesofindia.indiatimes.com/news', 12);
  if (!html) return [];
  var $ = cheerio.load(html);
  var articles = [];

  // Try main page selectors
  $('.col_l_6 .w_tle a, .top-newslist li a, .list5 li a, ._1tLba a').each(function(i, el) {
    if (articles.length >= 5) return false;
    var title = $(el).text().trim();
    var link = $(el).attr('href') || '';
    if (!link.startsWith('http')) link = 'https://timesofindia.indiatimes.com' + link;
    if (title.length > 15) {
      articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'Times of India' });
    }
  });

  // Broader fallback
  if (articles.length === 0) {
    $('a[title]').each(function(i, el) {
      if (articles.length >= 5) return false;
      var title = $(el).attr('title') || $(el).text().trim();
      var link = $(el).attr('href') || '';
      if (!link.startsWith('http')) link = 'https://timesofindia.indiatimes.com' + link;
      if (title.length > 20 && link.indexOf('/articleshow/') !== -1) {
        articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'Times of India' });
      }
    });
  }

  console.log('[NewsScraper] TOI: ' + articles.length + ' articles');
  return articles;
}

// ============================================================
// The Hindu
// ============================================================
function scrapeTheHindu() {
  console.log('[NewsScraper] Scraping The Hindu...');
  var html = curlGet('https://www.thehindu.com/news/', 12);
  if (!html) return [];
  var $ = cheerio.load(html);
  var articles = [];

  $('.story-card, .element, .Other-StoryCard').each(function(i, el) {
    if (articles.length >= 5) return false;
    var $el = $(el);
    var title = $el.find('h3 a, h2 a, .title a').first().text().trim();
    var link = $el.find('h3 a, h2 a, .title a').first().attr('href') || '';
    var snippet = $el.find('p').first().text().trim();
    if (!link.startsWith('http')) link = 'https://www.thehindu.com' + link;
    if (title.length > 15) {
      articles.push({ title: cleanText(title), snippet: cleanText(snippet).substring(0, 300), url: link, time: '', source: 'The Hindu' });
    }
  });

  if (articles.length === 0) {
    $('h3 a, h2 a').each(function(i, el) {
      if (articles.length >= 5) return false;
      var title = $(el).text().trim();
      var link = $(el).attr('href') || '';
      if (!link.startsWith('http')) link = 'https://www.thehindu.com' + link;
      if (title.length > 15 && link.indexOf('thehindu.com') !== -1) {
        articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'The Hindu' });
      }
    });
  }

  console.log('[NewsScraper] The Hindu: ' + articles.length + ' articles');
  return articles;
}

// ============================================================
// Indian Express
// ============================================================
function scrapeIndianExpress() {
  console.log('[NewsScraper] Scraping Indian Express...');
  var html = curlGet('https://indianexpress.com/', 12);
  if (!html) return [];
  var $ = cheerio.load(html);
  var articles = [];

  $('.top-news .title a, .other-article h3 a, .articles h2 a, .title a').each(function(i, el) {
    if (articles.length >= 5) return false;
    var title = $(el).text().trim();
    var link = $(el).attr('href') || '';
    if (title.length > 15 && link.startsWith('http')) {
      articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'Indian Express' });
    }
  });

  console.log('[NewsScraper] Indian Express: ' + articles.length + ' articles');
  return articles;
}

// ============================================================
// Hindustan Times
// ============================================================
function scrapeHT() {
  console.log('[NewsScraper] Scraping Hindustan Times...');
  var html = curlGet('https://www.hindustantimes.com/latest-news', 12);
  if (!html) return [];
  var $ = cheerio.load(html);
  var articles = [];

  $('.cartHolder h3 a, .hdg3 a, .storyShortDetail h3 a, .media-heading a').each(function(i, el) {
    if (articles.length >= 5) return false;
    var title = $(el).text().trim();
    var link = $(el).attr('href') || '';
    if (!link.startsWith('http')) link = 'https://www.hindustantimes.com' + link;
    if (title.length > 15) {
      articles.push({ title: cleanText(title), snippet: '', url: link, time: '', source: 'Hindustan Times' });
    }
  });

  console.log('[NewsScraper] HT: ' + articles.length + ' articles');
  return articles;
}

// ============================================================
// RSS Feed based scraper (most reliable fallback)
// ============================================================
function scrapeRSS(feedUrl, sourceName) {
  console.log('[NewsScraper] Fetching RSS: ' + sourceName);
  var xml = curlGet(feedUrl, 10);
  if (!xml) return [];
  var $ = cheerio.load(xml, { xmlMode: true });
  var articles = [];

  $('item').each(function(i, el) {
    if (articles.length >= 6) return false;
    var $item = $(el);
    var title = $item.find('title').text().trim();
    var link = $item.find('link').text().trim();
    var description = $item.find('description').text().trim();
    var pubDate = $item.find('pubDate').text().trim();

    // Clean description - remove CDATA, HTML tags
    description = description.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();

    if (title.length > 10) {
      articles.push({
        title: cleanText(title),
        snippet: cleanText(description).substring(0, 400),
        url: link,
        time: pubDate ? formatDate(pubDate) : '',
        source: sourceName
      });
    }
  });

  console.log('[NewsScraper] RSS ' + sourceName + ': ' + articles.length + ' articles');
  return articles;
}

function formatDate(dateStr) {
  try {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return diffMins + ' min ago';
    var diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return diffHrs + 'h ago';
    var diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return diffDays + 'd ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// ============================================================
// Scrape full article content from URL
// ============================================================
function scrapeArticleContent(url) {
  console.log('[NewsScraper] Scraping article: ' + url);
  var html = curlGet(url, 10);
  if (!html || html.length < 500) return '';
  var $ = cheerio.load(html);

  // Remove noise
  $('script, style, nav, footer, header, aside, iframe, noscript, form, button, svg, img, video, audio, .sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, .social, .share, .comments, .cookie, .popup, .modal, .newsletter, .related, .also-read, .recommended').remove();

  var content = '';
  // Try article-specific selectors
  var selectors = [
    'article .content-body', '.article-body', '.story-details', '.article__content',
    '.article_content', '.story_details', '.full-details', '.content-area',
    '.story-content', '.artText', '.article-content', '.post-content',
    'article p', '.story p', '.article p', 'main p'
  ];

  for (var i = 0; i < selectors.length; i++) {
    var $els = $(selectors[i]);
    if ($els.length > 0) {
      var texts = [];
      $els.each(function(_, el) {
        var t = $(el).text().trim();
        if (t.length > 30) texts.push(t);
      });
      if (texts.length > 0) {
        content = texts.join('\n\n');
        break;
      }
    }
  }

  if (!content || content.length < 100) {
    // Fallback: get all p tags
    var paragraphs = [];
    $('p').each(function(_, el) {
      var t = $(el).text().trim();
      if (t.length > 40) paragraphs.push(t);
    });
    content = paragraphs.slice(0, 10).join('\n\n');
  }

  content = cleanText(content);
  if (content.length > 2000) content = content.substring(0, 2000);
  return content;
}

// ============================================================
// Main news fetching function
// ============================================================
function fetchLatestNews() {
  console.log('[NewsScraper] === Fetching Latest Indian News ===');

  var allArticles = [];

  // RSS feeds are the most reliable - use these first
  var rssFeeds = [
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', name: 'The Hindu' },
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', name: 'Times of India' },
    { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', name: 'Hindustan Times' },
    { url: 'https://indianexpress.com/feed/', name: 'Indian Express' },
    { url: 'https://feeds.feedburner.com/ndtvnews-top-stories', name: 'NDTV' },
  ];

  // Try all RSS feeds
  for (var i = 0; i < rssFeeds.length; i++) {
    var rssArticles = scrapeRSS(rssFeeds[i].url, rssFeeds[i].name);
    allArticles = allArticles.concat(rssArticles);
  }

  // If RSS didn't give enough, try HTML scraping
  if (allArticles.length < 8) {
    console.log('[NewsScraper] RSS gave ' + allArticles.length + ' articles, trying HTML scraping...');
    var scraperFns = [scrapeNDTV, scrapeTOI, scrapeTheHindu, scrapeIndianExpress, scrapeHT];
    for (var j = 0; j < scraperFns.length && allArticles.length < 15; j++) {
      try {
        var scraped = scraperFns[j]();
        allArticles = allArticles.concat(scraped);
      } catch (e) {
        console.log('[NewsScraper] Scraper error: ' + e.message);
      }
    }
  }

  // Deduplicate by title similarity
  var unique = [];
  var seenTitles = {};
  for (var k = 0; k < allArticles.length; k++) {
    var key = allArticles[k].title.toLowerCase().substring(0, 50);
    if (!seenTitles[key]) {
      seenTitles[key] = true;
      unique.push(allArticles[k]);
    }
  }

  console.log('[NewsScraper] Total unique articles: ' + unique.length);

  // Fetch content for top articles (up to 10)
  var topArticles = unique.slice(0, 12);
  for (var m = 0; m < topArticles.length && m < 8; m++) {
    if (topArticles[m].url && (!topArticles[m].snippet || topArticles[m].snippet.length < 50)) {
      var content = scrapeArticleContent(topArticles[m].url);
      if (content && content.length > 50) {
        topArticles[m].snippet = content.substring(0, 400);
      }
    }
  }

  // Build formatted answer
  var answer = '## 📰 Latest News from India\n\n';
  answer += '*Live headlines from top Indian news sources*\n\n---\n\n';

  for (var n = 0; n < topArticles.length; n++) {
    var article = topArticles[n];
    answer += '### ' + (n + 1) + '. ' + article.title + '\n\n';
    if (article.snippet && article.snippet.length > 20) {
      answer += article.snippet + '\n\n';
    }
    var meta = '**' + article.source + '**';
    if (article.time) meta += ' · ' + article.time;
    answer += meta + '\n\n---\n\n';
  }

  if (topArticles.length === 0) {
    answer += 'Unable to fetch news at the moment. Please try again in a few seconds.\n\n';
  }

  // Build sources
  var sources = topArticles.map(function(a, idx) {
    return {
      name: a.source.toLowerCase().replace(/ /g, '.') + '.com',
      url: a.url,
      title: a.title,
      index: idx + 1
    };
  });

  var related = [
    'India politics latest updates',
    'India cricket news today',
    'Indian stock market today',
    'India technology news',
    'India weather forecast today'
  ];

  return {
    answer: answer,
    sources: sources,
    related: related,
    title: 'Latest News - India',
    newsArticles: topArticles
  };
}

module.exports = { fetchLatestNews, scrapeArticleContent, scrapeRSS };
