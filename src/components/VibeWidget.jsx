import React, { useState, useEffect } from 'react';

function getVibe(hour) {
  if (hour >= 22 || hour < 6) return "😴💤😴💤😴💤";
  if (hour >= 6 && hour < 8) return "🌄🥾 Hiken 🌞";
  if (hour >= 8 && hour < 11) return "🥾🏞️ Hiken & Hiken 🌲";
  if (hour >= 11 && hour < 14) return "🥾🌄 Meer Hiken 🌳📸";
  if (hour >= 14 && hour < 17) return "🥾🏔️ Nog meer Hiken 🗻";
  if (hour >= 17 && hour < 19) return "!!! Uitrusten van Hiken !!! ";
  if (hour >= 19 && hour < 21) return "🍽️ Avondeten";
  if (hour >= 21 && hour < 22) return "Keimooi aan het pilsen";
  return "Kutzoooooooi, widget kapot 🤷‍♂️";
}

export function VibeWidget() {
  const [peruTime, setPeruTime] = useState('');
  const [vibe, setVibe] = useState('');

  useEffect(() => {
    function updateVibe() {
      const options = { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false };
      const formatter = new Intl.DateTimeFormat('nl-NL', options);
      const parts = formatter.formatToParts(new Date());

      let hour = 0;
      let minute = '00';
      parts.forEach(part => {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'minute') minute = part.value;
      });

      setPeruTime(`${String(hour).padStart(2, '0')}:${minute}`);
      setVibe(getVibe(hour));
    }

    updateVibe();
    const interval = setInterval(updateVibe, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!peruTime) return <div>Locatie wordt ingeladen...</div>;

  return (
    <div className="vibe-widget">
      <div className="vibe-widget-time">
        <span className="location-dot"></span>
        {peruTime} <span className="timezone">(in Peru)</span>
      </div>
      <div className="vibe-widget-status">{vibe}</div>
    </div>
  );
}
