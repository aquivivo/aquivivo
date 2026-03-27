const QA_ADMIN_UIDS = new Set(['OgXNeCbloJiSGoi1DsZ9UN0aU0I2']);
const QA_ADMIN_EMAILS = new Set(['aquivivo.pl@gmail.com']);

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

export async function isQaAdminUser(authUser, userDoc = {}) {
  const reasons = [];
  const uid = String(authUser?.uid || '').trim();
  const email = norm(authUser?.email || userDoc?.email || userDoc?.emailLower);

  if (uid && QA_ADMIN_UIDS.has(uid)) reasons.push('uid_whitelist');
  if (email && QA_ADMIN_EMAILS.has(email)) reasons.push('email_whitelist');
  if (userDoc?.admin === true) reasons.push('admin_flag');
  if (norm(userDoc?.role) === 'admin') reasons.push('role_admin');

  return {
    allowed: reasons.length > 0,
    reasons,
  };
}

export function mountQaToolsPanel(options = {}) {
  const {
    enabled = false,
    authUid = '',
    targetUid = '',
    targetEmail = '',
    adminReasons = [],
    onStatus = null,
  } = options;

  if (!enabled) return null;

  const host =
    document.getElementById('qaToolsPanel') ||
    document.getElementById('qaPanel') ||
    document.querySelector('[data-qa-tools]');

  const reasonText = (Array.isArray(adminReasons) ? adminReasons : [])
    .map((r) => String(r || '').trim())
    .filter(Boolean)
    .join(', ');

  const msg = reasonText
    ? `QA mode activo (${reasonText}).`
    : 'QA mode activo.';

  if (typeof onStatus === 'function') {
    onStatus(msg, 'warn');
  }

  if (!host) return null;

  host.style.display = '';
  if (host.dataset.qaMounted === '1') return host;

  host.dataset.qaMounted = '1';
  host.innerHTML = `
    <div class="hintSmall" style="margin-top:8px;">
      <b>QA mode</b><br />
      authUid: ${String(authUid || '-')}; targetUid: ${String(targetUid || '-')}; targetEmail: ${String(targetEmail || '-')}
    </div>
  `;

  return host;
}

