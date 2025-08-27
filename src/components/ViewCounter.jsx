import { useState, useEffect } from 'preact/hooks';

export function ViewCounter({ path, apiUrl }) {
  const [views, setViews] = useState(0);
  const endpoint = `${apiUrl}/api/view`;

  // Runs once to get the view count
  useEffect(() => {
    if (!path || !endpoint) return;
    fetch(`${endpoint}?path=${encodeURIComponent(path)}`)
      .then(res => res.json())
      .then(data => setViews(data.views ?? 0))
      .catch(err => console.error("Error fetching views:", err));
  }, [path, endpoint]);

  return (
    <span className="chip">
      👀 {views}
    </span>
  );
}