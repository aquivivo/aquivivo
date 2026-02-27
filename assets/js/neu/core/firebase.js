export { app, auth, db, storage } from '../../neu-firebase-init.js?v=20260222c';

export async function init() {
  const { app, auth, db, storage } = await import('../../neu-firebase-init.js?v=20260222c');
  return { app, auth, db, storage };
}
