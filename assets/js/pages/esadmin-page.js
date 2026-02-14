// assets/js/pages/esadmin-page.js
// AquiVivo Admin (RESTORE+FIX): Dashboard + Uzytkownicy + Kody + Referral + Uslugi + Segmentacja (MVP)
// Architecture: no inline JS. Page logic lives here.

import { auth, db, storage } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { normalizePlanKey, levelsFromPlan } from '../plan-levels.js';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  startAfter,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const ADMIN_UIDS = new Set(['OgXNeCbloJiSGoi1DsZ9UN0aU0I2']);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function usePrettyProfile() {
  const host = location.hostname || '';
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('github.io')) return false;
  return true;
}

function buildProfileHref(handle, uid) {
  const safeHandle = String(handle || '').trim();
  if (safeHandle) {
    if (usePrettyProfile()) return `/perfil/${encodeURIComponent(safeHandle)}`;
    return `perfil.html?u=${encodeURIComponent(safeHandle)}`;
  }
  return `perfil.html?uid=${encodeURIComponent(uid)}`;
}

function normText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/\S+/i);
  return match ? match[0] : '';
}

function setStatus(el, msg, bad = false) {
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = bad ? 'var(--red, #ff6b6b)' : '';
}

/* =========================
   Utils: dates
   ========================= */
function toDateMaybe(ts) {
  try {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts?.toDate) return ts.toDate();
    if (ts?.seconds != null) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function isoDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// For <input type="datetime-local"> -> "YYYY-MM-DDTHH:mm"
function isoDateTimeLocal(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDateTimeLocal(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  // datetime-local returns "YYYY-MM-DDTHH:mm"
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateOnly(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  // date input returns "YYYY-MM-DD" -> treat as end of day
  const d = new Date(`${s}T23:59:59`);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + Number(n || 0));
  return x;
}

function isFuture(d) {
  const x = toDateMaybe(d);
  if (!x) return false;
  return x.getTime() > Date.now();
}

function hasAccess(u) {
  const role = String(u?.role || 'user');
  if (role === 'admin') return true;
  if (u?.access === true) return true;
  if (String(u?.plan || '') === 'premium') return true;
  if (isFuture(u?.accessUntil)) return true;
  return false;
}

/* =========================
  PLAN -> levels/accessUntil mapping (A1/A2/B1/B2)
   Contract in users/{uid}:
   - plan: string
   - levels: array of strings (e.g. ["A1","A2"])
   - accessUntil: Firestore Timestamp/Date
   ========================= */
const PLAN_DAYS = {
  free: 0,

  // single-level plans
  a1: 30,
  a2: 30,
  b1: 30,
  b2: 30,

  // premium bundles (progressive)
  premium: 30,
  premium_a1: 30,
  premium_b1: 30,
  premium_b2: 30,

  // VIP (custom names from Stripe / services.sku)
  'vip a1 + a2 + b1': 30,
  'vip a1 + a2 + b1 + b2': 30,
};

const servicesPlanCache = new Map();

function parseAccessDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function computeLevelsForPlan(planId) {
  const key = normalizePlanKey(planId);
  const svc = servicesPlanCache.get(key);
  if (svc?.accessLevels?.length) return [...svc.accessLevels];
  return levelsFromPlan(planId);
}

function computeUntilForPlan(planId) {
  const p = normalizePlanKey(planId);
  const svc = servicesPlanCache.get(p);
  const days = svc?.accessDays || PLAN_DAYS[p];
  if (!days || !Number.isFinite(days)) return null;
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d;
}

function normalizePlanId(planId) {
  return String(planId || 'free').trim();
}

/* =========================
   Lightweight counting (MVP)
   ========================= */
async function safeCountQuery(q, cap = 500) {
  const snap = await getDocs(query(q, limit(cap)));
  return snap.size;
}

async function safeCountCol(colName, cap = 500) {
  const snap = await getDocs(query(collection(db, colName), limit(cap)));
  return snap.size;
}

/* =========================
   Admin guard (client-side)
   ========================= */
async function ensureAdmin(user) {
  // DEV helper: allow-list specific UIDs to access admin UI even if users/{uid}.role is not set yet.
  // Security still depends on Firestore Rules (this only prevents accidental lock-out).
  try {
    if (ADMIN_UIDS.has(user.uid)) return true;

    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const role = String(data?.role || 'user');

    if (role !== 'admin') {
      // Show warning but DO NOT block the whole page (so you can still fix the role from UI/console).
      const banner =
        document.querySelector('.heroBanner .subtitle') ||
        document.querySelector('.heroBanner p.subtitle');
      if (banner)
        banner.textContent =
          ' Uwaga: Twoje konto nie ma roli admin w Firestore (users/OgXNeCbloJiSGoi1DsZ9UN0aU0I2.role). Panel w trybie DEV.';
      console.warn('[ensureAdmin] Not admin:', user.uid);
      return true;
    }
    return true;
  } catch (e) {
    console.error('[ensureAdmin]', e);
    // Fail-open in DEV to avoid locking yourself out; rules still protect writes.
    return true;
  }
}

/* =========================
   DASHBOARD (IDs: statUsers, statCourses, statExercises, etc.)
   ========================= */
async function loadDashboard() {
  const st = $('statsStatus');
  try {
    setStatus(st, 'Ladowanie...');

    const usersCol = collection(db, 'users');

    const [
      usersTotal,
      coursesTotal,
      exercisesTotal,
      premiumPlan,
      accessTrue,
      blocked,
      oneTopic,
    ] = await Promise.all([
      safeCountCol('users'),
      safeCountCol('courses'),
      safeCountCol('exercises'),
      safeCountQuery(query(usersCol, where('plan', '==', 'premium'))),
      safeCountQuery(query(usersCol, where('access', '==', true))),
      safeCountQuery(query(usersCol, where('blocked', '==', true))),
      safeCountQuery(query(usersCol, where('openedTopicsCount', '==', 1))),
    ]);

    if ($('statUsers')) $('statUsers').textContent = String(usersTotal);
    if ($('statCourses')) $('statCourses').textContent = String(coursesTotal);
    if ($('statExercises'))
      $('statExercises').textContent = String(exercisesTotal);

    if ($('statPremiumPlan'))
      $('statPremiumPlan').textContent = String(premiumPlan);
    if ($('statAccessTrue'))
      $('statAccessTrue').textContent = String(accessTrue);
    if ($('statBlocked')) $('statBlocked').textContent = String(blocked);
    if ($('statOneTopic')) $('statOneTopic').textContent = String(oneTopic);

    await loadPageViewsStats();

    setStatus(st, 'Gotowe');
    const updated = $('statsUpdated');
    if (updated) {
      updated.textContent = `Aktualizacja: ${new Date().toLocaleTimeString()}`;
    }
  } catch (e) {
    console.error('[dashboard]', e);
    setStatus(st, 'Blad: sprawdz rules / Console.', true);
  }
}

async function loadPageViewsStats() {
  const elToday = $('statVisitsToday');
  const elWeek = $('statVisitsWeek');
  const elMonth = $('statVisitsMonth');
  if (!elToday || !elWeek || !elMonth) return;

  try {
    const snap = await getDocs(
      query(collection(db, 'page_views'), orderBy('createdAt', 'desc'), limit(1000)),
    );
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const monthStart = new Date(todayStart.getTime() - 29 * 86400000);

    let today = 0;
    let week = 0;
    let month = 0;

    snap.forEach((docSnap) => {
      const v = docSnap.data() || {};
      if (v.isAdmin === true) return;
      if (v.uid && ADMIN_UIDS.has(v.uid)) return;
      const dt = toDateMaybe(v.createdAt);
      if (!dt) return;
      const ts = dt.getTime();
      if (ts >= monthStart.getTime()) {
        month += 1;
        if (ts >= weekStart.getTime()) {
          week += 1;
          if (ts >= todayStart.getTime()) today += 1;
        }
      }
    });

    elToday.textContent = String(today);
    elWeek.textContent = String(week);
    elMonth.textContent = String(month);
  } catch (e) {
    console.warn('[page_views]', e);
    elToday.textContent = '-';
    elWeek.textContent = '-';
    elMonth.textContent = '-';
  }
}

/* =========================
   Popup / banner settings
   ========================= */
async function loadPopupSettingsAdmin() {
  const status = $('popupStatus');
  try {
    setStatus(status, 'Ladowanie...');
    const snap = await getDoc(doc(db, 'site_settings', 'popup'));
    const data = snap.exists() ? snap.data() : {};
    if ($('popupEnabled'))
      $('popupEnabled').value = data.enabled === false ? 'false' : 'true';
    if ($('popupShowOn')) $('popupShowOn').value = String(data.showOn || 'visit');
    if ($('popupRepeat'))
      $('popupRepeat').value = data.repeat === true ? 'true' : 'false';
    if ($('popupTitle')) $('popupTitle').value = String(data.title || '');
    if ($('popupBody')) $('popupBody').value = String(data.body || '');
    if ($('popupCtaLabel')) $('popupCtaLabel').value = String(data.ctaLabel || '');
    if ($('popupCtaUrl')) $('popupCtaUrl').value = String(data.ctaUrl || '');
    if ($('popupImageUrl')) $('popupImageUrl').value = String(data.imageUrl || '');
    setStatus(status, 'Gotowe');
  } catch (e) {
    console.warn('[popup settings]', e);
    setStatus(status, 'Blad ladowania', true);
  }
}

async function savePopupSettings() {
  const status = $('popupStatus');
  try {
    setStatus(status, 'Zapisywanie...');
    const payload = {
      enabled: String($('popupEnabled')?.value || 'false') === 'true',
      showOn: String($('popupShowOn')?.value || 'visit'),
      repeat: String($('popupRepeat')?.value || 'false') === 'true',
      title: String($('popupTitle')?.value || '').trim(),
      body: String($('popupBody')?.value || '').trim(),
      ctaLabel: String($('popupCtaLabel')?.value || '').trim(),
      ctaUrl: String($('popupCtaUrl')?.value || '').trim(),
      imageUrl: String($('popupImageUrl')?.value || '').trim(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'site_settings', 'popup'), payload, { merge: true });
    setStatus(status, 'Zapisano');
  } catch (e) {
    console.warn('[popup save]', e);
    setStatus(status, 'Blad zapisu', true);
  }
}

/* =========================
   Quick nav (admin cards)
   ========================= */
function setupAdminQuickNav() {
  const select = $('adminQuickNav');
  if (!select) return;
  const cards = Array.from(document.querySelectorAll('details.card[id^="acc"]'));
  const options = cards
    .map((card) => {
      const summary = card.querySelector('summary');
      const label = summary ? summary.textContent.trim() : card.id;
      return { id: card.id, label };
    })
    .filter((opt) => opt.id && opt.label);

  select.innerHTML =
    '<option value="">Skocz do sekcji...</option>' +
    options.map((opt) => `<option value="${esc(opt.id)}">${esc(opt.label)}</option>`).join('');

  select.addEventListener('change', (e) => {
    const id = String(e.target?.value || '');
    if (!id) return;
    openAdminSection(id);
    select.value = '';
  });
}

function getAdminSectionCards() {
  return Array.from(document.querySelectorAll('details.card[id^="acc"]'));
}

let adminSectionPool = null;
let adminSectionSlot = null;
let activeAdminSectionId = '';

function ensureAdminSectionPool() {
  if (adminSectionPool) return adminSectionPool;
  const pool = document.createElement('div');
  pool.id = 'adminSectionPool';
  pool.className = 'admin-section-pool';
  pool.style.display = 'none';
  document.body.appendChild(pool);
  adminSectionPool = pool;
  return pool;
}

function ensureAdminSectionSlot() {
  if (adminSectionSlot) return adminSectionSlot;
  const slot = document.createElement('div');
  slot.id = 'adminSectionSlot';
  slot.className = 'admin-section-slot';
  const dashboard = document.getElementById('accDashboard');
  if (dashboard && dashboard.parentElement) {
    dashboard.insertAdjacentElement('afterend', slot);
  } else {
    const container = document.querySelector('main.page .container');
    container?.appendChild(slot);
  }
  adminSectionSlot = slot;
  return slot;
}

function setActiveAdminLink(id) {
  const sidePanel = document.getElementById('sidePanel');
  if (!sidePanel) return;
  const targetId = String(id || '');
  const activeLinks = [];
  sidePanel.querySelectorAll('.side-panel-link').forEach((link) => {
    const isActive = !!targetId && link.dataset.adminSection === targetId;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      activeLinks.push(link);
      const group = link.closest('details.side-panel-group');
      if (group) group.open = true;
    }
  });
  if (!activeLinks.length) return;
  const preferred =
    activeLinks.find((link) => link.dataset.adminShortcut !== '1') ||
    activeLinks[0];
  requestAnimationFrame(() => {
    preferred.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}

function openAdminSection(id) {
  if (!id) return;
  if (id === 'accDashboard') {
    setActiveAdminLink('accDashboard');
    const dashboard = document.getElementById('accDashboard');
    if (dashboard) {
      dashboard.open = true;
      const header = document.querySelector('.nav-glass');
      const offset = header ? header.getBoundingClientRect().height + 12 : 12;
      const top = dashboard.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    return;
  }

  if (activeAdminSectionId === id) {
    closeAdminSection();
    return;
  }

  const card = document.getElementById(id);
  if (!card) return;
  const slot = ensureAdminSectionSlot();
  const pool = ensureAdminSectionPool();

  if (slot.firstElementChild) {
    const prev = slot.firstElementChild;
    prev.open = false;
    pool.appendChild(prev);
  }

  card.open = true;
  slot.appendChild(card);
  slot.style.display = 'block';
  setActiveAdminLink(id);
  activeAdminSectionId = id;
  const header = document.querySelector('.nav-glass');
  const offset = header ? header.getBoundingClientRect().height + 12 : 12;
  const top = slot.getBoundingClientRect().top + window.pageYOffset - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

function closeAdminSection() {
  const slot = ensureAdminSectionSlot();
  const pool = ensureAdminSectionPool();
  if (slot.firstElementChild) {
    const prev = slot.firstElementChild;
    prev.open = false;
    pool.appendChild(prev);
  }
  slot.style.display = 'none';
  activeAdminSectionId = '';
  setActiveAdminLink('');
}

function setupAdminSidebarSections() {
  const sidePanel = document.getElementById('sidePanel');
  if (!sidePanel) return;
  if (sidePanel.dataset.adminSidebar === '1') return;
  document.body.classList.add('with-side-panel');
  if (!sidePanel.classList.contains('side-panel'))
    sidePanel.classList.add('side-panel');
  const cards = getAdminSectionCards();
  if (!cards.length) return;

  const cleanLabel = (txt) =>
    String(txt || '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  document.body.classList.add('admin-sections-single');
  ensureAdminSectionPool();
  ensureAdminSectionSlot();

  cards.forEach((card) => {
    if (card.id !== 'accDashboard') adminSectionPool.appendChild(card);
  });

  const hero = document.querySelector('.heroBanner');
  if (hero) hero.classList.add('admin-hidden');
  document.querySelectorAll('.adminGroupTitle, .adminGroup').forEach((el) => {
    el.classList.add('admin-hidden');
  });

  sidePanel.classList.add('side-panel--admin');
  sidePanel.dataset.adminSidebar = '1';
  sidePanel.innerHTML = '';

  const iconMap = {
    accDashboard: '📊',
    accPopup: '🎈',
    accServices: '🛒',
    accPayments: '💳',
    accPromo: '🏷️',
    accSegments: '🧩',
    accBroadcasts: '📢',
    accPublishing: '📝',
    accMissing: '🧹',
    accUsers: '👥',
    accProgress: '📈',
    accActivity: '⏱️',
    accFlashcards: '🃏',
    accReviews: '⭐',
    accReports: '🧾',
    accAppLogs: '🖥️',
    accAudioLib: '🎧',
  };

  const labelById = new Map(
    cards.map((card) => {
      const summary = card.querySelector('summary');
      const raw = summary ? summary.textContent.trim() : card.id;
      const label = cleanLabel(raw);
      return [card.id, label];
    }),
  );

  const groupDefs = [
    { title: '📂 Pulpit i ustawienia', items: ['accDashboard', 'accPopup'] },
    {
      title: '📈 Sprzedaz i marketing',
      items: [
        'accServices',
        'accPayments',
        'accPromo',
        'accSegments',
        'accBroadcasts',
        'accPublishing',
        'accMissing',
      ],
    },
    { title: '👥 Uzytkownicy i postep', items: ['accUsers', 'accProgress', 'accActivity', 'accFlashcards'] },
    { title: '⭐ Opinie i jakosc', items: ['accReviews', 'accReports'] },
    { title: '🛠️ Techniczne i multimedia', items: ['accAppLogs', 'accAudioLib'] },
  ];

  const quickGroup = document.createElement('details');
  quickGroup.className = 'side-panel-group';
  quickGroup.open = true;
  const quickSummary = document.createElement('summary');
  quickSummary.className = 'side-panel-group-title';
  quickSummary.textContent = 'Start i stare opcje';
  quickGroup.appendChild(quickSummary);

  const quickList = document.createElement('div');
  quickList.className = 'side-panel-group-list';
  const quickItems = [
    { href: 'admin-select.html', label: 'Centrum admina', icon: '&#x1F9ED;' },
    { href: 'admin-wizard.html', label: 'Kreator', icon: '&#x1F9F0;' },
    { href: 'lessonadmin.html', label: 'Admin lekcji', icon: '&#x1F4D8;' },
    { href: 'ejercicioadmin.html', label: 'Admin cwiczen', icon: '&#x1F3AF;' },
    { adminSection: 'accDashboard', label: 'Dashboard', icon: iconMap.accDashboard },
    { adminSection: 'accServices', label: 'Dodawanie tresci', icon: iconMap.accServices },
    { adminSection: 'accPayments', label: 'Ceny i platnosci', icon: iconMap.accPayments },
    { adminSection: 'accUsers', label: 'Uzytkownicy', icon: iconMap.accUsers },
    { adminSection: 'accPromo', label: 'Kody promo', icon: iconMap.accPromo },
    { adminSection: 'accSegments', label: 'Segmentacja', icon: iconMap.accSegments },
  ];
  quickItems.forEach((item) => {
    if (item.href) {
      const link = document.createElement('a');
      link.className = 'side-panel-link';
      link.href = item.href;
      link.innerHTML = `<span class="side-panel-ico">${item.icon || ''}</span><span>${esc(
        item.label || '',
      )}</span>`;
      quickList.appendChild(link);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'side-panel-link';
    btn.dataset.adminSection = item.adminSection || '';
    btn.dataset.adminShortcut = '1';
    btn.innerHTML = `<span class="side-panel-ico">${item.icon || ''}</span><span>${esc(
      item.label || '',
    )}</span>`;
    quickList.appendChild(btn);
  });
  quickGroup.appendChild(quickList);
  sidePanel.appendChild(quickGroup);

  const usedIds = new Set();
  groupDefs.forEach((group) => {
    const items = group.items.filter((id) => labelById.has(id));
    if (!items.length) return;
    const groupEl = document.createElement('details');
    groupEl.className = 'side-panel-group';
    groupEl.open = true;
    const summary = document.createElement('summary');
    summary.className = 'side-panel-group-title';
    summary.textContent = group.title;
    groupEl.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'side-panel-group-list';
    items.forEach((id) => {
      const label = labelById.get(id);
      if (!label) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'side-panel-link';
      btn.dataset.adminSection = id;
      const icon = iconMap[id] || '';
      btn.innerHTML = `<span class="side-panel-ico">${icon}</span><span>${esc(label)}</span>`;
      list.appendChild(btn);
      usedIds.add(id);
    });
    groupEl.appendChild(list);
    sidePanel.appendChild(groupEl);
  });

  const remaining = cards
    .map((card) => card.id)
    .filter((id) => id && !usedIds.has(id));
  if (remaining.length) {
    const groupEl = document.createElement('details');
    groupEl.className = 'side-panel-group';
    groupEl.open = true;
    const summary = document.createElement('summary');
    summary.className = 'side-panel-group-title';
    summary.textContent = 'Pozostale';
    groupEl.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'side-panel-group-list';
    remaining.forEach((id) => {
      const label = labelById.get(id);
      if (!label) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'side-panel-link';
      btn.dataset.adminSection = id;
      const icon = iconMap[id] || '';
      btn.innerHTML = `<span class="side-panel-ico">${icon}</span><span>${esc(label)}</span>`;
      list.appendChild(btn);
    });
    groupEl.appendChild(list);
    sidePanel.appendChild(groupEl);
  }

  sidePanel.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-admin-section]');
    if (!btn) return;
    const id = String(btn.dataset.adminSection || '');
    if (id) openAdminSection(id);
  });

  document.querySelectorAll('[data-open]').forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const id = btn.dataset.open;
      if (id) openAdminSection(id);
    });
  });
}

