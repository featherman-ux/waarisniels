import React, { useState, useEffect } from 'react';

const VIBE_SCHEDULE = [
  { start: 0, label: '😴💤 Hoogteslaap' },
  { start: 6, label: '🌄☕ Op zoek naar huurauto' },
  { start: 8, label: '🚤🌊 Ontbijt' },
  { start: 11, label: '🌞🏞️ Sucre verkennen' },
  { start: 14, label: '🚡🌆 Uyuni boeken' },
  { start: 17, label: '🥟🔥 Verse salteñas nassen' },
  { start: 19, label: '🍻🎶 Happy hour?!' },
  { start: 21, label: '🌌✨ Sterrenkijken in de Andes' },
  { start: 23, label: '😴💤 Hoogteslaap' },
];

const resolveVibe = (hour) => {
  const entry = [...VIBE_SCHEDULE]
    .filter(({ start }) => start <= hour)
    .pop();
  return entry ? entry.label : VIBE_SCHEDULE[VIBE_SCHEDULE.length - 1].label;
};

export function VibeWidget() {
  const [boliviaTime, setBoliviaTime] = useState('');
  const [vibe, setVibe] = useState('');

  useEffect(() => {
    function updateVibe() {
      const options = { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false };
      const formatter = new Intl.DateTimeFormat('nl-NL', options);
      const parts = formatter.formatToParts(new Date());

      let hour = 0;
      let minute = '00';
      parts.forEach(part => {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'minute') minute = part.value;
      });

      setBoliviaTime(`${String(hour).padStart(2, '0')}:${minute}`);
      setVibe(resolveVibe(hour));
    }

    updateVibe();
    const interval = setInterval(updateVibe, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!boliviaTime) return <div>Locatie wordt ingeladen...</div>;

  return (
    <div className="vibe-widget">
      <div className="vibe-widget-time">
        <span className="location-dot"></span>
        {boliviaTime} <span className="timezone">(in Bolivia)</span>
      </div>
      <div className="vibe-widget-status">{vibe}</div>
    </div>
  );
}
