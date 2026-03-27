let paypalSdkPromise = null;

function ensureNodeId(node, prefix = 'paypal-hosted-') {
  if (node.id) return node.id;
  const id = `${prefix}${Math.random().toString(36).slice(2, 10)}`;
  node.id = id;
  return id;
}

function buildSdkSrc({ sdkSrc, clientId, currency, disableFunding }) {
  const explicit = String(sdkSrc || '').trim();
  if (explicit) return explicit;

  const id = String(clientId || '').trim();
  if (!id) return '';

  const params = new URLSearchParams();
  params.set('client-id', id);
  params.set('components', 'hosted-buttons');
  params.set('currency', String(currency || 'PLN').trim() || 'PLN');

  const funding = String(disableFunding || '').trim();
  if (funding) params.set('disable-funding', funding);

  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function loadSdkOnce(src) {
  if (window.paypal?.HostedButtons) return Promise.resolve();
  if (paypalSdkPromise) return paypalSdkPromise;
  if (!src) return Promise.reject(new Error('Missing PayPal SDK src.'));

  paypalSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paypal-sdk="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('PayPal SDK failed to load.')),
        { once: true },
      );
      return;
    }

    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.paypalSdk = '1';
    s.addEventListener('load', () => resolve(), { once: true });
    s.addEventListener(
      'error',
      () => reject(new Error('PayPal SDK failed to load.')),
      { once: true },
    );
    document.head.appendChild(s);
  });

  return paypalSdkPromise;
}

export async function renderPayPalHostedButtons(options = {}) {
  const sdkSrc = buildSdkSrc(options);
  await loadSdkOnce(sdkSrc);

  if (!window.paypal?.HostedButtons) {
    throw new Error('PayPal HostedButtons unavailable.');
  }

  const targets = Array.from(
    document.querySelectorAll('[data-paypal-hosted-button-id]'),
  );
  const rendered = [];

  for (const node of targets) {
    const hostedButtonId = String(
      node.getAttribute('data-paypal-hosted-button-id') || '',
    ).trim();
    if (!hostedButtonId) continue;

    if (node.dataset.paypalRendered === '1') {
      rendered.push(hostedButtonId);
      continue;
    }

    const nodeId = ensureNodeId(node);
    await window.paypal
      .HostedButtons({ hostedButtonId })
      .render(`#${nodeId}`);

    node.dataset.paypalRendered = '1';
    rendered.push(hostedButtonId);
  }

  return rendered;
}

