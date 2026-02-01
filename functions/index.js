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

// ✅ MAPOWANIE PLAN → PRICE (STRIPE)
const PLAN_TO_PRICE = {
  premium_a1: 'price_1Sw0GZCI9cIUEmOtoPWavC9x',
};

// ⏱️ czas dostępu (dni)
const PLAN_TO_DAYS = {
  premium_a1: 90,
};

// 🔓 levele odblokowane przez plan
const PLAN_TO_LEVELS = {
  premium_a1: ['A1', 'A2'],
};

function normalizePlan(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase();
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
    const planId = normalizePlan(data?.planId);
    const priceId = PLAN_TO_PRICE[planId];

    if (!priceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Nieznany plan.',
      );
    }

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' });
    const origin = String(data?.origin || '').trim();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/services.html?success=1`,
      cancel_url: `${origin}/services.html?canceled=1`,
      client_reference_id: uid,
      metadata: { uid, planId },
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
      const planId = normalizePlan(session.metadata?.planId);

      const levels = PLAN_TO_LEVELS[planId];
      const days = PLAN_TO_DAYS[planId];

      if (uid && levels && days) {
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
