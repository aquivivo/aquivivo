// assets/js/pages/panel-page.js
// KROK 11: Panel użytkownika — status dostępu + kody promo
// - promo_codes/{CODE} (CODE = UPPERCASE, bez spacji)
// - users/{uid} aktualizujemy: access/plan/accessUntil/promoCodes
// Zasada dostępu (spójna z lessonpage-page.js):
// admin === true OR access === true OR plan === "premium" OR (accessUntil > now)

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

function toCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    if (Number.isNaN(d.getTime())) return '';
    // locale "es-ES" (UI hiszpański)
    return d.toLocaleString('es-ES', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '';
  }
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

function setMsg(text, kind = 'ok') {
  const box = $('promoMsg');
  if (!box) return;
  if (!text) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.style.display = 'block';
  box.textContent = text;
  // lekki sygnał kolorem bez zmian w CSS
  box.style.color = kind === 'bad' ? '#ffd1d7' : (kind === 'warn' ? '#ffe08a' : 'rgba(255,255,255,0.92)');
}

async function ensureUserDoc(user) {
  if (!user?.uid) return { admin: false, plan: 'free', access: false };

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        email: user.email || '',
        admin: false,
        access: false,
        plan: 'free',
        promoCodes: [],
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { admin: false, access: false, plan: 'free' };
  }

  const data = snap.data() || {};
  const patch = {};
  let needPatch = false;

  if (typeof data.email !== 'string') { patch.email = user.email || ''; needPatch = true; }
  if (typeof data.admin !== 'boolean') { patch.admin = false; needPatch = true; }
  if (typeof data.access === 'undefined') { patch.access = false; needPatch = true; }
  if (typeof data.plan !== 'string') { patch.plan = 'free'; needPatch = true; }
  if (!Array.isArray(data.promoCodes)) { patch.promoCodes = []; needPatch = true; }
  if (!data.createdAt) { patch.createdAt = serverTimestamp(); needPatch = true; }

  if (needPatch) await setDoc(ref, patch, { merge: true });

  return { ...data, ...patch };
}

function computeAccessFlags(userDoc) {
  const isAdmin = userDoc?.admin === true;
  const plan = String(userDoc?.plan || 'free').toLowerCase();
  const access = userDoc?.access === true;

  const until = userDoc?.accessUntil || null;
  const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? (untilDate.getTime() > Date.now()) : false;

  const hasAccess = isAdmin || access || plan === 'premium' || isUntilValid;

  return { isAdmin, plan, access, hasAccess, until, untilDate, isUntilValid };
}

function renderAccessUI(flags) {
  const accessPill = $('accessPill');
  const planPill = $('planPill');
  const untilPill = $('untilPill');

  if (accessPill) {
    accessPill.className = 'pill ' + (flags.hasAccess ? 'pill-green' : 'pill-red');
    accessPill.textContent = flags.hasAccess ? '🔓 Acceso: ACTIVO' : '🔒 Acceso: FREE';
    show(accessPill, true);
  }

  if (planPill) {
    planPill.className = 'pill pill-blue';
    planPill.textContent = flags.isAdmin ? '🛡️ Plan: ADMIN' : `💎 Plan: ${flags.plan === 'premium' ? 'PREMIUM' : 'FREE'}`;
    show(planPill, true);
  }

  if (untilPill) {
    if (flags.isUntilValid) {
      untilPill.className = 'pill';
      untilPill.textContent = `⏳ Hasta: ${formatDate(flags.until)}`;
      show(untilPill, true);
    } else {
      show(untilPill, false);
    }
  }
}

function renderAdminUI(isAdmin) {
  const badge = $('adminBadge');
  if (badge) badge.textContent = `(admin: ${isAdmin ? 'sí' : 'no'})`;

  const wrap = $('adminLinkWrap');
  if (wrap) {
    wrap.innerHTML = isAdmin
      ? `<a class="btn-yellow" href="esadmin.html">🛡️ Admin</a>`
      : '';
  }
}

function renderCourses() {
  const host = $('coursesCards');
  if (!host) return;

  const levels = [
    { lvl: 'A1', title: 'A1 — Principiante', subtitle: 'Empieza desde cero.' },
    { lvl: 'A2', title: 'A2 — Básico', subtitle: 'Refuerza lo esencial.' },
    { lvl: 'B1', title: 'B1 — Intermedio', subtitle: 'Comunicación diaria.' },
    { lvl: 'B2', title: 'B2 — Avanzado', subtitle: 'Fluidez y matices.' },
  ];

  host.innerHTML = levels
    .map(({ lvl, title, subtitle }) => {
      const href = `course.html?level=${encodeURIComponent(lvl)}`;
      return `
        <a class="courseCard" href="${href}" style="text-decoration:none; color:inherit;">
          <div class="courseTop">
            <div class="courseBadge">📚 ${lvl}</div>
            <div class="pill pill-yellow">Entrar →</div>
          </div>
          <div class="courseTitle" style="margin-top:10px;">${title}</div>
          <div class="muted" style="margin-top:6px;">${subtitle}</div>
        </a>
      `;
    })
    .join('');
}

