import React from 'react';
import '../styles/source.css';

const SourceCard = ({ source, index }) => {
  const getSourceColor = (idx) => {
    const colors = ['#6c5ce7', '#a29bfe', '#00cec9', '#fd79a8', '#fdcb6e', '#55efc4'];
    return colors[idx % colors.length];
  };

  const getFavicon = (url) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  const getSourceIcon = (name) => {
    return name.charAt(0).toUpperCase();
  };

  const favicon = source.url ? getFavicon(source.url) : null;

  return (
    <a
      href={source.url && source.url !== '#' ? source.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="source-card"
      title={source.title || source.name}
    >
      <div className="source-card-header">
        <div
          className="source-icon"
          style={!favicon ? { backgroundColor: getSourceColor(index) + '22', color: getSourceColor(index) } : {}}
        >
          {favicon ? (
            <img
              src={favicon}
              alt=""
              className="source-favicon"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
          ) : null}
          <span className={`source-initial ${favicon ? 'hidden' : ''}`}
                style={favicon ? { display: 'none' } : {}}>
            {getSourceIcon(source.name)}
          </span>
        </div>
        <div className="source-info">
          <span className="source-name">{source.title || source.name}</span>
          <span className="source-domain">{source.name}</span>
        </div>
      </div>
      <div className="source-badge">{source.index}</div>
    </a>
  );
};

export default SourceCard;