function watchAdminSidebar() {
  if (document.body.dataset.adminSidebarWatch === '1') return;
  document.body.dataset.adminSidebarWatch = '1';

  const tryInit = () => {
    const sidePanel = document.getElementById('sidePanel');
    if (!sidePanel) return;
    if (sidePanel.dataset.adminSidebar === '1') return;
    setupAdminSidebarSections();
  };

  const obs = new MutationObserver(() => {
    tryInit();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // also try right away + a bit later (in case layout renders after auth)
  tryInit();
  setTimeout(tryInit, 300);
  setTimeout(tryInit, 1000);
}

function openSectionFromHash() {
  const raw = String(window.location.hash || '').trim();
  if (!raw || raw.length < 2) return;
  const id = raw.slice(1);
  const card = document.getElementById(id);
  if (card) openAdminSection(id);
}

/* Optional: statCard click -> show small details (first 20 emails) */
async function loadStatDetails(type) {
  const detailsMap = {
    users: 'statUsersDetails',
    premium: 'statPremiumPlanDetails',
    access: 'statAccessTrueDetails',
    blocked: 'statBlockedDetails',
    oneTopic: 'statOneTopicDetails',
  };
  const detailsId = detailsMap[type];
  const box = detailsId ? $(detailsId) : null;
  if (!box) return;

  const open = box.style.display !== 'none';
  if (open) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.style.display = 'block';
  box.innerHTML = '<div class="hintSmall">Ladowanie...</div>';

  try {
    const usersCol = collection(db, 'users');
    let q1 = query(usersCol, orderBy('__name__'), limit(20));
    if (type === 'premium')
      q1 = query(usersCol, where('plan', '==', 'premium'), limit(20));
    if (type === 'access')
      q1 = query(usersCol, where('access', '==', true), limit(20));
    if (type === 'blocked')
      q1 = query(usersCol, where('blocked', '==', true), limit(20));
    if (type === 'oneTopic')
      q1 = query(usersCol, where('openedTopicsCount', '==', 1), limit(20));

    const snap = await getDocs(q1);
    const rows = [];
    snap.forEach((d) => {
      const u = d.data() || {};
      const email = esc(u.email || u.emailLower || d.id);
      const until = isoDate(u.accessUntil);
      rows.push(
        `<div class="hintSmall">${email}${until ? '  -  ' + esc(until) : ''}</div>`,
      );
    });
    box.innerHTML = rows.length
      ? rows.join('')
      : '<div class="hintSmall"></div>';
  } catch (e) {
    console.error('[stat details]', e);
    box.innerHTML = '<div class="hintSmall">Blad ladowania szczegolow.</div>';
  }
}

/* =========================
   REFERRAL SETTINGS
   promo_codes/_REFERRAL_SETTINGS
   ========================= */
async function loadReferralSettings() {
  const p = $('refOwnerPercent');
  const s = $('refRewardScope');
  const st = $('refSettingsStatus');
  if (!p || !s) return;

  try {
    const snap = await getDoc(doc(db, 'promo_codes', '_REFERRAL_SETTINGS'));
    const data = snap.exists() ? snap.data() : {};
    p.value = String(data?.percent ?? '');
    s.value = String(data?.scope ?? '');
  } catch (e) {
    console.error('[referral load]', e);
    setStatus(st, 'Blad ladowania.', true);
  }
}

async function saveReferralSettings() {
  const p = $('refOwnerPercent');
  const s = $('refRewardScope');
  const st = $('refSettingsStatus');
  if (!p || !s) return;

  const percent = Number(p.value || 0);
  const scope = String(s.value || '').trim();

  setStatus(st, 'Zapisywanie...');
  try {
    await setDoc(
      doc(db, 'promo_codes', '_REFERRAL_SETTINGS'),
      {
        type: 'REFERRAL_SETTINGS',
        percent,
        scope,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setStatus(st, 'Zapisano');
    await loadDashboard();
  } catch (e) {
    console.error('[referral save]', e);
    setStatus(st, 'Blad (uprawnienia?).', true);
  }
}

/* =========================
   PROMO CODES (promo_codes)
   Supports two schemas:
   A) { percent, note, active }  (old)
   B) { days, plan, active }     (current HTML form)
   ========================= */
function renderPromoRow(id, p) {
  const active = p.active === false ? 'NIE' : 'TAK';
  const pct = p.percent != null ? `${p.percent}%` : null;
  const days = p.days != null ? `${p.days} dni` : null;
  const plan = p.plan ? `plan: ${esc(p.plan)}` : null;
  const note = p.note ? esc(p.note) : '';
  const expDate = p.expiresAt ? isoDate(p.expiresAt) : null;
  const expObj = toDateMaybe(p.expiresAt);
  const expired = expObj && expObj.getTime() < Date.now();
  const exp = expDate ? `${expired ? 'wygaslo' : 'wygasa'}: ${expDate}` : null;
  const stack = p.stackDays === false ? 'od dzis' : 'dolicz dni';
  const repeat = p.repeatable === true ? 'wielokrotny' : '1 raz/uzytkownik';

  const line2 =
    [pct, days, plan, exp, stack, repeat, note].filter(Boolean).join('  -  ') ||
    '';

  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${esc(id)} ${active}</div>
          <div class="hintSmall">${line2}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-white-outline" type="button" data-pc="toggle" data-id="${esc(id)}">
            ${p.active === false ? 'Aktywuj' : 'Ukryj'}
          </button>
          <button class="btn-red" type="button" data-pc="del" data-id="${esc(id)}">Usun</button>
        </div>
      </div>
    </div>
  `;
}

async function loadPromoList() {
  const list = $('promoListAdmin') || $('promoList');
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'promo_codes'), limit(200)),
    );
    const rows = [];
    snap.forEach((d) => {
      if (d.id === '_REFERRAL_SETTINGS') return;
      rows.push(renderPromoRow(d.id, d.data() || {}));
    });
    list.innerHTML = rows.length
      ? rows.join('')
      : '<div class="hintSmall"></div>';
  } catch (e) {
    console.error('[promo list]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania promo_codes.</div>';
  }
}

async function savePromoCode() {
  // Current HTML ids
  const code = String($('promoCode')?.value || $('pcCode')?.value || '').trim();
  const st = $('promoStatus') || $('pcStatus');
  if (!code) {
    setStatus(st, 'Brak kodu.', true);
    return;
  }

  const daysRaw = $('promoDays')?.value;
  const daysInputPresent = !!$('promoDays');
  const expiresRaw = $('promoExpires')?.value;
  const plan = String($('promoPlan')?.value || 'premium');
  const active = $('promoActive')
    ? $('promoActive').checked
    : String($('pcActive')?.value || 'true') === 'true';
  const stackDays = $('promoStack') ? $('promoStack').checked : true;
  const repeatable = $('promoRepeat') ? $('promoRepeat').checked : false;
  const promoNote = $('promoNote')
    ? String($('promoNote').value || '').trim()
    : '';

  // Optional old schema inputs if present
  const percent = $('pcPercent') ? Number($('pcPercent').value || 0) : null;
  const noteLegacy = $('pcNote') ? String($('pcNote').value || '').trim() : '';
  const note = promoNote || noteLegacy;

  const days =
    daysRaw != null && String(daysRaw).trim() !== ''
      ? Number(daysRaw || 0)
      : null;
  const expiresAt = parseDateOnly(expiresRaw);

  setStatus(st, 'Zapisywanie...');
  try {
    const payload = {
      code,
      active,
      updatedAt: serverTimestamp(),
    };

    if (days != null) payload.days = days;
    else if (daysInputPresent) payload.days = null;
    if (plan) payload.plan = plan;
    if (percent != null && !Number.isNaN(percent) && percent !== 0)
      payload.percent = percent;
    if (note) payload.note = note;
    else if ($('promoNote') || $('pcNote')) payload.note = null;
    if (expiresRaw != null) {
      payload.expiresAt = expiresAt ? Timestamp.fromDate(expiresAt) : null;
    }
    payload.stackDays = stackDays;
    payload.repeatable = repeatable;

    await setDoc(doc(db, 'promo_codes', code), payload, { merge: true });

    setStatus(st, 'Zapisano');
    if ($('promoCode')) $('promoCode').value = '';
    if ($('promoDays')) $('promoDays').value = '';
    if ($('promoExpires')) $('promoExpires').value = '';
    if ($('promoPlan')) $('promoPlan').value = 'premium';
    if ($('promoNote')) $('promoNote').value = '';
    if ($('promoActive')) $('promoActive').checked = true;
    if ($('promoStack')) $('promoStack').checked = true;
    if ($('promoRepeat')) $('promoRepeat').checked = false;

    if ($('pcCode')) $('pcCode').value = '';
    if ($('pcPercent')) $('pcPercent').value = '';
    if ($('pcNote')) $('pcNote').value = '';
    if ($('pcActive')) $('pcActive').value = 'true';

    await loadPromoList();
    await loadDashboard();
  } catch (e) {
    console.error('[promo save]', e);
    setStatus(st, 'Blad (uprawnienia?).', true);
  }
}

async function togglePromo(id) {
  try {
    const ref = doc(db, 'promo_codes', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const p = snap.data() || {};
    const next = p.active === false ? true : false;
    await setDoc(
      ref,
      { active: next, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await loadPromoList();
    await loadDashboard();
  } catch (e) {
    console.error('[promo toggle]', e);
  }
}

async function deletePromo(id) {
  if (!confirm('Usunac kod?')) return;
  try {
    await deleteDoc(doc(db, 'promo_codes', id));
    await loadPromoList();
    await loadDashboard();
  } catch (e) {
    console.error('[promo delete]', e);
  }
}

function clearPromoForm() {
  if ($('promoCode')) $('promoCode').value = '';
  if ($('promoDays')) $('promoDays').value = '';
  if ($('promoExpires')) $('promoExpires').value = '';
  if ($('promoPlan')) $('promoPlan').value = 'premium';
  if ($('promoNote')) $('promoNote').value = '';
  if ($('promoActive')) $('promoActive').checked = true;
  if ($('promoStack')) $('promoStack').checked = true;
  if ($('promoRepeat')) $('promoRepeat').checked = false;
  setStatus($('promoStatus'), '');
}

/* =========================
   SERVICES (services) CRUD
   ========================= */
let currentServiceId = null;
let currentServiceData = null;
const SERVICE_PRICE_FALLBACK = {
  premium_a1: 'price_1Sw2t5CI9cIUEmOtYvVwzq30',
  premium_b1: 'price_1Sw2rUCI9cIUEmOtj7nhkJFQ',
  premium_b2: 'price_1Sw2xqCI9cIUEmOtEDsrRvid',
  'vip a1 + a2 + b1': 'price_1Sw2yvCI9cIUEmOtwTCkpP4e',
  'vip a1 + a2 + b1 + b2': 'price_1Sw2zoCI9cIUEmOtSeTp1AjZ',
  'tarjeta de residencia': 'price_1Sw310CI9cIUEmOtCYMhSLHa',
};

function fillServiceForm(id, s) {
  if ($('svcSku')) $('svcSku').value = id || s.sku || '';
  if ($('svcCategory')) {
    const raw = String(s.category || '').toLowerCase();
    const mapped = raw === 'consults' ? 'consultas' : raw;
    $('svcCategory').value = mapped || 'extras';
  }
  if ($('svcTitle')) $('svcTitle').value = s.title || '';
  if ($('svcDesc')) $('svcDesc').value = s.desc || '';
  if ($('svcPrice')) $('svcPrice').value = s.price || '';
  if ($('svcBadge')) $('svcBadge').value = s.badge || '';
  if ($('svcAccessDays'))
    $('svcAccessDays').value =
      s.accessDays != null && s.accessDays !== ''
        ? String(s.accessDays)
        : '';
  if ($('svcAccessLevels'))
    $('svcAccessLevels').value = formatServiceLevels(s.accessLevels);
  if ($('svcOrder')) $('svcOrder').value = String(Number(s.order || 0));
  if ($('svcCtaType')) $('svcCtaType').value = s.ctaType || 'info';
  if ($('svcStripePriceId')) $('svcStripePriceId').value = s.stripePriceId || '';
  if ($('svcCtaUrl')) $('svcCtaUrl').value = s.ctaUrl || '';
  if ($('svcCtaLabel')) $('svcCtaLabel').value = s.ctaLabel || '';
  if ($('svcActive'))
    $('svcActive').value = s.active === false ? 'false' : 'true';
}

function parseServiceLevels(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v || '').trim().toUpperCase())
      .filter((v) => ['A1', 'A2', 'B1', 'B2'].includes(v));
  }
  const str = String(raw || '').trim();
  if (!str) return [];
  const parts = str.replace(/\+/g, ' ').split(/[,\s]+/).filter(Boolean);
  const out = [];
  parts.forEach((p) => {
    const up = String(p).trim().toUpperCase();
    if (['A1', 'A2', 'B1', 'B2'].includes(up)) out.push(up);
  });
  return [...new Set(out)];
}

function formatServiceLevels(raw) {
  const levels = parseServiceLevels(raw);
  return levels.length ? levels.join(',') : '';
}

function renderServiceRow(id, s) {
  const active = s.active === false ? 'NIE hidden' : 'TAK active';
  const cat = String(s.category || '').toLowerCase();
  const catClass = cat ? ` serviceRow--${cat}` : '';
  const stripeInfo =
    s.ctaType === 'stripe' && s.stripePriceId
      ? `  -  stripe: ${esc(s.stripePriceId)}`
      : s.ctaType === 'stripe'
        ? '  -  stripe: brak priceId'
        : '';
  const levelsText = formatServiceLevels(s.accessLevels);
  const accessInfo = [
    s.accessDays ? `dni: ${esc(s.accessDays)}` : '',
    levelsText ? `poziomy: ${esc(levelsText)}` : '',
  ]
    .filter(Boolean)
    .join('  -  ');
  return `
    <div class="listItem${catClass}">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${esc(s.title || id)}</div>
          <div class="hintSmall">SKU: ${esc(id)}  -  cat: ${esc(s.category || 'extras')}  -  ${active}</div>
          <div class="hintSmall">${s.price ? ' ' + esc(s.price) : ''}${s.badge ? '  -   ' + esc(s.badge) : ''}${stripeInfo}${accessInfo ? '  -  ' + accessInfo : ''}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn-white-outline" type="button" data-svc="edit" data-id="${esc(id)}">Edytuj</button>
          <button class="btn-white-outline" type="button" data-svc="toggle" data-id="${esc(id)}">
            ${s.active === false ? 'Aktywuj' : 'Ukryj'}
          </button>
          <button class="btn-red" type="button" data-svc="del" data-id="${esc(id)}">Usun</button>
        </div>
      </div>
    </div>
  `;
}

async function loadServicesList() {
  const list = $('servicesAdminList');
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';

  try {
    servicesPlanCache.clear();
    const snap = await getDocs(
      query(collection(db, 'services'), orderBy('order', 'asc'), limit(500)),
    );
    const rows = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const sku = data.sku || d.id;
      const key = normalizePlanKey(sku);
      const accessLevels = parseServiceLevels(data.accessLevels);
      const accessDays = parseAccessDays(data.accessDays);
      const cached = {
        accessLevels,
        accessDays,
        sku,
        id: d.id,
      };
      if (key) servicesPlanCache.set(key, cached);
      const idKey = normalizePlanKey(d.id);
      if (idKey && !servicesPlanCache.has(idKey))
        servicesPlanCache.set(idKey, cached);
      rows.push(renderServiceRow(d.id, data));
    });
    list.innerHTML = rows.length
      ? rows.join('')
      : '<div class="hintSmall"></div>';
  } catch (e) {
    console.error('[services list]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania services.</div>';
  }
}

async function backfillServicePriceIds() {
  const st = $('svcStatus');
  setStatus(st, 'Uzupelnianie priceId...');
  try {
    const snap = await getDocs(
      query(collection(db, 'services'), limit(500)),
    );
    const batch = writeBatch(db);
    let updated = 0;
    snap.forEach((d) => {
      const data = d.data() || {};
      if (String(data.stripePriceId || '').trim()) return;
      const sku = String(data.sku || d.id || '').trim();
      const keySku = normalizePlanKey(sku);
      const keyId = normalizePlanKey(d.id);
      const priceId =
        SERVICE_PRICE_FALLBACK[keySku] || SERVICE_PRICE_FALLBACK[keyId];
      if (!priceId) return;
      batch.set(
        d.ref,
        {
          stripePriceId: priceId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      updated += 1;
    });

    if (updated > 0) {
      await batch.commit();
      setStatus(st, `Uzupelniono priceId: ${updated}`);
    } else {
      setStatus(st, 'Brak brakujacych priceId');
    }

    await loadServicesList();
  } catch (e) {
    console.error('[services backfill]', e);
    setStatus(st, 'Blad uzupelniania priceId.', true);
  }
}

async function saveService() {
  const st = $('svcStatus');
  const sku = String($('svcSku')?.value || '').trim();
  if (!sku) return setStatus(st, 'Brak SKU.', true);

  const accessDaysRaw = String($('svcAccessDays')?.value || '').trim();
  const accessDays =
    accessDaysRaw !== '' ? Number(accessDaysRaw || 0) : null;
  if (
    accessDaysRaw !== '' &&
    (!Number.isFinite(accessDays) || accessDays <= 0)
  ) {
    return setStatus(st, 'Dni dostepu musza byc > 0.', true);
  }

  const accessLevels = parseServiceLevels($('svcAccessLevels')?.value || '');
  const stripePriceIdRaw = String($('svcStripePriceId')?.value || '').trim();

  const skuLower = normalizePlanKey(sku);
  const payload = {
    sku,
    skuLower,
    category: String($('svcCategory')?.value || 'extras'),
    title: String($('svcTitle')?.value || '').trim(),
    desc: String($('svcDesc')?.value || '').trim(),
    price: String($('svcPrice')?.value || '').trim(),
    badge: String($('svcBadge')?.value || '').trim(),
    accessDays: accessDays ?? null,
    accessLevels: accessLevels.length ? accessLevels : null,
    order: Number($('svcOrder')?.value || 0),
    ctaType: String($('svcCtaType')?.value || 'info').trim(),
    // stripePriceId: don't wipe existing when field is empty during edit
    ctaUrl: String($('svcCtaUrl')?.value || '').trim(),
    ctaLabel: String($('svcCtaLabel')?.value || '').trim(),
    active: String($('svcActive')?.value || 'true') === 'true',
    updatedAt: serverTimestamp(),
  };
  if (
    payload.ctaType === 'stripe' &&
    !stripePriceIdRaw &&
    !currentServiceData?.stripePriceId
  ) {
    return setStatus(st, 'Podaj Stripe priceId (CTA = stripe).', true);
  }
  if (stripePriceIdRaw) {
    payload.stripePriceId = stripePriceIdRaw;
  } else if (!currentServiceData?.stripePriceId || currentServiceId !== sku) {
    // allow empty for new doc; keep existing for edits
    payload.stripePriceId = '';
  }

  if (
    payload.ctaType === 'link' &&
    payload.ctaUrl &&
    !/^https?:\/\//i.test(payload.ctaUrl)
  ) {
    return setStatus(
      st,
      'CTA url musi zaczynac sie od http(s):// (tylko dla link)',
      true,
    );
  }

  setStatus(st, 'Zapisywanie...');
  try {
    await setDoc(doc(db, 'services', sku), payload, { merge: true });
    setStatus(st, 'Zapisano');
    await loadServicesList();
    await loadDashboard();
  } catch (e) {
    console.error('[services save]', e);
    setStatus(st, 'Blad (uprawnienia?).', true);
  }
}

async function editService(id) {
  const snap = await getDoc(doc(db, 'services', id));
  if (!snap.exists()) return;
  currentServiceId = id;
  currentServiceData = snap.data() || {};
  fillServiceForm(id, currentServiceData);
  setStatus($('svcStatus'), 'Edycja');
}

async function toggleService(id) {
  try {
    const ref = doc(db, 'services', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const s = snap.data() || {};
    const next = s.active === false ? true : false;
    await setDoc(
      ref,
      { active: next, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await loadServicesList();
    await loadDashboard();
  } catch (e) {
    console.error('[service toggle]', e);
  }
}

async function deleteService(id) {
  if (!confirm('Usunac usluge?')) return;
  try {
    await deleteDoc(doc(db, 'services', id));
    await loadServicesList();
    await loadDashboard();
  } catch (e) {
    console.error('[service delete]', e);
  }
}

function clearServiceForm() {
  currentServiceId = null;
  currentServiceData = null;
  fillServiceForm('', {
    category: 'extras',
    ctaType: 'info',
    active: true,
    order: 0,
  });
  setStatus($('svcStatus'), '');
}

/* =========================
   PUBLISHING (drafts)
   ========================= */
let draftsCache = [];
let draftsTotalCount = 0;
let coursesIndex = new Map();

function parseCourseMetaId(raw) {
  const id = String(raw || '');
  const parts = id.split('__');
  if (parts.length >= 2) {
    return {
      level: parts[0],
      topicId: parts.slice(1).join('__'),
    };
  }
  return { level: '', topicId: id };
}

async function ensureCoursesIndex(force = false) {
  if (!force && coursesIndex.size) return coursesIndex;
  coursesIndex = new Map();
  const snap = await getDocs(query(collection(db, 'courses'), limit(500)));
  snap.forEach((d) => coursesIndex.set(d.id, d.data() || {}));
  return coursesIndex;
}

function getDraftFilters() {
  return {
    level: String($('draftLevel')?.value || 'all'),
    search: String($('draftSearch')?.value || '').trim().toLowerCase(),
  };
}

function renderDrafts() {
  const list = $('draftsList');
  if (!list) return;

  const { level, search } = getDraftFilters();
  let items = draftsCache.slice();

  if (level !== 'all') {
    items = items.filter((d) => String(d.level || '') === level);
  }
  if (search) {
    items = items.filter((d) => {
      const hay = `${d.title || ''} ${d.topicId || ''} ${d.slug || ''}`
        .toLowerCase()
        .trim();
      return hay.includes(search);
    });
  }

  const draftsSummaryEl = $('draftsSummary');
  if (draftsSummaryEl) {
    draftsSummaryEl.textContent =
      draftsTotalCount > 0
        ? `Szkice: ${draftsCache.length} / wszystkie: ${draftsTotalCount}`
        : 'Brak danych.';
  }

  if (!items.length) {
    list.innerHTML = '<div class="hintSmall">Brak szkicow.</div>';
    return;
  }

  list.innerHTML = items
    .map((d) => {
      const title = esc(d.title || d.slug || d.topicId || '(bez tytulu)');
      const levelTxt = esc(d.level || '-');
      const meta = esc(d.topicId || d.slug || d.id || '');
      const updated = d.updatedAt ? isoDate(d.updatedAt) : '';
      const hasHtml = d.hasHtml ? 'tak' : 'nie';
      const link = d.topicId
        ? `lessonpage.html?level=${encodeURIComponent(d.level)}&id=${encodeURIComponent(d.topicId)}`
        : '';

      return `
        <div class="listItem">
          <div style="font-weight:900;">${title}</div>
          <div class="hintSmall">poziom: ${levelTxt}  -  id: ${meta}  -  html: ${hasHtml}${updated ? '  -  aktualizacja: ' + esc(updated) : ''}</div>
          <div class="metaRow" style="margin-top:8px; gap:8px;">
            <button class="btn-white-outline" data-draft="publish" data-id="${esc(d.id)}">Opublikuj</button>
            ${link ? `<a class="btn-white-outline" href="${esc(link)}" target="_blank" rel="noopener">Podglad</a>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadDrafts() {
  const st = $('draftsStatus');
  try {
    setStatus(st, 'Ladowanie...');
    await ensureCoursesIndex();
    const snap = await getDocs(query(collection(db, 'course_meta'), limit(400)));
    draftsTotalCount = snap.size || 0;
    draftsCache = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const published = data.published === true;
      if (published) return;
      const meta = parseCourseMetaId(d.id);
      const course = coursesIndex.get(meta.topicId || '') || {};
      draftsCache.push({
        id: d.id,
        level: data.level || meta.level || course.level || '',
        topicId: meta.topicId || data.topicId || '',
        slug: data.topicSlug || course.slug || '',
        title: data.title || course.title || data.titleEs || '',
        updatedAt: data.updatedAt || data.createdAt || null,
        hasHtml: typeof data.html === 'string' && data.html.trim().length > 0,
      });
    });
    setStatus(st, `Gotowe (${draftsCache.length})`);
    renderDrafts();
  } catch (e) {
    console.error('[drafts]', e);
    setStatus(st, 'Blad', true);
    const list = $('draftsList');
    if (list)
      list.innerHTML = '<div class="hintSmall">Blad ladowania szkicow.</div>';
  }
}

async function publishDraft(id) {
  if (!id) return;
  try {
    await setDoc(
      doc(db, 'course_meta', id),
      { published: true, updatedAt: serverTimestamp() },
      { merge: true },
    );
    draftsCache = draftsCache.filter((d) => d.id !== id);
    renderDrafts();
  } catch (e) {
    console.error('[publish draft]', e);
  }
}

/* =========================
   MISSING DATA (audyt)
   ========================= */
let missingCache = {
  price: [],
  audio: [],
  tags: [],
  trans: [],
};

function normalizeOptions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n|;/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
  }
  return [];
}

function needsAudio(typeRaw) {
  const t = normText(typeRaw);
  return (
    t.includes('escuchar') ||
    t.includes('dictado') ||
    t.includes('audio') ||
    t.includes('repetir') ||
    t.includes('voz') ||
    t.includes('narrador')
  );
}

function hasAudio(ex) {
  if (ex?.audioUrl || ex?.audio || ex?.audioSrc) return true;
  const url = extractUrl(ex?.notes || '');
  return !!url;
}

function needsTranslation(typeRaw) {
  const t = normText(typeRaw);
  return t.includes('traduccion') || t.includes('tarjetas') || t.includes('fichas');
}

function lineHasTranslation(line) {
  const raw = String(line || '').trim();
  if (!raw) return false;
  if (/\bPL\s*:/i.test(raw) && /\bES\s*:/i.test(raw)) return true;
  if (raw.includes('|')) {
    const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2;
  }
  if (raw.includes('=') || raw.includes('->')) {
    const parts = raw.split(/=|->/).map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2;
  }
  if (raw.includes(' - ')) {
    const parts = raw.split(' - ').map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2;
  }
  return false;
}

function hasTranslation(ex) {
  const options = normalizeOptions(ex?.options);
  if (!options.length) return false;
  return options.some((line) => lineHasTranslation(line));
}

function getMissingFilters() {
  return {
    level: String($('missingLevel')?.value || 'all'),
    search: String($('missingSearch')?.value || '').trim().toLowerCase(),
  };
}

function filterMissing(items) {
  const { level, search } = getMissingFilters();
  let out = items.slice();
  if (level !== 'all') {
    out = out.filter((x) => String(x.level || '') === level);
  }
  if (search) {
    out = out.filter((x) => {
      const hay = `${x.title || ''} ${x.id || ''} ${x.topicId || ''} ${x.slug || ''}`
        .toLowerCase()
        .trim();
      return hay.includes(search);
    });
  }
  return out;
}

function renderMissingList(targetId, items, emptyText) {
  const list = $(targetId);
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="hintSmall">${emptyText}</div>`;
    return;
  }
  list.innerHTML = items.slice(0, 30).map((i) => {
    const title = esc(i.title || i.slug || i.id || '(bez tytulu)');
    const meta = esc(i.meta || '');
    return `
      <div class="missingItem">
        <div class="missingItemTitle">${title}</div>
        <div class="missingItemMeta">${meta}</div>
      </div>
    `;
  }).join('');
}

function renderMissing() {
  const priceItems = filterMissing(missingCache.price);
  const audioItems = filterMissing(missingCache.audio);
  const tagsItems = filterMissing(missingCache.tags);
  const transItems = filterMissing(missingCache.trans);

  if ($('missingPriceCount')) $('missingPriceCount').textContent = String(missingCache.price.length);
  if ($('missingAudioCount')) $('missingAudioCount').textContent = String(missingCache.audio.length);
  if ($('missingTagsCount')) $('missingTagsCount').textContent = String(missingCache.tags.length);
  if ($('missingTransCount')) $('missingTransCount').textContent = String(missingCache.trans.length);

  const missingPriceInfo = $('missingPriceInfo');
  const missingAudioInfo = $('missingAudioInfo');
  const missingTagsInfo = $('missingTagsInfo');
  const missingTransInfo = $('missingTransInfo');
  if (missingPriceInfo) missingPriceInfo.textContent = `Pokazano: ${priceItems.length}`;
  if (missingAudioInfo) missingAudioInfo.textContent = `Pokazano: ${audioItems.length}`;
  if (missingTagsInfo) missingTagsInfo.textContent = `Pokazano: ${tagsItems.length}`;
  if (missingTransInfo) missingTransInfo.textContent = `Pokazano: ${transItems.length}`;

  renderMissingList('missingPriceList', priceItems, 'Brak brakow.');
  renderMissingList('missingAudioList', audioItems, 'Brak brakow.');
  renderMissingList('missingTagsList', tagsItems, 'Brak brakow.');
  renderMissingList('missingTransList', transItems, 'Brak brakow.');
}

async function loadMissing() {
  const st = $('missingStatus');
  try {
    setStatus(st, 'Ladowanie...');
    missingCache = { price: [], audio: [], tags: [], trans: [] };

    const svcSnap = await getDocs(query(collection(db, 'services'), limit(500)));
    svcSnap.forEach((d) => {
      const data = d.data() || {};
      const cta = String(data.ctaType || '');
      const priceId = String(data.stripePriceId || '').trim();
      if (cta === 'stripe' && !priceId) {
        missingCache.price.push({
          id: d.id,
          title: data.title || data.name || data.sku || d.id,
          meta: `sku: ${data.sku || d.id}  -  kategoria: ${data.category || '-'}`,
          level: data.level || '',
        });
      }
    });

    const exSnap = await getDocs(query(collection(db, 'exercises'), limit(600)));
    exSnap.forEach((d) => {
      const ex = d.data() || {};
      const level = String(ex.level || '');
      const title = ex.prompt || ex.question || ex.title || d.id;
      const meta = `id: ${d.id}  -  poziom: ${level || '-'}  -  typ: ${ex.type || '-'}`;
      const tags = Array.isArray(ex.tags) ? ex.tags.filter(Boolean) : [];

      if (!tags.length) {
        missingCache.tags.push({
          id: d.id,
          title,
          meta,
          level,
          topicId: ex.topicId || '',
          slug: ex.topicSlug || '',
        });
      }

      if (needsAudio(ex.type) && !hasAudio(ex)) {
        missingCache.audio.push({
          id: d.id,
          title,
          meta,
          level,
          topicId: ex.topicId || '',
          slug: ex.topicSlug || '',
        });
      }

      if (needsTranslation(ex.type) && !hasTranslation(ex)) {
        missingCache.trans.push({
          id: d.id,
          title,
          meta,
          level,
          topicId: ex.topicId || '',
          slug: ex.topicSlug || '',
        });
      }
    });

    setStatus(st, 'Gotowe');
    renderMissing();
  } catch (e) {
    console.error('[missing]', e);
    setStatus(st, 'Blad', true);
  }
}

/* =========================
   ACTIVITY (DAU/WAU/MAU)
   ========================= */
let activityTopCache = [];

function renderActivityTop() {
  const list = $('activityTopList');
  if (!list) return;
  if (!activityTopCache.length) {
    list.innerHTML = '<div class="hintSmall">Brak danych.</div>';
    return;
  }
  list.innerHTML = activityTopCache
    .map((t) => {
      const title = esc(t.title || t.id || '(bez tytulu)');
      const level = esc(t.level || '-');
      const count = Number(t.count || 0);
      return `
        <div class="listItem">
          <div style="font-weight:900;">${title}</div>
          <div class="hintSmall">poziom: ${level}  -  aktywnosci: ${count}</div>
        </div>
      `;
    })
    .join('');
}

async function loadActivityStats() {
  const st = $('activityStatus');
  try {
    setStatus(st, 'Ladowanie...');
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let dau = 0;
    let wau = 0;
    let mau = 0;

    const userSnap = await getDocs(query(collection(db, 'users'), limit(500)));
    userSnap.forEach((d) => {
      const u = d.data() || {};
      const last =
        toDateMaybe(u.lastLoginAt) ||
        toDateMaybe(u.lastSeenAt) ||
        toDateMaybe(u.createdAt);
      if (!last) return;
      const diff = now - last.getTime();
      if (diff <= dayMs) dau += 1;
      if (diff <= 7 * dayMs) wau += 1;
      if (diff <= 30 * dayMs) mau += 1;
    });

    if ($('activityDAU')) $('activityDAU').textContent = String(dau);
    if ($('activityWAU')) $('activityWAU').textContent = String(wau);
    if ($('activityMAU')) $('activityMAU').textContent = String(mau);

    let durationSum = 0;
    let durationCount = 0;
    const metaSnap = await getDocs(query(collection(db, 'course_meta'), limit(400)));
    metaSnap.forEach((d) => {
      const m = d.data() || {};
      const dur = Number(m.durationMin || m.duration || 0);
      if (dur > 0) {
        durationSum += dur;
        durationCount += 1;
      }
    });
    const avgDur = durationCount ? Math.round(durationSum / durationCount) : null;
    if ($('activityAvgLesson'))
      $('activityAvgLesson').textContent = avgDur ? `${avgDur} min` : 'brak danych';

    const progSnap = await getDocs(
      query(collectionGroup(db, 'topics'), limit(600)),
    );
    const map = new Map();
    progSnap.forEach((d) => {
      const data = d.data() || {};
      const rawId = d.id || '';
      const meta = parseCourseMetaId(rawId);
      const key = data.topicId || data.topicSlug || meta.topicId || rawId;
      if (!key) return;
      const level = data.level || meta.level || '';
      const entry = map.get(key) || {
        id: key,
        count: 0,
        level,
        topicId: data.topicId || meta.topicId || key,
        slug: data.topicSlug || '',
      };
      entry.count += 1;
      map.set(key, entry);
    });

    await ensureCoursesIndex();
    activityTopCache = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => {
        const course =
          coursesIndex.get(t.topicId || '') ||
          coursesIndex.get(t.id || '') ||
          {};
        return {
          ...t,
          title: course.title || t.slug || t.id,
          level: t.level || course.level || '',
        };
      });

    renderActivityTop();
    setStatus(st, 'Gotowe');
  } catch (e) {
    console.error('[activity]', e);
    setStatus(st, 'Blad', true);
    if ($('activityTopList'))
      $('activityTopList').innerHTML =
        '<div class="hintSmall">Blad ladowania aktywnosci.</div>';
  }
}

/* =========================
   USERS (Uzytkownicy)
   ========================= */
let usersLast = null;
let usersCache = new Map();
let usersProgressCache = new Map();

function formatProgressSummary(s) {
  if (!s) return 'Postepy: -';
  const total = Number(s.topicsTotal || 0);
  const done = Number(s.topicsCompleted || 0);
  const practice = Number.isFinite(s.practiceAvg) ? `${s.practiceAvg}%` : '-';
  const test = Number.isFinite(s.testAvg) ? `${s.testAvg}%` : '-';
  return `Postepy: ${done}/${total} tematow, praktyka ${practice}, test ${test}`;
}

function summarizeProgressDocs(snap) {
  const docs = snap?.docs || [];
  const total = docs.length;
  let completed = 0;
  let practiceSum = 0;
  let practiceCount = 0;
  let testSum = 0;
  let testCount = 0;
  let lastTs = null;

  docs.forEach((d) => {
    const data = d.data() || {};
    if (data.completed === true) completed += 1;

    const practice = Number(data.practicePercent);
    if (!Number.isNaN(practice)) {
      practiceSum += practice;
      practiceCount += 1;
    }

    const testTotal = Number(data.testTotal || 0);
    const testScore = Number(data.testScore);
    if (testTotal > 0 && !Number.isNaN(testScore)) {
      testSum += testScore;
      testCount += 1;
    }

    const ts = data.lastActivityAt || data.updatedAt || data.completedAt || null;
    const dt = toDateMaybe(ts);
    if (dt && (!lastTs || dt.getTime() > lastTs.getTime())) lastTs = dt;
  });

  const practiceAvg = practiceCount ? Math.round(practiceSum / practiceCount) : null;
  const testAvg = testCount ? Math.round(testSum / testCount) : null;

  return {
    topicsTotal: total,
    topicsCompleted: completed,
    practiceAvg,
    testAvg,
    lastActivity: lastTs,
  };
}

async function loadProgressForUsers(uids) {
  const missing = (uids || []).filter((uid) => uid && !usersProgressCache.has(uid));
  if (!missing.length) return;

  await Promise.all(
    missing.map(async (uid) => {
      try {
        const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
        usersProgressCache.set(uid, summarizeProgressDocs(snap));
      } catch {
        usersProgressCache.set(uid, null);
      }
    }),
  );
}

function renderUserRow(uid, u) {
  const email = esc(u.email || u.emailLower || '(brak emaila)');
  const handleRaw = String(u.handle || '').trim();
  const handleLabel = handleRaw ? `@${handleRaw}` : '';
  const profileHref = buildProfileHref(handleRaw, uid);
  const role = esc(u.role || 'user');
  const plan = esc(u.plan || '');
  const until = isoDate(u.accessUntil);
  const blocked = u.blocked === true ? 'BLOK' : '';
  const access = hasAccess(u) ? 'TAK' : 'NIE';
  const progressSummary = formatProgressSummary(usersProgressCache.get(uid));

  const statusBadge = (() => {
    if (String(u.role || 'user') === 'admin')
      return `<span class="pill">ADMIN</span>`;
    if (u.blocked === true) return `<span class="pill">BLOCKED</span>`;
    if (hasAccess(u)) {
      const d = toDateMaybe(u.accessUntil);
      if (d && d.getTime() - Date.now() < 7 * 24 * 3600 * 1000)
        return `<span class="pill">EXPIRING</span>`;
      return `<span class="pill">ACTIVE</span>`;
    }
    return `<span class="pill">FREE</span>`;
  })();

  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${email} ${blocked}</div>
          ${handleLabel ? `<div class="hintSmall">${esc(handleLabel)}</div>` : ''}
          <div class="hintSmall">uid: ${esc(uid)}  -  role: ${role}  -  access: ${access}${plan ? '  -  plan: ' + plan : ''}${until ? '  -  until: ' + esc(until) : ''}</div>
          <div class="hintSmall">${esc(progressSummary)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${statusBadge}
          <a class="btn-white-outline" href="${profileHref}">Profil</a>
          <button class="btn-white-outline" type="button" data-user="open" data-uid="${esc(uid)}">Edytuj</button>
        </div>
      </div>
    </div>
  `;
}

function applyUserFilters(entries) {
  const searchTerm = String($('userSearch')?.value || '')
    .trim()
    .toLowerCase();
  const filter = String($('roleFilter')?.value || 'all');
  const planFilter = String($('planFilter')?.value || 'all');
  const sortKey = String($('userSort')?.value || 'createdAt_desc');

  const out = [];
  for (const [uid, u] of entries) {
    const role = String(u.role || 'user');

    if (filter === 'admins' && role !== 'admin') continue;
    if (filter === 'premium' && !hasAccess(u)) continue;
    if (filter === 'free' && hasAccess(u)) continue;
    if (filter === 'blocked' && u.blocked !== true) continue;

    if (planFilter !== 'all') {
      const planNorm = normalizePlanKey(u.plan || 'free');
      if (planFilter === 'vip') {
        if (!planNorm.startsWith('vip')) continue;
      } else if (planNorm !== planFilter) {
        continue;
      }
    }

    if (searchTerm) {
      const em = String(u.email || u.emailLower || '').toLowerCase();
      if (!em.includes(searchTerm) && !uid.includes(searchTerm)) continue;
    }

    out.push([uid, u]);
  }
  return sortUsers(out, sortKey);
}

function sortUsers(entries, sortKey) {
  const getEmail = (u) => String(u.email || u.emailLower || '').toLowerCase();
  const getPlan = (u) => normalizePlanKey(u.plan || 'free');
  const getCreated = (u) => toDateMaybe(u.createdAt)?.getTime() || 0;
  const getLastLogin =
    (u) =>
      toDateMaybe(u.lastLoginAt)?.getTime() ||
      toDateMaybe(u.lastSeenAt)?.getTime() ||
      0;
  const getAccessUntil = (u) => toDateMaybe(u.accessUntil)?.getTime() || 0;

  const [field, dirRaw] = String(sortKey || 'createdAt_desc').split('_');
  const dir = dirRaw === 'asc' ? 1 : -1;

  const sorted = entries.slice();
  sorted.sort((a, b) => {
    const ua = a[1];
    const ub = b[1];
    let va = 0;
    let vb = 0;
    if (field === 'email') {
      va = getEmail(ua);
      vb = getEmail(ub);
    } else if (field === 'lastLogin') {
      va = getLastLogin(ua);
      vb = getLastLogin(ub);
    } else if (field === 'accessUntil') {
      va = getAccessUntil(ua);
      vb = getAccessUntil(ub);
    } else if (field === 'plan') {
      va = getPlan(ua);
      vb = getPlan(ub);
    } else {
      va = getCreated(ua);
      vb = getCreated(ub);
    }

    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return sorted;
}

async function loadUsers(reset = false) {
  const list = $('usersList');
  const section = $('usersSection');
  if (!list) return;

  if (section) section.style.display = 'block';

  if (reset) {
    usersLast = null;
    usersCache = new Map();
    list.innerHTML = '';
  }

  list.innerHTML = list.innerHTML || '<div class="hintSmall">Ladowanie...</div>';

  try {
    const parts = [collection(db, 'users'), orderBy('__name__'), limit(50)];
    if (usersLast) parts.splice(2, 0, startAfter(usersLast));
    const q1 = query.apply(null, parts);

    const snap = await getDocs(q1);
    snap.forEach((d) => {
      usersLast = d;
      usersCache.set(d.id, d.data() || {});
    });

    const filtered = applyUserFilters(usersCache.entries());
    const rows = filtered.map(([uid, u]) => renderUserRow(uid, u));
    list.innerHTML = rows.length ? rows.join('') : '<div class="hintSmall"></div>';

    // Load progress summaries for visible users, then re-render once
    const visibleUids = filtered.map(([uid]) => uid);
    await loadProgressForUsers(visibleUids);
    const rowsAfter = filtered.map(([uid, u]) => renderUserRow(uid, u));
    list.innerHTML = rowsAfter.length ? rowsAfter.join('') : '<div class="hintSmall"></div>';
  } catch (e) {
    console.error('[users]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania userow.</div>';
  }
}

/* =========================
   POSTEPY (analiza)
   ========================= */
let progressUsers = [];
let progressEntries = [];
let progressCoursesCache = new Map();
let progressExerciseCache = new Map();
let currentProgressUid = '';

function safeKey(raw) {
  return String(raw || '').replace(/[^a-z0-9_-]/gi, '_');
}

function pickUserLabel(u) {
  const email = u?.email || u?.emailLower || '';
  return email ? `${email} (${u.uid || ''})` : u.uid || '(brak)';
}

function getProgressFilters() {
  return {
    sortKey: String($('progressSort')?.value || 'lastActivity_desc'),
    filter: String($('progressFilter')?.value || 'all'),
    search: String($('progressSearch')?.value || '').trim().toLowerCase(),
  };
}

async function loadProgressUsers() {
  const select = $('progressUserSelect');
  const section = $('progressSection');
  if (!select) return;

  select.innerHTML = '<option value="">Wybierz uzytkownika</option>';
  if (section) section.style.display = 'none';

  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(300)));
    progressUsers = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      progressUsers.push({ uid: d.id, ...data });
    });
    progressUsers.sort((a, b) => {
      const ea = String(a.emailLower || a.email || '').toLowerCase();
      const eb = String(b.emailLower || b.email || '').toLowerCase();
      return ea.localeCompare(eb);
    });
    for (const u of progressUsers) {
      const opt = document.createElement('option');
      opt.value = u.uid;
      opt.textContent = pickUserLabel(u);
      select.appendChild(opt);
    }
  } catch (e) {
    console.error('[progress users]', e);
  }
}

async function hydrateCourseTitles(entries) {
  const ids = new Set();
  entries.forEach((e) => {
    if (e.topicId) ids.add(String(e.topicId));
  });
  const missing = Array.from(ids).filter((id) => !progressCoursesCache.has(id));
  if (!missing.length) return;

  await Promise.all(
    missing.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'courses', id));
        if (snap.exists()) progressCoursesCache.set(id, snap.data() || {});
      } catch {}
    }),
  );
}

function getWrongResults(entry) {
  const results = entry?.testResults && typeof entry.testResults === 'object' ? entry.testResults : {};
  return Object.entries(results).filter(([, r]) => r && r.correct === false);
}

function normalizeAnswerValue(val) {
  if (val == null) return '-';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function normalizeOptionsValue(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n|;/)
      .map((x) => String(x || '').trim())
      .filter(Boolean);
  }
  return [];
}

function formatExerciseType(ex) {
  const raw = ex?.type || ex?.kind || ex?.exerciseType || '';
  return String(raw || '').trim();
}

function isHardTopic(entry) {
  const practice = Number(entry?.practicePercent || 0);
  const testTotal = Number(entry?.testTotal || 0);
  const testScore = Number(entry?.testScore || 0);
  if (practice > 0 && practice < 80) return true;
  if (testTotal > 0 && testScore < 80) return true;
  return false;
}

function sortProgress(entries, sortKey) {
  const list = entries.slice();
  const [field, dirRaw] = String(sortKey || 'lastActivity_desc').split('_');
  const dir = dirRaw === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    const ta = a;
    const tb = b;
    let va = 0;
    let vb = 0;
    if (field === 'practice') {
      va = Number(ta.practicePercent || 0);
      vb = Number(tb.practicePercent || 0);
    } else if (field === 'test') {
      va = Number(ta.testScore || 0);
      vb = Number(tb.testScore || 0);
    } else if (field === 'topic') {
      const ca = progressCoursesCache.get(ta.topicId || '') || {};
      const cb = progressCoursesCache.get(tb.topicId || '') || {};
      const taName = String(ca.title || ta.topicSlug || ta.topicId || ta.id || '').toLowerCase();
      const tbName = String(cb.title || tb.topicSlug || tb.topicId || tb.id || '').toLowerCase();
      va = taName;
      vb = tbName;
    } else {
      const da = toDateMaybe(ta.lastActivityAt || ta.updatedAt || ta.completedAt);
      const db = toDateMaybe(tb.lastActivityAt || tb.updatedAt || tb.completedAt);
      va = da ? da.getTime() : 0;
      vb = db ? db.getTime() : 0;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return list;
}

function renderProgressList() {
  const list = $('progressList');
  const section = $('progressSection');
  if (!list) return;

  const { sortKey, filter, search } = getProgressFilters();
  let entries = progressEntries.slice();

  if (filter === 'hard') {
    entries = entries.filter((e) => isHardTopic(e));
  } else if (filter === 'not_done') {
    entries = entries.filter((e) => e.completed !== true);
  }

  if (search) {
    entries = entries.filter((e) => {
      const course = progressCoursesCache.get(e.topicId || '') || {};
      const title = String(course.title || e.topicSlug || e.topicId || e.id || '').toLowerCase();
      return title.includes(search);
    });
  }

  entries = sortProgress(entries, sortKey);

  if (section) section.style.display = 'block';
  if (!entries.length) {
    list.innerHTML = '<div class="hintSmall">Brak danych.</div>';
    return;
  }

  list.innerHTML = entries
    .map((e) => {
      const course = progressCoursesCache.get(e.topicId || '') || {};
      const title = esc(course.title || e.topicSlug || e.topicId || e.id || '(bez tytulu)');
      const level = esc(String(e.level || course.level || '-'));
      const practice = Number(e.practicePercent || 0);
      const testTotal = Number(e.testTotal || 0);
      const testCorrect = Number(e.testCorrect || 0);
      const testAnswered = Number(e.testAnswered || 0);
      const testScore = testTotal ? Number(e.testScore || 0) : null;
      const completed = e.completed === true;
      const last = isoDate(e.lastActivityAt || e.updatedAt || e.completedAt);
      const wrong = getWrongResults(e);
      const key = safeKey(e.id);
      const hard = isHardTopic(e);
      const missing = testTotal > 0 ? Math.max(0, testTotal - testAnswered) : 0;
      const testLine =
        testTotal > 0
          ? `test: ${testCorrect}/${testTotal} (${testScore}%)${missing ? '  -  brak: ' + missing : ''}`
          : 'test: -';

      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${title}</div>
              <div class="hintSmall">
                level: ${level}  -  praktyka: ${practice}%  -  ${testLine}  -  ${completed ? 'UKONCZONE' : 'W TRAKCIE'}${last ? '  -  ostatnio: ' + esc(last) : ''}
              </div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              ${hard ? '<span class="pill pill-red">TRUDNE</span>' : ''}
              ${completed ? '<span class="pill pill-blue">DONE</span>' : '<span class="pill">IN PROGRESS</span>'}
              ${wrong.length ? `<span class="pill">BLEDY ${wrong.length}</span>` : ''}
              ${wrong.length ? `<button class="btn-white-outline" data-progress="toggle" data-key="${key}">Bledy</button>` : ''}
            </div>
          </div>
          <div class="hintSmall progressErrorsBox" id="progressErrors_${key}" style="display:none; margin-top:10px;"></div>
        </div>
      `;
    })
    .join('');
}

async function loadProgressForUser(uid) {
  const list = $('progressList');
  const section = $('progressSection');
  if (!uid || !list) return;

  currentProgressUid = uid;
  if (section) section.style.display = 'block';
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';

  try {
    const snap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    progressEntries = [];
    snap.forEach((d) => progressEntries.push({ id: d.id, ...(d.data() || {}) }));
    await hydrateCourseTitles(progressEntries);
    renderProgressList();
  } catch (e) {
    console.error('[progress list]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania postepow.</div>';
  }
}

async function loadExercisesForTopic(topicId) {
  const id = String(topicId || '').trim();
  if (!id) return new Map();
  if (progressExerciseCache.has(id)) return progressExerciseCache.get(id);

  const map = new Map();
  try {
    const snap = await getDocs(
      query(collection(db, 'exercises'), where('topicId', '==', id)),
    );
    snap.forEach((d) => map.set(d.id, d.data() || {}));
  } catch (e) {
    console.warn('[progress exercises]', e);
  }
  progressExerciseCache.set(id, map);
  return map;
}

async function toggleProgressErrors(key) {
  const box = document.getElementById(`progressErrors_${key}`);
  if (!box) return;

  if (box.style.display === 'block') {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  const entry = progressEntries.find((e) => safeKey(e.id) === key);
  if (!entry) return;

  const wrong = getWrongResults(entry);
  if (!wrong.length) {
    box.textContent = 'Brak bledow testu.';
    box.style.display = 'block';
    return;
  }

  const exMap = await loadExercisesForTopic(entry.topicId);
  const lines = wrong.map(([exId, r], idx) => {
    const ex = exMap.get(exId) || {};
    const prompt = esc(ex.prompt || '(brak tresci)');
    const correct = esc(normalizeAnswerValue(ex.answer));
    const userAns = esc(normalizeAnswerValue(r?.answer));
    const opts = normalizeOptionsValue(ex.options || ex.optionsText || '');
    const type = formatExerciseType(ex);

    const optionsHtml = opts.length
      ? `<div class="progressErrorOptions">Opcje: ${opts.map((o) => `<span>${esc(o)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="progressErrorItem">
        <div class="progressErrorHead">
          <span class="progressErrorIndex">#${idx + 1}</span>
          <span class="progressErrorId">${esc(exId)}</span>
          ${type ? `<span class="pill">Typ: ${esc(type)}</span>` : ''}
        </div>
        <div class="progressErrorPrompt">${prompt}</div>
        ${optionsHtml}
        <div class="progressErrorAnswers">
          <div><span class="progressErrorLabel">Uzytkownik:</span> <span class="progressErrorUser">${userAns}</span></div>
          <div><span class="progressErrorLabel">Poprawna:</span> <span class="progressErrorCorrect">${correct}</span></div>
        </div>
      </div>
    `;
  });
  box.innerHTML = lines.join('');
  box.style.display = 'block';
}

  /* =========================
     FISZKI (STATYSTYKI)
     ========================= */
  let flashcardsCache = [];

  function normalizeText(v) {
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function parseCardLine(raw) {
    let line = String(raw || '').trim();
    if (!line) return null;
    line = line.replace(/^\s*\d+\)\s*/, '').trim();

    let parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      parts = line.split(/->|=>|—|–|-/).map((p) => p.trim()).filter(Boolean);
    }
    if (parts.length < 2) return null;
    return { front: parts[0], back: parts[1] };
  }

  function isCardExercise(ex) {
    const t = normalizeText(ex?.type || '');
    return t.includes('tarjeta');
  }

  function countCards(ex) {
    const opts = Array.isArray(ex?.options) ? ex.options : [];
    let count = 0;
    opts.forEach((line) => {
      if (parseCardLine(line)) count += 1;
    });
    return count;
  }

  function renderFlashcardsStats() {
    const list = $('flashcardsList');
    const summary = $('flashcardsSummary');
    const level = String($('flashcardsLevel')?.value || 'all').toUpperCase();
    const search = normalizeText($('flashcardsSearch')?.value || '');

    if (!list) return;

    let rows = flashcardsCache.slice();
    if (level !== 'ALL') {
      rows = rows.filter((r) => String(r.level || '').toUpperCase() === level);
    }
    if (search) {
      rows = rows.filter((r) => {
        const hay = normalizeText(`${r.title || ''} ${r.topicId || ''}`);
        return hay.includes(search);
      });
    }

    const totalCards = rows.reduce((sum, r) => sum + (r.cards || 0), 0);
    const totalTopics = rows.length;
    const totalExercises = rows.reduce((sum, r) => sum + (r.exercises || 0), 0);

    if (summary) {
      summary.textContent = `Razem kart: ${totalCards} · Tematow: ${totalTopics} · Cwiczen: ${totalExercises}`;
    }

    if (!rows.length) {
      list.innerHTML = '<div class="hintSmall">Brak danych.</div>';
      return;
    }

    list.innerHTML = rows
      .map((r) => {
        const title = esc(r.title || r.topicId || '(bez tytulu)');
        const lvl = esc(String(r.level || '-'));
        return `<div style="margin-bottom:8px;">${lvl} · <b>${title}</b> — karty: ${r.cards} (cwiczenia: ${r.exercises})</div>`;
      })
      .join('');
  }

  async function loadFlashcardsStats() {
    const list = $('flashcardsList');
    if (list) list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
    const summary = $('flashcardsSummary');
    if (summary) summary.textContent = '';

    try {
      const coursesSnap = await getDocs(collection(db, 'courses'));
      const courses = new Map();
      coursesSnap.forEach((d) => courses.set(d.id, d.data() || {}));

      const exSnap = await getDocs(collection(db, 'exercises'));
      const map = new Map();

      exSnap.forEach((d) => {
        const ex = d.data() || {};
        if (!isCardExercise(ex)) return;
        const cards = countCards(ex);
        if (!cards) return;

        const topicId = String(ex.topicId || ex.topicSlug || '').trim();
        const course = topicId ? courses.get(topicId) || {} : {};
        const level = String(ex.level || course.level || '').toUpperCase();
        if (!topicId || !level) return;

        const key = `${level}__${topicId}`;
        const prev = map.get(key) || {
          level,
          topicId,
          title: course.title || ex.topicTitle || topicId,
          cards: 0,
          exercises: 0,
        };
        prev.cards += cards;
        prev.exercises += 1;
        map.set(key, prev);
      });

      const order = { A1: 1, A2: 2, B1: 3, B2: 4 };
      flashcardsCache = Array.from(map.values()).sort((a, b) => {
        const oa = order[String(a.level || '').toUpperCase()] || 9;
        const ob = order[String(b.level || '').toUpperCase()] || 9;
        if (oa !== ob) return oa - ob;
        if (b.cards !== a.cards) return b.cards - a.cards;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });

      renderFlashcardsStats();
    } catch (e) {
      console.error('[flashcards stats]', e);
      if (list) list.innerHTML = '<div class="hintSmall">Blad ladowania fiszek.</div>';
    }
  }

  /* =========================
     OPINIE I OCENY
     ========================= */
let reviewsCache = [];

function getReviewFilters() {
  return {
    type: String($('reviewType')?.value || 'all'),
    rating: String($('reviewRating')?.value || 'all'),
    level: String($('reviewLevel')?.value || 'all'),
    search: String($('reviewSearch')?.value || '').trim().toLowerCase(),
  };
}

function formatReviewDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  return isoDate(d);
}

/* =========================
   PLATNOSCI
   ========================= */
let paymentsCache = [];
let attemptsCache = [];

function formatPaymentDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatMoney(amount, currency) {
  const val = Number(amount);
  if (!Number.isFinite(val)) return '-';
  const curr = String(currency || '').toUpperCase();
  const num = val / 100;
  return `${num.toFixed(2)} ${curr || ''}`.trim();
}

function getPaymentsFilters() {
  return {
    status: String($('paymentsStatus')?.value || 'all').toLowerCase(),
    search: String($('paymentsSearch')?.value || '').trim().toLowerCase(),
  };
}

function paymentStatusOf(p) {
  return String(p.status || p.paymentStatus || p.payment_status || '')
    .trim()
    .toLowerCase();
}

function statusLabel(status) {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return 'SUKCES';
    case 'failed':
      return 'NIEUDANE';
    case 'pending':
      return 'W TOKU';
    case 'expired':
      return 'WYGASLE';
    default:
      return status ? status.toUpperCase() : 'NIEZNANY';
  }
}

function statusClass(status) {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return 'status-pill--success';
    case 'failed':
      return 'status-pill--failed';
    case 'pending':
      return 'status-pill--pending';
    case 'expired':
      return 'status-pill--expired';
    default:
      return '';
  }
}

function renderStatusPill(statusRaw) {
  const status = String(statusRaw || '').toLowerCase();
  return `<span class="status-pill ${statusClass(status)}">${esc(
    statusLabel(status),
  )}</span>`;
}

function summarizePayments() {
  const el = $('paymentsSummary');
  if (!el) return;
  if (!paymentsCache.length) {
    el.textContent = '';
    return;
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 6);

  const agg = {
    today: { count: 0, totals: {} },
    week: { count: 0, totals: {} },
  };

  for (const p of paymentsCache) {
    const status = paymentStatusOf(p);
    if (status !== 'succeeded' && status !== 'paid') continue;
    const d = toDateMaybe(p.createdAt || p.updatedAt || p.stripeCreatedAt);
    if (!d) continue;
    const amount = Number(p.amountTotal ?? p.amount_total);
    const currency = String(p.currency || '').toUpperCase();
    if (d >= startToday) {
      agg.today.count += 1;
      if (!Number.isNaN(amount)) {
        agg.today.totals[currency] = (agg.today.totals[currency] || 0) + amount;
      }
    }
    if (d >= startWeek) {
      agg.week.count += 1;
      if (!Number.isNaN(amount)) {
        agg.week.totals[currency] = (agg.week.totals[currency] || 0) + amount;
      }
    }
  }

  const fmtTotals = (totals) => {
    const parts = Object.entries(totals).map(([cur, amt]) =>
      formatMoney(amt, cur),
    );
    return parts.length ? parts.join(' / ') : '-';
  };

  el.textContent = `Dzis: ${agg.today.count} ( ${fmtTotals(agg.today.totals)} )  ·  7 dni: ${agg.week.count} ( ${fmtTotals(agg.week.totals)} )`;
}

function summarizeAttempts() {
  const el = $('attemptsSummary');
  if (!el) return;
  if (!attemptsCache.length) {
    el.textContent = '';
    return;
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 6);

  let today = 0;
  let week = 0;
  let todayFailed = 0;
  let weekFailed = 0;

  for (const p of attemptsCache) {
    const d = toDateMaybe(p.createdAt || p.updatedAt);
    if (!d) continue;
    const status = String(p.status || '').toLowerCase();
    if (d >= startToday) {
      today += 1;
      if (status === 'failed' || status === 'expired') todayFailed += 1;
    }
    if (d >= startWeek) {
      week += 1;
      if (status === 'failed' || status === 'expired') weekFailed += 1;
    }
  }

  el.textContent = `Dzis: ${today} (blad/wygasle: ${todayFailed})  ·  7 dni: ${week} (blad/wygasle: ${weekFailed})`;
}

function renderPayments() {
  const list = $('paymentsList');
  if (!list) return;
  const { status, search } = getPaymentsFilters();
  let items = paymentsCache.slice();

  if (status !== 'all') {
    items = items.filter((p) => paymentStatusOf(p) === status);
  }
  if (search) {
    items = items.filter((p) => {
      const hay = [
        p.email,
        p.uid,
        p.planSku,
        p.planId,
        p.serviceId,
        p.stripeSessionId,
        p.sessionId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  }

  if (!items.length) {
    list.innerHTML = '<div class="hintSmall">Brak platnosci.</div>';
    return;
  }

  list.innerHTML = items
    .map((p) => {
      const email = esc(p.email || '(brak emaila)');
      const statusTxt = paymentStatusOf(p) || 'unknown';
      const amount = formatMoney(p.amountTotal || p.amount_total, p.currency);
      const date = formatPaymentDate(p.createdAt || p.updatedAt || p.stripeCreatedAt);
      const plan = esc(p.planSku || p.planId || '-');
      const sessionId = esc(p.stripeSessionId || p.sessionId || '-');
      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${plan}</div>
              <div class="hintSmall" style="margin-top:6px;">${renderStatusPill(statusTxt)}  <span style="margin-left:8px;">kwota: ${esc(amount)}  -  ${esc(date)}</span></div>
              <div class="hintSmall">user: ${email}</div>
              <div class="hintSmall">session: ${sessionId}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
  summarizePayments();
}

async function loadPayments() {
  const list = $('paymentsList');
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
  setStatus($('paymentsStatusText'), 'Ladowanie...');

  try {
    const lim = Number($('paymentsLimit')?.value || 100);
    const snap = await getDocs(
      query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(lim)),
    );
    paymentsCache = [];
    snap.forEach((d) => paymentsCache.push({ id: d.id, ...(d.data() || {}) }));
    renderPayments();
    summarizePayments();
    setStatus($('paymentsStatusText'), `Gotowe (${paymentsCache.length})`);
  } catch (e) {
    console.error('[payments]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania platnosci.</div>';
    setStatus($('paymentsStatusText'), 'Blad', true);
  }
}

function getAttemptsFilters() {
  return {
    status: String($('attemptsStatus')?.value || 'all').toLowerCase(),
    search: String($('attemptsSearch')?.value || '').trim().toLowerCase(),
  };
}

function renderAttempts() {
  const list = $('attemptsList');
  if (!list) return;
  const { status, search } = getAttemptsFilters();
  let items = attemptsCache.slice();

  if (status !== 'all') {
    items = items.filter(
      (p) => String(p.status || '').toLowerCase() === status,
    );
  }
  if (search) {
    items = items.filter((p) => {
      const hay = [
        p.email,
        p.uid,
        p.planSku,
        p.planId,
        p.serviceId,
        p.stripeSessionId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  }

  if (!items.length) {
    list.innerHTML = '<div class="hintSmall">Brak prob checkoutu.</div>';
    return;
  }

  list.innerHTML = items
    .map((p) => {
      const email = esc(p.email || '(brak emaila)');
      const statusTxt = String(p.status || 'unknown');
      const date = formatPaymentDate(p.createdAt || p.updatedAt);
      const plan = esc(p.planSku || p.planId || '-');
      const sessionId = esc(p.stripeSessionId || '-');
      const err = esc(p.error || '');
      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${plan}</div>
              <div class="hintSmall" style="margin-top:6px;">${renderStatusPill(statusTxt)}  <span style="margin-left:8px;">${esc(date)}</span></div>
              <div class="hintSmall">user: ${email}</div>
              <div class="hintSmall">session: ${sessionId}</div>
              ${err ? `<div class="hintSmall">blad: ${err}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
  summarizeAttempts();
}

async function loadAttempts() {
  const list = $('attemptsList');
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
  setStatus($('attemptsStatusText'), 'Ladowanie...');

  try {
    const lim = Number($('attemptsLimit')?.value || 100);
    const snap = await getDocs(
      query(
        collection(db, 'payment_attempts'),
        orderBy('createdAt', 'desc'),
        limit(lim),
      ),
    );
    attemptsCache = [];
    snap.forEach((d) => attemptsCache.push({ id: d.id, ...(d.data() || {}) }));
    renderAttempts();
    summarizeAttempts();
    setStatus($('attemptsStatusText'), `Gotowe (${attemptsCache.length})`);
  } catch (e) {
    console.error('[attempts]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania prob.</div>';
    setStatus($('attemptsStatusText'), 'Blad', true);
  }
}

/* =========================
   APP LOGS
   ========================= */
let appLogsCache = [];

function formatLogDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function getLogFilters() {
  return {
    type: String($('logType')?.value || 'all'),
    page: String($('logPage')?.value || '').trim().toLowerCase(),
    search: String($('logSearch')?.value || '').trim().toLowerCase(),
    limit: Number($('logLimit')?.value || 100),
  };
}

function renderAppLogs() {
  const list = $('appLogsList');
  const section = $('appLogsSection');
  if (!list) return;

  const { type, page, search } = getLogFilters();
  let entries = appLogsCache.slice();

  if (type !== 'all') {
    entries = entries.filter((e) => String(e.type || '') === type);
  }
  if (page) {
    entries = entries.filter((e) => String(e.page || '').toLowerCase().includes(page));
  }
  if (search) {
    entries = entries.filter((e) => {
      const hay = `${e.message || ''} ${e.email || ''} ${e.uid || ''}`.toLowerCase();
      return hay.includes(search);
    });
  }

  if (section) section.style.display = 'block';
  if (!entries.length) {
    list.innerHTML = '<div class="hintSmall">Brak logow.</div>';
    return;
  }

  list.innerHTML = entries
    .map((e) => {
      const id = safeKey(e.id);
      const when = formatLogDate(e.createdAt);
      const who = esc(e.email || e.uid || 'anon');
      const pageTxt = esc(e.page || '-');
      const typeTxt = esc(e.type || 'error');
      const msg = esc(e.message || '(brak komunikatu)');
      const stack = esc(e.stack || '');
      const extra = e.extra ? esc(JSON.stringify(e.extra)) : '';

      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${typeTxt.toUpperCase()} ${when ? '· ' + when : ''}</div>
              <div class="hintSmall">strona: ${pageTxt}  -  user: ${who}</div>
              <div class="hintSmall logMessage">${msg}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="btn-white-outline" data-log="toggle" data-id="${id}">Szczegoly</button>
            </div>
          </div>
          <div class="hintSmall logDetails" id="logDetails_${id}" style="display:none; margin-top:10px;">
            ${stack ? `<div><b>Stack:</b><br/>${stack}</div>` : ''}
            ${extra ? `<div style="margin-top:6px;"><b>Extra:</b> ${extra}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadAppLogs() {
  const list = $('appLogsList');
  const section = $('appLogsSection');
  const st = $('logStatus');
  if (!list) return;

  const { limit } = getLogFilters();
  if (section) section.style.display = 'block';
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
  setStatus(st, 'Ladowanie...');

  try {
    const snap = await getDocs(
      query(collection(db, 'app_logs'), orderBy('createdAt', 'desc'), limit(limit || 100)),
    );
    appLogsCache = [];
    snap.forEach((d) => {
      appLogsCache.push({ id: d.id, ...(d.data() || {}) });
    });
    renderAppLogs();
    setStatus(st, `Wczytano: ${appLogsCache.length}`);
  } catch (e) {
    console.error('[app logs]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania logow.</div>';
    setStatus(st, 'Blad', true);
  }
}

function toggleAppLogDetails(id) {
  const box = document.getElementById(`logDetails_${id}`);
  if (!box) return;
  if (box.style.display === 'block') {
    box.style.display = 'none';
  } else {
    box.style.display = 'block';
  }
}

/* =========================
   BIBLIOTEKA AUDIO
   ========================= */
let audioLibCache = [];

function formatAudioDate(ts) {
  const d = toDateMaybe(ts);
  if (!d) return '';
  return isoDate(d);
}

function renderAudioLibrary() {
  const list = $('audioLibList');
  if (!list) return;

  if (!audioLibCache.length) {
    list.innerHTML = '<div class="hintSmall">Brak plikow audio.</div>';
    return;
  }

  list.innerHTML = audioLibCache
    .map((a) => {
      const id = esc(a.id || '');
      const label = esc(a.label || a.name || a.fileName || a.id || 'audio');
      const url = esc(a.url || '');
      const level = a.level ? `poziom: ${esc(a.level)}` : '';
      const topic = a.topicId ? `temat: ${esc(a.topicId)}` : '';
      const when = formatAudioDate(a.createdAt || a.updatedAt);
      const meta = [level, topic, when ? `data: ${esc(when)}` : '']
        .filter(Boolean)
        .join('  -  ');

      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${label}</div>
              <div class="hintSmall">${meta || ''}</div>
              ${url ? `<div class="hintSmall">${url}</div>` : ''}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${url ? `<button class="btn-white-outline" data-audio="copy" data-url="${url}">Kopiuj URL</button>` : ''}
              ${url ? `<a class="btn-white-outline" href="${url}" target="_blank" rel="noopener">Otworz</a>` : ''}
              <button class="btn-red" data-audio="del" data-id="${id}">Usun</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadAudioLibrary() {
  const list = $('audioLibList');
  const st = $('audioLibStatus');
  if (!list) return;

  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
  setStatus(st, 'Ladowanie...');

  try {
    const snap = await getDocs(
      query(collection(db, 'audio_library'), orderBy('createdAt', 'desc'), limit(200)),
    );
    audioLibCache = [];
    snap.forEach((d) => audioLibCache.push({ id: d.id, ...(d.data() || {}) }));
    renderAudioLibrary();
    setStatus(st, `Wczytano: ${audioLibCache.length}`);
  } catch (e) {
    console.error('[audio library]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania audio.</div>';
    setStatus(st, 'Blad', true);
  }
}

async function uploadAudioLibrary() {
  const fileInput = $('audioLibFile');
  const labelInput = $('audioLibLabel');
  const levelInput = $('audioLibLevel');
  const topicInput = $('audioLibTopic');
  const st = $('audioLibStatus');

  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus(st, 'Wybierz plik audio.', true);
    return;
  }
  if (!String(file.type || '').startsWith('audio/')) {
    setStatus(st, 'To nie jest plik audio.', true);
    return;
  }

  const label = String(labelInput?.value || '').trim() || file.name;
  const level = String(levelInput?.value || '').trim().toUpperCase() || null;
  const topicId = String(topicInput?.value || '').trim() || null;

  const safeName = String(file.name || 'audio')
    .replace(/[^a-z0-9._-]/gi, '_')
    .toLowerCase();
  const path = `audio/library/${Date.now()}_${safeName}`;

  setStatus(st, 'Wgrywanie...');
  try {
    const refObj = storageRef(storage, path);
    await uploadBytes(refObj, file, { contentType: file.type });
    const url = await getDownloadURL(refObj);

    await addDoc(collection(db, 'audio_library'), {
      label,
      url,
      level,
      topicId,
      path,
      size: file.size || 0,
      contentType: file.type || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setStatus(st, 'Wgrano ?');
    if (labelInput) labelInput.value = '';
    if (fileInput) fileInput.value = '';
    await loadAudioLibrary();
  } catch (e) {
    console.error('[audio upload]', e);
    setStatus(st, 'Blad wgrywania.', true);
  }
}

async function deleteAudioLibrary(id) {
  if (!id) return;
  if (!confirm('Usunac plik z biblioteki? (nie usuwa ze storage)')) return;
  try {
    await deleteDoc(doc(db, 'audio_library', id));
    await loadAudioLibrary();
  } catch (e) {
    console.error('[audio delete]', e);
    setStatus($('audioLibStatus'), 'Blad usuwania.', true);
  }
}

async function copyAudioUrl(url) {
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setStatus($('audioLibStatus'), 'Skopiowano ?');
  } catch (e) {
    console.warn('[audio copy]', e);
    setStatus($('audioLibStatus'), 'Nie udalo sie skopiowac.', true);
  }
}

function renderReviews() {
  const list = $('reviewsList');
  const section = $('reviewsSection');
  if (!list) return;

  const { type, rating, level, search } = getReviewFilters();
  let items = reviewsCache.slice();

  if (type !== 'all') items = items.filter((r) => String(r.targetType || '') === type);
  if (rating !== 'all')
    items = items.filter((r) => String(r.rating || '') === rating);
  if (level !== 'all')
    items = items.filter((r) => String(r.level || '').toUpperCase() === level);
  if (search) {
    items = items.filter((r) => {
      const email = String(r.userEmail || '').toLowerCase();
      const title = String(r.topicTitle || r.topicSlug || r.topicId || '').toLowerCase();
      return email.includes(search) || title.includes(search);
    });
  }

  if (section) section.style.display = 'block';
  if (!items.length) {
    list.innerHTML = '<div class="hintSmall">Brak opinii.</div>';
    return;
  }

  list.innerHTML = items
    .map((r) => {
      const email = esc(r.userEmail || '(brak emaila)');
      const ratingVal = Number(r.rating || 0);
      const ratingTxt = ratingVal ? `${ratingVal}/5` : '-';
      const target = esc(r.targetType || '-');
      const title = esc(r.topicTitle || r.topicSlug || r.topicId || r.courseLabel || '-');
      const lvl = esc(String(r.level || '-'));
      const date = esc(formatReviewDate(r.createdAt || r.updatedAt));
      const text = esc(r.text || r.comment || '');
      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${title}</div>
              <div class="hintSmall">typ: ${target}  -  poziom: ${lvl}  -  ocena: ${ratingTxt}  -  ${date}</div>
              ${text ? `<div class="hintSmall" style="margin-top:6px;">${text}</div>` : ''}
              <div class="hintSmall" style="margin-top:6px;">user: ${email}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadReviews() {
  const list = $('reviewsList');
  const section = $('reviewsSection');
  if (!list) return;

  if (section) section.style.display = 'block';
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';

  try {
    const snap = await getDocs(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(200)),
    );
    reviewsCache = [];
    snap.forEach((d) => reviewsCache.push({ id: d.id, ...(d.data() || {}) }));
    renderReviews();
  } catch (e) {
    console.error('[reviews]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania opinii.</div>';
  }
}

/* =========================
   ZGLOSZENIA (user reports)
   ========================= */
let reportsCache = [];

function getReportFilters() {
  return {
    status: String($('reportStatusFilter')?.value || 'all').toLowerCase(),
    search: String($('reportSearch')?.value || '').trim().toLowerCase(),
  };
}

function reportStatusLabel(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'done') return 'ZAMKNIETE';
  if (st === 'open') return 'W TOKU';
  return 'NOWE';
}

function reportStatusClass(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'done') return 'reportStatus--done';
  if (st === 'open') return 'reportStatus--open';
  return 'reportStatus--new';
}

function renderReports() {
  const list = $('reportsList');
  if (!list) return;

  const { status, search } = getReportFilters();
  let items = reportsCache.slice();

  if (status !== 'all') {
    items = items.filter((r) => String(r.status || 'new').toLowerCase() === status);
  }
  if (search) {
    items = items.filter((r) => {
      const hay = `${r.email || ''} ${r.topicId || ''} ${r.message || r.text || ''}`
        .toLowerCase()
        .trim();
      return hay.includes(search);
    });
  }

  if (!items.length) {
    list.innerHTML = '<div class="hintSmall">Brak zgloszen.</div>';
    return;
  }

  list.innerHTML = items
    .map((r) => {
      const statusVal = String(r.status || 'new').toLowerCase();
      const statusTxt = reportStatusLabel(statusVal);
      const email = esc(r.email || r.userEmail || '(brak emaila)');
      const type = esc(r.type || 'inne');
      const level = esc(r.level || '-');
      const topic = esc(r.topicId || r.topicSlug || '-');
      const msg = esc(r.message || r.text || '');
      const date = esc(isoDate(r.createdAt || r.updatedAt));
      const origin = esc(r.origin || 'user');

      return `
        <div class="listItem">
          <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:900;">${type}</div>
              <div class="hintSmall">
                ${date ? date + '  -  ' : ''}poziom: ${level}  -  temat: ${topic}  -  origin: ${origin}
              </div>
              ${msg ? `<div class="hintSmall" style="margin-top:6px;">${msg}</div>` : ''}
              <div class="hintSmall" style="margin-top:6px;">user: ${email}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="reportStatus ${reportStatusClass(statusVal)}">${statusTxt}</span>
              <button class="btn-white-outline" data-report="toggle" data-id="${esc(r.id)}">Zamknij/Otworz</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadReports() {
  const list = $('reportsList');
  if (!list) return;
  list.innerHTML = '<div class="hintSmall">Ladowanie...</div>';
  setStatus($('reportStatusText'), 'Ladowanie...');

  try {
    const snap = await getDocs(
      query(collection(db, 'user_reports'), orderBy('createdAt', 'desc'), limit(200)),
    );
    reportsCache = [];
    snap.forEach((d) => reportsCache.push({ id: d.id, ...(d.data() || {}) }));
    renderReports();
    setStatus($('reportStatusText'), `Gotowe (${reportsCache.length})`);
  } catch (e) {
    console.error('[reports]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania zgloszen.</div>';
    setStatus($('reportStatusText'), 'Blad', true);
  }
}

async function createReportFromAdmin() {
  const msg = String($('reportMessage')?.value || '').trim();
  if (!msg) {
    setStatus($('reportCreateStatus'), 'Wpisz opis.', true);
    return;
  }
  const type = String($('reportType')?.value || 'other');
  const level = String($('reportLevel')?.value || '').trim();
  const topicId = String($('reportTopic')?.value || '').trim();
  const email = String($('reportEmail')?.value || '').trim();
  const user = auth.currentUser;

  try {
    setStatus($('reportCreateStatus'), 'Zapisywanie...');
    await addDoc(collection(db, 'user_reports'), {
      type,
      level: level || null,
      topicId: topicId || null,
      email: email || user?.email || null,
      userId: user?.uid || null,
      message: msg,
      status: 'new',
      origin: 'admin',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    $('reportMessage').value = '';
    $('reportTopic').value = '';
    setStatus($('reportCreateStatus'), 'Dodano');
    await loadReports();
  } catch (e) {
    console.error('[report create]', e);
    setStatus($('reportCreateStatus'), 'Blad', true);
  }
}

async function toggleReportStatus(id) {
  if (!id) return;
  const current = reportsCache.find((r) => r.id === id);
  const status = String(current?.status || 'new').toLowerCase();
  const next = status === 'done' ? 'open' : 'done';
  try {
    await setDoc(
      doc(db, 'user_reports', id),
      { status: next, updatedAt: serverTimestamp() },
      { merge: true },
    );
    if (current) current.status = next;
    renderReports();
  } catch (e) {
    console.error('[report toggle]', e);
  }
}

/* ===== BROADCASTS ===== */
let broadcastsCache = [];

function renderBroadcasts() {
  const list = $('broadcastList');
  if (!list) return;
  if (!broadcastsCache.length) {
    list.innerHTML = '<div class="muted">Brak wiadomosci.</div>';
    return;
  }
  list.innerHTML = broadcastsCache
    .map((b) => {
      const title = esc(b.title || 'Wiadomosc');
      const body = esc(b.body || b.message || '');
      const date = isoDateTimeLocal(b.createdAt) || '';
      return `
        <div class="listItem">
          <div style="font-weight:900">${title}</div>
          <div class="muted" style="margin-top:6px">${body}</div>
          <div class="hintSmall" style="margin-top:6px">${date}</div>
        </div>
      `;
    })
    .join('');
}

async function loadBroadcasts() {
  const status = $('broadcastStatus');
  try {
    setStatus(status, 'Ladowanie...');
    const snap = await getDocs(
      query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(50)),
    );
    broadcastsCache = [];
    snap.forEach((d) => broadcastsCache.push({ id: d.id, ...(d.data() || {}) }));
    renderBroadcasts();
    setStatus(status, `Gotowe (${broadcastsCache.length})`);
  } catch (e) {
    console.error('[broadcasts]', e);
    setStatus(status, 'Blad', true);
  }
}

async function sendBroadcast() {
  const titleEl = $('broadcastTitle');
  const bodyEl = $('broadcastBody');
  const status = $('broadcastStatus');
  const body = String(bodyEl?.value || '').trim();
  const title = String(titleEl?.value || '').trim();
  const createdByUid = String(auth.currentUser?.uid || '').trim();
  const createdByEmail = String(auth.currentUser?.email || '').trim().toLowerCase();
  if (!body) {
    setStatus(status, 'Wpisz wiadomosc.', true);
    return;
  }
  try {
    const fanoutNotifications = async ({ broadcastId, title, body, link, createdByUid }) => {
      if (!broadcastId) return 0;
      const usersSnap = await getDocs(collection(db, 'users'));
      const notifId = `broadcast_${broadcastId}`;
      let batch = writeBatch(db);
      let ops = 0;
      let sent = 0;

      const commit = async () => {
        if (!ops) return;
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      for (const uDoc of usersSnap.docs) {
        const uid = String(uDoc.id || '').trim();
        if (!uid) continue;
        if (createdByUid && uid === createdByUid) continue;
        const userData = uDoc.data() || {};
        if (userData.blocked === true) continue;

        const ref = doc(db, 'user_notifications', uid, 'items', notifId);
        batch.set(
          ref,
          {
            title: String(title || 'Wiadomosc').trim() || 'Wiadomosc',
            body: String(body || '').trim(),
            type: 'broadcast',
            link: String(link || 'mensajes.html').trim(),
            data: { broadcastId },
            read: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        ops += 1;
        sent += 1;

        if (ops >= 400) await commit();
      }

      await commit();
      return sent;
    };

    setStatus(status, 'Wysylanie...');
    const ref = await addDoc(collection(db, 'broadcasts'), {
      title: title || 'Wiadomosc',
      body,
      link: 'mensajes.html',
      createdByUid: createdByUid || null,
      createdByEmail: createdByEmail || null,
      createdAt: serverTimestamp(),
    });
    let pushed = 0;
    try {
      pushed = await fanoutNotifications({
        broadcastId: ref.id,
        title: title || 'Wiadomosc',
        body,
        link: 'mensajes.html',
        createdByUid,
      });
    } catch (fanoutErr) {
      console.warn('[broadcast fanout]', fanoutErr);
    }
    if (bodyEl) bodyEl.value = '';
    if (titleEl) titleEl.value = '';
    setStatus(
      status,
      pushed > 0 ? `Wyslano (${pushed} powiadomien)` : 'Wyslano',
    );
    await loadBroadcasts();
  } catch (e) {
    console.error('[broadcast send]', e);
    setStatus(status, 'Blad', true);
  }
}

function ensureUserQuickButtons() {
  // Add missing quick buttons into the modal actions row (without editing HTML file).
  const statusEl = $('um_status');
  const row = statusEl?.parentElement; // metaRow where buttons live
  if (!row) return;

  const mkBtn = (id, cls, text) => {
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    return b;
  };

  if (!$('um_extend7'))
    row.insertBefore(
      mkBtn('um_extend7', 'btn-white-outline', ' Przedluz +7 dni'),
      statusEl,
    );
  if (!$('um_extend30'))
    row.insertBefore(
      mkBtn('um_extend30', 'btn-white-outline', ' Przedluz +30 dni'),
      statusEl,
    );
  if (!$('um_extend90'))
    row.insertBefore(
      mkBtn('um_extend90', 'btn-white-outline', ' Przedluz +90 dni'),
      statusEl,
    );
  if (!$('um_forever'))
    row.insertBefore(
      mkBtn('um_forever', 'btn-white-outline', ' Na stale (do 2099)'),
      statusEl,
    );

  if (!$('um_resetTrial'))
    row.insertBefore(
      mkBtn('um_resetTrial', 'btn-yellow', ' Pozwol na nowy trial'),
      statusEl,
    );
  if (!$('um_revoke'))
    row.insertBefore(
      mkBtn('um_revoke', 'btn-red', 'Usun dostep'),
      statusEl,
    );
}

function addDaysToUntil(existing, days) {
  const base = existing && existing instanceof Date ? existing : null;
  const now = new Date();
  const start = base && base.getTime() > now.getTime() ? base : now;
  const d = new Date(start.getTime());
  d.setDate(d.getDate() + Number(days));
  return d;
}

function setUntilInputFromDate(dt) {
  const inp = $('um_until');
  if (!inp) return;
  // to local datetime-local value: YYYY-MM-DDTHH:MM
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const mm = pad(dt.getMonth() + 1);
  const dd = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mi = pad(dt.getMinutes());
  inp.value = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

async function quickExtend(days) {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  // Keep current plan selection, just extend the date and enable access.
  const manual = parseDateTimeLocal($('um_until')?.value || '');
  const cached = usersCache.get(uid) || {};
  const current = manual || toDateMaybe(cached.accessUntil);
  const next = addDaysToUntil(current, days);

  if ($('um_access')) $('um_access').checked = true;
  if ($('um_blocked')) $('um_blocked').checked = false;

  setUntilInputFromDate(next);
  await saveUserModal();
}

async function quickResetTrial() {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        trialEligibleAfter: Timestamp.fromDate(new Date()),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    const old = usersCache.get(uid) || {};
    usersCache.set(uid, {
      ...old,
      trialEligibleAfter: new Date(),
    });
    setStatus($('um_status'), 'Trial ponownie aktywny ');
  } catch (e) {
    console.error('[trial allow]', e);
    setStatus($('um_status'), 'Blad aktywacji triala.', true);
  }
}

function renderTrialInfo(u) {
  const info = $('um_trial_info');
  if (!info) return;
  const usedAt = toDateMaybe(u?.trialUsedAt);
  const eligibleAt = toDateMaybe(u?.trialEligibleAfter);
  const lvl = String(u?.trialLevel || '').toUpperCase();
  const days = Number(u?.trialDays || 0);
  const parts = [];
  if (usedAt) parts.push(`uzyto: ${isoDate(usedAt)}`);
  if (lvl) parts.push(`poziom: ${lvl}`);
  if (days) parts.push(`dni: ${days}`);
  if (eligibleAt) parts.push(`ponownie: ${isoDate(eligibleAt)}`);
  info.textContent = parts.length ? parts.join('  -  ') : 'Brak uzytego triala.';
}

async function grantTrialNow() {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  const level = String($('um_trial_level')?.value || 'A1').toUpperCase();
  const days = Math.max(1, Number($('um_trial_days')?.value || 7));
  const until = addDaysToUntil(new Date(), days);

  const payload = {
    plan: `trial_${level.toLowerCase()}`,
    levels: [level],
    access: false,
    blocked: false,
    accessUntil: Timestamp.fromDate(until),
    trialUsedAt: serverTimestamp(),
    trialLevel: level,
    trialDays: days,
    trialSource: 'admin',
    trialEligibleAfter: null,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    const old = usersCache.get(uid) || {};
    usersCache.set(uid, { ...old, ...payload });
    setStatus($('um_status'), 'Trial przyznany ');
    renderTrialInfo({ ...old, ...payload });
  } catch (e) {
    console.error('[trial grant]', e);
    setStatus($('um_status'), 'Blad przyznawania triala.', true);
  }
}

async function quickForever() {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  // Permanent (with "until"): access=true + accessUntil far in the future
  if ($('um_access')) $('um_access').checked = true;
  if ($('um_blocked')) $('um_blocked').checked = false;

  // Keep current plan selection (or set premium for clarity)
  const p = normalizePlanId($('um_plan')?.value || 'free');
  if (p === 'free') $('um_plan').value = 'premium';

  // Set accessUntil to a far-future date (so UI shows ACTIVE and it's effectively permanent)
  const far = new Date(2099, 11, 31, 12, 0, 0); // 2099-12-31 12:00
  setUntilInputFromDate(far);

  await saveUserModal();
}

async function quickRevoke() {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  // Remove access by clearing levels and setting accessUntil in the past.
  if ($('um_access')) $('um_access').checked = false;
  if ($('um_plan')) $('um_plan').value = 'free';
  if ($('um_blocked')) $('um_blocked').checked = false;

  // set a past date so even if something checks it, it's expired
  const past = new Date(Date.now() - 24 * 3600 * 1000);
  setUntilInputFromDate(past);

  // additionally clear levels explicitly (saveUserModal derives levels from plan, so we patch after save)
  await saveUserModal();
  try {
    await setDoc(doc(db, 'users', uid), { levels: [] }, { merge: true });
    const old = usersCache.get(uid) || {};
    usersCache.set(uid, { ...old, levels: [] });
  } catch (e) {
    console.error('[revoke levels]', e);
  }
}

function openUserModal(uid) {
  const modal = $('userModal');
  if (!modal) return;
  const u = usersCache.get(uid);
  if (!u) return;

  if ($('um_email')) $('um_email').textContent = u.email || u.emailLower || '';
  if ($('um_uid')) $('um_uid').textContent = uid;

  if ($('um_admin'))
    $('um_admin').checked = String(u.role || 'user') === 'admin';
  if ($('um_access')) $('um_access').checked = u.access === true;
  if ($('um_blocked')) $('um_blocked').checked = u.blocked === true;

  if ($('um_plan')) $('um_plan').value = u.plan || 'free';
  if ($('um_until')) $('um_until').value = isoDateTimeLocal(u.accessUntil);
  if ($('um_note')) $('um_note').value = u.note || '';
  if ($('um_gender'))
    $('um_gender').value = String(u.gender || '').toLowerCase();
  if ($('um_trial_level'))
    $('um_trial_level').value = String(u.trialLevel || 'A1').toUpperCase();
  if ($('um_trial_days'))
    $('um_trial_days').value = Number(u.trialDays || 7);
  renderTrialInfo(u);

  if ($('um_status')) $('um_status').textContent = '';

  ensureUserQuickButtons();

  modal.style.display = 'block';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeUserModal() {
  const modal = $('userModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

async function saveUserModal() {
  const uid = String($('um_uid')?.textContent || '').trim();
  if (!uid) return;

  const st = $('um_status');
  setStatus(st, 'Zapisywanie...');

  const role = $('um_admin')?.checked ? 'admin' : 'user';
  const access = $('um_access')?.checked ? true : false; // legacy toggle (kept for compatibility)
  const blocked = $('um_blocked')?.checked ? true : false;

  const plan = normalizePlanId($('um_plan')?.value || 'free');
  const note = String($('um_note')?.value || '').trim();
  const gender = String($('um_gender')?.value || '')
    .trim()
    .toLowerCase();

  // If admin set datetime manually -> keep it. Otherwise compute default by plan.
  const manualUntil = parseDateTimeLocal($('um_until')?.value || '');
  const computedUntil = computeUntilForPlan(plan);
  const accessUntil = manualUntil || computedUntil || null;

  // Levels always derived from plan (single source of truth)
  const levels = computeLevelsForPlan(plan);

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        role,
        access,
        blocked,
        plan,
        levels,
        note,
        gender,
        accessUntil,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // refresh cache
    const old = usersCache.get(uid) || {};
    usersCache.set(uid, {
      ...old,
      role,
      access,
      blocked,
      plan,
      levels,
      note,
      gender,
      accessUntil,
    });
    setStatus(st, 'Zapisano');
    closeUserModal();
    await loadUsers(true);
    await loadDashboard();
  } catch (e) {
    console.error('[user save]', e);
    setStatus(st, 'Blad (uprawnienia?).', true);
  }
}

/* =========================`n   SEGMENTACJA (MVP)`n   ========================= */
let segmentCache = []; // [{uid,email,...}] last loaded segment

function renderSegmentRow(u) {
  const email = esc(u.email || u.emailLower || u.uid);
  const until = isoDate(u.accessUntil);
  const role = esc(u.role || 'user');
  const plan = esc(u.plan || '');
  const access = hasAccess(u) ? 'TAK' : 'NIE';
  return `
    <div class="listItem">
      <div class="rowBetween" style="gap:10px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;">${email}</div>
          <div class="hintSmall">uid: ${esc(u.uid)}  -  role: ${role}  -  access: ${access}${plan ? '  -  plan: ' + plan : ''}${until ? '  -  until: ' + esc(until) : ''}</div>
        </div>
      </div>
    </div>
  `;
}

async function loadSegmentExpiring(days) {
  const st = $('segmentStatus');
  const list = $('segmentList');
  if (!list) return;

  setStatus(st, 'Ladowanie...');
  list.innerHTML = '';

  try {
    const today = startOfDay(new Date());
    const end = addDays(today, Number(days || 0));
    // include whole end day
    end.setHours(23, 59, 59, 999);

    const q1 = query(
      collection(db, 'users'),
      where('accessUntil', '>=', today),
      where('accessUntil', '<=', end),
      orderBy('accessUntil', 'asc'),
      limit(200),
    );

    const snap = await getDocs(q1);
    segmentCache = [];
    snap.forEach((d) => {
      const u = d.data() || {};
      segmentCache.push({ uid: d.id, ...u });
    });

    list.innerHTML = segmentCache.length
      ? segmentCache.map(renderSegmentRow).join('')
      : '<div class="hintSmall"></div>';
    setStatus(st, `Gotowe (${segmentCache.length})`);
  } catch (e) {
    console.error('[segment expiring]', e);
    list.innerHTML =
      '<div class="hintSmall">Blad ladowania segmentu (mozliwy brak indexu).</div>';
    setStatus(st, 'Blad', true);
  }
}

async function loadSegmentPremiumActive() {
  const st = $('segmentStatus');
  const list = $('segmentList');
  if (!list) return;

  setStatus(st, 'Ladowanie...');
  list.innerHTML = '';

  try {
    const now = new Date();
    const q1 = query(
      collection(db, 'users'),
      where('accessUntil', '>=', now),
      orderBy('accessUntil', 'asc'),
      limit(200),
    );
    const snap = await getDocs(q1);
    segmentCache = [];
    snap.forEach((d) => segmentCache.push({ uid: d.id, ...(d.data() || {}) }));
    list.innerHTML = segmentCache.length
      ? segmentCache.map(renderSegmentRow).join('')
      : '<div class="hintSmall"></div>';
    setStatus(st, `Gotowe (${segmentCache.length})`);
  } catch (e) {
    console.error('[segment premium active]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania segmentu.</div>';
    setStatus(st, 'Blad', true);
  }
}

async function loadSegmentFreeApprox() {
  const st = $('segmentStatus');
  const list = $('segmentList');
  if (!list) return;

  setStatus(st, 'Ladowanie...');
  list.innerHTML = '';

  try {
    // Approx: users with access == false AND (plan != premium) AND (accessUntil missing OR in past)
    const snap = await getDocs(query(collection(db, 'users'), limit(300)));
    segmentCache = [];
    snap.forEach((d) => {
      const u = d.data() || {};
      const ok = !hasAccess(u);
      if (ok) segmentCache.push({ uid: d.id, ...u });
    });

    list.innerHTML = segmentCache.length
      ? segmentCache.map(renderSegmentRow).join('')
      : '<div class="hintSmall"></div>';
    setStatus(st, `Gotowe (${segmentCache.length})`);
  } catch (e) {
    console.error('[segment free]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania segmentu.</div>';
    setStatus(st, 'Blad', true);
  }
}

async function loadSegmentOneTopic() {
  const st = $('segmentStatus');
  const list = $('segmentList');
  if (!list) return;

  setStatus(st, 'Ladowanie...');
  list.innerHTML = '';

  try {
    const q1 = query(
      collection(db, 'users'),
      where('openedTopicsCount', '==', 1),
      limit(200),
    );
    const snap = await getDocs(q1);
    segmentCache = [];
    snap.forEach((d) => segmentCache.push({ uid: d.id, ...(d.data() || {}) }));
    list.innerHTML = segmentCache.length
      ? segmentCache.map(renderSegmentRow).join('')
      : '<div class="hintSmall"></div>';
    setStatus(st, `Gotowe (${segmentCache.length})`);
  } catch (e) {
    console.error('[segment one topic]', e);
    list.innerHTML = '<div class="hintSmall">Blad ladowania segmentu.</div>';
    setStatus(st, 'Blad', true);
  }
}

function exportSegmentCSV() {
  if (!segmentCache?.length) return;

  const header = [
    'email',
    'uid',
    'role',
    'plan',
    'access',
    'blocked',
    'accessUntil',
  ];
  const lines = [header.join(',')];

  for (const u of segmentCache) {
    const row = [
      (u.email || u.emailLower || '').replaceAll('"', '""'),
      String(u.uid || '').replaceAll('"', '""'),
      String(u.role || 'user').replaceAll('"', '""'),
      String(u.plan || '').replaceAll('"', '""'),
      hasAccess(u) ? 'true' : 'false',
      u.blocked === true ? 'true' : 'false',
      isoDate(u.accessUntil),
    ];
    lines.push(row.map((x) => `"${String(x)}"`).join(','));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `segment_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* =========================
   BIND EVENTS
   ========================= */
function bindEvents() {
  watchAdminSidebar();
  setupAdminSidebarSections();
  // dashboard refresh
  $('btnRefreshStats')?.addEventListener('click', loadDashboard);
  document.querySelectorAll('.statCard[data-expand]')?.forEach?.((el) => {
    el.addEventListener('click', (e) => {
      const type = el.getAttribute('data-expand');
      if (type) loadStatDetails(type);
    });
  });
  setupAdminQuickNav();

  // popup / banner
  $('btnSavePopup')?.addEventListener('click', savePopupSettings);

  // referral
  $('btnSaveReferralSettings')?.addEventListener('click', saveReferralSettings);

  // promo
  $('btnSavePromoCode')?.addEventListener('click', savePromoCode);
  $('btnClearPromoForm')?.addEventListener('click', clearPromoForm);
  $('promoListAdmin')?.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('button[data-pc]');
    if (!btn) return;
    const act = btn.getAttribute('data-pc');
    const id = btn.getAttribute('data-id');
    if (!id) return;
    if (act === 'toggle') await togglePromo(id);
    if (act === 'del') await deletePromo(id);
  });

  // services
  $('btnReloadServicesAdmin')?.addEventListener('click', loadServicesList);
  $('btnBackfillPriceIds')?.addEventListener('click', backfillServicePriceIds);
  $('btnSaveService')?.addEventListener('click', saveService);
  $('btnClearService')?.addEventListener('click', clearServiceForm);
  $('servicesAdminList')?.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('button[data-svc]');
    if (!btn) return;
    const act = btn.getAttribute('data-svc');
    const id = btn.getAttribute('data-id');
    if (!id) return;
    if (act === 'edit') await editService(id);
    if (act === 'toggle') await toggleService(id);
    if (act === 'del') await deleteService(id);
  });

  // publikacje (drafty)
  $('btnLoadDrafts')?.addEventListener('click', loadDrafts);
  $('draftLevel')?.addEventListener('change', renderDrafts);
  $('draftSearch')?.addEventListener('input', renderDrafts);
  $('draftsList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-draft="publish"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (id) publishDraft(id);
  });

  // kontrola brakow
  $('btnLoadMissing')?.addEventListener('click', loadMissing);
  $('missingLevel')?.addEventListener('change', renderMissing);
  $('missingSearch')?.addEventListener('input', renderMissing);

  // users
  $('btnLoadUsers')?.addEventListener('click', () => loadUsers(true));
  $('btnLoadMore')?.addEventListener('click', () => loadUsers(false));
  $('btnSearch')?.addEventListener('click', () => loadUsers(true));
  $('btnClear')?.addEventListener('click', () => {
    if ($('userSearch')) $('userSearch').value = '';
    if ($('roleFilter')) $('roleFilter').value = 'all';
    if ($('planFilter')) $('planFilter').value = 'all';
    if ($('userSort')) $('userSort').value = 'createdAt_desc';
    loadUsers(true);
  });
  $('roleFilter')?.addEventListener('change', () => loadUsers(true));
  $('planFilter')?.addEventListener('change', () => loadUsers(true));
  $('userSort')?.addEventListener('change', () => loadUsers(true));
  $('usersList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-user]');
    if (!btn) return;
    const uid = btn.getAttribute('data-uid');
    if (uid) openUserModal(uid);
  });

  // postepy (analiza)
  $('btnLoadProgress')?.addEventListener('click', loadProgressUsers);
  $('progressUserSelect')?.addEventListener('change', (e) => {
    const uid = String(e.target?.value || '');
    if (uid) loadProgressForUser(uid);
  });
  $('progressSort')?.addEventListener('change', renderProgressList);
  $('progressFilter')?.addEventListener('change', renderProgressList);
  $('progressSearch')?.addEventListener('input', renderProgressList);
  // fiszki (statystyki)
  $('btnLoadFlashcards')?.addEventListener('click', loadFlashcardsStats);
  $('flashcardsLevel')?.addEventListener('change', renderFlashcardsStats);
  $('flashcardsSearch')?.addEventListener('input', renderFlashcardsStats);
  $('progressList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-progress="toggle"]');
    if (!btn) return;
    const key = btn.getAttribute('data-key');
    if (key) toggleProgressErrors(key);
  });

  // aktywnosc
  $('btnLoadActivity')?.addEventListener('click', loadActivityStats);

  $('userModalClose')?.addEventListener('click', closeUserModal);
  $('um_cancel')?.addEventListener('click', closeUserModal);
  $('um_save')?.addEventListener('click', saveUserModal);
  $('um_extend7')?.addEventListener('click', () => quickExtend(7));
  $('um_extend30')?.addEventListener('click', () => quickExtend(30));
  $('um_extend90')?.addEventListener('click', () => quickExtend(90));
  $('um_forever')?.addEventListener('click', quickForever);
  $('um_resetTrial')?.addEventListener('click', quickResetTrial);
  $('um_trial_grant')?.addEventListener('click', grantTrialNow);
  $('um_trial_allow')?.addEventListener('click', quickResetTrial);
  $('um_revoke')?.addEventListener('click', quickRevoke);
  // segmentacja
  $('btnLoadExp0')?.addEventListener('click', () => loadSegmentExpiring(0));
  $('btnLoadExp3')?.addEventListener('click', () => loadSegmentExpiring(3));
  $('btnLoadExp7')?.addEventListener('click', () => loadSegmentExpiring(7));
  $('btnLoadExp14')?.addEventListener('click', () => loadSegmentExpiring(14));
  $('btnLoadPremiumActive')?.addEventListener(
    'click',
    loadSegmentPremiumActive,
  );
  $('btnLoadFreeUsers')?.addEventListener('click', loadSegmentFreeApprox);
  $('btnLoadOneTopic')?.addEventListener('click', loadSegmentOneTopic);
  $('btnExportSegment')?.addEventListener('click', exportSegmentCSV);

  // optional: not implemented yet
  $('btnLoadOneTopicInactive')?.addEventListener('click', () => {
    setStatus(
      $('segmentStatus'),
      'MVP: ten segment jeszcze nie jest podpiety.',
      true,
    );
  });

  // opinie i oceny
  $('btnLoadReviews')?.addEventListener('click', loadReviews);
  $('reviewType')?.addEventListener('change', renderReviews);
  $('reviewRating')?.addEventListener('change', renderReviews);
  $('reviewLevel')?.addEventListener('change', renderReviews);
  $('reviewSearch')?.addEventListener('input', renderReviews);

  // zgloszenia
  $('btnCreateReport')?.addEventListener('click', createReportFromAdmin);
  $('btnLoadReports')?.addEventListener('click', loadReports);
  $('reportStatusFilter')?.addEventListener('change', renderReports);
  $('reportSearch')?.addEventListener('input', renderReports);
  $('reportsList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-report="toggle"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (id) toggleReportStatus(id);
  });

  // komunikacja
  $('btnSendBroadcast')?.addEventListener('click', sendBroadcast);
  $('btnReloadBroadcasts')?.addEventListener('click', loadBroadcasts);

  // platnosci
  $('btnLoadPayments')?.addEventListener('click', loadPayments);
  $('paymentsStatus')?.addEventListener('change', renderPayments);
  $('paymentsSearch')?.addEventListener('input', renderPayments);
  $('paymentsLimit')?.addEventListener('change', loadPayments);
  $('btnLoadAttempts')?.addEventListener('click', loadAttempts);
  $('attemptsStatus')?.addEventListener('change', renderAttempts);
  $('attemptsSearch')?.addEventListener('input', renderAttempts);
  $('attemptsLimit')?.addEventListener('change', loadAttempts);

  // logi aplikacji
  $('btnLoadAppLogs')?.addEventListener('click', loadAppLogs);
  $('logType')?.addEventListener('change', renderAppLogs);
  $('logPage')?.addEventListener('input', renderAppLogs);
  $('logSearch')?.addEventListener('input', renderAppLogs);
  $('logLimit')?.addEventListener('change', loadAppLogs);
  $('appLogsList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-log="toggle"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (id) toggleAppLogDetails(id);
  });

  // biblioteka audio
  $('btnUploadAudioLib')?.addEventListener('click', uploadAudioLibrary);
  $('btnLoadAudioLib')?.addEventListener('click', loadAudioLibrary);
  $('audioLibList')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button[data-audio]');
    if (!btn) return;
    const act = btn.getAttribute('data-audio');
    if (act === 'copy') copyAudioUrl(btn.getAttribute('data-url') || '');
    if (act === 'del') deleteAudioLibrary(btn.getAttribute('data-id') || '');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  setTimeout(openSectionFromHash, 200);
  window.addEventListener('hashchange', openSectionFromHash);
  openAdminSection('accDashboard');

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // layout.js should redirect anyway
    const ok = await ensureAdmin(user);
    if (!ok) return;

    // Load sections independently so one failure doesn't break others
    await loadDashboard();
    await loadPopupSettingsAdmin();
    await loadReferralSettings();
    await loadPromoList();
    await loadServicesList();
    await loadBroadcasts();
  });
});

