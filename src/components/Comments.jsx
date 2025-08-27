import { useState, useEffect } from 'preact/hooks';

// Utility function to prevent HTML injection from user comments
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}

export function Comments({ slug, apiUrl }) {
  const [comments, setComments] = useState([]);
  const endpoint = `${apiUrl}/api/comments`;

  const fetchComments = () => {
    const url = new URL(endpoint);
    url.searchParams.set('slug', slug);
    fetch(url.toString())
      .then(res => res.json())
      .then(data => setComments(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error fetching comments:", err));
  };

  // Runs once to get the initial comments
  useEffect(() => {
    if (slug) {
      fetchComments();
    }
  }, [slug]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      slug: slug,
      name: (fd.get('name') || '').toString().trim(),
      message: (fd.get('message') || '').toString(),
      website: (fd.get('website') || '').toString(), // Honeypot
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to post comment');
      return res.json();
    })
    .then(() => {
      form.reset();
      fetchComments(); // Refresh comments list
    })
    .catch(err => {
      console.error(err);
      alert('Could not post comment.');
    });
  };

  return (
    <section className="comments">
      <h2>Reacties</h2>
      <form id="c-form" onSubmit={handleSubmit}>
        <input type="text" name="name" placeholder="Naam (optioneel)" />
        <input type="text" name="website" className="hp" style={{ display: 'none' }} tabIndex="-1" autoComplete="off" />
        <textarea name="message" required minLength="2" placeholder="Zeg iets leuks…"></textarea>
        <button type="submit">Plaats reactie</button>
      </form>

      <div id="c-list" aria-live="polite">
        {comments.length === 0 ? (
          <p>Nog geen reacties.</p>
        ) : (
          comments.map(c => (
            <div className="c-item" key={c.id}>
              <div className="c-head">
                <strong>{escapeHTML(c.name || 'Anoniem')}</strong> · <small>{new Date(c.createdAt).toLocaleString()}</small>
              </div>
              <p dangerouslySetInnerHTML={{ __html: escapeHTML(c.message || '') }} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}