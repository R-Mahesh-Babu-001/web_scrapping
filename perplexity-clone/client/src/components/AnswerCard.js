import React, { useState } from 'react';
import '../styles/answer.css';

const AnswerCard = ({ answer }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Render inline formatting: **bold**, *italic*, source refs [1], etc.
  const renderInline = (text) => {
    const parts = text.split(/(\*\*.*?\*\*|\*[^*]+?\*|\[\d+\])/g);
    return parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return <em key={j}>{part.slice(1, -1)}</em>;
      }
      if (/^\[\d+\]$/.test(part)) {
        const num = part.replace(/[[\]]/g, '');
        return (
          <sup key={j} className="source-ref" title={`Source ${num}`}>
            {num}
          </sup>
        );
      }
      return <span key={j}>{part}</span>;
    });
  };

  const renderAnswer = (text) => {
    if (!text) return <p className="answer-paragraph empty">No answer available.</p>;

    const blocks = text.split('\n\n').filter(b => b.trim());

    return blocks.map((block, i) => {
      // Headers
      if (block.startsWith('## ')) {
        return <h3 key={i} className="answer-heading">{block.replace('## ', '')}</h3>;
      }
      if (block.startsWith('### ')) {
        return <h4 key={i} className="answer-subheading">{block.replace('### ', '')}</h4>;
      }

      // Horizontal rule
      if (block.trim() === '---') {
        return <hr key={i} className="answer-divider" />;
      }

      // Blockquote
      if (block.startsWith('> ')) {
        const quoteText = block.replace(/^> ?/gm, '');
        return <blockquote key={i} className="answer-blockquote">{renderInline(quoteText)}</blockquote>;
      }

      // Bullet points
      if (block.includes('\n•') || block.startsWith('•') || block.includes('\n- ') || block.startsWith('- ')) {
        const items = block.split('\n').filter(line => line.trim());
        return (
          <ul key={i} className="answer-list">
            {items.map((item, j) => (
              <li key={j}>{renderInline(item.replace(/^[•\-]\s*/, ''))}</li>
            ))}
          </ul>
        );
      }

      // Numbered lists
      if (/^\d+\.\s/.test(block)) {
        const items = block.split('\n').filter(line => line.trim());
        return (
          <ol key={i} className="answer-list">
            {items.map((item, j) => (
              <li key={j}>{renderInline(item.replace(/^\d+\.\s*/, ''))}</li>
            ))}
          </ol>
        );
      }

      // Regular paragraph
      return (
        <p key={i} className="answer-paragraph">
          {renderInline(block)}
        </p>
      );
    });
  };

  return (
    <div className="answer-card">
      <div className="answer-header">
        <div className="answer-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
        </div>
        <span className="answer-label">Answer</span>
      </div>
      <div className="answer-body">
        {renderAnswer(answer)}
      </div>
      <div className="answer-actions">
        <button className="action-btn" title="Copy" onClick={handleCopy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
        <button className="action-btn" title="Share">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
          <span>Share</span>
        </button>
      </div>
    </div>
  );
};

export default AnswerCard;
