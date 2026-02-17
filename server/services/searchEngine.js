const knowledgeBase = require('../data/knowledge-base.json');

class SearchEngine {
  constructor() {
    this.knowledge = knowledgeBase.topics;
  }

  /**
   * Tokenize and normalize a query string
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  /**
   * Calculate relevance score between query tokens and a set of keywords
   */
  calculateRelevance(queryTokens, keywords, content) {
    let score = 0;
    const contentLower = content.toLowerCase();
    const titleBoost = 2.0;

    for (const token of queryTokens) {
      // Check keyword matches (high weight)
      for (const keyword of keywords) {
        if (keyword.includes(token) || token.includes(keyword)) {
          score += 3;
        }
        if (keyword === token) {
          score += 5;
        }
      }
      // Check content matches
      const regex = new RegExp(token, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length * 0.5;
      }
    }

    return score;
  }

  /**
   * Search the knowledge base for relevant articles
   */
  search(query) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return { answer: "Please provide a question or topic to search for.", sources: [], related: [] };
    }

    let allResults = [];

    // Score each topic and article
    for (const [topicName, topic] of Object.entries(this.knowledge)) {
      for (const article of topic.articles) {
        const relevance = this.calculateRelevance(
          queryTokens,
          topic.keywords,
          article.title + ' ' + article.content
        );

        if (relevance > 0) {
          allResults.push({
            topic: topicName,
            title: article.title,
            content: article.content,
            sources: article.sources,
            date: article.date,
            relevance
          });
        }
      }
    }

    // Sort by relevance
    allResults.sort((a, b) => b.relevance - a.relevance);

    if (allResults.length === 0) {
      return this.generateFallbackResponse(query, queryTokens);
    }

    // Get top result
    const topResult = allResults[0];
    const answer = this.generateAnswer(query, queryTokens, topResult);
    const sources = topResult.sources.map((source, i) => ({
      name: source,
      url: '#',
      index: i + 1
    }));

    // Get related topics
    const related = allResults
      .slice(1, 4)
      .map(r => r.title);

    return { answer, sources, related, title: topResult.title };
  }

  /**
   * Generate a well-formatted answer from the top result
   */
  generateAnswer(query, queryTokens, result) {
    const sentences = result.content.split(/(?<=[.!?])\s+/);
    let relevantSentences = [];

    // Score each sentence
    const scoredSentences = sentences.map((sentence, index) => {
      let score = 0;
      const sentenceLower = sentence.toLowerCase();
      for (const token of queryTokens) {
        if (sentenceLower.includes(token)) {
          score += 2;
        }
      }
      // Boost first sentences (they're usually more informative)
      if (index < 2) score += 1;
      return { sentence, score, index };
    });

    // Sort by relevance but maintain some order
    scoredSentences.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1) return b.score - a.score;
      return a.index - b.index;
    });

    // Take top sentences
    relevantSentences = scoredSentences
      .slice(0, Math.min(5, sentences.length))
      .sort((a, b) => a.index - b.index)
      .map(s => s.sentence);

    const answer = relevantSentences.join(' ');

    return answer;
  }

  /**
   * Generate a fallback response when no relevant articles are found
   */
  generateFallbackResponse(query, queryTokens) {
    const suggestions = [
      "Try rephrasing your question",
      "Use more specific keywords",
      "Ask about technology, science, health, or history"
    ];

    return {
      answer: `I don't have specific information about "${query}" in my knowledge base yet. Here are some suggestions:\n\n• ${suggestions.join('\n• ')}\n\nI can help with topics like artificial intelligence, web development, space exploration, climate science, health and nutrition, and world history.`,
      sources: [],
      related: [
        "The Evolution of Artificial Intelligence",
        "Breakthroughs in Space Exploration",
        "Mental Health Awareness and Treatment"
      ],
      title: "No exact match found"
    };
  }

  /**
   * Get trending/latest topics
   */
  getLatestNews() {
    let allArticles = [];
    for (const [topicName, topic] of Object.entries(this.knowledge)) {
      for (const article of topic.articles) {
        allArticles.push({
          topic: topicName,
          title: article.title,
          content: article.content.substring(0, 200) + '...',
          sources: article.sources,
          date: article.date
        });
      }
    }
    allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
    return allArticles.slice(0, 5);
  }

  /**
   * Get recommendations based on a topic
   */
  getRecommendations(topic) {
    const queryTokens = this.tokenize(topic || 'technology science');
    const results = this.search(topic || 'latest technology trends');
    return results;
  }

  /**
   * Compare two topics
   */
  compare(topic1, topic2) {
    const result1 = this.search(topic1);
    const result2 = this.search(topic2);

    return {
      answer: `## ${topic1}\n\n${result1.answer}\n\n---\n\n## ${topic2}\n\n${result2.answer}`,
      sources: [...(result1.sources || []), ...(result2.sources || [])],
      related: [...(result1.related || []), ...(result2.related || [])].slice(0, 4),
      title: `Comparison: ${topic1} vs ${topic2}`
    };
  }

  /**
   * Troubleshoot a problem
   */
  troubleshoot(problem) {
    const result = this.search(problem);
    if (result.sources.length > 0) {
      result.answer = `**Troubleshooting: ${problem}**\n\nBased on available information:\n\n${result.answer}\n\n**Suggested Steps:**\n1. Review the information above for relevant context\n2. Check the sources listed for more detailed guidance\n3. Consider related topics for additional insights`;
    }
    return result;
  }
}

module.exports = new SearchEngine();
