const PUBLIC_PAGES = new Set([
  'services',
  'ayuda',
  'contacto',
  'privacy',
  'terms',
  'returns',
]);
const PAGE_ALIASES = {
  kontakt: 'contacto',
  'polityka-prywatnosci': 'privacy',
  regulamin: 'terms',
  zwroty: 'returns',
};

function pageFromPathname() {
  const raw = String(location.pathname || '').trim().toLowerCase();
  const file = raw.split('/').pop() || '';
  if (!file) return '';
  return file.replace(/\.html$/, '');
}

function normalizePageKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return PAGE_ALIASES[key] || key;
}

function currentPageKey() {
  const fromDataset = normalizePageKey(document.body?.dataset?.page || '');
  if (fromDataset) return fromDataset;
  const fromPath = normalizePageKey(pageFromPathname());
  if (fromPath) return fromPath;
  return '';
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPublicHeader(page) {
  const mount = document.getElementById('appHeader');
  if (!mount) return;

  const isActive = (name) => (page === name ? 'aria-current="page"' : '');
  mount.innerHTML = `
    <header class="topbar nav-glass neu-shell-header">
      <div class="nav-inner container">
        <a class="brand neu-brand" href="/app/index.html" aria-label="AquiVivo">
          <img src="assets/img/logo.png" alt="AquiVivo" />
          <span class="neu-brand-copy">
            <strong>NEU</strong>
            <small>Social App</small>
          </span>
        </a>

        <div class="nav-actions" aria-label="Public navigation">
          <a class="btn-white-outline" href="/app/index.html" ${isActive('index')}>Inicio</a>
          <a class="btn-yellow" href="/app/neu-login.html">Iniciar sesion</a>
        </div>
      </div>
      <div class="nav-line nav-line-below"></div>
    </header>
  `;
}

function renderPublicFooter() {
  const mount = document.getElementById('appFooter');
  if (!mount) return;

  mount.innerHTML = `
    <footer class="site-footer neu-shell-footer">
      <div class="footer-inner container">
        <div class="footer-copy">&copy; ${esc(new Date().getFullYear())} AquiVivo</div>
        <div class="footer-links">
          <a href="/app/legal/polityka-prywatnosci.html">Politica de privacidad</a>
          <a href="/app/legal/regulamin.html">Terminos</a>
          <a href="/app/legal/zwroty.html">Devoluciones</a>
          <a href="/app/legal/ayuda.html">Ayuda</a>
        </div>
      </div>
    </footer>
  `;
}

async function bootstrapLayout() {
  const body = document.body;
  const page = currentPageKey();
  const isNeuPage =
    body?.classList?.contains('neu-social-app') ||
    body?.classList?.contains('neu-auth-page');

  if (!isNeuPage && PUBLIC_PAGES.has(page)) {
    await import('./neu-layout.js?v=20260327b1');
    return;
  }

  await import('./neu-layout.js?v=20260327b1');
}

bootstrapLayout();

