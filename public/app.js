// Block Lending front end: plain DOM, talks to the JSON API in server.js.
const $ = sel => document.querySelector(sel);
let me = null;
let items = [];
let filter = 'all';

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status });
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form));
}

// ---------- screens ----------
function showAuth() {
  me = null;
  $('#auth').hidden = false;
  $('#app').hidden = true;
  $('#who').hidden = true;
}

async function showApp() {
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#who').hidden = false;
  $('#who-name').textContent = `${me.name} · ${me.unit}`;
  $('#members').textContent = `${me.members} of ${me.maxMembers} neighbours have joined.`;
  await loadItems();
}

async function boot() {
  try {
    me = await api('GET', '/api/me');
    await showApp();
  } catch {
    showAuth();
  }
}

// ---------- auth ----------
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  $('#login-form').hidden = tab.dataset.tab !== 'login';
  $('#join-form').hidden = tab.dataset.tab !== 'join';
  $('#auth-error').textContent = '';
}));

for (const [formSel, url] of [['#login-form', '/api/login'], ['#join-form', '/api/join']]) {
  $(formSel).addEventListener('submit', async e => {
    e.preventDefault();
    $('#auth-error').textContent = '';
    try {
      await api('POST', url, formData(e.target));
      e.target.reset();
      me = await api('GET', '/api/me');
      await showApp();
    } catch (err) {
      $('#auth-error').textContent = err.message;
    }
  });
}

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  showAuth();
});

// ---------- item kinds (list in kinds.js) ----------
function icon(kindId) {
  const kind = KINDS.find(k => k.id === kindId) || KINDS.find(k => k.id === 'other');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kind.icon}</svg>`;
}

for (const [i, kind] of KINDS.entries()) {
  const tile = document.createElement('label');
  tile.className = 'kind-tile';
  tile.innerHTML = `<input type="radio" name="kind" value="${kind.id}"${i === 0 ? ' required' : ''}>
    ${icon(kind.id)}<span></span>`;
  tile.querySelector('span').textContent = kind.label;
  $('#kind-grid').append(tile);
}

function syncOtherField() {
  const isOther = $('#add-form').kind.value === 'other';
  $('#other-title').hidden = !isOther;
  $('#other-title').required = isOther;
  return isOther;
}

$('#kind-grid').addEventListener('change', () => {
  if (syncOtherField()) $('#other-title').focus();
});

// ---------- items ----------
async function loadItems() {
  try {
    items = await api('GET', '/api/items');
    $('#app-error').textContent = '';
    render();
  } catch (err) {
    if (err.status === 401) return showAuth();
    $('#app-error').textContent = err.message;
  }
}

$('#add-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('POST', '/api/items', formData(e.target));
    e.target.reset();
    syncOtherField();
    await loadItems();
  } catch (err) {
    $('#app-error').textContent = err.message;
  }
});

document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  filter = chip.dataset.filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
  render();
}));

const FILTERS = {
  all: () => true,
  available: i => i.status === 'available',
  mine: i => i.owner_id === me.id,
  borrowing: i => i.borrower_id === me.id,
};

function statusText(item) {
  const mine = item.owner_id === me.id;
  const you = item.borrower_id === me.id;
  const who = you ? 'you' : `${item.borrower_name} (${item.borrower_unit})`;
  if (item.status === 'available') return 'Available';
  if (item.status === 'requested') return mine ? `${who} asked to borrow` : `Requested by ${who}`;
  return `Lent to ${who}`;
}

// Which buttons each person sees mirrors the server's rule in applyAction().
function actionsFor(item) {
  const mine = item.owner_id === me.id;
  const you = item.borrower_id === me.id;
  if (mine) {
    if (item.status === 'requested') return [['lend', 'Lend it'], ['decline', 'Decline']];
    if (item.status === 'lent') return [['returned', 'Mark returned']];
    return [['edit', 'Edit'], ['delete', 'Delete']];
  }
  if (item.status === 'available') return [['request', 'Ask to borrow']];
  if (item.status === 'requested' && you) return [['cancel', 'Cancel request']];
  return [];
}

function render() {
  const list = $('#items');
  list.replaceChildren();
  const shown = items.filter(FILTERS[filter]);
  $('#empty').hidden = shown.length > 0;

  for (const item of shown) {
    const li = document.createElement('li');
    li.className = `item status-${item.status}`;
    const pic = document.createElement('div');
    pic.className = 'item-icon';
    pic.innerHTML = icon(item.kind);
    const body = document.createElement('div');
    body.className = 'item-body';
    li.append(pic, body);

    const head = document.createElement('div');
    head.className = 'item-head';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = statusText(item);
    head.append(title, badge);

    const meta = document.createElement('p');
    meta.className = 'muted small';
    meta.textContent = item.owner_id === me.id ? 'Yours' : `${item.owner_name} · ${item.owner_unit}`;

    body.append(head, meta);
    if (item.note) {
      const note = document.createElement('p');
      note.textContent = item.note;
      body.append(note);
    }

    const buttons = document.createElement('div');
    buttons.className = 'actions';
    for (const [action, label] of actionsFor(item)) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className = action === 'delete' || action === 'decline' ? 'secondary' : '';
      btn.addEventListener('click', () => doAction(item, action));
      buttons.append(btn);
    }
    body.append(buttons);
    list.append(li);
  }
}

async function doAction(item, action) {
  try {
    if (action === 'delete') {
      if (!confirm(`Delete "${item.title}"?`)) return;
      await api('DELETE', `/api/items/${item.id}`);
    } else if (action === 'edit') {
      const title = prompt('Title', item.title);
      if (title === null) return;
      const note = prompt('Note', item.note);
      if (note === null) return;
      await api('PATCH', `/api/items/${item.id}`, { action, title, note });
    } else {
      await api('PATCH', `/api/items/${item.id}`, { action });
    }
    await loadItems();
  } catch (err) {
    if (err.status === 401) return showAuth();
    $('#app-error').textContent = err.message;
    await loadItems();
  }
}

// Pick up neighbours' changes without a manual refresh.
setInterval(() => { if (me && !document.hidden) loadItems(); }, 15_000);

boot();
