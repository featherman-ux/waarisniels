import React, { useEffect, useRef, useState } from 'react';

const safeStorageGet = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch (error) {
    console.warn(`[safeStorage] Failed to get item '${key}'`, error);
    return null;
  }
};

const safeStorageSet = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.warn(`[safeStorage] Failed to set item '${key}'`, error);
  }
};

export function ViewCounter({ path, apiUrl }) {
  const [views, setViews] = useState(null);
  const [uniqueVisitors, setUniqueVisitors] = useState(null);
  const [status, setStatus] = useState('idle');
  const trackedPath = useRef('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!path) return;

    const baseUrl = apiUrl || window.location.origin;
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/view`;
    const analyticsEndpoint = `${baseUrl.replace(/\/$/, '')}/api/analytics`;
    const trackKey = `${endpoint}|${path}`;

    if (trackedPath.current === trackKey) return;
    trackedPath.current = trackKey;

    const controller = new AbortController();
    const sessionKey = 'viewcounter-session-id';

    const devMode =
      window.location.hostname === 'localhost' ||
      window.location.hostname.endsWith('.test') ||
      safeStorageGet(window.localStorage, 'niels_dev_mode') === 'true';

    if (devMode) {
      setStatus('dev');
      setViews(0);
      setUniqueVisitors(0);
      return;
    }

    const ensureSessionId = () => {
      const existing = safeStorageGet(window.sessionStorage, sessionKey);
      if (existing) return existing;

      const generated =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      safeStorageSet(window.sessionStorage, sessionKey, generated);
      return generated;
    };

    const sendAnalytics = (payload) => {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(analyticsEndpoint, blob);
      } else {
        fetch(analyticsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch((error) => console.warn('[ViewCounter] Analytics send failed', error));
      }
    };

    const emitPageview = () => {
      sendAnalytics({
        type: 'pageview',
        path,
        referrer: document.referrer || null,
        screenResolution: `${window.screen.width || 0}x${window.screen.height || 0}`,
        sessionDuration: 0,
        timestamp: new Date().toISOString(),
      });
    };

    const fetchViews = async () => {
      try {
        setStatus('loading');
        const sessionId = ensureSessionId();
        const screenResolution = `${window.screen.width || 0}x${window.screen.height || 0}`;
        const referrer = document.referrer || null;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            path,
            sessionId,
            timestamp: new Date().toISOString(),
            referrer,
            screenResolution,
          }),
          keepalive: true,
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Unexpected status ${res.status}`);

        const data = await res.json();
        setViews(typeof data.views === 'number' ? data.views : 0);
        setUniqueVisitors(
          typeof data.uniqueVisitors === 'number' ? data.uniqueVisitors : null
        );
        setStatus('ready');
        emitPageview();
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('[ViewCounter] Failed to fetch views', error);
        setStatus('error');
      }
    };

    fetchViews();

    const visibilityState = {
      startedAt: performance.now(),
      totalVisibleMs: 0,
      flushed: false,
    };

    const flushAnalytics = (reason = 'session_end') => {
      if (visibilityState.flushed) return;
      visibilityState.flushed = true;

      if (!document.hidden) {
        visibilityState.totalVisibleMs += performance.now() - visibilityState.startedAt;
      }

      const durationSeconds = Math.round(visibilityState.totalVisibleMs / 1000);

      sendAnalytics({
        type: reason,
        path,
        referrer: document.referrer || null,
        screenResolution: `${window.screen.width || 0}x${window.screen.height || 0}`,
        sessionDuration: durationSeconds,
        timestamp: new Date().toISOString(),
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityState.totalVisibleMs += performance.now() - visibilityState.startedAt;
      } else {
        visibilityState.startedAt = performance.now();
      }
    };

    const handleBeforeUnload = () => flushAnalytics('before_unload');
    const handlePageHide = () => flushAnalytics('pagehide');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      flushAnalytics('cleanup');
    };
  }, [path, apiUrl]);

  const titleText =
    status === 'ready' && typeof views === 'number'
      ? `${formatNumber(views)} total views${
          typeof uniqueVisitors === 'number' && uniqueVisitors > 0
            ? ` • ${formatNumber(uniqueVisitors)} unique visitors`
            : ''
        }`
      : undefined;

  const label = (() => {
    if (status === 'dev') return 'DEV';
    if (status === 'error') return 'Error';
    if (status === 'ready' && typeof views === 'number') return formatNumber(views);
    return '…';
  })();

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors duration-150 ${
        status === 'error'
          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
      }`}
      aria-live="polite"
      title={titleText}
      data-state={status}
    >
      <span aria-hidden="true">👁️</span>
      <span>{label}</span>
      {status === 'ready' && typeof uniqueVisitors === 'number' && uniqueVisitors > 0 && (
        <span className="text-xs opacity-75">• {formatNumber(uniqueVisitors)} unique</span>
      )}
    </span>
  );
}

// --- Like Button ----------------------------------------------------------

export function LikeButton({ likeKey, apiUrl }) {
  const [count, setCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const endpoint = `${apiUrl}/api/like`;

  useEffect(() => {
    if (!likeKey) return;

    fetch(`${endpoint}?key=${encodeURIComponent(likeKey)}`)
      .then((res) => res.json())
      .then((data) => setCount(data.count ?? 0))
      .catch((err) => console.error('Error fetching likes:', err));
  }, [likeKey, endpoint]);

  const handleLike = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setIsLiked(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: likeKey }),
      });
      const data = await response.json();
      setCount(data.count ?? 0);
      setTimeout(() => setIsLiked(false), 1000);
    } catch (error) {
      console.error('Error posting like:', error);
      setIsLiked(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLike}
      disabled={isLoading}
      className={`inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 transform ${
        isLiked ? 'bg-red-100 text-red-800 scale-105' : 'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:scale-105'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`transition-transform duration-300 ${isLiked ? 'animate-bounce' : ''}`}>
        {isLiked ? '❤️' : '👍'}
      </span>
      <span>Like ({count})</span>
    </button>
  );
}

