// assets/js/pages/panel-page.js
// Panel użytkownika: status dostępu + kody promo
// Dodatki:
// - jeśli w URL jest ?as=UID i zalogowany jest admin, pokazuje podgląd panelu danego usera (read-only)
// - jeśli layout.js przekierował z reason=blocked, pokazuje komunikat

import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  Timestamp,
  addDoc,
  collection,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const qs = new URLSearchParams(location.search);
const AS_UID = (qs.get('as') || '').trim(); // admin preview

function toCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? '' : 'none';
}

function ensureMsgBox() {
  let box = document.getElementById('promoMsg');
  if (!box) {
    const anchor = document.getElementById('promoList')?.parentElement || document.getElementById('lastActivityCard');
    if (anchor) {
      box = document.createElement('div');
      box.id = 'promoMsg';
      box.className = 'hintSmall';
      box.style.marginTop = '10px';
      box.style.display = 'none';
      anchor.insertBefore(box, anchor.firstChild);
    }
  }
  return box;
}

function setMsg(text, kind = 'ok') {
  const box = ensureMsgBox();
  if (!box) return;
  if (!text) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.style.display = 'block';
  box.textContent = text;
  box.style.color = kind === 'bad' ? '#ffd1d7' : (kind === 'warn' ? '#ffe08a' : 'rgba(255,255,255,0.92)');
}

function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch {
    return '';
  }
}

async function ensureUserDoc(user) {
  if (!user?.uid) return { admin: false, access: false, plan: 'free' };

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
        blocked: false,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { admin: false, access: false, plan: 'free', blocked: false };
  }

  const data = snap.data() || {};
  const patch = {};
  let needPatch = false;

  if (typeof data.email !== 'string') { patch.email = user.email || ''; needPatch = true; }
  if (typeof data.admin !== 'boolean') { patch.admin = false; needPatch = true; }
  if (typeof data.access === 'undefined') { patch.access = false; needPatch = true; }
  if (typeof data.plan !== 'string') { patch.plan = 'free'; needPatch = true; }
  if (!Array.isArray(data.promoCodes)) { patch.promoCodes = []; needPatch = true; }
  if (typeof data.blocked !== 'boolean') { patch.blocked = false; needPatch = true; }
  if (!data.createdAt) { patch.createdAt = serverTimestamp(); needPatch = true; }

  if (needPatch) await setDoc(ref, patch, { merge: true });

  return { ...data, ...patch };
}

function computeFlags(userDoc) {
  const isAdmin = userDoc?.admin === true;
  const plan = String(userDoc?.plan || 'free').toLowerCase();
  const access = userDoc?.access === true;

  const until = userDoc?.accessUntil || null;
  const untilDate = until?.toDate ? until.toDate() : (until ? new Date(until) : null);
  const hasUntil = !!untilDate && !Number.isNaN(untilDate.getTime());
  const isUntilValid = hasUntil ? (untilDate.getTime() > Date.now()) : false;

  const blocked = userDoc?.blocked === true;

  const hasAccess = isAdmin || access || plan === 'premium' || isUntilValid;

  return { isAdmin, plan, access, hasAccess, until, isUntilValid, blocked };
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


function parseAccessLevels(userDoc) {
  const raw = userDoc?.accessLevels;
  if (Array.isArray(raw)) return raw.map((x) => String(x).toUpperCase()).filter(Boolean);

  // backward compatibility: plan like "a1", "a2", "b1", "b2", "pack_a1a2", "pack_b1b2"
  const p = String(userDoc?.plan || '').toLowerCase();
  if (p === 'a1') return ['A1'];
  if (p === 'a2') return ['A2'];
  if (p === 'b1') return ['B1'];
  if (p === 'b2') return ['B2'];
  if (p === 'pack_a1a2') return ['A1', 'A2'];
  if (p === 'pack_b1b2') return ['B1', 'B2'];
  return [];
}

function hasLevelAccess(flags, userDoc, level) {
  const lvl = String(level || '').toUpperCase();
  if (flags?.isAdmin) return true;
  if (flags?.hasAccess) return true; // premium/global access
  const levels = parseAccessLevels(userDoc);
  return levels.includes(lvl);
}

function renderPlans(userDoc, flags) {
  const card = $('plansCard');
  if (!card) return;

  const subtitle = $('plansSubtitle');
  const status = $('plansStatus');

  const levels = parseAccessLevels(userDoc);
  const hasAnyLevel = levels.length > 0;

  const chunks = [];
  if (flags?.isAdmin) chunks.push('admin');
  if (flags?.hasAccess && !flags?.isAdmin && !hasAnyLevel) chunks.push('premium');
  if (hasAnyLevel) chunks.push(`niveles: ${levels.join(', ')}`);
  if (!chunks.length) chunks.push('sin acceso');

  if (status) {
    status.style.display = 'block';
    status.textContent = `Estado: ${chunks.join(' · ')}`;
  }
  if (subtitle) {
    subtitle.textContent =
      'Elige un paquete. Las consultas son un add‑on (no desbloquean lecciones).';
  }

  // Visual pills per plan card
  const setPill = (id, yes) => {
    const el = $(id);
    if (!el) return;
    el.className = 'pill ' + (yes ? 'pill-green' : 'pill pill-yellow');
    el.textContent = yes ? '✅ Tienes acceso' : 'Disponible';
  };

  setPill(
    'pillPlanA1A2',
    hasLevelAccess(flags, userDoc, 'A1') || hasLevelAccess(flags, userDoc, 'A2'),
  );
  setPill('pillPlanB1', hasLevelAccess(flags, userDoc, 'B1'));
  setPill('pillPlanB2', hasLevelAccess(flags, userDoc, 'B2'));

  // Consultations add-on (does NOT unlock lessons)
  const included = Number(userDoc?.consultationsIncluded || 0);
  const left = Number(
    userDoc?.consultationsLeft ??
      userDoc?.consultationsRemaining ??
      included ??
      0,
  );

  const c1 = $('consultIncluded');
  const c2 = $('consultLeft');
  if (c1) c1.textContent = `Incluidas: ${included}`;
  if (c2) c2.textContent = `Restantes: ${left}`;

  const consultCTA = $('btnConsultCTA');
  if (consultCTA) {
    // Configure your booking link here (Calendly / WhatsApp / your page)
    const url = String(userDoc?.consultationsBookingUrl || '').trim();
    consultCTA.href = url || '#';
    consultCTA.onclick = (e) => {
      if ((consultCTA.getAttribute('href') || '#') === '#') {
        e.preventDefault();
        setMsg('Configura el enlace de reserva en el admin.', 'warn');
      }
    };
  }

  // Scroll to promo input
  card.querySelectorAll('[data-act="scrollPromo"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = $('adm_promo_code');
      box?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      box?.focus?.();
    });
  });
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

