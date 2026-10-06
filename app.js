const API = 'https://api-open.data.gov.sg/v2/real-time/api/pm25';
const REGIONS = ['north', 'south', 'east', 'west', 'central'];
const PRESETS = [
  { name: 'Sensitive', value: 56, hint: 'For asthma, heart or lung conditions, the elderly, children and pregnancy.' },
  { name: 'Moderate', value: 100, hint: 'For most adults.' },
  { name: 'Tolerant', value: 151, hint: 'For healthy adults spending a short time outdoors.' },
];
const STEADY = 2;   // µg/m³ per hour; smaller slopes count as steady
const NEAR = 15;    // "keep one handy" when rising and within this of the threshold
const STALE_MS = 150 * 60 * 1000;
const STORE_KEY = 'pm25-mask-check';

// ---------- Pure logic ----------

function band(v) {
  if (v <= 55) return 'Normal';
  if (v <= 150) return 'Elevated';
  if (v <= 250) return 'High';
  return 'Very High';
}

// series: [{ time: Date, readings: { north, ... } }] sorted oldest first
function analyse(series, region) {
  const pts = series.filter(p => Number.isFinite(p.readings[region])).slice(-3);
  if (pts.length === 0) return null;

  const latest = pts[pts.length - 1];
  const result = { current: latest.readings[region], time: latest.time, slope: null, projected: null };

  if (pts.length >= 2) {
    const oldest = pts[0];
    const hours = (latest.time - oldest.time) / 3600000;
    if (hours > 0 && hours <= 3) {
      result.slope = (result.current - oldest.readings[region]) / hours;
      result.projected = [1, 2].map(h => Math.max(0, Math.round(result.current + result.slope * h)));
    }
  }
  return result;
}

function trendLabel(slope) {
  if (slope === null) return 'unavailable';
  if (Math.abs(slope) < STEADY) return 'steady';
  return slope > 0 ? 'rising' : 'falling';
}

function verdict(a, threshold) {
  const peak = Math.max(a.current, ...(a.projected || []));
  const rising = trendLabel(a.slope) === 'rising';
  const rate = rising ? ` (+${Math.round(a.slope)}/hr)` : '';

  if (peak >= threshold) {
    return {
      kind: 'bring',
      title: 'Bring a mask',
      reason: a.current >= threshold
        ? `It's ${a.current} now, at or above your threshold of ${threshold}.`
        : `It's ${a.current} now but rising${rate}, and could reach ${peak} within 2 hours. Your threshold is ${threshold}.`,
    };
  }
  if (rising && peak >= threshold - NEAR) {
    return {
      kind: 'handy',
      title: 'Keep one handy',
      reason: `It's ${a.current} and rising${rate}. The estimate is ${peak}, close to your threshold of ${threshold}. Pack a mask just in case.`,
    };
  }
  const trend = trendLabel(a.slope);
  return {
    kind: 'ok',
    title: 'No mask needed',
    reason: `It's ${a.current}, below your threshold of ${threshold}` +
      (trend === 'unavailable' ? ' (no recent trend available).' : `, and ${trend}.`),
  };
}

// ---------- Data ----------

function sgDate(offsetDays = 0) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' })
    .format(new Date(Date.now() + offsetDays * 86400000));
}