// --- Comments -------------------------------------------------------------

const escapeHTML = (value) =>
  String(value).replace(/[&<>"']/g, (m) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m])
  );

const formatMessage = (value) =>
  escapeHTML(value)
    .split(/\r?\n/)
    .map((line) => (line.length ? line : '&nbsp;'))
    .join('<br />');

export function Comments({ slug, apiUrl }) {
  const [comments, setComments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `${apiUrl}/api/comments`;

  const fetchComments = async () => {
    if (!slug) return;
    try {
      const url = new URL(endpoint);
      url.searchParams.set('slug', slug);
      const res = await fetch(url.toString());
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    }
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!slug || isSubmitting) return;

    const form = event.currentTarget;
    const fd = new FormData(form);
    const payload = {
      slug,
      name: (fd.get('name') || '').toString().trim(),
      message: (fd.get('message') || '').toString(),
      website: (fd.get('website') || '').toString(),
    };

    if (payload.website) return; // Honeypot filled

    if (payload.message.length < 2) {
      setError('Je reactie is iets te kort.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Failed to post comment (${res.status})`);

      form.reset();
      await fetchComments();
    } catch (err) {
      console.error(err);
      setError('Plaatsen lukt nu niet. Probeer het later nog eens.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="comments" aria-labelledby="comments-title">
      <div className="comments__header">
        <h2 id="comments-title">Reacties</h2>
        <p className="comments__subtitle">Laat een berichtje achter – ik lees alles.</p>
      </div>

      <form id="c-form" className="comments__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="comment-name">Naam</label>
        <input id="comment-name" type="text" name="name" placeholder="Naam (optioneel)" />

        <input
          type="text"
          name="website"
          className="hp"
          style={{ display: 'none' }}
          tabIndex="-1"
          autoComplete="off"
        />

        <label className="sr-only" htmlFor="comment-message">Bericht</label>
        <textarea
          id="comment-message"
          name="message"
          required
          minLength={2}
          placeholder="Zeg iets leuks…"
        />

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Versturen…' : 'Plaats reactie'}
        </button>

        {error && (
          <p className="comments__error" role="status" aria-live="polite">
            {error}
          </p>
        )}
      </form>

      <div id="c-list" className="comments__list" aria-live="polite">
        {comments.length === 0 ? (
          <p className="comments__empty">Nog geen reacties.</p>
        ) : (
          comments.map((c) => (
            <article className="comments__item" key={c.id}>
              <header className="comments__meta">
                <strong>{c.name?.trim() || 'Anoniem'}</strong>
                <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString()}</time>
              </header>
              <p dangerouslySetInnerHTML={{ __html: formatMessage(c.message || '') }} />
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default Comments;
