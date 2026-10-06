// SVG drawing for the verdict card, the region map and the trend chart.

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const capitalise = s => s[0].toUpperCase() + s.slice(1);
const fmtHour = d => d.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric' });
const fmtTime = d => d.toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit' });

// ---------- Verdict icon ----------

const ICONS = {
  // Face mask with ear loops and pleats
  bring: `
    <path d="M11 17c4.5-2.5 8.5-3.5 13-3.5s8.5 1 13 3.5v10c-3.5 5-8 7.5-13 7.5s-9.5-2.5-13-7.5z"/>
    <path d="M11 19.5H7.5c0 5.5 1.8 8.5 5 9.5M37 19.5h3.5c0 5.5-1.8 8.5-5 9.5"/>
    <path d="M16 21.5h16M16 26.5h16"/>`,
  // Bag with a folded mask peeking out
  handy: `
    <path d="M10 20h28l-2.5 18h-23z"/>
    <path d="M18 20v-3a6 6 0 0 1 12 0v3"/>
    <path d="M17 27.5c2.5-1.2 4.5-1.7 7-1.7s4.5.5 7 1.7v3.5c-2 2-4.3 3-7 3s-5-1-7-3z"/>`,
  // Sun: clear air
  ok: `
    <circle cx="24" cy="24" r="7"/>
    <path d="M24 8v4M24 36v4M8 24h4M36 24h4M12.7 12.7l2.8 2.8M32.5 32.5l2.8 2.8M12.7 35.3l2.8-2.8M32.5 15.5l2.8-2.8"/>`,
};

function setIcon(svg, kind) {
  svg.innerHTML = ICONS[kind] || '';
}

// ---------- Drifting particles ----------

let particleKey = null;

function drawParticles(svg, value) {
  // Redraw only when the reading moves enough to change the density
  const key = value == null ? 'none' : Math.round(value / 5);
  if (key === particleKey) return;
  particleKey = key;
  svg.replaceChildren();
  if (value == null) return;

  const rand = (a, b) => a + Math.random() * (b - a);
  const count = Math.max(8, Math.min(70, Math.round(value / 2.5)));
  for (let i = 0; i < count; i++) {
    const c = el('circle', {
      cx: `${rand(0, 100).toFixed(1)}%`,
      cy: `${rand(0, 100).toFixed(1)}%`,
      r: rand(0.8, 2.6).toFixed(1),
    }, svg);
    c.style.setProperty('--o', rand(0.12, 0.35).toFixed(2));
    c.style.setProperty('--dx', `${rand(-18, 18).toFixed(0)}px`);
    c.style.setProperty('--dy', `${rand(-10, 10).toFixed(0)}px`);
    c.style.setProperty('--dur', `${rand(6, 14).toFixed(1)}s`);
    c.style.setProperty('--delay', `${rand(-14, 0).toFixed(1)}s`);
  }
}

// ---------- Region map ----------

// Simplified outline of Singapore island, as [longitude, latitude]
const OUTLINE = [
  [103.61, 1.32], [103.64, 1.35], [103.68, 1.37], [103.70, 1.41], [103.73, 1.44],
  [103.77, 1.45], [103.80, 1.46], [103.83, 1.45], [103.85, 1.44], [103.87, 1.42],
  [103.90, 1.41], [103.93, 1.40], [103.96, 1.39], [103.99, 1.38], [104.03, 1.36],
  [104.03, 1.33], [103.99, 1.32], [103.95, 1.31], [103.91, 1.30], [103.87, 1.28],
  [103.84, 1.26], [103.81, 1.27], [103.78, 1.28], [103.74, 1.30], [103.70, 1.30],
  [103.66, 1.29], [103.62, 1.30],
];

// Label locations from the API's regionMetadata
const REGION_POINTS = {
  north: [103.82, 1.41803],
  south: [103.82, 1.29587],
  east: [103.94, 1.35735],
  west: [103.70, 1.35735],
  central: [103.82, 1.35735],
};

const project = ([lon, lat]) => [+((lon - 103.58) * 1000).toFixed(1), +((1.485 - lat) * 1000).toFixed(1)];

