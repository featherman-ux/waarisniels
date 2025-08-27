import { useState, useEffect } from 'preact/hooks';

export function LikeButton({ likeKey, apiUrl }) {
  const [count, setCount] = useState(0);
  const endpoint = `${apiUrl}/api/like`;

  // Runs once to get the initial like count
  useEffect(() => {
    if (!likeKey || !endpoint) return;
    fetch(`${endpoint}?key=${encodeURIComponent(likeKey)}`)
      .then(res => res.json())
      .then(data => setCount(data.count ?? 0))
      .catch(err => console.error("Error fetching likes:", err));
  }, [likeKey, endpoint]);

  // Runs when the button is clicked
  const handleLike = () => {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: likeKey }),
    })
      .then(res => res.json())
      .then(data => setCount(data.count ?? 0))
      .catch(err => console.error("Error posting like:", err));
  };

  return (
    <button onClick={handleLike} className="chip">
      👍 Like (<span>{count}</span>)
    </button>
  );
}