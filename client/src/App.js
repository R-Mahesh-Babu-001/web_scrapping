import React, { useState } from 'react';
import HomePage from './components/HomePage';
import ResultsPage from './components/ResultsPage';
import './styles/global.css';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [searchResult, setSearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (query, mode = 'search') => {
    if (!query.trim()) return;
    
    setSearchQuery(query);
    setIsLoading(true);
    setCurrentView('results');

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSearchResult(data.data);
      } else {
        setSearchResult({
          answer: 'Sorry, something went wrong. Please try again.',
          sources: [],
          related: []
        });
      }
    } catch (error) {
      setSearchResult({
        answer: 'Unable to connect to the server. Please make sure the backend is running.',
        sources: [],
        related: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSearch = async (imageFile, additionalQuery = '') => {
    const displayQuery = additionalQuery || 'Analyzing image: ' + imageFile.name;
    setSearchQuery(displayQuery);
    setIsLoading(true);
    setCurrentView('results');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      if (additionalQuery) {
        formData.append('query', additionalQuery);
      }

      const response = await fetch('/api/image-search', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setSearchResult(data.data);
      } else {
        setSearchResult({
          answer: 'Sorry, image analysis failed. ' + (data.error || 'Please try again.'),
          sources: [],
          related: []
        });
      }
    } catch (error) {
      setSearchResult({
        answer: 'Unable to connect to the server for image analysis. Please make sure the backend is running.',
        sources: [],
        related: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoHome = () => {
    setCurrentView('home');
    setSearchResult(null);
    setSearchQuery('');
  };

  const handleFetchNews = async () => {
    setSearchQuery('Latest News - India');
    setIsLoading(true);
    setCurrentView('results');

    try {
      const response = await fetch('/api/news');
      const data = await response.json();

      if (data.success) {
        setSearchResult(data.data);
      } else {
        setSearchResult({
          answer: 'Failed to fetch news. Please try again.',
          sources: [],
          related: []
        });
      }
    } catch (error) {
      setSearchResult({
        answer: 'Unable to connect to the server. Please make sure the backend is running.',
        sources: [],
        related: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      {currentView === 'home' ? (
        <HomePage onSearch={handleSearch} onImageSearch={handleImageSearch} onFetchNews={handleFetchNews} />
      ) : (
        <ResultsPage
          query={searchQuery}
          result={searchResult}
          isLoading={isLoading}
          onSearch={handleSearch}
          onImageSearch={handleImageSearch}
          onGoHome={handleGoHome}
        />
      )}
    </div>
  );
}

export default App;
