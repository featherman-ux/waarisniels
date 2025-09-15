import React, { useState, useEffect, useRef } from 'react';

// Enhanced ViewCounter with privacy compliance
export function ViewCounter({ path, apiUrl }) {
  const [views, setViews] = useState('...');
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [error, setError] = useState(false);
  const endpoint = `${apiUrl}/api/view`;
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!path || !endpoint || hasTracked.current) return;

    // Enhanced dev mode detection
    const isDevMode = localStorage.getItem('niels_dev_mode') === 'true' || 
                     window.location.hostname === 'localhost' ||
                     window.location.hostname.includes('preview');

    if (isDevMode) {
      console.log("🔧 Dev Mode: pageview tracking disabled");
      setViews('DEV');
      return;
    }

    // Track visitor with privacy-compliant data
    const trackVisitor = async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            path, 
            referrer: document.referrer || 'Direct',
            timestamp: new Date().toISOString()
          }),
          keepalive: true,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setViews(data.views ?? 'Error');
        setUniqueVisitors(data.uniqueVisitors ?? 0);
        hasTracked.current = true;

      } catch (err) {
        console.error("Analytics error:", err);
        setViews('Error');
        setError(true);
      }
    };

    trackVisitor();
  }, [path, endpoint, apiUrl]);

  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 ${
      error
        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-200'
    }`}>
      <span>👁️</span>
      <span>{views}</span>
      {uniqueVisitors > 0 && (
        <span className="text-xs opacity-75">• {uniqueVisitors} unique</span>
      )}
    </span>
  );
}

// Enhanced LikeButton with animations
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
      .catch((err) => console.error("Error fetching likes:", err));
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
      
      // Add visual feedback
      setTimeout(() => setIsLiked(false), 1000);
      
    } catch (err) {
      console.error("Error posting like:", err);
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
        isLiked 
          ? 'bg-red-100 text-red-800 scale-105' 
          : 'bg-gray-100 text-gray-800 hover:bg-gray-200 hover:scale-105'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`transition-transform duration-300 ${isLiked ? 'animate-bounce' : ''}`}>
        {isLiked ? '❤️' : '👍'}
      </span>
      <span>Like ({count})</span>
    </button>
  );
}

// Enhanced Comments with better UX
export default function Comments({ slug, apiUrl }) {
  const [comments, setComments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = `${apiUrl}/api/comments`;

  const fetchComments = async () => {
    if (!slug) return;
    const url = new URL(endpoint);
    url.searchParams.set('slug', slug);

    try {
      const response = await fetch(url.toString());
      const data = await response.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching comments:", err);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [slug]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setMessage('');
    
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      slug,
      name: (fd.get('name') || '').toString().trim(),
      message: (fd.get('message') || '').toString().trim(),
      website: (fd.get('website') || '').toString(), // Honeypot
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to post comment');
      
      form.reset();
      setMessage('Comment posted successfully!');
      fetchComments();
      
    } catch (err) {
      console.error(err);
      setMessage('Could not post comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="comments space-y-6">
      <h2 className="text-2xl font-bold">Comments</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-gray-50 rounded-lg">
        <input 
          type="text" 
          name="name" 
          placeholder="Name (optional)" 
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        
        <input
          type="text"
          name="website"
          style={{ display: 'none' }}
          tabIndex="-1"
          autoComplete="off"
        />
        
        <textarea 
          name="message" 
          required 
          minLength={2} 
          placeholder="Leave a comment..." 
          rows="4"
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        
        <button 
          type="submit"
          disabled={isSubmitting}
          className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
            isSubmitting
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 transform hover:scale-105'
          }`}
        >
          {isSubmitting ? 'Posting...' : 'Post Comment'}
        </button>
        
        {message && (
          <div className={`p-3 rounded-md ${
            message.includes('successfully') 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {message}
          </div>
        )}
      </form>

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No comments yet. Be the first to comment!</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-gray-900">{comment.name || 'Anonymous'}</strong>
                <small className="text-gray-500">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </small>
              </div>
              <p className="text-gray-700">{comment.message}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}