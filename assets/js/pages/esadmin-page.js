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
  query,
  where,
  orderBy,
  limit,
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

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const ADMIN_UIDS = new Set(['OgXNeCbloJiSGoi1DsZ9UN0aU0I2']); // add more UIDs if needed

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

    setStatus(st, 'Gotowe');
  } catch (e) {
    console.error('[dashboard]', e);
    setStatus(st, 'Blad: sprawdz rules / Console.', true);
  }
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
    p.value = data?.percent ?? '';
    s.value = data?.scope ?? '';
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
    stripePriceId: String($('svcStripePriceId')?.value || '').trim(),
    ctaUrl: String($('svcCtaUrl')?.value || '').trim(),
    ctaLabel: String($('svcCtaLabel')?.value || '').trim(),
    active: String($('svcActive')?.value || 'true') === 'true',
    updatedAt: serverTimestamp(),
  };

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
  fillServiceForm(id, snap.data() || {});
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
  fillServiceForm('', {
    category: 'extras',
    ctaType: 'info',
    active: true,
    order: 0,
  });
  setStatus($('svcStatus'), '');
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
          <div class="hintSmall">uid: ${esc(uid)}  -  role: ${role}  -  access: ${access}${plan ? '  -  plan: ' + plan : ''}${until ? '  -  until: ' + esc(until) : ''}</div>
          <div class="hintSmall">${esc(progressSummary)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${statusBadge}
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

    setStatus(st, 'Wgrano ✅');
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
    setStatus($('audioLibStatus'), 'Skopiowano ✅');
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
  // dashboard refresh
  $('btnRefreshStats')?.addEventListener('click', loadDashboard);
  document.querySelectorAll('.statCard[data-expand]')?.forEach?.((el) => {
    el.addEventListener('click', (e) => {
      const type = el.getAttribute('data-expand');
      if (type) loadStatDetails(type);
    });
  });

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

  onAuthStateChanged(auth, async (user) => {
    if (!user) return; // layout.js should redirect anyway
    const ok = await ensureAdmin(user);
    if (!ok) return;

    // Load sections independently so one failure doesn't break others
    await loadDashboard();
    await loadReferralSettings();
    await loadPromoList();
    await loadServicesList();
  });
});