async function logAccess(uid, action, details = {}) {
  try {
    await addDoc(collection(db, 'users', uid, 'access_logs'), {
      action,
      details,
      byUid: uid, // self (promo by user)
      byEmail: auth.currentUser?.email || null,
      createdAt: serverTimestamp(),
    });
  } catch {}
}

async function applyPromoCode(targetUid, targetDoc) {
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
    if (AS_UID) {
      setMsg('Modo vista: no puedes aplicar códigos aquí.', 'warn');
      return;
    }

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

    const currentUntil = targetDoc?.accessUntil?.toDate ? targetDoc.accessUntil.toDate() : null;
    let newUntil = until;
    if (currentUntil && !Number.isNaN(currentUntil.getTime())) {
      if (currentUntil.getTime() > newUntil.getTime()) newUntil = currentUntil;
    }

    const payload = {
      updatedAt: serverTimestamp(),
      promoCodes: arrayUnion(code),
      plan: grantPlan === 'premium' ? 'premium' : grantPlan,
      access: true,
    };
    if (days > 0) payload.accessUntil = Timestamp.fromDate(newUntil);

    await updateDoc(doc(db, 'users', targetUid), payload);
    await logAccess(targetUid, 'promo_applied', { code, days });

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

function showBlockedBanner() {
  const reason = new URLSearchParams(location.search).get('reason');
  if (reason === 'blocked') {
    setMsg('⛔ Tu cuenta está bloqueada. Contacta con el administrador.', 'bad');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderCourses();

  const btn = $('addPromoBtn');
  const input = $('adm_promo_code');

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    const baseDoc = await ensureUserDoc(user);

    // Admin preview: load target user doc
    let viewUid = user.uid;
    let viewDoc = baseDoc;

    const isAdmin = baseDoc.admin === true;
    if (AS_UID) {
      if (!isAdmin) {
        setMsg('Acceso denegado (solo admin).', 'bad');
        return;
      }
      viewUid = AS_UID;
      const snap = await getDoc(doc(db, 'users', viewUid));
      viewDoc = snap.exists() ? (snap.data() || {}) : {};
      setMsg(`👀 Vista del panel de: ${viewDoc.email || viewUid}`, 'warn');
    } else {
      showBlockedBanner();
    }

    const emailEl = $('userEmail');
    if (emailEl) emailEl.textContent = (AS_UID ? (viewDoc.email || '—') : (user.email || '—'));

    renderAdminUI(isAdmin);

    renderPromoList(viewDoc);

    const flags = computeFlags(viewDoc);
    renderPlans(viewDoc, flags);

    if (btn) {
      btn.onclick = async () => {
        const fresh = await getDoc(doc(db, 'users', viewUid));
        const latest = fresh.exists() ? fresh.data() || {} : viewDoc;
        await applyPromoCode(viewUid, latest);

        const after = await getDoc(doc(db, 'users', viewUid));
        const afterDoc = after.exists() ? after.data() || {} : latest;
        renderPromoList(afterDoc);
      };
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btn?.click();
      });
    }

    // Disable promo applying in preview mode
    if (AS_UID) {
      if (input) input.disabled = true;
      if (btn) btn.disabled = true;
    }
  });
});
