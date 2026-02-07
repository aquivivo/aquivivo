// assets/js/paypal-hosted-buttons.js
// Lightweight helper for PayPal "Hosted Buttons".

let sdkPromise = null;

function buildSdkUrl({ clientId, currency, disableFunding }) {
  const params = new URLSearchParams();
  params.set('client-id', String(clientId || '').trim());
  params.set('components', 'hosted-buttons');
  if (disableFunding) params.set('disable-funding', String(disableFunding));
  if (currency) params.set('currency', String(currency));
  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function safeId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

export function ensurePayPalHostedButtonsSdk({
  clientId,
  currency = 'PLN',
  disableFunding = 'venmo',
} = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PayPal SDK can only run in the browser.'));
  }
  const cleanedClientId = String(clientId || '').trim();
  if (!cleanedClientId) {
    return Promise.reject(new Error('Missing PayPal clientId.'));
  }

  if (window.paypal?.HostedButtons) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paypal-hosted-sdk="1"]');
    if (existing) {
      const done = () => resolve(window.paypal);
      if (window.paypal?.HostedButtons) return done();
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load PayPal SDK.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = buildSdkUrl({
      clientId: cleanedClientId,
      currency,
      disableFunding,
    });
    script.async = true;
    script.dataset.paypalHostedSdk = '1';
    script.addEventListener('load', () => resolve(window.paypal), { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load PayPal SDK.')),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export async function renderPayPalHostedButtons({
  clientId,
  currency = 'PLN',
  disableFunding = 'venmo',
  selector = '[data-paypal-hosted-button-id]',
} = {}) {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!nodes.length) return;

  const paypal = await ensurePayPalHostedButtonsSdk({
    clientId,
    currency,
    disableFunding,
  });
  if (!paypal?.HostedButtons) {
    throw new Error('PayPal HostedButtons is not available.');
  }

  for (const el of nodes) {
    if (!el || el.dataset.paypalRendered === '1') continue;
    const hostedButtonId = String(el.dataset.paypalHostedButtonId || '').trim();
    if (!hostedButtonId) continue;

    el.dataset.paypalRendered = '1';

    try {
      if (!el.id) el.id = `paypal-container-${safeId(hostedButtonId) || 'btn'}`;
      await paypal.HostedButtons({ hostedButtonId }).render(`#${el.id}`);
    } catch (e) {
      console.warn('[paypal] HostedButtons render failed', e);
      el.dataset.paypalRendered = '0';
      if (!String(el.textContent || '').trim()) {
        el.innerHTML =
          '<div class="hintSmall">No se pudo cargar PayPal. Intenta recargar.</div>';
      }
    }
  }
}

