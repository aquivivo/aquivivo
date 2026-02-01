import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

(function () {
  const ADMIN_HREF = 'esadmin.html';

  function pageType() {
    return (document.body?.dataset?.page || '').toLowerCase();
  }

  function isPublicPage(pathname) {
  // Public pages that must work without authentication
  const p = (pathname || "").toLowerCase();
  return (
    p.endsWith("/index.html") ||
    p.endsWith("/login.html") ||
    p.endsWith("/services.html") ||
    p === "/" ||
    p.endsWith("/privacy.html") ||
    p.endsWith("/terms.html")
  );
})();
