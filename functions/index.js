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

// Fallback price IDs (Stripe) – used when services doc is missing stripePriceId.
const PLAN_TO_PRICE_ID = {
  premium_a1: 'price_1Sw2t5CI9cIUEmOtYvVwzq30',
  premium_b1: 'price_1Sw2rUCI9cIUEmOtj7nhkJFQ',
  premium_b2: 'price_1Sw2xqCI9cIUEmOtEDsrRvid',
  'vip a1 + a2 + b1': 'price_1Sw2yvCI9cIUEmOtwTCkpP4e',
  'vip a1 + a2 + b1 + b2': 'price_1Sw2zoCI9cIUEmOtSeTp1AjZ',
  'tarjeta de residencia': 'price_1Sw310CI9cIUEmOtCYMhSLHa',
};

function normalizePlan(planId) {
  return String(planId || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ');
}

function canonicalPlanKey(planId) {
  const key = normalizePlan(planId);
  if (!key) return key;
  const has = (token) => key.includes(token);
  if (has('premium') && has('a1') && has('a2')) return 'premium_a1';
  if (has('premium') && has('b1')) return 'premium_b1';
  if (has('premium') && has('b2')) return 'premium_b2';
  if (has('vip') && has('a1') && has('a2') && has('b1') && has('b2'))
    return 'vip a1 + a2 + b1 + b2';
  if (has('vip') && has('a1') && has('a2') && has('b1'))
    return 'vip a1 + a2 + b1';
  if (has('tarjeta') && has('residencia')) return 'tarjeta de residencia';
  if (has('plan premium a1 + a2')) return 'premium_a1';
  return key;
}

function isStripeMissingPrice(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === 'resource_missing' || msg.includes('no such price');
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
  const planKey = canonicalPlanKey(planIdRaw);
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

  let doc = null;
  let data = null;
  if (!snap.empty) {
    doc = snap.docs[0];
    data = doc.data() || {};
  } else if (planIdRaw) {
    const byId = await db.doc(`services/${planIdRaw}`).get();
    if (byId.exists) {
      doc = byId;
      data = byId.data() || {};
    }
  }

  if (!doc) return null;
  const accessDays = parseAccessDays(data.accessDays);
  const accessLevels = normalizeAccessLevels(data.accessLevels);
  let priceId = data.stripePriceId || data.priceId || '';
  if (!priceId) {
    const docKey = canonicalPlanKey(data.sku || doc.id);
    const fallback = PLAN_TO_PRICE_ID[planKey] || PLAN_TO_PRICE_ID[docKey];
    if (fallback) {
      priceId = fallback;
      try {
        await doc.ref.set(
          {
            stripePriceId: fallback,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (e) {
        console.warn('[services] Failed to backfill stripePriceId', e);
      }
    }
  }
  return {
    priceId,
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
    planKey: canonicalPlanKey(data.sku || snap.id),
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
/* =======================
   NOTIFICATIONS (in-app + push)
   Collection: user_notifications/{uid}/items/{id}
   ======================= */

function normalizeLang(lang) {
  const l = String(lang || '').trim().toLowerCase();
  if (l.startsWith('pl')) return 'pl';
  if (l.startsWith('en')) return 'en';
  return 'es';
}

function tsToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return null;
}

function isoDate(ts) {
  const d = tsToDate(ts);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatAmount(amountTotal, currency) {
  const n = Number(amountTotal);
  const cur = String(currency || '').toUpperCase();
  if (!Number.isFinite(n)) return '';
  const value = (n / 100).toFixed(2);
  return cur ? `${value} ${cur}` : value;
}

function textFor(lang, key, vars = {}) {
  const l = normalizeLang(lang);
  const t = (map) => map[l] || map.es;

  if (key === 'payment_user') {
    const plan = String(vars.plan || '').trim();
    const until = String(vars.until || '').trim();
    return {
      title: t({
        pl: 'Platnosc przyjeta',
        es: 'Pago confirmado',
        en: 'Payment confirmed',
      }),
      body: t({
        pl: until
          ? `Dziekujemy! Dostep aktywny do ${until}.${plan ? ` Plan: ${plan}.` : ''}`
          : `Dziekujemy! Dostep zostal aktywowany.${plan ? ` Plan: ${plan}.` : ''}`,
        es: until
          ? `Gracias. Tu acceso esta activo hasta ${until}.${plan ? ` Plan: ${plan}.` : ''}`
          : `Gracias. Tu acceso fue activado.${plan ? ` Plan: ${plan}.` : ''}`,
        en: until
          ? `Thanks. Your access is active until ${until}.${plan ? ` Plan: ${plan}.` : ''}`
          : `Thanks. Your access was activated.${plan ? ` Plan: ${plan}.` : ''}`,
      }),
    };
  }

  if (key === 'payment_admin') {
    const who = String(vars.who || '').trim();
    const plan = String(vars.plan || '').trim();
    const amount = String(vars.amount || '').trim();
    return {
      title: t({ pl: 'Nowy zakup', es: 'Nueva compra', en: 'New purchase' }),
      body: t({
        pl: `${who || 'Uzytkownik'} wykupil${plan ? `: ${plan}` : ''}${amount ? ` (${amount})` : ''}.`,
        es: `${who || 'Usuario'} compro${plan ? `: ${plan}` : ''}${amount ? ` (${amount})` : ''}.`,
        en: `${who || 'User'} purchased${plan ? `: ${plan}` : ''}${amount ? ` (${amount})` : ''}.`,
      }),
    };
  }

  if (key === 'access_user') {
    const until = String(vars.until || '').trim();
    const levels = String(vars.levels || '').trim();
    return {
      title: t({ pl: 'Dostep aktywny', es: 'Acceso activo', en: 'Access active' }),
      body: t({
        pl: until
          ? `Twoj dostep jest aktywny do ${until}.${levels ? ` Poziomy: ${levels}.` : ''}`
          : `Twoj dostep zostal aktywowany.${levels ? ` Poziomy: ${levels}.` : ''}`,
        es: until
          ? `Tu acceso esta activo hasta ${until}.${levels ? ` Niveles: ${levels}.` : ''}`
          : `Tu acceso fue activado.${levels ? ` Niveles: ${levels}.` : ''}`,
        en: until
          ? `Your access is active until ${until}.${levels ? ` Levels: ${levels}.` : ''}`
          : `Your access was activated.${levels ? ` Levels: ${levels}.` : ''}`,
      }),
    };
  }

  if (key === 'access_admin') {
    const who = String(vars.who || '').trim();
    const until = String(vars.until || '').trim();
    const levels = String(vars.levels || '').trim();
    const plan = String(vars.plan || '').trim();
    return {
      title: t({ pl: 'Przyznano dostep', es: 'Acceso otorgado', en: 'Access granted' }),
      body: t({
        pl: `${who || 'Uzytkownik'} ma dostep${until ? ` do ${until}` : ''}${
          plan ? ` (plan: ${plan})` : ''
        }${levels ? ` [${levels}]` : ''}.`,
        es: `${who || 'Usuario'} tiene acceso${until ? ` hasta ${until}` : ''}${
          plan ? ` (plan: ${plan})` : ''
        }${levels ? ` [${levels}]` : ''}.`,
        en: `${who || 'User'} has access${until ? ` until ${until}` : ''}${
          plan ? ` (plan: ${plan})` : ''
        }${levels ? ` [${levels}]` : ''}.`,
      }),
    };
  }

  if (key === 'friend_invite') {
    const from = String(vars.from || '').trim();
    return {
      title: t({ pl: 'Nowe zaproszenie', es: 'Nueva invitacion', en: 'New invitation' }),
      body: t({
        pl: from ? `Zaproszenie od ${from}.` : 'Masz nowe zaproszenie.',
        es: from ? `Invitacion de ${from}.` : 'Tienes una nueva invitacion.',
        en: from ? `Invitation from ${from}.` : 'You have a new invitation.',
      }),
    };
  }

  if (key === 'friend_accepted') {
    const who = String(vars.who || '').trim();
    return {
      title: t({
        pl: 'Zaproszenie zaakceptowane',
        es: 'Invitacion aceptada',
        en: 'Invitation accepted',
      }),
      body: t({
        pl: who
          ? `${who} zaakceptowal(-a) Twoje zaproszenie.`
          : 'Twoje zaproszenie zostalo zaakceptowane.',
        es: who ? `${who} acepto tu invitacion.` : 'Tu invitacion fue aceptada.',
        en: who
          ? `${who} accepted your invitation.`
          : 'Your invitation was accepted.',
      }),
    };
  }

  if (key === 'correction_comment') {
    const who = String(vars.who || '').trim();
    return {
      title: t({ pl: 'Nowa korekta', es: 'Nueva correccion', en: 'New correction' }),
      body: t({
        pl: who
          ? `${who} skomentowal(-a) Twoja prosbe o korekte.`
          : 'Ktos skomentowal Twoja prosbe o korekte.',
        es: who
          ? `${who} comento tu solicitud de correccion.`
          : 'Tienes una nueva correccion.',
        en: who
          ? `${who} commented on your correction request.`
          : 'You have a new correction.',
      }),
    };
  }

  return { title: 'Notificacion', body: '' };
}

function isAlreadyExistsError(err) {
  const code = err?.code;
  const msg = String(err?.message || '').toLowerCase();
  return code === 6 || code === 'already-exists' || msg.includes('already exists');
}

async function createUserNotification(uid, id, payload) {
  if (!uid || !id) return null;
  const ref = db.doc(`user_notifications/${uid}/items/${id}`);
  const docPayload = {
    title: String(payload?.title || '').trim() || 'Notificacion',
    body: String(payload?.body || '').trim(),
    type: String(payload?.type || '').trim(),
    link: payload?.link ? String(payload.link) : '',
    data: payload?.data && typeof payload.data === 'object' ? payload.data : {},
    read: payload?.read === true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await ref.create(docPayload);
  } catch (e) {
    if (isAlreadyExistsError(e)) return null;
    throw e;
  }
  return null;
}

async function sendPushToUser(uid, title, body, data = {}) {
  if (!uid) return null;

  try {
    const settingsSnap = await db.doc(`user_settings/${uid}`).get();
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    if (settings.pushEnabled === false) return null;
  } catch (e) {
    console.warn('[push] settings read failed', e);
  }

  let tokens = [];
  try {
    const snap = await db
      .collection('user_push_tokens')
      .doc(uid)
      .collection('tokens')
      .get();
    tokens = snap.docs.map((d) => d.id).filter(Boolean);
  } catch (e) {
    console.warn('[push] tokens read failed', e);
    return null;
  }
  if (!tokens.length) return null;

  const safeData = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    safeData[String(k)] = String(v);
  });

  try {
    const resp = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: safeData,
    });

    const invalid = [];
    resp.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalid.push(tokens[idx]);
      }
    });
    if (invalid.length) {
      await Promise.all(
        invalid.map((t) =>
          db
            .collection('user_push_tokens')
            .doc(uid)
            .collection('tokens')
            .doc(t)
            .delete()
            .catch(() => null),
        ),
      );
    }
  } catch (e) {
    console.warn('[push] send failed', e);
  }

  return null;
}

