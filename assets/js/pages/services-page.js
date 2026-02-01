// assets/js/pages/services-page.js
// Public services/pricing page: renders plans from Firestore (services collection)
// Architecture: no inline JS in HTML; page logic lives here.

import { db, auth } from '../firebase-init.js';
import { startCheckout } from '../stripe-checkout.js';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderCard(svc) {
  const title = svc.title ? esc(svc.title) : esc(svc.sku || 'Plan');
  const desc = svc.desc ? esc(svc.desc) : '';
  const badge = svc.badge
    ? `<div class="badge" style="display:inline-block; margin-bottom:10px;">${esc(svc.badge)}</div>`
    : '';
  const price = svc.price
    ? `<div style="margin-top:12px; font-size:22px; font-weight:900;">${esc(svc.price)}</div>`
    : '';

  // CTA
  const ctaLabel =
    svc.ctaLabel && String(svc.ctaLabel).trim() ? esc(svc.ctaLabel) : 'Comprar';
  let ctaHtml = '';

  if (svc.ctaType === 'stripe') {
    // For Stripe checkout we treat `sku` as planId (the same planId used by createCheckoutSession)
    const planId = String(svc.sku || '').trim();
    ctaHtml = `
      <button class="btn-yellow" data-plan="${esc(planId)}" type="button">${ctaLabel}</button>
    `;
  } else if (svc.ctaType === 'link') {
    const url = String(svc.ctaUrl || '').trim();
    ctaHtml = `
      <a class="btn-yellow" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ctaLabel}</a>
    `;
  } else if (svc.ctaType === 'payhip') {
    // Keep it visible, but do not guess integration here.
    ctaHtml = `
      <button class="btn-white-outline" type="button" disabled>Payhip</button>
    `;
  } else {
    ctaHtml = `
      <button class="btn-white-outline" type="button" disabled>${ctaLabel}</button>
    `;
  }

  return `
    <div class="card" style="margin-top:16px;">
      <div class="sectionTitle" style="margin-top:0;">${badge}${title}</div>
      ${desc ? `<div class="muted">${desc}</div>` : ''}
      ${price}
      <div style="margin-top:14px;">${ctaHtml}</div>
    </div>
  `;
}

async function loadServices() {
  const grid = $('servicesGrid');
  const fallback = $('servicesFallback');
  if (!grid) return;

  grid.innerHTML = '<div class="hintSmall">Cargando…</div>';
  if (fallback) fallback.style.display = 'none';

  try {
    const q = query(collection(db, 'services'), where('active', '==', true));
    const snap = await getDocs(q);

    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (!items.length) {
      grid.innerHTML = '<div class="hintSmall">No hay planes activos.</div>';
      return;
    }

    grid.innerHTML = items.map(renderCard).join('');

    // Bind Stripe buttons
    grid.querySelectorAll('button[data-plan]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const planId = btn.getAttribute('data-plan');
        if (!planId) return;

        try {
          btn.disabled = true;
          btn.textContent = 'Redirigiendo…';
          await startCheckout(planId);
        } catch (e) {
          console.error('[services checkout]', e);
          btn.disabled = false;
          btn.textContent = 'Intentar otra vez';
          alert('No se pudo iniciar el checkout. Inténtalo de nuevo.');
        }
      });
    });
  } catch (e) {
    console.error('[services load]', e);

    // Typical cases:
    // - permission-denied (Firestore rules)
    // - unauthenticated (rules require login)
    grid.innerHTML =
      '<div class="hintSmall">No se pudo cargar la oferta.</div>';
    if (fallback) fallback.style.display = 'block';
  }
}

function init() {
  // If rules depend on auth, we reload after auth state resolves.
  // If page is public, it still works.
  onAuthStateChanged(auth, () => {
    loadServices();
  });

  // Also load immediately (covers fast public access + avoids blank screen)
  loadServices();
}

init();
