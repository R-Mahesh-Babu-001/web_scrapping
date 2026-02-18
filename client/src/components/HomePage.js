import React, { useState, useEffect, useRef } from 'react';
import SearchBar from './SearchBar';
import logo from '../assets/logo.png';
import '../styles/home.css';

const HomePage = ({ onSearch, onImageSearch, onFetchNews }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    // Fetch initial suggestions
    fetch('/api/suggestions')
      .then(res => res.json())
      .then(data => setSuggestions(data.suggestions || []))
      .catch(() => setSuggestions([]));
  }, []);

  return (
    <div className="home-container">
      <div className="home-content">
        <div className="logo-wrapper">
          <img src={logo} alt="wick_city" className="home-logo-img" />
          <h1 className="logo-text">wick<span className="logo-highlight">_city</span></h1>
        </div>
        
        <SearchBar 
          onSearch={onSearch}
          onImageSearch={onImageSearch}
          suggestions={suggestions}
          placeholder="Ask anything. Type @ for sources and / for shortcuts."
        />

        <div className="quick-actions">
          <button
            className="quick-action-btn"
            onClick={() => onFetchNews && onFetchNews()}
          >
            <span className="quick-action-icon">📰</span>
            <span className="quick-action-label">Latest News</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
