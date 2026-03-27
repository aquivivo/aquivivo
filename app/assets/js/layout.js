import { getNeuLoginPath, getNeuPath } from './neu-paths.js';

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

function rootedNeuPath(fileName) {
  const resolved = getNeuPath(fileName);
  return `/${String(resolved || '').replace(/^\/+/, '')}`;
}

function renderPublicHeader(page) {
  const mount = document.getElementById('appHeader');
  if (!mount) return;

  const isActive = (name) => (page === name ? 'aria-current="page"' : '');
  const homeHref = rootedNeuPath('index.html');
  const loginHref = `/${String(getNeuLoginPath() || '').replace(/^\/+/, '')}`;
  const logoSrc = rootedNeuPath('assets/img/logo.png');
  mount.innerHTML = `
    <header class="topbar nav-glass neu-shell-header">
      <div class="nav-inner container">
        <a class="brand neu-brand" href="${homeHref}" aria-label="AquiVivo">
          <img src="${logoSrc}" alt="AquiVivo" />
          <span class="neu-brand-copy">
            <strong>NEU</strong>
            <small>Social App</small>
          </span>
        </a>

        <div class="nav-actions" aria-label="Public navigation">
          <a class="btn-white-outline" href="${homeHref}" ${isActive('index')}>Inicio</a>
          <a class="btn-yellow" href="${loginHref}">Iniciar sesion</a>
        </div>
      </div>
      <div class="nav-line nav-line-below"></div>
    </header>
  `;
}

function renderPublicFooter() {
  const mount = document.getElementById('appFooter');
  if (!mount) return;
  const privacyHref = rootedNeuPath('pages/legal/polityka-prywatnosci.html');
  const termsHref = rootedNeuPath('pages/legal/regulamin.html');
  const returnsHref = rootedNeuPath('pages/legal/zwroty.html');
  const helpHref = rootedNeuPath('pages/legal/ayuda.html');

  mount.innerHTML = `
    <footer class="site-footer neu-shell-footer">
      <div class="footer-inner container">
        <div class="footer-copy">&copy; ${esc(new Date().getFullYear())} AquiVivo</div>
        <div class="footer-links">
          <a href="${privacyHref}">Politica de privacidad</a>
          <a href="${termsHref}">Terminos</a>
          <a href="${returnsHref}">Devoluciones</a>
          <a href="${helpHref}">Ayuda</a>
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
