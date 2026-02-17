import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/searchbar.css';

const SearchBar = ({ onSearch, onImageSearch, suggestions = [], placeholder, compact = false, initialValue = '' }) => {
  const [query, setQuery] = useState(initialValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [selectedModel, setSelectedModel] = useState('Default');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const imageMenuRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (query.length > 0) {
      const filtered = suggestions.filter(s =>
        s.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [query, suggestions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
      if (imageMenuRef.current && !imageMenuRef.current.contains(e.target)) {
        setShowImageMenu(false);
      }
      setShowModelMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize Speech Recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = finalTranscript || interimTranscript;
      setVoiceTranscript(currentText);
      setQuery(prev => {
        // If there's existing text, append. Otherwise replace.
        const base = prev && !isListening ? prev + ' ' : '';
        return finalTranscript ? base + finalTranscript : currentText;
      });
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone permission in your browser settings.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
      // Auto-submit if we got text
      if (query.trim()) {
        setTimeout(() => {
          onSearch(query.trim(), selectedModel.toLowerCase());
        }, 300);
      }
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedImage && onImageSearch) {
      onImageSearch(selectedImage, query.trim());
      clearImage();
      return;
    }
    if (query.trim()) {
      setShowSuggestions(false);
      onSearch(query, selectedModel.toLowerCase());
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
      setShowImageMenu(false);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    onSearch(suggestion, selectedModel.toLowerCase());
  };

  const models = ['Default', 'Detailed', 'Concise'];

  return (
    <form onSubmit={handleSubmit} className={`search-bar-container ${compact ? 'compact' : ''}`}>
      <div className="search-bar">
        {imagePreview && (
          <div className="image-preview-bar">
            <div className="image-preview-item">
              <img src={imagePreview} alt="Selected" className="preview-thumb" />
              <span className="preview-name">{selectedImage?.name}</span>
              <button type="button" className="preview-remove" onClick={clearImage} title="Remove image">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="search-input-wrapper">
          <textarea
            ref={inputRef}
            className="search-input"
            placeholder={selectedImage ? "Ask about this image... (or press Enter to analyze)" : (placeholder || "Ask anything...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={compact ? 1 : 2}
          />
        </div>
        
        <div className="search-bar-footer">
          <div className="search-bar-left">
            {/* Hidden file inputs */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <input
              type="file"
              ref={cameraInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
            />

            <div className="image-upload-wrapper" ref={imageMenuRef}>
              <button
                type="button"
                className={`icon-btn attach-btn ${selectedImage ? 'has-image' : ''}`}
                title="Upload image"
                onClick={() => setShowImageMenu(!showImageMenu)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              {showImageMenu && (
                <div className="image-upload-menu">
                  <button
                    type="button"
                    className="image-menu-item"
                    onClick={() => { fileInputRef.current?.click(); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    <span>Upload from Device</span>
                  </button>
                  <button
                    type="button"
                    className="image-menu-item"
                    onClick={() => { cameraInputRef.current?.click(); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <span>Take Photo</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="search-bar-right">
            <div className="model-selector">
              <button
                type="button"
                className="model-btn"
                onClick={(e) => { e.stopPropagation(); setShowModelMenu(!showModelMenu); }}
              >
                {selectedModel} <span className="chevron">▾</span>
              </button>
              {showModelMenu && (
                <div className="model-menu">
                  {models.map((model, i) => (
                    <button
                      key={i}
                      className={`model-option ${model === selectedModel ? 'active' : ''}`}
                      onClick={() => { setSelectedModel(model); setShowModelMenu(false); }}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className={`icon-btn mic-btn ${isListening ? 'listening' : ''}`} title={isListening ? 'Stop listening' : 'Voice search'} onClick={toggleVoice}>
              {isListening ? (
                <div className="mic-pulse">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2"></path>
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2"></line>
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2"></line>
                  </svg>
                </div>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
            </button>

            {isListening && (
              <div className="voice-indicator">
                <span className="voice-dot"></span>
                <span className="voice-label">Listening...</span>
              </div>
            )}

            <button type="submit" className="icon-btn submit-btn" title="Submit">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
                <path d="M8 12h8M12 8l4 4-4 4"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showSuggestions && (
        <div className="suggestions-dropdown" ref={suggestionsRef}>
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              className="suggestion-item"
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
};

export default SearchBar;
