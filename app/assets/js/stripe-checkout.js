import { app, auth } from './firebase-init.js';
import {
  getFunctions,
  httpsCallable,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js';

const functions = getFunctions(app);
const createCheckoutSession = httpsCallable(functions, 'createCheckoutSession');

function getOrigin() {
  try {
    return String(window.location?.origin || '').trim();
  } catch {
    return '';
  }
}

export async function startCheckout(planId) {
  const id = String(planId || '').trim();
  if (!id) throw new Error('Brak planId.');

  if (!auth.currentUser) {
    throw new Error('Debes iniciar sesion para comprar.');
  }

  const res = await createCheckoutSession({
    planId: id,
    origin: getOrigin(),
  });

  const url = String(res?.data?.url || '').trim();
  if (!url) throw new Error('No se recibio URL de checkout.');

  window.location.assign(url);
  return url;
}

