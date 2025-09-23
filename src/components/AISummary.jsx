
import React, { useState, useEffect } from 'react';
import { apiUrl } from '../lib/api';

const safeSessionGet = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.warn('[AISummary] Unable to read cache', error);
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch (error) {
    console.warn('[AISummary] Unable to write cache', error);
  }
};

const tidySummary = (raw) => {
  if (!raw) return '';
  let text = raw
    .replace(/^here'?s[^:]*:/i, '')
    .replace(/^(a |an )?quick (personal )?summary\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text = `${text}.`;
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 2);

  const finalText = sentences.join(' ');
  const signaturePhrases = [
    'heeee meiden',
    'gasten facking mooi',
    'ken gebeuren',
    'magisch mooi',
  ];

  if (signaturePhrases.some((phrase) => finalText.toLowerCase().includes(phrase))) {
    return finalText;
  }

  return `${finalText} Magisch mooi.`.replace(/\s+/g, ' ').trim();
};

export function AISummary({ postSlug, postContent }) {
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const cacheKey = `summary_v2_${postSlug}`;

  useEffect(() => {
    const fetchSummary = async () => {
      // Check cache first
      const cachedSummary = safeSessionGet(cacheKey);
      if (cachedSummary) {
        setSummary(cachedSummary);
        setIsLoading(false);
        return;
      }

      // If not in cache, fetch from API
      try {
        const response = await fetch(apiUrl('/api/ai-summary'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: postContent }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch summary');
        }

        const data = await response.json();
        const cleaned = tidySummary(data.summary);

        if (cleaned) {
          setSummary(cleaned);
          safeSessionSet(cacheKey, cleaned);
        } else {
          setError(true);
        }
      } catch (error) {
        console.error('Error fetching AI summary:', error);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, [postSlug, postContent, cacheKey]);

  if (isLoading) {
    return (
      <div className="ai-summary-loading">
        <p><em>Generating an AI-powered summary...</em></p>
      </div>
    );
  }

  return (
    <div className={`ai-summary${error ? ' ai-summary--error' : ''}`}>
      <div className="ai-summary__eyebrow">Mijn snelle recap</div>
      <h3>✨ Wat ik hier meemaakte</h3>
      <p>
        {error
          ? 'De AI-samenvatting is even niet beschikbaar, maar het verhaal hieronder vertelt je alles.'
          : summary}
      </p>
    </div>
  );
}