let ADMIN_UIDS_CACHE = { uids: [], fetchedAt: 0 };
async function getAdminUids() {
  const now = Date.now();
  if (
    ADMIN_UIDS_CACHE.uids.length &&
    now - ADMIN_UIDS_CACHE.fetchedAt < 5 * 60 * 1000
  ) {
    return ADMIN_UIDS_CACHE.uids;
  }

  const uids = new Set();
  try {
    const [byAdmin, byRole, byEmail] = await Promise.all([
      db.collection('users').where('admin', '==', true).get(),
      db.collection('users').where('role', '==', 'admin').get(),
      db.collection('users')
        .where('emailLower', '==', 'aquivivo.pl@gmail.com')
        .limit(1)
        .get(),
    ]);
    byAdmin.forEach((d) => uids.add(d.id));
    byRole.forEach((d) => uids.add(d.id));
    byEmail.forEach((d) => uids.add(d.id));
  } catch (e) {
    console.warn('[admins] lookup failed', e);
  }

  ADMIN_UIDS_CACHE = { uids: [...uids].filter(Boolean), fetchedAt: now };
  return ADMIN_UIDS_CACHE.uids;
}

// Notifications: broadcast from admin -> fanout to user_notifications/{uid}/items
exports.onBroadcastCreated = functions.firestore
  .document('broadcasts/{broadcastId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    const broadcastId = String(context.params.broadcastId || '').trim();
    const title = String(data.title || '').trim() || 'Mensaje del equipo';
    const body = String(data.body || data.message || '').trim();
    const link = String(data.link || 'mensajes.html').trim();
    const createdByUid = String(data.createdByUid || '').trim();

    if (!broadcastId || !body) return null;

    let usersSnap = null;
    try {
      usersSnap = await db.collection('users').get();
    } catch (e) {
      console.warn('[broadcast] users read failed', e);
      return null;
    }

    const payload = {
      title,
      body,
      type: 'broadcast',
      link,
      data: {
        broadcastId,
      },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const notifId = `broadcast_${broadcastId}`;
    let batch = db.batch();
    let ops = 0;
    let sent = 0;

    const commitBatch = async () => {
      if (!ops) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    for (const d of usersSnap.docs) {
      const uid = String(d.id || '').trim();
      if (!uid) continue;
      if (createdByUid && uid === createdByUid) continue;
      const user = d.data() || {};
      if (user.blocked === true) continue;

      const ref = db.doc(`user_notifications/${uid}/items/${notifId}`);
      batch.set(ref, payload, { merge: true });
      ops += 1;
      sent += 1;

      if (ops >= 400) {
        await commitBatch();
      }
    }

    await commitBatch();
    console.log(`[broadcast] fanout done: ${sent} users, id=${broadcastId}`);
    return null;
  });

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

    const attemptRef = db.collection('payment_attempts').doc();
    const attemptData = {
      uid,
      planId: service?.planKey || canonicalPlanKey(planIdRaw),
      planSku: planIdRaw,
      serviceId: service?.id || '',
      priceId,
      origin: origin || '',
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await attemptRef.set(attemptData, { merge: true });

    let session;
    let usedPriceId = priceId;
    const planKey = service?.planKey || canonicalPlanKey(planIdRaw);
    const fallbackPriceId = PLAN_TO_PRICE_ID[planKey] || '';

    const createSession = async (stripePriceId) =>
      stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: `${safeBaseUrl}/services.html?success=1`,
        cancel_url: `${safeBaseUrl}/services.html?canceled=1`,
        client_reference_id: uid,
        metadata: {
          uid,
          planId: planKey,
          planSku: planIdRaw,
          serviceId: service?.id || '',
          attemptId: attemptRef.id,
        },
        allow_promotion_codes: true,
      });

    try {
      session = await createSession(usedPriceId);
    } catch (err) {
      if (
        isStripeMissingPrice(err) &&
        fallbackPriceId &&
        fallbackPriceId !== usedPriceId
      ) {
        try {
          usedPriceId = fallbackPriceId;
          session = await createSession(usedPriceId);
          if (service?.id) {
            await db
              .doc(`services/${service.id}`)
              .set(
                { stripePriceId: usedPriceId, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true },
              );
          }
        } catch (err2) {
          err = err2;
        }
      }
      if (!session) {
        await attemptRef.set(
          {
            status: 'failed',
            error: err?.message || String(err),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        const msg = isStripeMissingPrice(err)
          ? `No such price: ${usedPriceId}. Sprawdz, czy Stripe secret jest w tym samym trybie (test/live) co ten price.`
          : err?.message || 'Stripe error';
        throw new functions.https.HttpsError('failed-precondition', msg);
      }
    }

    await attemptRef.set(
      {
        status: 'pending',
        stripeSessionId: session.id,
        priceId: usedPriceId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

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
      const planId = canonicalPlanKey(planSku);
      const serviceId = session.metadata?.serviceId;
      const attemptId = session.metadata?.attemptId;

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

      const paymentStatus =
        session.payment_status === 'paid' ? 'succeeded' : session.payment_status || 'succeeded';
      const paymentRef = db.doc(`payments/${session.id}`);
      await paymentRef.set(
        {
          uid: uid || '',
          email: session.customer_details?.email || session.customer_email || '',
          planId,
          planSku: planSku || '',
          serviceId: serviceId || '',
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent || '',
          amountTotal: session.amount_total ?? null,
          currency: session.currency || '',
          status: paymentStatus,
          stripeCreatedAt:
            session.created != null
              ? admin.firestore.Timestamp.fromMillis(Number(session.created) * 1000)
              : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      if (attemptId) {
        await db.doc(`payment_attempts/${attemptId}`).set(
          {
            status: paymentStatus,
            stripeSessionId: session.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object;
      const attemptId = session.metadata?.attemptId;
      if (attemptId) {
        await db.doc(`payment_attempts/${attemptId}`).set(
          {
            status: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
            stripeSessionId: session.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('stripeWebhook error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Sync email index for chat search
exports.syncEmailIndex = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() || {} : null;
    const before = change.before.exists ? change.before.data() || {} : null;
    const uid = context.params.uid;

    const beforeEmail = String(before?.email || '').trim().toLowerCase();
    const afterEmail = String(after?.email || '').trim().toLowerCase();

    if (!after) {
      if (beforeEmail) {
        await db.doc(`email_index/${beforeEmail}`).delete().catch(() => null);
      }
      return null;
    }

    if (!afterEmail) return null;

    if (beforeEmail && beforeEmail !== afterEmail) {
      await db.doc(`email_index/${beforeEmail}`).delete().catch(() => null);
    }

    const displayName = String(
      after.displayName || after.name || after.email || '',
    ).trim();
    const payload = {
      uid,
      emailLower: afterEmail,
      handle: String(after.handle || '').trim(),
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.doc(`email_index/${afterEmail}`).set(payload, { merge: true });
    return null;
  });

// Push notifications for chat messages
exports.onConversationMessage = functions.firestore
  .document('conversations/{convId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data() || {};
    const convId = context.params.convId;
    const convSnap = await db.doc(`conversations/${convId}`).get();
    if (!convSnap.exists) return null;

    const conv = convSnap.data() || {};
    const participants = Array.isArray(conv.participants) ? conv.participants : [];
    const senderId = String(msg.senderId || '');
    const recipients = participants.filter((uid) => uid && uid !== senderId);
    if (!recipients.length) return null;

    const settingsSnaps = await Promise.all(
      recipients.map((uid) => db.doc(`user_settings/${uid}`).get()),
    );
    const convSettingSnaps = await Promise.all(
      recipients.map((uid) => db.doc(`users/${uid}/conversations/${convId}`).get()),
    );
    const filtered = recipients.filter((uid, idx) => {
      const settings = settingsSnaps[idx].exists ? settingsSnaps[idx].data() || {} : {};
      const convSettings = convSettingSnaps[idx].exists ? convSettingSnaps[idx].data() || {} : {};
      if (settings.pushEnabled === false) return false;
      if (convSettings.muted === true) return false;
      return true;
    });
    if (!filtered.length) return null;

    const tokenSnaps = await Promise.all(
      filtered.map((uid) =>
        db.collection('user_push_tokens').doc(uid).collection('tokens').get(),
      ),
    );
    const tokens = [];
    tokenSnaps.forEach((s) => {
      s.forEach((doc) => tokens.push(doc.id));
    });
    if (!tokens.length) return null;

    const title =
      conv.title ||
      (conv.type === 'support' ? 'Soporte' : conv.type === 'group' ? 'Grupo' : 'Nuevo mensaje');
    const body = msg.text || 'Adjunto';

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { convId },
    });

    return null;
  });

// Notifications: payments (Stripe webhook creates payments/{sessionId})
exports.onPaymentCreated = functions.firestore
  .document('payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const pay = snap.data() || {};
    const status = String(pay.status || '').toLowerCase();
    if (status && status !== 'succeeded' && status !== 'paid') return null;

    const paymentId = context.params.paymentId;
    const uid = String(pay.uid || '').trim();
    const email = String(pay.email || '').trim();
    const plan = String(pay.planSku || pay.planId || '').trim();
    const amount = formatAmount(pay.amountTotal, pay.currency);

    const adminUids = await getAdminUids();
    await Promise.all(
      adminUids.map(async (adminUid) => {
        let adminLang = 'pl';
        try {
          const aSnap = await db.doc(`users/${adminUid}`).get();
          if (aSnap.exists) adminLang = normalizeLang(aSnap.data()?.lang);
        } catch {}
        const { title, body } = textFor(adminLang, 'payment_admin', {
          who: email || uid,
          plan,
          amount,
        });
        await createUserNotification(adminUid, `admin_pay_${paymentId}`, {
          type: 'payment',
          title,
          body,
          data: { paymentId, uid, plan, amount },
          link: 'esadmin.html#pagos',
        });
        await sendPushToUser(adminUid, title, body, { kind: 'payment', paymentId });
      }),
    );

    if (uid) {
      let userLang = 'es';
      let until = '';
      let levels = '';
      try {
        const uSnap = await db.doc(`users/${uid}`).get();
        const u = uSnap.exists ? uSnap.data() || {} : {};
        userLang = normalizeLang(u.lang);
        until = isoDate(u.accessUntil);
        levels = Array.isArray(u.levels) ? u.levels.join(', ') : '';
      } catch {}
      const { title, body } = textFor(userLang, 'payment_user', { plan, until, levels });
      await createUserNotification(uid, `pay_${paymentId}`, {
        type: 'payment',
        title,
        body,
        data: { paymentId, plan, amount },
        link: 'pagos.html',
      });
      await sendPushToUser(uid, title, body, { kind: 'payment', paymentId });
    }

    return null;
  });

// Notifications: manual access changes (trial/admin grant/etc)
exports.onUserAccessUpdated = functions.firestore
  .document('users/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const uid = context.params.uid;

    const stripeSessionBefore = String(before.lastStripeSessionId || '').trim();
    const stripeSessionAfter = String(after.lastStripeSessionId || '').trim();
    const stripeProviderAfter = String(after.lastPaymentProvider || '')
      .trim()
      .toLowerCase();
    const isStripePurchaseUpdate =
      stripeProviderAfter === 'stripe' &&
      stripeSessionAfter &&
      stripeSessionAfter !== stripeSessionBefore;

    const now = Date.now();
    const beforeUntil = tsToDate(before.accessUntil)?.getTime() || 0;
    const afterUntil = tsToDate(after.accessUntil)?.getTime() || 0;
    const beforeActive = before.access === true || beforeUntil > now;
    const afterActive = after.access === true || afterUntil > now;

    const planBefore = String(before.plan || '').trim();
    const planAfter = String(after.plan || '').trim();

    const beforeLevels = Array.isArray(before.levels)
      ? before.levels.map(String)
      : [];
    const afterLevels = Array.isArray(after.levels) ? after.levels.map(String) : [];
    const beforeSet = new Set(beforeLevels.map((v) => v.toUpperCase()));
    const afterSet = new Set(afterLevels.map((v) => v.toUpperCase()));
    const addedLevels = [...afterSet].filter((v) => !beforeSet.has(v)).sort();

    const gainedAccess = !beforeActive && afterActive;
    const extendedAccess =
      beforeActive &&
      afterActive &&
      afterUntil &&
      (!beforeUntil || afterUntil - beforeUntil >= 6 * 60 * 60 * 1000);

    // Skip access notification if the same change comes from Stripe (handled by onPaymentCreated)
    if (isStripePurchaseUpdate) return null;
    if (!gainedAccess && !extendedAccess && !addedLevels.length && planAfter === planBefore) {
      return null;
    }

    const untilStr =
      afterUntil > now ? new Date(afterUntil).toISOString().slice(0, 10) : '';
    const levelsStr = afterLevels.length ? afterLevels.join(', ') : '';

    // User notification
    const userLang = normalizeLang(after.lang);
    const { title: uTitle, body: uBody } = textFor(userLang, 'access_user', {
      until: untilStr,
      levels: levelsStr,
    });
    const notifId = `access_${context.eventId}`;
    await createUserNotification(uid, notifId, {
      type: 'access',
      title: uTitle,
      body: uBody,
      data: { uid, until: untilStr, levels: afterLevels, plan: planAfter },
      link: 'services.html',
    });
    await sendPushToUser(uid, uTitle, uBody, { kind: 'access', uid });

    // Admin notification
    const adminUids = await getAdminUids();
    const who = String(after.email || after.emailLower || uid).trim();
    await Promise.all(
      adminUids.map(async (adminUid) => {
        let adminLang = 'pl';
        try {
          const aSnap = await db.doc(`users/${adminUid}`).get();
          if (aSnap.exists) adminLang = normalizeLang(aSnap.data()?.lang);
        } catch {}
        const { title, body } = textFor(adminLang, 'access_admin', {
          who,
          until: untilStr,
          levels: levelsStr,
          plan: planAfter,
        });
        await createUserNotification(adminUid, notifId, {
          type: 'access',
          title,
          body,
          data: { uid, who, until: untilStr, levels: afterLevels, plan: planAfter },
          link: `esadmin.html#users?uid=${encodeURIComponent(uid)}`,
        });
        await sendPushToUser(adminUid, title, body, { kind: 'access', uid });
      }),
    );

    return null;
  });

// Notifications: friend invitations
exports.onFriendRequestWrite = functions.firestore
  .document('friend_requests/{id}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() || {} : null;
    const after = change.after.exists ? change.after.data() || {} : null;
    if (!after) return null;

    const statusAfter = String(after.status || '').toLowerCase();
    const statusBefore = String(before?.status || '').toLowerCase();
    if (statusAfter === statusBefore) return null;

    const fromUid = String(after.fromUid || '').trim();
    const toUid = String(after.toUid || '').trim();
    const requestId = String(context.params?.id || '').trim();
    if (!fromUid || !toUid) return null;

    let fromLabel = '';
    let toLabel = '';
    try {
      const [fromPub, toPub] = await Promise.all([
        db.doc(`public_users/${fromUid}`).get(),
        db.doc(`public_users/${toUid}`).get(),
      ]);
      const f = fromPub.exists ? fromPub.data() || {} : {};
      const t = toPub.exists ? toPub.data() || {} : {};
      const fh = String(f.handle || '').trim();
      const th = String(t.handle || '').trim();
      fromLabel = fh ? `@${fh}` : String(f.displayName || f.name || '').trim();
      toLabel = th ? `@${th}` : String(t.displayName || t.name || '').trim();
    } catch {}
    if (!fromLabel) fromLabel = fromUid;
    if (!toLabel) toLabel = toUid;

    if (statusAfter === 'pending') {
      let toLang = 'es';
      try {
        const snap = await db.doc(`users/${toUid}`).get();
        if (snap.exists) toLang = normalizeLang(snap.data()?.lang);
      } catch {}
      const { title, body } = textFor(toLang, 'friend_invite', { from: fromLabel });
      const id = `fr_pending_${context.eventId}`;
      await createUserNotification(toUid, id, {
        type: 'friend_request',
        title,
        body,
        data: { requestId, fromUid, toUid, status: 'pending' },
        link: 'perfil.html',
      });
      await sendPushToUser(toUid, title, body, {
        kind: 'friend_request',
        fromUid,
        toUid,
      });
    }

    if (statusAfter === 'accepted') {
      let fromLang = 'es';
      try {
        const snap = await db.doc(`users/${fromUid}`).get();
        if (snap.exists) fromLang = normalizeLang(snap.data()?.lang);
      } catch {}
      const { title, body } = textFor(fromLang, 'friend_accepted', { who: toLabel });
      const id = `fr_accepted_${context.eventId}`;
      await createUserNotification(fromUid, id, {
        type: 'friend_request',
        title,
        body,
        data: { requestId, fromUid, toUid, status: 'accepted' },
        link: 'perfil.html',
      });
      await sendPushToUser(fromUid, title, body, {
        kind: 'friend_request_accepted',
        fromUid,
        toUid,
      });
    }

    return null;
  });

// Community corrections index (for global list)
exports.onCorrectionPostWrite = functions.firestore
  .document('user_feed/{uid}/posts/{postId}')
  .onWrite(async (change, context) => {
    const uid = String(context.params.uid || '').trim();
    const postId = String(context.params.postId || '').trim();
    if (!uid || !postId) return null;

    const before = change.before.exists ? change.before.data() || {} : null;
    const after = change.after.exists ? change.after.data() || {} : null;

    const beforeType = String(before?.type || '').trim().toLowerCase();
    const afterType = String(after?.type || '').trim().toLowerCase();

    const indexRef = db.doc(`community_corrections/${postId}`);

    // Delete index if the post was deleted or changed away from "correction"
    if (!after || afterType !== 'correction') {
      if (beforeType === 'correction') {
        try {
          await indexRef.delete();
        } catch {}
      }
      return null;
    }

    const rawText = String(after.text || '').trim();
    const snippet = rawText.length > 220 ? `${rawText.slice(0, 220)}…` : rawText;

    const payload = {
      ownerUid: uid,
      ownerName: String(after.authorName || '').trim() || 'Usuario',
      level: String(after.level || '').trim() || '',
      topicId: String(after.topicId || '').trim() || null,
      topicTitle: String(after.topicTitle || '').trim() || null,
      snippet,
      resolved: after.resolved === true,
      hasVoice: !!String(after.voiceUrl || '').trim(),
      createdAt: after.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await indexRef.set(payload, { merge: true });
    } catch (e) {
      console.warn('[correction] index write failed', e);
    }

    return null;
  });

// Notifications: community corrections (comments on correction requests)
exports.onCorrectionCommentCreated = functions.firestore
  .document('user_feed/{uid}/posts/{postId}/comments/{commentId}')
  .onCreate(async (snap, context) => {
    const uid = String(context.params.uid || '').trim();
    const postId = String(context.params.postId || '').trim();
    const commentId = String(context.params.commentId || '').trim();
    if (!uid || !postId) return null;

    const comment = snap.data() || {};
    const fromUid = String(comment.authorUid || '').trim();
    if (!fromUid || fromUid === uid) return null;

    // Only notify for correction posts
    let post = null;
    try {
      const pSnap = await db.doc(`user_feed/${uid}/posts/${postId}`).get();
      if (!pSnap.exists) return null;
      post = pSnap.data() || {};
    } catch (e) {
      console.warn('[correction] post read failed', e);
      return null;
    }

    const type = String(post.type || '').trim().toLowerCase();
    if (type !== 'correction') return null;

    let userLang = 'es';
    try {
      const uSnap = await db.doc(`users/${uid}`).get();
      if (uSnap.exists) userLang = normalizeLang(uSnap.data()?.lang);
    } catch {}

    const who = String(comment.authorName || '').trim() || fromUid;
    const { title, body } = textFor(userLang, 'correction_comment', { who });

    const notifId = `corr_comment_${context.eventId}`;
    const link = `correccion.html?uid=${encodeURIComponent(uid)}&post=${encodeURIComponent(postId)}`;

    await createUserNotification(uid, notifId, {
      type: 'correction',
      title,
      body,
      data: { postId, commentId, fromUid },
      link,
    });
    await sendPushToUser(uid, title, body, {
      kind: 'correction_comment',
      postId,
      fromUid,
    });

    return null;
  });