async function fetchDay(date) {
  const res = await fetch(`${API}?date=${date}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.errorMsg || 'API error');
  return (json.data.items || []).map(i => ({
    time: new Date(i.timestamp),
    readings: i.readings.pm25_one_hourly,
  }));
}

async function loadSeries() {
  let items = await fetchDay(sgDate());
  // Just after midnight there aren't enough readings yet, so add yesterday's
  if (items.length < 3) items = items.concat(await fetchDay(sgDate(-1)));
  return items.sort((a, b) => a.time - b.time);
}

// ---------- Settings ----------

function loadSettings() {
  const settings = { region: 'central', threshold: 100 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && REGIONS.includes(saved.region)) settings.region = saved.region;
    if (saved && Number.isFinite(saved.threshold) && saved.threshold > 0) settings.threshold = saved.threshold;
  } catch {}
  return settings;
}

function saveSettings(settings) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
}

// ---------- UI ----------

function startApp() {
  const $ = id => document.getElementById(id);
  const settings = loadSettings();
  let series = null;
  let lastFetch = 0;

  const fmtTime = d => d.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit' });
  const cap = s => s[0].toUpperCase() + s.slice(1);

  function makeButtons(container, items, onPick) {
    container.replaceChildren(...items.map(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      b.dataset.value = item.value;
      b.addEventListener('click', () => onPick(item.value));
      return b;
    }));
  }

  function markPressed(container, value) {
    for (const b of container.children) b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
  }

  function setVerdict(kind, title, reason = '') {
    $('verdict').className = `verdict verdict--${kind}`;
    setIcon($('verdict-icon'), kind);
    $('verdict-title').textContent = title;
    $('verdict-reason').textContent = reason;
  }

  function pickRegion(region) {
    settings.region = region;
    saveSettings(settings);
    render();
  }

  function renderMap() {
    const regions = REGIONS.map(name => {
      const a = series && analyse(series, name);
      return { name, value: a ? a.current : null, kind: a ? verdict(a, settings.threshold).kind : 'none' };
    });
    drawMap($('map'), regions, settings.region, pickRegion);
  }

  function renderSettings() {
    renderMap();
    markPressed($('presets'), settings.threshold);
    if (Number($('threshold').value) !== settings.threshold) $('threshold').value = settings.threshold;
    const preset = PRESETS.find(p => p.value === settings.threshold);
    $('preset-hint').textContent = preset ? preset.hint : 'Custom threshold.';
  }

  function render() {
    renderSettings();
    if (!series) return;

    const a = analyse(series, settings.region);
    if (!a) {
      setVerdict('loading', 'No reading yet', `There's no recent reading for ${settings.region}. Try again shortly.`);
      return;
    }

    const v = verdict(a, settings.threshold);
    setVerdict(v.kind, v.title, v.reason);
    drawParticles($('particles'), a.current);

    const points = series
      .filter(p => Number.isFinite(p.readings[settings.region]))
      .slice(-12)
      .map(p => ({ time: p.time, value: p.readings[settings.region] }));
    $('chart-title').textContent = `Last 12 hours in ${cap(settings.region)}`;
    drawChart($('chart'), $('tip'), points, a, settings.threshold);

    $('now').textContent = a.current;
    $('band').textContent = band(a.current);

    const trend = trendLabel(a.slope);
    const arrow = { rising: '↑', falling: '↓', steady: '→', unavailable: '–' }[trend];
    $('trend').textContent = arrow;
    $('trend-note').textContent = a.slope === null
      ? 'unavailable'
      : `${trend} ${a.slope >= 0 ? '+' : ''}${Math.round(a.slope)}/hr`;

    $('p1').textContent = a.projected ? a.projected[0] : '–';
    $('p2').textContent = a.projected ? a.projected[1] : '–';

    const stale = Date.now() - a.time > STALE_MS;
    $('updated').textContent = `${cap(settings.region)} reading at ${fmtTime(a.time)}` +
      (stale ? ' (data may be delayed)' : '');
  }

  async function refresh() {
    $('refresh').disabled = true;
    if (!series) setVerdict('loading', 'Checking the air…');
    try {
      series = await loadSeries();
      lastFetch = Date.now();
      render();
    } catch (err) {
      if (series) {
        $('updated').textContent = `Couldn't refresh (${err.message}). Showing earlier data.`;
      } else {
        setVerdict('loading', "Couldn't load readings", `${err.message}. Check your connection and press Refresh.`);
      }
    } finally {
      $('refresh').disabled = false;
    }
  }

  makeButtons($('presets'), PRESETS.map(p => ({ label: `${p.name} · ${p.value}`, value: p.value })), value => {
    settings.threshold = value;
    saveSettings(settings);
    render();
  });

  $('threshold').addEventListener('input', e => {
    const v = Math.round(Number(e.target.value));
    if (!Number.isFinite(v) || v < 1 || v > 500) return;
    settings.threshold = v;
    saveSettings(settings);
    render();
  });

  $('refresh').addEventListener('click', refresh);

  // Re-check when the user comes back to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5 * 60 * 1000) refresh();
  });

  // Redraw the chart at its new width
  let lastWidth = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w !== lastWidth) { lastWidth = w; render(); }
  }).observe($('chart').parentElement);

  render();
  refresh();
}

if (typeof document !== 'undefined') startApp();
if (typeof module !== 'undefined') module.exports = { band, analyse, trendLabel, verdict, sgDate, loadSeries };
