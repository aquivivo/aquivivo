const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();

// Secrets set via:
// firebase.cmd functions:config:set stripe.secret="sk_..." stripe.webhook="whsec_..."
// or env vars: STRIPE_SECRET / STRIPE_WEBHOOK_SECRET
function getStripeSecret() {
  return functions.config().stripe?.secret || process.env.STRIPE_SECRET || '';
}

function getStripeWebhookSecret() {
  return (
    functions.config().stripe?.webhook ||
    process.env.STRIPE_WEBHOOK_SECRET ||
    ''
  );
}

function getBaseUrl() {
  return functions.config().app?.base_url || process.env.BASE_URL || '';
}

// ⏱️ czas dostępu (dni)
const PLAN_TO_DAYS = {
  premium_a1: 90,
  premium_b1: 90,
  premium_b2: 90,
  'vip a1 + a2 + b1': 90,
  'vip a1 + a2 + b1 + b2': 90,
};

// 🔓 levele odblokowane przez plan
const PLAN_TO_LEVELS = {
  premium_a1: ['A1', 'A2'],
  premium_b1: ['B1'],
  premium_b2: ['B2'],
  'vip a1 + a2 + b1': ['A1', 'A2', 'B1'],
  'vip a1 + a2 + b1 + b2': ['A1', 'A2', 'B1', 'B2'],
};

function normalizePlan(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ');
}

function parseAccessDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeAccessLevels(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v || '').trim().toUpperCase())
      .filter((v) => ['A1', 'A2', 'B1', 'B2'].includes(v));
  }
  const str = String(raw || '').trim();
  if (!str) return [];
  const parts = str.replace(/\+/g, ' ').split(/[,\s]+/).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const up = String(p).trim().toUpperCase();
    if (['A1', 'A2', 'B1', 'B2'].includes(up)) out.push(up);
  }
  return [...new Set(out)];
}

async function getPriceFromServices(planIdRaw) {
  const planKey = normalizePlan(planIdRaw);
  if (!planIdRaw && !planKey) return null;

  let snap = await db
    .collection('services')
    .where('skuLower', '==', planKey)
    .limit(1)
    .get();

  if (snap.empty && planIdRaw) {
    snap = await db
      .collection('services')
      .where('sku', '==', planIdRaw)
      .limit(1)
      .get();
  }

  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() || {};
  const accessDays = parseAccessDays(data.accessDays);
  const accessLevels = normalizeAccessLevels(data.accessLevels);
  return {
    priceId: data.stripePriceId || data.priceId || '',
    active: data.active !== false,
    sku: data.sku || planIdRaw,
    id: doc.id,
    planKey,
    accessDays,
    accessLevels,
  };
}

async function getServiceById(serviceId) {
  if (!serviceId) return null;
  const snap = await db.doc(`services/${serviceId}`).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    id: snap.id,
    sku: data.sku || snap.id,
    planKey: normalizePlan(data.sku || snap.id),
    active: data.active !== false,
    accessDays: parseAccessDays(data.accessDays),
    accessLevels: normalizeAccessLevels(data.accessLevels),
  };
}

function computeNextUntil(existingTs, days) {
  const now = new Date();
  let base = now;

  if (existingTs?.toDate) {
    const current = existingTs.toDate();
    if (current > now) base = current;
  }

  return admin.firestore.Timestamp.fromDate(
    new Date(base.getTime() + Number(days) * 24 * 60 * 60 * 1000),
  );
}

// 1️⃣ START CHECKOUT (callable)
exports.createCheckoutSession = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Zaloguj się.');
    }

    const STRIPE_SECRET = getStripeSecret();
    if (!STRIPE_SECRET) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Brak stripe.secret w config.',
      );
    }

    const uid = context.auth.uid;
    const planIdRaw = String(data?.planId || '').trim();
    if (!planIdRaw) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Brak planId.',
      );
    }

    const service = await getPriceFromServices(planIdRaw);
    const priceId = service?.priceId;
    if (!priceId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Brak stripePriceId w services dla SKU: ${planIdRaw}`,
      );
    }
    if (service?.active === false) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Plan jest nieaktywny.',
      );
    }

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const origin = String(data?.origin || '').trim();
    const configuredBaseUrl = getBaseUrl().trim();
    const baseUrl = configuredBaseUrl || origin;
    const safeBaseUrl = baseUrl.replace(/\/+$/, '');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${safeBaseUrl}/services.html?success=1`,
      cancel_url: `${safeBaseUrl}/services.html?canceled=1`,
      client_reference_id: uid,
      metadata: {
        uid,
        planId: service?.planKey || normalizePlan(planIdRaw),
        planSku: planIdRaw,
        serviceId: service?.id || '',
      },
      allow_promotion_codes: true,
    });

    return { url: session.url };
  },
);

// 2️⃣ WEBHOOK STRIPE → FIRESTORE
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).send('Missing stripe-signature');

    const STRIPE_SECRET = getStripeSecret();
    const STRIPE_WEBHOOK_SECRET = getStripeWebhookSecret();
    if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
      return res.status(500).send('Stripe not configured');
    }

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const uid = session.metadata?.uid || session.client_reference_id;
      const planSku = session.metadata?.planSku || session.metadata?.planId;
      const planId = normalizePlan(planSku);
      const serviceId = session.metadata?.serviceId;

      let service = null;
      if (serviceId) service = await getServiceById(serviceId);
      if (!service && planSku) service = await getPriceFromServices(planSku);

      const levels =
        service?.accessLevels?.length
          ? service.accessLevels
          : PLAN_TO_LEVELS[planId] || [];
      const days = service?.accessDays || PLAN_TO_DAYS[planId];

      if (uid && days) {
        const userRef = db.doc(`users/${uid}`);

        await db.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const user = snap.exists ? snap.data() || {} : {};
          const nextUntil = computeNextUntil(user.accessUntil, days);

          tx.set(
            userRef,
            {
              plan: planId,
              levels,
              access: true,
              blocked: false,
              accessUntil: nextUntil,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastPaymentProvider: 'stripe',
              lastStripeSessionId: session.id,
            },
            { merge: true },
          );
        });
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('stripeWebhook error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
