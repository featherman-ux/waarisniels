import React, { useState, useEffect } from 'react';

export function ViewCounter({ path, apiUrl }) {
  const [views, setViews] = useState('...');
  const endpoint = `${apiUrl}/api/view`;

  useEffect(() => {
    if (!path || !endpoint) return;

    // --- ADMIN/DEV MODE LOGIC ---
    const isDevMode = localStorage.getItem('niels_dev_mode') === 'true';
    if (isDevMode) {
      console.log("Admin Mode: pageview wordt niet gelogd.");
      setViews('ADMIN'); // Show ADMIN if dev mode
      return;
    }
    // --- END OF DEV LOGIC ---

    // Normal visitors
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, referrer: document.referrer }),
      keepalive: true,
    })
      .then(res => res.json())
      .then(data => setViews(data.views ?? 0))
      .catch(err => {
        console.error("Error logging or fetching views:", err);
        setViews('Error');
      });
  }, [path, endpoint]);

  return <span className="chip">👀 {views}</span>;
}
