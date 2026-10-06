// Things neighbours commonly lend: id, label and a simple 24×24 line icon (inner SVG markup).
// One list for both sides: the page reads it as a global, server.js require()s it to validate.
const KINDS = [
  { id: 'drill', label: 'Drill',
    icon: '<rect x="3" y="6" width="11" height="6" rx="1.5"/><path d="M14 8h3M17 9h4"/><path d="M6 12l-1 8h5l1-8"/>' },
  { id: 'ladder', label: 'Ladder',
    icon: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>' },
  { id: 'toolbox', label: 'Toolbox',
    icon: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M9 8V5h6v3M3 13h18M11 12v2h2v-2"/>' },
  { id: 'extension', label: 'Extension cord',
    icon: '<rect x="4" y="9" width="8" height="8" rx="1.5"/><path d="M6.5 9V5M9.5 9V5M8 17v1a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V5"/>' },
  { id: 'steamboat', label: 'Steamboat pot',
    icon: '<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 11h20M10 11V7h4v4"/><path d="M8 7c0-1.5 1.5-1.5 1.5-3M15 7c0-1.5 1.5-1.5 1.5-3"/>' },
  { id: 'table', label: 'Folding table',
    icon: '<path d="M3 8h18M6 8l3 12M18 8l-3 12M7.6 14h8.8"/>' },
  { id: 'luggage', label: 'Luggage',
    icon: '<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M10 7V4h4v3M10 11v5M14 11v5M9 20v1.5M15 20v1.5"/>' },
  { id: 'tent', label: 'Tent',
    icon: '<path d="M3 20L12 5l9 15z"/><path d="M12 12l-3 8M12 12l3 8"/>' },
  { id: 'boardgame', label: 'Board game',
    icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none"/>' },
  { id: 'pump', label: 'Bicycle pump',
    icon: '<path d="M7 3h6M10 3v4"/><rect x="8" y="7" width="4" height="11" rx="1"/><path d="M6 21h8M10 18v3M12 10c4 0 6 2 6 6v5"/>' },
  { id: 'speaker', label: 'Speaker',
    icon: '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7.5" r="1.2"/>' },
  { id: 'umbrella', label: 'Umbrella',
    icon: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 1-4 0M12 3v0"/>' },
  { id: 'other', label: 'Others',
    icon: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>' },
];

if (typeof module !== 'undefined') module.exports = KINDS;
