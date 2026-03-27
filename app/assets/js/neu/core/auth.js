import { requireNeuAuth } from '../../neu-auth-gate.js?v=20260222c';
import { setAuthUser } from '../context/neu-app-context.js';

export async function requireAuth(context) {
  const user = await requireNeuAuth();
  setAuthUser(context, user);
  return user;
}

export async function init(context) {
  return requireAuth(context);
}
