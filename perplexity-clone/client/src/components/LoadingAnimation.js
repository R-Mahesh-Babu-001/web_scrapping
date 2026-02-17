import React from 'react';
import '../styles/loading.css';

const LoadingAnimation = ({ query }) => {
  return (
    <div className="loading-container">
      <div className="loading-header">
        <h2 className="loading-query">{query}</h2>
      </div>
      
      <div className="loading-content">
        <div className="loading-sources">
          <div className="loading-section-label">
            <div className="shimmer shimmer-small"></div>
          </div>
          <div className="loading-sources-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="loading-source-card">
                <div className="shimmer shimmer-circle"></div>
                <div className="shimmer shimmer-line"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="loading-answer">
          <div className="thinking-indicator">
            <div className="thinking-dots">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
            <span className="thinking-text">Searching and analyzing...</span>
          </div>
          
          <div className="loading-lines">
            <div className="shimmer shimmer-line-full"></div>
            <div className="shimmer shimmer-line-full"></div>
            <div className="shimmer shimmer-line-medium"></div>
            <div className="shimmer shimmer-line-full"></div>
            <div className="shimmer shimmer-line-short"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingAnimation;
