import React, { useState, useEffect } from 'react';

const VIBE_SCHEDULE = [
  { start: 0, label: '😴💤😴💤😴💤' },
  { start: 6, label: '🌄🥾 Hiken 🌞' },
  { start: 8, label: '🥾🏞️ Hiken & Hiken 🌲' },
  { start: 11, label: '🥾🌄 Meer Hiken 🌳📸' },
  { start: 14, label: '🥾🏔️ Nog meer Hiken 🗻' },
  { start: 17, label: '!!! Uitrusten van Hiken !!! ' },
  { start: 19, label: '🍽️ Avondeten' },
  { start: 21, label: 'Keimooi aan het pilsen' },
  { start: 22, label: '😴💤😴💤😴💤' },
];

const resolveVibe = (hour) => {
  const entry = [...VIBE_SCHEDULE]
    .filter(({ start }) => start <= hour)
    .pop();
  return entry ? entry.label : VIBE_SCHEDULE[VIBE_SCHEDULE.length - 1].label;
};

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
      setVibe(resolveVibe(hour));
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
