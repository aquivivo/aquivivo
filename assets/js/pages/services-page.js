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
import { renderPayPalHostedButtons } from '../paypal-hosted-buttons.js?v=20260208d';

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getPayPalConfig() {
  const body = document.body || {};
  const sdkSrc = String(body.dataset.paypalSdkSrc || '').trim();
  const clientId = String(body.dataset.paypalClientId || '').trim();
  const currency = String(body.dataset.paypalCurrency || 'PLN').trim() || 'PLN';
  const disableFunding =
    String(body.dataset.paypalDisableFunding || 'venmo').trim() || 'venmo';
  return { sdkSrc, clientId, currency, disableFunding };
}

function requireCheckoutConsent() {
  const checkbox = $('checkoutConsent');
  if (!checkbox) return true;
  if (checkbox.checked) return true;
  try {
    checkbox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {}
  checkbox.focus?.();
  alert('Antes de comprar, marca la casilla de aceptación.');
  return false;
}

let paypalRendered = false;

function setPayPalStatus(msg) {
  const status = $('paypalStatus');
  if (!status) return;
  if (!msg) {
    status.style.display = 'none';
    status.textContent = '';
    return;
  }
  status.style.display = 'block';
  status.textContent = msg;
}

async function ensurePayPalRendered() {
  if (paypalRendered) return;
  paypalRendered = true;
  setPayPalStatus('Cargando PayPal…');
  try {
    const { sdkSrc, clientId, currency, disableFunding } = getPayPalConfig();
    await renderPayPalHostedButtons({
      sdkSrc,
      clientId,
      currency,
      disableFunding,
    });
    setPayPalStatus('');
  } catch (e) {
    paypalRendered = false;
    console.error('[paypal]', e);
    const msg = String(e?.message || '').trim();
    setPayPalStatus(
      msg
        ? `No se pudo cargar PayPal (${msg}).`
        : 'No se pudo cargar PayPal. Intenta recargar la página.',
    );
  }
}

function updatePayPalGate() {
  const wrap = $('paypalHostedWrap');
  const overlay = $('paypalHostedOverlay');
  const link = $('paypalFallbackLink');

  const checkbox = $('checkoutConsent');
  const enabled = !checkbox || checkbox.checked === true;

  if (link) {
    link.classList.toggle('is-disabled', !enabled);
    link.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  if (!wrap || !overlay) return;

  const { sdkSrc, clientId } = getPayPalConfig();
  const configured = Boolean(sdkSrc || clientId);
  if (!configured) return;

  wrap.classList.toggle('is-enabled', enabled);
  overlay.setAttribute('aria-hidden', enabled ? 'true' : 'false');

  if (enabled) ensurePayPalRendered();
}

function initPayPal() {
  const wrap = $('paypalHostedWrap');
  const { sdkSrc, clientId } = getPayPalConfig();
  const configured = Boolean(sdkSrc || clientId);

  if (wrap) wrap.style.display = configured ? '' : 'none';

  const link = $('paypalFallbackLink');
  if (link && !link.dataset.wired) {
    link.dataset.wired = '1';
    link.addEventListener('click', (e) => {
      if (!requireCheckoutConsent()) {
        e.preventDefault();
      }
    });
  }

  const checkbox = $('checkoutConsent');
  if (checkbox && !checkbox.dataset.paypalWired) {
    checkbox.dataset.paypalWired = '1';
    checkbox.addEventListener('change', updatePayPalGate);
  }

  updatePayPalGate();
}

function renderCard(svc) {
  const title = svc.title ? esc(svc.title) : esc(svc.sku || 'Plan');
  const desc = svc.desc ? esc(svc.desc) : '';
  const rawTitle = String(svc.title || '').trim();
  const isFeatured = Boolean(svc._isFeatured);
  const isA1A2 = Boolean(svc._isA1A2);
  const isHablemosAmor = /e-?book\s+hablemos\s+del\s+amor/i.test(rawTitle);
  const rawBadge = String(svc.badge || '').trim();
  const badgeText = rawBadge
    ? esc(
        rawBadge.toLowerCase() === 'super promo'
          ? '¡Más chévre!'
          : rawBadge.toLowerCase() === 'más popular'
            ? 'Bacano 🙂'
            : rawBadge.toLowerCase() === 'popular'
              ? '¡Más chévre!'
              : rawBadge,
      )
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
    const planId = String(svc.sku || svc.id || '').trim();
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
    <div class="card services-card${isFeatured ? ' services-card--featured' : ''}${isA1A2 ? ' services-card--a1a2' : ''}${isHablemosAmor ? ' services-card--amor' : ''}">
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
      consulta: 'servicios',
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

        if (!requireCheckoutConsent()) return;

        try {
          btn.disabled = true;
          btn.textContent = 'Redirigiendo…';
          await startCheckout(planId);
        } catch (e) {
          console.error('[services checkout]', e);
          const msg = String(e?.message || '').trim();
          btn.disabled = false;
          btn.textContent = 'Intentar otra vez';
          alert(
            msg
              ? 'No se pudo iniciar el checkout. ' + msg
              : 'No se pudo iniciar el checkout. Inténtalo de nuevo.',
          );
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

  // Optional: PayPal hosted button (render only after consent is checked)
  initPayPal();
}

init();

