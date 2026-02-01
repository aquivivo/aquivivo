// assets/js/stripe-checkout.js
// Client helper: start Stripe Checkout via Cloud Function

import { app } from "./firebase-init.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

export async function startCheckout(planId) {
  const fn = httpsCallable(getFunctions(app), "createCheckoutSession");
  const origin = location.origin;
  const res = await fn({ planId, origin });
  const url = res?.data?.url;
  if (!url) throw new Error("No checkout URL");
  location.href = url;
}
