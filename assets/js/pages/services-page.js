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
  const isFeatured = Boolean(svc._isFeatured);
  const isA1A2 = Boolean(svc._isA1A2);
  const badgeText = svc.badge
    ? esc(svc.badge)
    : isFeatured
      ? '★ Recomendado'
      : '';
  const badge = badgeText ? `<div class="badge">${badgeText}</div>` : '';
  const price = svc.price
    ? `<div class="priceTag">${esc(svc.price)}</div>`
    : '';
  const ctaClass = isFeatured
    ? 'btn-yellow'
    : isA1A2
      ? 'btn-red'
      : 'btn-white-outline';

  // CTA
  const ctaLabel =
    svc.ctaLabel && String(svc.ctaLabel).trim() ? esc(svc.ctaLabel) : 'Comprar';
  let ctaHtml = '';

  if (svc.ctaType === 'stripe') {
    // For Stripe checkout we treat `sku` as planId (the same planId used by createCheckoutSession)
    const planId = String(svc.sku || '').trim();
    ctaHtml = `
      <button class="${ctaClass}" data-plan="${esc(planId)}" type="button">${ctaLabel}</button>
    `;
  } else if (svc.ctaType === 'link') {
    const url = String(svc.ctaUrl || '').trim();
    ctaHtml = `
      <a class="${ctaClass}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ctaLabel}</a>
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
    <div class="card services-card${isFeatured ? ' services-card--featured' : ''}${isA1A2 ? ' services-card--a1a2' : ''}">
      <div class="sectionTitle" style="margin-top:0;">${badge}${title}</div>
      ${desc ? `<div class="muted">${desc}</div>` : ''}
      ${price}
      <div class="ctaRow">${ctaHtml}</div>
    </div>
  `;
}

