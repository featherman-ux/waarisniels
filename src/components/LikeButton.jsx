import React, { useState, useEffect } from 'react';

export function LikeButton({ likeKey, apiUrl }) {
  const [count, setCount] = useState(0);
  const endpoint = `${apiUrl}/api/like`;

  // Fetch initial like count
  useEffect(() => {
    if (!likeKey) return;

    fetch(`${endpoint}?key=${encodeURIComponent(likeKey)}`)
      .then((res) => res.json())
      .then((data) => setCount(data.count ?? 0))
      .catch((err) => console.error("Error fetching likes:", err));
  }, [likeKey, endpoint]);

  // Handle button click
  const handleLike = () => {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: likeKey }),
    })
      .then((res) => res.json())
      .then((data) => setCount(data.count ?? 0))
      .catch((err) => console.error("Error posting like:", err));
  };

  return (
    <button onClick={handleLike} className="chip">
      👍 Like (<span>{count}</span>)
    </button>
  );
}
