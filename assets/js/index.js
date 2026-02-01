/* functions/index.js
 * AquiVivo — Redeem promo codes to activate plans automatically
 * - User enters code in services.html
 * - Client calls callable function redeemPromoCode({ code })
 * - Function:
 *    - validates promo_codes/{codeLower} (active, not used, optional expiresAt)
 *    - writes users/{uid}: plan, levels, access=true, blocked=false, accessUntil
 *    - marks promo code as usedBy/usedAt (optionally single-use)
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function planConfig(planId) {
  // Match your app logic:
  // free: A1 7 days (trial)
  // premium_a1: A1 + A2 30 days
  // premium_b1: B1 + A1 30 days
  // premium_b2: B2 + A1 30 days
  const p = String(planId || "").toLowerCase().trim();
  if (p === "free") return { plan: "free", levels: ["A1"], days: 7 };
  if (p === "premium_a1" || p === "premium_a1a2") return { plan: "premium_a1", levels: ["A1", "A2"], days: 30 };
  if (p === "premium_b1") return { plan: "premium_b1", levels: ["B1", "A1"], days: 30 };
  if (p === "premium_b2") return { plan: "premium_b2", levels: ["B2", "A1"], days: 30 };
  if (p === "premium") return { plan: "premium", levels: ["A1", "A2", "B1", "B2"], days: 365 };
  return null;
}

function addDaysFromNow(days) {
  const ms = Number(days) * 24 * 60 * 60 * 1000;
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() + ms));
}

exports.redeemPromoCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const uid = context.auth.uid;
  const code = normalizeCode(data?.code);
  if (!code) {
    throw new functions.https.HttpsError("invalid-argument", "Código vacío.");
  }

  const promoRef = db.doc(`promo_codes/${code}`);
  const userRef = db.doc(`users/${uid}`);

  return await db.runTransaction(async (tx) => {
    const promoSnap = await tx.get(promoRef);
    if (!promoSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Código no existe.");
    }

    const promo = promoSnap.data() || {};
    if (promo.active === false) {
      throw new functions.https.HttpsError("failed-precondition", "Código inactivo.");
    }

    if (promo.singleUse === true && promo.usedAt) {
      throw new functions.https.HttpsError("failed-precondition", "Código ya usado.");
    }

    if (promo.expiresAt && promo.expiresAt.toDate && promo.expiresAt.toDate() < new Date()) {
      throw new functions.https.HttpsError("failed-precondition", "Código expirado.");
    }

    const cfg = planConfig(promo.plan);
    if (!cfg) {
      throw new functions.https.HttpsError("failed-precondition", "Código mal configurado (plan).");
    }

    // Extend from max(now, current accessUntil) to be nice
    const userSnap = await tx.get(userRef);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const now = new Date();
    let base = now;

    if (user.accessUntil && user.accessUntil.toDate) {
      const curr = user.accessUntil.toDate();
      if (curr > now) base = curr;
    }

    const next = admin.firestore.Timestamp.fromDate(
      new Date(base.getTime() + cfg.days * 24 * 60 * 60 * 1000)
    );

    tx.set(
      userRef,
      {
        plan: cfg.plan,
        levels: cfg.levels,
        access: true,
        blocked: false,
        accessUntil: next,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // mark promo as used (optional)
    const promoPatch = {
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedBy: uid,
    };

    tx.set(promoRef, promoPatch, { merge: true });

    return { ok: true, plan: cfg.plan, levels: cfg.levels, accessUntil: next.toDate().toISOString() };
  });
});
