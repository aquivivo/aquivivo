import { startCheckout } from "../stripe-checkout.js";

function bind() {
  // Supports both: id="buyA1" and data-plan="premium_a1"
  const btnById = document.getElementById("buyA1");
  const btnByData = document.querySelector('[data-plan="premium_a1"]');
  const btn = btnById || btnByData;

  if (!btn) {
    console.warn("[services-page] No buy button found (buyA1 / data-plan=premium_a1).");
    return;
  }

  btn.addEventListener("click", async () => {
    try {
      btn.disabled = true;
      btn.classList.add("is-loading");
      await startCheckout("premium_a1");
    } catch (e) {
      console.error("[services-page] startCheckout failed:", e);
      alert(e?.message || "No se pudo iniciar el pago. Revisa consola.");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  });

  console.log("[services-page] Bound Stripe checkout to Premium A1.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bind);
} else {
  bind();
}
