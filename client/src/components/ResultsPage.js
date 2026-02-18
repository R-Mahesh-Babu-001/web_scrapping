import React from 'react';
import SearchBar from './SearchBar';
import AnswerCard from './AnswerCard';
import SourceCard from './SourceCard';
import LoadingAnimation from './LoadingAnimation';
import logo from '../assets/logo.png';
import '../styles/results.css';

const ResultsPage = ({ query, result, isLoading, onSearch, onImageSearch, onGoHome }) => {
  return (
    <div className="results-container">
      {/* Top bar with logo and new chat */}
      <div className="results-topbar">
        <button className="topbar-logo" onClick={onGoHome} title="Home">
          <img src={logo} alt="wick_city" className="topbar-logo-img" />
        </button>
        <button className="new-chat-btn" onClick={onGoHome} title="New Chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>New Chat</span>
        </button>
      </div>

      {/* Main content */}
      <main className="results-main">
        <div className="results-header">
          <SearchBar
            onSearch={onSearch}
            onImageSearch={onImageSearch}
            compact={true}
            initialValue={query}
            placeholder="Ask a follow-up..."
          />
        </div>

        <div className="results-content">
          {isLoading ? (
            <LoadingAnimation query={query} />
          ) : result ? (
            <>
              <div className="query-display">
                <h2>{query}</h2>
              </div>

              {result.sources && result.sources.length > 0 && (
                <div className="sources-section">
                  <h3 className="section-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    Sources
                  </h3>
                  <div className="sources-grid">
                    {result.sources.map((source, index) => (
                      <SourceCard key={index} source={source} index={index} />
                    ))}
                  </div>
                </div>
              )}

              <AnswerCard answer={result.answer} />

              {result.related && result.related.length > 0 && (
                <div className="related-section">
                  <h3 className="section-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 10 20 15 15 20"></polyline>
                      <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
                    </svg>
                    Related
                  </h3>
                  <div className="related-list">
                    {result.related.map((topic, index) => (
                      <button
                        key={index}
                        className="related-item"
                        onClick={() => onSearch(topic)}
                      >
                        <span>{topic}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default ResultsPage;
