import React, { useState } from 'react';

export default function InteractiveCounter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <p>Huidige telling: {count}</p>
      <button onClick={() => setCount(count + 1)}>Verhoog</button>
      <style>{`
       .counter {
          border: 1px solid #ccc;
          padding: 1rem;
          border-radius: 8px;
          display: inline-block;
        }
       .counter button {
          margin-left: 1rem;
        }
      `}</style>
    </div>
  );
}