// Closed Catmull-Rom spline through the points, as cubic Béziers
function smoothPath(pts) {
  const n = pts.length;
  let d = `M${pts[0]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6].map(v => v.toFixed(1));
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6].map(v => v.toFixed(1));
    d += ` C${c1} ${c2} ${p2}`;
  }
  return d + 'Z';
}

const ISLAND_PATH = smoothPath(OUTLINE.map(project));

// regions: [{ name, value, kind }] where kind is ok / handy / bring / none
function drawMap(svg, regions, selected, onPick) {
  const hadFocus = svg.contains(document.activeElement);
  svg.replaceChildren();
  el('path', { d: ISLAND_PATH, class: 'land' }, svg);

  for (const r of regions) {
    const [x, y] = project(REGION_POINTS[r.name]);
    const isSel = r.name === selected;
    const label = `${capitalise(r.name)}${r.value == null ? '' : ` · ${r.value}`}`;
    const g = el('g', {
      class: `region region--${r.kind}${isSel ? ' is-selected' : ''}`,
      role: 'button',
      tabindex: 0,
      'aria-pressed': String(isSel),
      'aria-label': `${capitalise(r.name)}, ${r.value == null ? 'no reading' : `PM2.5 ${r.value}`}`,
    }, svg);
    el('circle', { cx: x, cy: y, r: 24, class: 'hit' }, g);
    if (isSel) el('circle', { cx: x, cy: y, r: 13, class: 'sel-ring' }, g);
    el('circle', { cx: x, cy: y, r: isSel ? 8 : 6, class: 'dot' }, g);
    el('text', { x, y: y + 26, class: 'map-label' }, g).textContent = label;

    g.addEventListener('click', () => onPick(r.name));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.name); }
    });
    if (hadFocus && isSel) queueMicrotask(() => g.focus());
  }
}

// ---------- Trend chart ----------

// points: [{ time, value }] measured, oldest first; analysis from analyse()
function drawChart(svg, tip, points, analysis, threshold) {
  const W = Math.max(280, Math.round(svg.parentElement.getBoundingClientRect().width));
  const H = 200;
  const m = { l: 34, r: 18, t: 18, b: 26 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('height', H);
  svg.replaceChildren();
  tip.hidden = true;
  if (points.length === 0) return;

  const last = points[points.length - 1];
  const estimates = (analysis && analysis.projected || []).map((value, i) => ({
    time: new Date(+last.time + (i + 1) * 3600000), value, est: true,
  }));
  const all = [...points, ...estimates];

  const t0 = +all[0].time;
  const span = Math.max(3600000, +all[all.length - 1].time - t0);
  const step = Math.max(...all.map(p => p.value), threshold) > 200 ? 100 : 50;
  const yMax = Math.ceil(Math.max(...all.map(p => p.value), threshold) * 1.1 / step) * step;
  const x = t => m.l + (t - t0) / span * (W - m.l - m.r);
  const y = v => m.t + (1 - v / yMax) * (H - m.t - m.b);

  // Gridlines and y ticks
  for (let v = 0; v <= yMax; v += step) {
    el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }, svg);
    el('text', { x: m.l - 6, y: y(v), class: 'axis axis--y' }, svg).textContent = v;
  }
  // X ticks every 3 hours
  for (const p of all) {
    const hour = Number(p.time.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false }));
    if (hour % 3 === 0) el('text', { x: x(p.time), y: H - 6, class: 'axis axis--x' }, svg).textContent = fmtHour(p.time);
  }

  // Threshold
  el('line', { x1: m.l, x2: W - m.r, y1: y(threshold), y2: y(threshold), class: 'threshold' }, svg);
  el('text', { x: m.l + 6, y: y(threshold) - 6, class: 'threshold-label' }, svg).textContent = `Your threshold · ${threshold}`;

  // Measured: area wash + line
  const linePts = points.map(p => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`);
  el('path', {
    d: `M${x(points[0].time)},${y(0)} L${linePts.join(' L')} L${x(last.time)},${y(0)}Z`,
    class: 'area',
  }, svg);
  el('polyline', { points: linePts.join(' '), class: 'line' }, svg);

  // Estimate: dashed continuation with hollow dots
  if (estimates.length) {
    const estPts = [last, ...estimates].map(p => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`);
    el('polyline', { points: estPts.join(' '), class: 'line line--est' }, svg);
    for (const p of estimates) el('circle', { cx: x(p.time), cy: y(p.value), r: 4, class: 'dot-est' }, svg);
  }

  // Latest reading: ringed dot with its value
  el('circle', { cx: x(last.time), cy: y(last.value), r: 4.5, class: 'dot-now' }, svg);
  el('text', { x: x(last.time), y: y(last.value) - 12, class: 'end-label' }, svg).textContent = last.value;

  // Hover: crosshair + tooltip on the nearest hour
  const cross = el('line', { y1: m.t, y2: H - m.b, class: 'crosshair', visibility: 'hidden' }, svg);
  const hoverDot = el('circle', { r: 5, class: 'dot-hover', visibility: 'hidden' }, svg);
  const overlay = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, class: 'overlay' }, svg);

  overlay.addEventListener('pointermove', e => {
    const box = svg.getBoundingClientRect();
    const px = (e.clientX - box.left) * (W / box.width);
    const p = all.reduce((best, q) => Math.abs(x(q.time) - px) < Math.abs(x(best.time) - px) ? q : best);
    const cx = x(p.time), cy = y(p.value);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', cx); hoverDot.setAttribute('cy', cy); hoverDot.setAttribute('visibility', 'visible');
    tip.textContent = `${fmtTime(p.time)} · ${p.value}${p.est ? ' (estimate)' : ''}`;
    tip.hidden = false;
    const left = cx * (box.width / W);
    tip.style.left = `${Math.min(Math.max(left, 60), box.width - 60)}px`;
    tip.style.top = `${Math.max(0, cy * (box.height / H) - 40)}px`;
  });
  overlay.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
}