async function loadServices() {
  const plansGrid = $('servicesPlansGrid');
  const servicesGrid = $('servicesServicesGrid');
  const extrasGrid = $('servicesExtrasGrid');
  const ebooksGrid = $('servicesEbooksGrid');
  const fallback = $('servicesFallback');
  if (!plansGrid || !servicesGrid || !extrasGrid || !ebooksGrid) return;

  plansGrid.innerHTML = '<div class="hintSmall">Cargando…</div>';
  servicesGrid.innerHTML = '<div class="hintSmall">Cargando…</div>';
  extrasGrid.innerHTML = '<div class="hintSmall">Cargando…</div>';
  ebooksGrid.innerHTML = '<div class="hintSmall">Cargando…</div>';
  if (fallback) fallback.style.display = 'none';

  try {
    const q = query(collection(db, 'services'), where('active', '==', true));
    const snap = await getDocs(q);

    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
    items.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (!items.length) {
      plansGrid.innerHTML =
        '<div class="hintSmall">No hay planes activos.</div>';
      servicesGrid.innerHTML = '<div class="hintSmall">No hay servicios.</div>';
      extrasGrid.innerHTML = '<div class="hintSmall">No hay extras.</div>';
      ebooksGrid.innerHTML = '<div class="hintSmall">No hay ebooks.</div>';
      return;
    }

    const normalize = (val) =>
      String(val || '')
        .toLowerCase()
        .trim();
    const categoryMap = {
      plan: 'plans',
      planes: 'plans',
      plano: 'plans',
      plany: 'plans',
      suscripcion: 'plans',
      suscripción: 'plans',
      subscription: 'plans',
      membresia: 'plans',
      membresía: 'plans',
      membership: 'plans',
      servicio: 'servicios',
      servicios: 'servicios',
      service: 'servicios',
      services: 'servicios',
      consults: 'servicios',
      consultas: 'servicios',
      uslugi: 'servicios',
      usługi: 'servicios',
      consulta: 'servicios',
      consultas: 'servicios',
      clase: 'servicios',
      clases: 'servicios',
      lesson: 'servicios',
      lessons: 'servicios',
      extra: 'extras',
      extras: 'extras',
      ekstra: 'extras',
      bonus: 'extras',
      addon: 'extras',
      'add-on': 'extras',
      ebook: 'ebooks',
      ebooks: 'ebooks',
      ebooki: 'ebooks',
      'e-book': 'ebooks',
      pdf: 'ebooks',
    };
    const classify = (item) => {
      const rawCat = normalize(
        item.category || item.section || item.type || item.group,
      );
      const title = normalize(item.title || '');
      const text = normalize(
        `${item.title || ''} ${item.sku || ''} ${item.badge || ''} ${item.desc || ''}`,
      );

      if (title.includes('plan premium b2')) return 'plans';
      if (
        title.includes('e-book') ||
        title.includes('ebook') ||
        title.includes('e book')
      ) {
        return 'ebooks';
      }

      if (rawCat && categoryMap[rawCat]) return categoryMap[rawCat];

      const isEbook =
        /ebook|e-book|e book|ebooki|pdf/.test(rawCat) ||
        /ebook|e-book|e book|ebooki|pdf/.test(text);
      if (isEbook) return 'ebooks';

      const isExtra =
        /extra|extras|ekstra|bonus|add-on/.test(rawCat) ||
        /extra|extras|ekstra|bonus|add-on/.test(text);
      if (isExtra) return 'extras';

      const isService =
        /servicio|servicios|service|services|uslugi|usługi|clase|lesson|consulta|asesor[ií]a|tarjeta de residencia|residencia/.test(
          rawCat,
        ) ||
        /servicio|servicios|service|services|uslugi|usługi|clase|lesson|consulta|asesor[ií]a|tarjeta de residencia|residencia/.test(
          text,
        );
      if (isService) return 'servicios';

      const isPlan =
        /plan|planes|plano|plany|suscripci[oó]n|subscription|membres[ií]a|membership|plan premium|premium plan|premium b2/.test(
          rawCat,
        ) ||
        /plan|planes|plano|plany|suscripci[oó]n|subscription|membres[ií]a|membership|plan premium|premium plan|premium b2/.test(
          text,
        );
      if (isPlan) return 'plans';

      if (rawCat) {
        console.warn('[services] Unknown category:', rawCat, 'for', item);
      }
      return 'plans';
    };

    const vipMatcher = (item) => {
      const text =
        `${item.title || ''} ${item.sku || ''} ${item.badge || ''} ${item.desc || ''}`.toLowerCase();
      return (
        text.includes('vip') &&
        text.includes('a1') &&
        text.includes('a2') &&
        text.includes('b1') &&
        text.includes('b2')
      );
    };

    const a1a2Matcher = (item) => {
      const text =
        `${item.title || ''} ${item.sku || ''} ${item.badge || ''} ${item.desc || ''}`.toLowerCase();
      return (
        text.includes('a1') &&
        text.includes('a2') &&
        !text.includes('b1') &&
        !text.includes('b2')
      );
    };

    const groups = {
      plans: [],
      servicios: [],
      extras: [],
      ebooks: [],
    };
    items.forEach((item) => {
      const bucket = classify(item);
      groups[bucket].push(item);
    });

    const featured =
      groups.plans.find(vipMatcher) ||
      groups.plans.find((item) => item.featured === true) ||
      groups.plans[0] ||
      items[0];
    const featuredId = featured?.id;
    items.forEach((item) => {
      item._isFeatured = item.id === featuredId && groups.plans.includes(item);
      item._isA1A2 = a1a2Matcher(item);
    });

    plansGrid.innerHTML = groups.plans.length
      ? groups.plans.map(renderCard).join('')
      : '<div class="hintSmall">No hay planes activos.</div>';
    servicesGrid.innerHTML = groups.servicios.length
      ? groups.servicios.map(renderCard).join('')
      : '<div class="hintSmall">No hay servicios.</div>';
    extrasGrid.innerHTML = groups.extras.length
      ? groups.extras.map(renderCard).join('')
      : '<div class="hintSmall">No hay extras.</div>';
    ebooksGrid.innerHTML = groups.ebooks.length
      ? groups.ebooks.map(renderCard).join('')
      : '<div class="hintSmall">No hay ebooks.</div>';

    // Bind Stripe buttons
    const buttons = [plansGrid, servicesGrid, extrasGrid, ebooksGrid].flatMap(
      (g) => Array.from(g.querySelectorAll('button[data-plan]')),
    );

    buttons.forEach((btn) => {
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
    plansGrid.innerHTML =
      '<div class="hintSmall">No se pudo cargar la oferta.</div>';
    servicesGrid.innerHTML =
      '<div class="hintSmall">No se pudo cargar la oferta.</div>';
    extrasGrid.innerHTML =
      '<div class="hintSmall">No se pudo cargar la oferta.</div>';
    ebooksGrid.innerHTML =
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