function renderLastActivityFallback() {
  const when = $('lastActivityWhen');
  const title = $('lastActivityTitle');
  const link = $('lastActivityLink');
  if (when) when.textContent = '—';
  if (title) title.textContent = '—';
  if (link) link.href = 'espanel.html';
}

function renderPromoList(userDoc) {
  const host = $('promoList');
  if (!host) return;

  const codes = Array.isArray(userDoc?.promoCodes) ? userDoc.promoCodes : [];
  if (!codes.length) {
    host.textContent = '—';
    return;
  }

  host.innerHTML = codes
    .slice(0, 20)
    .map((c) => `<span class="pill" style="margin-right:8px; margin-bottom:8px; display:inline-flex;">🏷️ ${String(c)}</span>`)
    .join('');
}

async function applyPromoCode(user, userDoc) {
  const input = $('adm_promo_code');
  const btn = $('addPromoBtn');
  const raw = input ? input.value : '';
  const code = toCode(raw);

  if (!code) {
    setMsg('Introduce un código.', 'warn');
    return;
  }

  setMsg('');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Aplicando…';
  }

  try {
    // promo_codes/{CODE}
    const promoRef = doc(db, 'promo_codes', code);
    const promoSnap = await getDoc(promoRef);

    if (!promoSnap.exists()) {
      setMsg('Código inválido.', 'bad');
      return;
    }

    const promo = promoSnap.data() || {};
    if (promo.active === false) {
      setMsg('Este código está desactivado.', 'bad');
      return;
    }

    const days = Number(promo.days || promo.durationDays || 0);
    const grantPlan = String(promo.plan || 'premium').toLowerCase();
    const now = new Date();
    const until = new Date(now.getTime() + Math.max(0, days) * 24 * 60 * 60 * 1000);

    const userRef = doc(db, 'users', user.uid);

    // Jeśli kod był już użyty, tylko dopisz do listy (bez dublowania)
    // i ewentualnie przedłuż accessUntil (max).
    const currentUntil = userDoc?.accessUntil?.toDate ? userDoc.accessUntil.toDate() : null;
    let newUntil = until;
    if (currentUntil && !Number.isNaN(currentUntil.getTime())) {
      // jeśli już ma późniejszy termin, nie skracamy
      if (currentUntil.getTime() > newUntil.getTime()) newUntil = currentUntil;
    }

    const payload = {
      updatedAt: serverTimestamp(),
      promoCodes: arrayUnion(code),
    };

    // przyznanie dostępu
    // - jeśli promo ma days=0, nadal ustawiamy plan/access (to może być „dożywotnie” lub manualnie zarządzane)
    payload.plan = grantPlan === 'premium' ? 'premium' : grantPlan;
    payload.access = true;

    if (days > 0) payload.accessUntil = newUntil;

    await updateDoc(userRef, payload);

    if (input) input.value = '';
    setMsg('Código aplicado ✅', 'ok');
  } catch (e) {
    console.error(e);
    setMsg('Error aplicando el código. Intenta de nuevo.', 'bad');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Aplicar';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCourses();
  renderLastActivityFallback();

  const btn = $('addPromoBtn');
  const input = $('adm_promo_code');

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const emailEl = $('userEmail');
    if (emailEl) emailEl.textContent = user.email || '—';

    // Ensure / read user doc
    const userDoc = await ensureUserDoc(user);
    const flags = computeAccessFlags(userDoc);

    renderAdminUI(flags.isAdmin);
    renderAccessUI(flags);
    renderPromoList(userDoc);

    // Bind apply promo
    if (btn) {
      btn.onclick = async () => {
        setMsg('');
        // refresh latest user doc before applying
        const fresh = await getDoc(doc(db, 'users', user.uid));
        const latest = fresh.exists() ? fresh.data() || {} : userDoc;
        await applyPromoCode(user, latest);

        // refresh UI after apply
        const after = await getDoc(doc(db, 'users', user.uid));
        const afterDoc = after.exists() ? after.data() || {} : latest;
        renderPromoList(afterDoc);
        renderAccessUI(computeAccessFlags(afterDoc));
      };
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btn?.click();
      });
    }
  });
});
