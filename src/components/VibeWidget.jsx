import React, { useState, useEffect } from 'react';

const VIBE_SCHEDULE = [
  { start: 0, label: '😴💤 Droomt van golven' },
  { start: 6, label: '🌅🧘‍♂️ Ochtendyoga aan het strand' },
  { start: 8, label: '☕🥭 Açaí & koffie ontbijt' },
  { start: 10, label: '🏄‍♂️🌊 (Kite)surfen in de zon' },
  { start: 13, label: '🍛🌴 Lunch bij strandtent' },
  { start: 15, label: '🌞🏖️ Chill of tweede surfsessie' },
  { start: 17, label: '🍹🌅 Caipirinha bij zonsondergang' },
  { start: 19, label: '🎶🔥 Live muziek of strandbar' },
  { start: 22, label: '🌌✨ Nachtduik of sterren kijken' },
  { start: 23, label: '😴💤 Slapen met geluid van de zee' },
];

const resolveVibe = (hour) => {
  const entry = [...VIBE_SCHEDULE].filter(({ start }) => start <= hour).pop();
  return entry ? entry.label : VIBE_SCHEDULE[VIBE_SCHEDULE.length - 1].label;
};

export function VibeWidget() {
  const [brazilTime, setBrazilTime] = useState('');
  const [vibe, setVibe] = useState('');

  useEffect(() => {
    function updateVibe() {
      const options = { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', hour12: false };
      const formatter = new Intl.DateTimeFormat('nl-NL', options);
      const parts = formatter.formatToParts(new Date());

      let hour = 0;
      let minute = '00';
      parts.forEach(part => {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'minute') minute = part.value;
      });

      setBrazilTime(`${String(hour).padStart(2, '0')}:${minute}`);
      setVibe(resolveVibe(hour));
    }

    updateVibe();
    const interval = setInterval(updateVibe, 60000);
    return () => clearInterval(interval);
  }, []);

  // Zelfde .vibe-widget-wrapper (dus dezelfde afmetingen) in beide staten — anders
  // verspringt de hero eronder zodra dit na hydratie van een kale tekstregel naar de
  // volle kaart wisselt (gevonden via Lighthouse CLS, zie DESIGN_HANDOFF §7).
  if (!brazilTime) {
    return (
      <div className="vibe-widget">
        <div className="vibe-widget-time">
          <span className="location-dot"></span>
          Locatie wordt ingeladen&hellip;
        </div>
        <div className="vibe-widget-status" aria-hidden="true" style={{ visibility: 'hidden' }}>&nbsp;</div>
      </div>
    );
  }

  return (
    <div className="vibe-widget">
      <div className="vibe-widget-time">
        <span className="location-dot"></span>
        {brazilTime} <span className="timezone">(in Brazilië)</span>
      </div>
      <div className="vibe-widget-status">{vibe}</div>
    </div>
  );
}