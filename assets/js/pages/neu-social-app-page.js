import { signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { deleteObject, ref as storageRef } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import { requireNeuAuth } from '../neu-auth-gate.js?v=20260222c';
import { auth, db, storage } from '../neu-firebase-init.js?v=20260222c';

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readCity() {
  const raw = String(document.getElementById('profileCity')?.textContent || '').trim();
  return raw || 'tu ciudad';
}

const NEU_URL_PARAMS = new URLSearchParams(location.search);
const SAFE_MODE = NEU_URL_PARAMS.get('safe') === '1';
const NEU_QA_MODE = NEU_URL_PARAMS.get('qa') === '1';
const NEU_SAFE_MOD_ALLOWED = new Set(['portal_obs', 'flow_bridge', 'crud_posts', 'crud_stories']);

function parseSafeModeModule(params) {
  const values = params
    .getAll('mod')
    .flatMap((raw) => String(raw || '').split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const value of values) {
    if (NEU_SAFE_MOD_ALLOWED.has(value)) return value;
  }
  return '';
}

const SAFE_MODE_MOD = SAFE_MODE ? parseSafeModeModule(NEU_URL_PARAMS) : '';
const SAFE_ENABLE_PORTAL_OBS = !SAFE_MODE || SAFE_MODE_MOD === 'portal_obs';
const SAFE_ENABLE_FLOW_BRIDGE = !SAFE_MODE || SAFE_MODE_MOD === 'flow_bridge';
const SAFE_ENABLE_CRUD_POSTS = !SAFE_MODE || SAFE_MODE_MOD === 'crud_posts';
const SAFE_ENABLE_CRUD_STORIES = !SAFE_MODE || SAFE_MODE_MOD === 'crud_stories';

function qaDebug(message, payload = null) {
  if (!NEU_QA_MODE) return;
  if (payload == null) console.debug(`[neu-qa] ${message}`);
  else console.debug(`[neu-qa] ${message}`, payload);
}

let neuFatalShown = false;

function safeModeHref() {
  const url = new URL(location.href);
  url.searchParams.set('safe', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

function formatFatalLines(errorLike) {
  const text = String(errorLike?.stack || errorLike?.message || errorLike || 'Unknown error');
  return text
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function showFatalOverlay(errorLike, { source = 'runtime' } = {}) {
  if (neuFatalShown) return;
  neuFatalShown = true;

  const lines = formatFatalLines(errorLike);
  const host = document.createElement('div');
  host.id = 'neuFatalOverlay';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '99999';
  host.style.background = 'rgba(2, 8, 22, 0.9)';
  host.style.backdropFilter = 'blur(6px)';
  host.style.display = 'grid';
  host.style.placeItems = 'center';
  host.style.padding = '20px';

  host.innerHTML = `
    <div style="width:min(920px,96vw);max-height:88vh;overflow:auto;border-radius:14px;border:1px solid rgba(255,255,255,.2);background:rgba(11,31,68,.92);color:#e6ecff;box-shadow:0 20px 46px rgba(0,0,0,.42);padding:16px;">
      <div style="font:700 16px/1.3 Sora,system-ui,sans-serif;margin:0 0 10px;">[NEU FATAL] ${esc(source)}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:0;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);font:400 12px/1.45 ui-monospace,Consolas,monospace;">${esc(lines.join('\n'))}</pre>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">
        <a href="${esc(safeModeHref())}" style="display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 14px;border-radius:10px;background:#fcd116;color:#10295d;font:700 13px/1 Sora,system-ui,sans-serif;text-decoration:none;">Uruchom Safe Mode</a>
        <button type="button" id="neuFatalDismissBtn" style="height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.06);color:#e6ecff;font:600 13px/1 Sora,system-ui,sans-serif;cursor:pointer;">Zamknij</button>
      </div>
    </div>
  `;

  host.querySelector('#neuFatalDismissBtn')?.addEventListener('click', () => {
    host.remove();
  });

  document.body?.append(host);
}

function installFatalHooks() {
  if (installFatalHooks._wired) return;
  installFatalHooks._wired = true;

  window.onerror = function onFatal(message, source, lineno, colno, error) {
    showFatalOverlay(error || `${message || 'Error'} @ ${source || '-'}:${lineno || 0}:${colno || 0}`, {
      source: 'window.onerror',
    });
    return false;
  };

  window.onunhandledrejection = function onFatalRejection(event) {
    const reason = event?.reason;
    showFatalOverlay(reason || 'Unhandled Promise rejection', {
      source: 'window.onunhandledrejection',
    });
  };
}

installFatalHooks();

function renderSafeModeBadge() {
  if (!SAFE_MODE) return;
  if (document.getElementById('neuSafeModeBadge')) return;

  const badge = document.createElement('div');
  badge.id = 'neuSafeModeBadge';
  badge.textContent = SAFE_MODE_MOD ? `SAFE MODE | mod: ${SAFE_MODE_MOD}` : 'SAFE MODE | mod: minimal';
  badge.style.position = 'fixed';
  badge.style.right = '14px';
  badge.style.bottom = 'calc(env(safe-area-inset-bottom, 0px) + 14px)';
  badge.style.zIndex = '9500';
  badge.style.height = '32px';
  badge.style.padding = '0 12px';
  badge.style.borderRadius = '999px';
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.border = '1px solid rgba(255,255,255,0.2)';
  badge.style.background = 'rgba(15, 42, 92, 0.85)';
  badge.style.color = '#e6ecff';
  badge.style.font = '600 12px/1 Sora,system-ui,sans-serif';
  badge.style.boxShadow = '0 10px 24px rgba(0,0,0,0.32)';
  badge.style.backdropFilter = 'blur(8px)';
  badge.style.webkitBackdropFilter = 'blur(8px)';
  document.body?.append(badge);
}

if (SAFE_MODE) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSafeModeBadge, { once: true });
  } else {
    renderSafeModeBadge();
  }
}

function wireQaLongTaskProbe() {
  if (!NEU_QA_MODE) return;
  if (wireQaLongTaskProbe._wired) return;
  wireQaLongTaskProbe._wired = true;
  if (!('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = Math.round(Number(entry.duration || 0));
        if (duration >= 80) {
          qaDebug('long-task', { durationMs: duration, name: entry.name || 'task' });
        }
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // ignore unsupported browsers/modes
  }
}

function showWelcomeEmptyState() {
  const feed = document.getElementById('feedList');
  if (!feed) return;
  const hasPosts = !!feed.querySelector('.post-card');
  const searchText = String(document.getElementById('feedSearchInput')?.value || '').trim();
  const activePortal = String(document.body?.dataset?.portal || '').toLowerCase();

  if (hasPosts || searchText || activePortal !== 'feed') return;
  if (feed.querySelector('.neu-welcome-empty')) return;

  const city = esc(readCity());
  feed.innerHTML = `
    <div class="neu-welcome-empty">
      <div class="neu-welcome-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M12 8v8"></path>
          <path d="M8 12h8"></path>
        </svg>
      </div>
      <p class="neu-welcome-title">Bienvenida</p>
      <p class="neu-welcome-sub">Aqu&iacute; hay personas y preguntas en ${city}</p>
      <button class="btn-yellow neu-welcome-btn" id="neuWelcomeCommunityBtn" type="button">Ver comunidad</button>
    </div>
  `;

  const btn = document.getElementById('neuWelcomeCommunityBtn');
  btn?.addEventListener('click', () => {
    const target = document.querySelector('[data-portal-target="network"]');
    if (target instanceof HTMLElement) target.click();
  });
}

function initNeuFlowBridge() {
  if (!SAFE_ENABLE_FLOW_BRIDGE) return;
  if (initNeuFlowBridge._wired) return;
  initNeuFlowBridge._wired = true;

  const feed = document.getElementById('feedList');
  if (!feed) return;

  const observer = new MutationObserver(() => {
    window.setTimeout(showWelcomeEmptyState, 0);
  });
  observer.observe(feed, { childList: true });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-portal-target], [data-feed-source], #btnFeedReset');
    if (!trigger) return;
    window.setTimeout(showWelcomeEmptyState, 0);
    window.setTimeout(() => {
      const activePortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
      if (NEU_PORTAL_ALLOWED.has(activePortal)) {
        syncRouteFromPortalState(activePortal);
      }
      syncBottomNavActiveState();
    }, 0);
  });

  document.getElementById('feedSearchInput')?.addEventListener('input', () => {
    window.setTimeout(showWelcomeEmptyState, 0);
  });

  window.setTimeout(showWelcomeEmptyState, 120);
  window.setTimeout(showWelcomeEmptyState, 700);
  window.setTimeout(showWelcomeEmptyState, 1400);
}

const NEU_POST_MODE_CREATE = 'create';
const NEU_POST_MODE_EDIT = 'edit';
const NEU_POST_PRIMARY_COLLECTION = 'neuPosts';

const neuPostCrudState = {
  wired: false,
  editing: null,
  pendingDelete: null,
  feedObserver: null,
  modalObserver: null,
  publishDefaultLabel: '',
  composerDefaultTitle: '',
  deleting: false,
  saving: false,
  decorateTick: null,
};

function neuCurrentUid() {
  return String(auth.currentUser?.uid || '').trim();
}

function neuGetFeedList() {
  return document.getElementById('feedList');
}

function neuSetComposerInlineMsg(text, bad = false) {
  const msg = document.getElementById('composerMsg');
  if (!(msg instanceof HTMLElement)) return;
  msg.textContent = String(text || '');
  msg.style.color = bad ? '#ff91a2' : 'rgba(230,236,255,0.9)';
}

function neuIsVideoUrl(url) {
  const value = String(url || '').toLowerCase().trim();
  if (!value) return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(value) || value.includes('youtube.com') || value.includes('youtu.be');
}

function neuExtractTags(...inputs) {
  const all = inputs
    .map((value) => String(value || ''))
    .join(' ')
    .toLowerCase();
  const tags = new Set();
  const byHash = all.match(/#[a-z0-9_]{1,30}/g) || [];
  byHash.forEach((tag) => tags.add(tag.replace('#', '')));
  all
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith('#') && token.length > 1) tags.add(token.slice(1));
    });
  return Array.from(tags).slice(0, 20);
}

function neuModeFromType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'story') return 'story';
  if (value === 'reel') return 'reel';
  if (value === 'poll') return 'poll';
  if (value === 'event') return 'event';
  return 'post';
}

function neuTypeFromMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (value === 'story' || value === 'reel' || value === 'poll' || value === 'event') return value;
  return 'user';
}

function neuReadPostIdentity(card) {
  if (!(card instanceof HTMLElement)) return null;
  const ownerUid = String(card.dataset.owner || '').trim();
  const postId = String(card.dataset.post || '').trim();
  if (!ownerUid || !postId) return null;
  return { ownerUid, postId };
}

function neuCardText(card) {
  if (!(card instanceof HTMLElement)) return '';
  return String(card.querySelector('.post-text')?.textContent || '').trim();
}

function neuCardTags(card) {
  if (!(card instanceof HTMLElement)) return [];
  const text = String(card.querySelector('.post-tags')?.textContent || '');
  const tags = text.match(/#[a-z0-9_]+/gi) || [];
  return tags.map((tag) => tag.replace('#', '').trim()).filter(Boolean);
}

function neuCardMedia(card) {
  if (!(card instanceof HTMLElement)) return '';
  const img = card.querySelector('.media-block img');
  if (img instanceof HTMLImageElement) return String(img.getAttribute('src') || '').trim();
  const video = card.querySelector('.media-block video');
  if (video instanceof HTMLVideoElement) {
    return String(video.getAttribute('src') || video.currentSrc || '').trim();
  }
  return '';
}

function neuCardMeta(card) {
  if (!(card instanceof HTMLElement)) return '';
  const metas = Array.from(card.querySelectorAll('.post-meta'));
  return metas
    .map((node) => String(node.textContent || '').trim())
    .join(' | ');
}

function neuCardFallbackData(card) {
  const meta = neuCardMeta(card).toLowerCase();
  const hasPoll = meta.includes('poll:');
  const hasEvent = meta.includes('event:');
  return {
    type: hasPoll ? 'poll' : hasEvent ? 'event' : 'post',
    text: neuCardText(card),
    tags: neuCardTags(card),
    media: neuCardMedia(card),
    pollOptions: [],
    eventDate: '',
    eventPlace: '',
  };
}

function neuComposerEls() {
  return {
    modal: document.getElementById('composerModal'),
    title: document.querySelector('#composerModal .composer-head h2'),
    mode: document.getElementById('composerMode'),
    media: document.getElementById('composerMedia'),
    tags: document.getElementById('composerTags'),
    poll: document.getElementById('composerPoll'),
    eventDate: document.getElementById('composerEventDate'),
    eventPlace: document.getElementById('composerEventPlace'),
    text: document.getElementById('composerText'),
    publish: document.getElementById('btnComposerPublish'),
    clear: document.getElementById('btnComposerClear'),
    close: document.getElementById('btnComposerToggle'),
  };
}

function neuEnsureComposerBaseLabels() {
  const { publish, title } = neuComposerEls();
  if (!neuPostCrudState.publishDefaultLabel && publish instanceof HTMLButtonElement) {
    neuPostCrudState.publishDefaultLabel = String(publish.textContent || '').trim() || 'Publicar';
  }
  if (!neuPostCrudState.composerDefaultTitle && title instanceof HTMLElement) {
    neuPostCrudState.composerDefaultTitle = String(title.textContent || '').trim() || 'Crear post';
  }
}

function neuSetComposerMode(mode) {
  neuEnsureComposerBaseLabels();
  const { publish, title } = neuComposerEls();
  const editOn = mode === NEU_POST_MODE_EDIT;
  if (publish instanceof HTMLButtonElement) {
    publish.textContent = editOn ? 'Guardar cambios' : neuPostCrudState.publishDefaultLabel || 'Publicar';
    publish.dataset.neuEditMode = editOn ? '1' : '0';
  }
  if (title instanceof HTMLElement) {
    title.textContent = editOn ? 'Editar publicación' : neuPostCrudState.composerDefaultTitle || 'Crear post';
  }
}

function neuClearEditState() {
  neuPostCrudState.editing = null;
  neuSetComposerMode(NEU_POST_MODE_CREATE);
}

function neuOpenComposer() {
  const trigger = document.getElementById('btnOpenComposer') || document.querySelector('[data-open-composer]');
  if (trigger instanceof HTMLElement) {
    trigger.click();
    return;
  }

  const modal = document.getElementById('composerModal');
  if (modal instanceof HTMLElement) {
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }
}

function neuCloseComposer() {
  const closeBtn = document.getElementById('btnComposerToggle');
  if (closeBtn instanceof HTMLElement) {
    closeBtn.click();
    return;
  }
  const modal = document.getElementById('composerModal');
  if (modal instanceof HTMLElement) modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function neuBuildPostFromDocData(data = {}) {
  const tags = Array.isArray(data.tags) ? data.tags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const pollOptions = Array.isArray(data.pollOptions)
    ? data.pollOptions.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    type: String(data.type || 'post').trim().toLowerCase(),
    text: String(data.text || '').trim(),
    tags,
    media: String(data.videoURL || data.mediaURL || data.imageURL || data.imageUrl || data.media || '').trim(),
    pollOptions,
    eventDate: String(data.eventDate || '').trim(),
    eventPlace: String(data.eventPlace || '').trim(),
  };
}

async function neuResolveOwnedPostRef(ownerUid, postId) {
  const meUid = neuCurrentUid();
  if (!meUid || ownerUid !== meUid || !postId) return null;

  const candidates = [
    { source: 'neu', ref: doc(db, NEU_POST_PRIMARY_COLLECTION, postId) },
    { source: 'legacy', ref: doc(db, 'user_feed', ownerUid, 'posts', postId) },
  ];

  for (const candidate of candidates) {
    try {
      const snap = await getDoc(candidate.ref);
      if (!snap.exists()) continue;
      const data = snap.data() || {};
      const docUid = String(data.authorUid || data.ownerUid || ownerUid || '').trim();
      if (docUid && docUid !== meUid) continue;
      return { ...candidate, data };
    } catch {
      // ignore and keep looking
    }
  }

  return {
    source: 'legacy',
    ref: doc(db, 'user_feed', ownerUid, 'posts', postId),
    data: null,
  };
}

function neuPrefillComposerFromPost(postData = {}) {
  const { mode, media, tags, poll, eventDate, eventPlace, text } = neuComposerEls();
  const resolvedMode = neuModeFromType(postData.type);
  if (mode instanceof HTMLSelectElement) {
    mode.value = resolvedMode;
    mode.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (text instanceof HTMLTextAreaElement) text.value = String(postData.text || '');
  if (media instanceof HTMLInputElement) media.value = String(postData.media || '');
  if (tags instanceof HTMLInputElement) {
    const allTags = Array.isArray(postData.tags) ? postData.tags : [];
    tags.value = allTags.map((tag) => `#${tag}`).join(' ');
  }
  if (poll instanceof HTMLInputElement) {
    const options = Array.isArray(postData.pollOptions) ? postData.pollOptions : [];
    poll.value = options.join(', ');
  }
  if (eventDate instanceof HTMLInputElement) eventDate.value = String(postData.eventDate || '');
  if (eventPlace instanceof HTMLInputElement) eventPlace.value = String(postData.eventPlace || '');
}

function neuReadComposerDraft() {
  const { mode, media, tags, poll, eventDate, eventPlace, text } = neuComposerEls();
  const rawMode = String(mode?.value || 'post').trim().toLowerCase();
  const draft = {
    mode: rawMode,
    text: String(text?.value || '').trim(),
    media: String(media?.value || '').trim(),
    tagsRaw: String(tags?.value || '').trim(),
    pollRaw: String(poll?.value || '').trim(),
    eventDate: String(eventDate?.value || '').trim(),
    eventPlace: String(eventPlace?.value || '').trim(),
  };
  draft.tags = neuExtractTags(draft.text, draft.tagsRaw);
  draft.pollOptions = draft.pollRaw
    ? draft.pollRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return draft;
}

function neuBuildPostPatchFromComposer() {
  const draft = neuReadComposerDraft();
  if (!draft.text && !draft.media && draft.mode !== 'event' && draft.mode !== 'poll') {
    return { error: 'Escribe texto o media URL para guardar.' };
  }
  if (draft.mode === 'poll' && draft.pollOptions.length < 2) {
    return { error: 'Poll necesita mínimo 2 opciones.' };
  }
  if (draft.mode === 'event' && !draft.eventDate) {
    return { error: 'Event necesita fecha.' };
  }

  const patch = {
    type: neuTypeFromMode(draft.mode),
    text: draft.text,
    tags: draft.tags,
    updatedAt: serverTimestamp(),
    story: draft.mode === 'story',
  };

  if (draft.media) {
    if (neuIsVideoUrl(draft.media)) {
      patch.videoURL = draft.media;
      patch.imageURL = deleteField();
      patch.imageUrl = deleteField();
      patch.media = deleteField();
      patch.mediaURL = deleteField();
    } else {
      patch.imageURL = draft.media;
      patch.imageUrl = draft.media;
      patch.videoURL = deleteField();
      patch.media = deleteField();
      patch.mediaURL = deleteField();
    }
  } else {
    patch.videoURL = deleteField();
    patch.imageURL = deleteField();
    patch.imageUrl = deleteField();
    patch.media = deleteField();
    patch.mediaURL = deleteField();
  }

  if (draft.mode === 'story') {
    patch.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else {
    patch.expiresAt = deleteField();
  }

  if (draft.mode === 'poll') patch.pollOptions = draft.pollOptions;
  else patch.pollOptions = deleteField();

  if (draft.mode === 'event') {
    patch.eventDate = draft.eventDate;
    patch.eventPlace = draft.eventPlace;
  } else {
    patch.eventDate = deleteField();
    patch.eventPlace = deleteField();
  }

  return { patch };
}

function neuFindFeedCard(ownerUid, postId) {
  const feed = neuGetFeedList();
  if (!(feed instanceof HTMLElement)) return null;
  const cards = feed.querySelectorAll('.post-card[data-owner][data-post]');
  for (const card of cards) {
    const matchOwner = String(card.getAttribute('data-owner') || '').trim() === ownerUid;
    const matchPost = String(card.getAttribute('data-post') || '').trim() === postId;
    if (matchOwner && matchPost) return card;
  }
  return null;
}

async function neuStartEditPost(card) {
  const identity = neuReadPostIdentity(card);
  const meUid = neuCurrentUid();
  if (!identity || !meUid || identity.ownerUid !== meUid) {
    neuSetComposerInlineMsg('Solo puedes editar tus publicaciones.', true);
    return;
  }

  const resolved = await neuResolveOwnedPostRef(identity.ownerUid, identity.postId);
  if (!resolved?.ref) {
    neuSetComposerInlineMsg('No se pudo abrir el editor.', true);
    return;
  }

  const fallbackData = neuCardFallbackData(card);
  const sourceData = resolved.data ? neuBuildPostFromDocData(resolved.data) : fallbackData;

  neuOpenComposer();
  neuPostCrudState.editing = {
    ownerUid: identity.ownerUid,
    postId: identity.postId,
    ref: resolved.ref,
    source: resolved.source,
  };
  neuSetComposerMode(NEU_POST_MODE_EDIT);
  neuPrefillComposerFromPost(sourceData);
  neuSetComposerInlineMsg('Modo edición activado.');
}

async function neuSaveEditedPost() {
  if (!neuPostCrudState.editing || neuPostCrudState.saving) return;
  const edit = neuPostCrudState.editing;
  const meUid = neuCurrentUid();
  if (!meUid || edit.ownerUid !== meUid) {
    neuSetComposerInlineMsg('No tienes permiso para editar esta publicación.', true);
    neuClearEditState();
    return;
  }

  const { patch, error } = neuBuildPostPatchFromComposer();
  if (error) {
    neuSetComposerInlineMsg(error, true);
    return;
  }

  const { publish } = neuComposerEls();
  const currentLabel = publish instanceof HTMLButtonElement ? String(publish.textContent || '') : '';
  neuPostCrudState.saving = true;
  if (publish instanceof HTMLButtonElement) {
    publish.disabled = true;
    publish.textContent = 'Guardando...';
  }

  try {
    await updateDoc(edit.ref, patch);
    neuSetComposerInlineMsg('Publicación actualizada.');
    neuCloseComposer();
    neuClearEditState();
    window.setTimeout(() => location.reload(), 150);
  } catch (err) {
    console.error('[neu-post] update failed', err);
    neuSetComposerInlineMsg('No se pudo actualizar la publicación.', true);
  } finally {
    neuPostCrudState.saving = false;
    if (publish instanceof HTMLButtonElement) {
      publish.disabled = false;
      if (neuPostCrudState.editing) publish.textContent = 'Guardar cambios';
      else publish.textContent = neuPostCrudState.publishDefaultLabel || currentLabel || 'Publicar';
    }
  }
}

function neuEnsureDeleteModal() {
  let modal = document.getElementById('neuPostDeleteModal');
  if (modal instanceof HTMLElement) return modal;

  modal = document.createElement('div');
  modal.id = 'neuPostDeleteModal';
  modal.className = 'neu-confirm-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="neu-confirm-backdrop" data-neu-delete-close="1"></div>
    <div class="neu-confirm-card" role="dialog" aria-modal="true" aria-labelledby="neuDeleteTitle">
      <h3 id="neuDeleteTitle">Eliminar publicación</h3>
      <p>Esta acción no se puede deshacer.</p>
      <div class="neu-confirm-actions">
        <button class="btn-white-outline" id="neuDeleteCancelBtn" type="button">Cancelar</button>
        <button class="btn-yellow neu-danger-btn" id="neuDeleteConfirmBtn" type="button">Eliminar</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

function neuOpenDeleteModal(ownerUid, postId) {
  const modal = neuEnsureDeleteModal();
  neuPostCrudState.pendingDelete = { ownerUid, postId };
  modal.hidden = false;
  document.body.classList.add('neu-delete-open');
}

function neuCloseDeleteModal() {
  const modal = document.getElementById('neuPostDeleteModal');
  if (modal instanceof HTMLElement) modal.hidden = true;
  neuPostCrudState.pendingDelete = null;
  neuPostCrudState.deleting = false;
  document.body.classList.remove('neu-delete-open');
}

async function neuConfirmDeletePost() {
  if (neuPostCrudState.deleting) return;
  const target = neuPostCrudState.pendingDelete;
  const meUid = neuCurrentUid();
  if (!target || !meUid || target.ownerUid !== meUid) {
    neuSetComposerInlineMsg('No tienes permiso para eliminar esta publicación.', true);
    neuCloseDeleteModal();
    return;
  }

  const confirmBtn = document.getElementById('neuDeleteConfirmBtn');
  if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
  neuPostCrudState.deleting = true;

  try {
    const resolved = await neuResolveOwnedPostRef(target.ownerUid, target.postId);
    if (!resolved?.ref) throw new Error('missing-ref');

    await deleteDoc(resolved.ref);
    const card = neuFindFeedCard(target.ownerUid, target.postId);
    card?.remove();
    neuSetComposerInlineMsg('Publicación eliminada.');
    neuCloseDeleteModal();
    window.setTimeout(() => location.reload(), 120);
  } catch (err) {
    console.error('[neu-post] delete failed', err);
    neuSetComposerInlineMsg('No se pudo eliminar la publicación.', true);
    neuCloseDeleteModal();
  } finally {
    neuPostCrudState.deleting = false;
    if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
  }
}

function neuCloseAllPostMenus(except = null) {
  const menus = document.querySelectorAll('.neu-post-menu');
  menus.forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-post-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
  });
}

function neuTogglePostMenu(menu) {
  if (!(menu instanceof HTMLElement)) return;
  const isOpen = menu.classList.contains('is-open');
  if (isOpen) {
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-post-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
    return;
  }
  neuCloseAllPostMenus(menu);
  menu.classList.add('is-open');
  const panel = menu.querySelector('.neu-post-menu-panel');
  if (panel instanceof HTMLElement) panel.hidden = false;
}

function neuCreatePostMenu(ownerUid, postId) {
  const menu = document.createElement('div');
  menu.className = 'neu-post-menu';
  menu.dataset.owner = ownerUid;
  menu.dataset.post = postId;
  menu.innerHTML = `
    <button class="neu-post-menu-toggle" type="button" aria-label="Opciones" title="Opciones">⋯</button>
    <div class="neu-post-menu-panel" hidden>
      <button class="neu-post-menu-item" data-neu-post-action="edit" type="button">Editar</button>
      <button class="neu-post-menu-item neu-post-menu-item-danger" data-neu-post-action="delete" type="button">Eliminar</button>
    </div>
  `;
  return menu;
}

function neuDecorateFeedPostMenus() {
  const feed = neuGetFeedList();
  if (!(feed instanceof HTMLElement)) return;
  const meUid = neuCurrentUid();

  feed.querySelectorAll('.post-card[data-owner][data-post]').forEach((card) => {
    const identity = neuReadPostIdentity(card);
    if (!identity) return;

    const head = card.querySelector('.post-head');
    if (!(head instanceof HTMLElement)) return;

    const existing = head.querySelector('.neu-post-menu');
    const isMine = !!meUid && identity.ownerUid === meUid;

    if (!isMine) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;
    head.append(neuCreatePostMenu(identity.ownerUid, identity.postId));
  });
}

function neuWirePostCrudEvents() {
  if (neuPostCrudState.wired) return;
  neuPostCrudState.wired = true;

  neuEnsureComposerBaseLabels();
  neuEnsureDeleteModal();

  const feed = neuGetFeedList();
  if (feed instanceof HTMLElement) {
    neuPostCrudState.feedObserver = new MutationObserver(() => {
      if (neuPostCrudState.decorateTick) window.clearTimeout(neuPostCrudState.decorateTick);
      neuPostCrudState.decorateTick = window.setTimeout(() => {
        neuDecorateFeedPostMenus();
        neuPostCrudState.decorateTick = null;
      }, 60);
    });
    // Observe only top-level list swaps to avoid storms from nested text mutations.
    neuPostCrudState.feedObserver.observe(feed, { childList: true });
  }

  const composerModal = document.getElementById('composerModal');
  if (composerModal instanceof HTMLElement) {
    neuPostCrudState.modalObserver = new MutationObserver(() => {
      if (composerModal.hidden && neuPostCrudState.editing) neuClearEditState();
    });
    neuPostCrudState.modalObserver.observe(composerModal, { attributes: true, attributeFilter: ['hidden'] });
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const publishBtn = target.closest('#btnComposerPublish');
      if (publishBtn && neuPostCrudState.editing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        neuSaveEditedPost().catch((error) => {
          console.error('[neu-post] save handler failed', error);
          neuSetComposerInlineMsg('No se pudo guardar.', true);
        });
      }
    },
    true,
  );

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const deleteClose = target.closest('[data-neu-delete-close], #neuDeleteCancelBtn');
    if (deleteClose) {
      event.preventDefault();
      neuCloseDeleteModal();
      return;
    }

    const deleteConfirm = target.closest('#neuDeleteConfirmBtn');
    if (deleteConfirm) {
      event.preventDefault();
      neuConfirmDeletePost().catch((error) => {
        console.error('[neu-post] delete handler failed', error);
        neuSetComposerInlineMsg('No se pudo eliminar.', true);
      });
      return;
    }

    const menuToggle = target.closest('.neu-post-menu-toggle');
    if (menuToggle) {
      event.preventDefault();
      event.stopPropagation();
      const menu = menuToggle.closest('.neu-post-menu');
      neuTogglePostMenu(menu);
      return;
    }

    const menuAction = target.closest('.neu-post-menu-item[data-neu-post-action]');
    if (menuAction) {
      event.preventDefault();
      const action = String(menuAction.getAttribute('data-neu-post-action') || '').trim();
      const card = menuAction.closest('.post-card');
      const identity = neuReadPostIdentity(card);
      neuCloseAllPostMenus();

      if (!identity || identity.ownerUid !== neuCurrentUid()) {
        neuSetComposerInlineMsg('Solo puedes gestionar tus publicaciones.', true);
        return;
      }

      if (action === 'edit') {
        neuStartEditPost(card).catch((error) => {
          console.error('[neu-post] edit init failed', error);
          neuSetComposerInlineMsg('No se pudo abrir edición.', true);
        });
        return;
      }

      if (action === 'delete') {
        neuOpenDeleteModal(identity.ownerUid, identity.postId);
      }
      return;
    }

    if (!target.closest('.neu-post-menu')) neuCloseAllPostMenus();
  });

  window.setTimeout(neuDecorateFeedPostMenus, 0);
  window.setTimeout(neuDecorateFeedPostMenus, 300);
  window.setTimeout(neuDecorateFeedPostMenus, 900);
}

const NEU_STORY_PRIMARY_COLLECTION = 'neuStories';
const NEU_STORY_LIMIT = 180;
const NEU_STORY_WINDOW_MS = 72 * 60 * 60 * 1000;
const NEU_STORY_CACHE_TTL_MS = 8000;

const neuStoryCrudState = {
  wired: false,
  stories: [],
  byKey: new Map(),
  byMedia: new Map(),
  nameSet: new Set(),
  loadingPromise: null,
  refreshTimer: null,
  refreshInFlight: false,
  refreshQueued: false,
  refreshLastAt: 0,
  lastLoadedAt: 0,
  gridObserver: null,
  stripObserver: null,
  modalObserver: null,
  pendingDeleteKey: '',
  deleting: false,
};

function neuNormalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function neuAsDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function neuTs(value) {
  const d = neuAsDate(value);
  return d ? d.getTime() : 0;
}

function neuMediaLookupKeys(url) {
  const raw = String(url || '').trim();
  if (!raw) return [];
  const keys = new Set([raw]);
  try {
    const parsed = new URL(raw);
    keys.add(`${parsed.origin}${parsed.pathname}`);
  } catch {
    // raw could already be a storage path or relative key
  }
  return Array.from(keys).map((item) => item.trim()).filter(Boolean);
}

function neuMediaFromDocData(data = {}) {
  return String(data.videoURL || data.mediaURL || data.imageURL || data.imageUrl || data.media || '').trim();
}

function neuStoryStoragePathFromDocData(data = {}) {
  const direct = String(data.storagePath || data.storageRef || data.mediaPath || data.imagePath || data.videoPath || '').trim();
  if (direct) return direct;
  return '';
}

function neuIsStoryLikeDoc(data = {}) {
  const type = String(data.type || '').trim().toLowerCase();
  const storyFlag = data.story === true;
  const media = neuMediaFromDocData(data);
  const createdAt = data.createdAt || data.updatedAt || null;
  if (type === 'story' || storyFlag) return true;
  if (!media) return false;
  const ageMs = Date.now() - neuTs(createdAt);
  return ageMs >= 0 && ageMs <= NEU_STORY_WINDOW_MS;
}

function neuStoryCandidateKey(item) {
  return `${String(item.source || '')}:${String(item.id || '')}`;
}

function neuBuildOwnNameSet() {
  const names = new Set();
  const display = String(auth.currentUser?.displayName || '').trim();
  const email = String(auth.currentUser?.email || '').trim();
  const leftName = String(document.getElementById('leftName')?.textContent || '').trim();
  const leftHandle = String(document.getElementById('leftHandle')?.textContent || '').trim().replace(/^@/, '');
  const fromEmail = email.includes('@') ? email.split('@')[0] : '';

  [display, leftName, leftHandle, fromEmail].forEach((value) => {
    const normalized = neuNormalizeText(value);
    if (normalized) names.add(normalized);
  });
  return names;
}

function neuAuthorLooksMine(author) {
  const value = neuNormalizeText(author);
  if (!value) return false;
  return neuStoryCrudState.nameSet.has(value);
}

function neuBuildStoryCandidate(source, uid, snap) {
  const data = snap.data() || {};
  const ownerUid = String(data.authorUid || data.ownerUid || data.userId || uid || '').trim();
  if (ownerUid && ownerUid !== uid) return null;
  if (!neuIsStoryLikeDoc(data)) return null;

  return {
    id: snap.id,
    ownerUid: uid,
    source,
    ref:
      source === 'legacy'
        ? doc(db, 'user_feed', uid, 'posts', snap.id)
        : doc(db, NEU_STORY_PRIMARY_COLLECTION, snap.id),
    type: String(data.type || '').trim().toLowerCase(),
    text: String(data.text || '').trim(),
    authorName: String(data.authorName || data.displayName || data.name || auth.currentUser?.displayName || '').trim(),
    media: neuMediaFromDocData(data),
    createdAt: data.createdAt || data.updatedAt || null,
    storagePath: neuStoryStoragePathFromDocData(data),
    raw: data,
  };
}

function neuRebuildStoryLookup(stories) {
  neuStoryCrudState.byKey.clear();
  neuStoryCrudState.byMedia.clear();
  neuStoryCrudState.stories = stories;

  stories.forEach((item) => {
    const key = neuStoryCandidateKey(item);
    neuStoryCrudState.byKey.set(key, item);

    neuMediaLookupKeys(item.media).forEach((mediaKey) => {
      if (!neuStoryCrudState.byMedia.has(mediaKey)) neuStoryCrudState.byMedia.set(mediaKey, []);
      neuStoryCrudState.byMedia.get(mediaKey).push(item);
    });
  });
}

async function neuLoadOwnStoryCandidates({ force = false } = {}) {
  const uid = neuCurrentUid();
  if (!uid) return [];

  const now = Date.now();
  if (
    !force &&
    Array.isArray(neuStoryCrudState.stories) &&
    neuStoryCrudState.stories.length &&
    now - Number(neuStoryCrudState.lastLoadedAt || 0) < NEU_STORY_CACHE_TTL_MS
  ) {
    return neuStoryCrudState.stories;
  }

  if (!force && neuStoryCrudState.loadingPromise) return neuStoryCrudState.loadingPromise;

  const task = (async () => {
    const collected = new Map();
    const keep = (candidate) => {
      if (!candidate) return;
      const key = neuStoryCandidateKey(candidate);
      if (!collected.has(key)) collected.set(key, candidate);
    };

    neuStoryCrudState.nameSet = neuBuildOwnNameSet();

    const loadNeuStories = async () => {
      const attempts = [
        query(collection(db, NEU_STORY_PRIMARY_COLLECTION), where('authorUid', '==', uid), limit(NEU_STORY_LIMIT)),
        query(collection(db, NEU_STORY_PRIMARY_COLLECTION), where('ownerUid', '==', uid), limit(NEU_STORY_LIMIT)),
      ];
      for (const q of attempts) {
        try {
          const snap = await getDocs(q);
          snap.forEach((docSnap) => keep(neuBuildStoryCandidate('neuStories', uid, docSnap)));
        } catch {
          // ignore collection/query that is not available
        }
      }
    };

    const loadLegacyStories = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'user_feed', uid, 'posts'), orderBy('createdAt', 'desc'), limit(NEU_STORY_LIMIT)));
        snap.forEach((docSnap) => keep(neuBuildStoryCandidate('legacy', uid, docSnap)));
      } catch {
        try {
          const snap = await getDocs(query(collection(db, 'user_feed', uid, 'posts'), limit(NEU_STORY_LIMIT)));
          snap.forEach((docSnap) => keep(neuBuildStoryCandidate('legacy', uid, docSnap)));
        } catch {
          // ignore
        }
      }
    };

    await Promise.all([loadNeuStories(), loadLegacyStories()]);

    const stories = Array.from(collected.values()).sort((a, b) => neuTs(b.createdAt) - neuTs(a.createdAt));
    neuRebuildStoryLookup(stories);
    neuStoryCrudState.lastLoadedAt = Date.now();
    return stories;
  })();

  neuStoryCrudState.loadingPromise = task;
  try {
    return await task;
  } finally {
    neuStoryCrudState.loadingPromise = null;
  }
}

function neuFindOwnStoryCandidate({ author = '', media = '' } = {}) {
  if (author && !neuAuthorLooksMine(author)) return null;
  for (const mediaKey of neuMediaLookupKeys(media)) {
    const list = neuStoryCrudState.byMedia.get(mediaKey);
    if (Array.isArray(list) && list.length) return list[0];
  }
  return null;
}

function neuStoryDescriptorFromGridTile(tile) {
  const meta = String(tile.querySelector('.story-tile-meta')?.textContent || '');
  const author = meta.includes('|') ? meta.split('|')[0].trim() : meta.trim();
  const media = String(
    tile.querySelector('.story-tile-media img')?.getAttribute('src') ||
      tile.querySelector('.story-tile-media video')?.getAttribute('src') ||
      '',
  ).trim();
  return { author, media };
}

function neuStoryDescriptorFromStripPill(pill) {
  const author = String(pill.querySelector('.story-pill-title')?.textContent || '').trim();
  const media = String(
    pill.querySelector('.story-pill-media img')?.getAttribute('src') ||
      pill.querySelector('.story-pill-media video')?.getAttribute('src') ||
      '',
  ).trim();
  return { author, media };
}

function neuApplyStoryKey(node, item) {
  if (!(node instanceof HTMLElement)) return;
  const key = neuStoryCandidateKey(item);
  node.dataset.neuStoryKey = key;
  node.dataset.neuStorySource = item.source;
  node.dataset.neuStoryId = item.id;
}

function neuClearStoryKey(node) {
  if (!(node instanceof HTMLElement)) return;
  delete node.dataset.neuStoryKey;
  delete node.dataset.neuStorySource;
  delete node.dataset.neuStoryId;
}

function neuEnsureStoryGridMenu(tile) {
  let menu = tile.querySelector('.neu-story-grid-menu');
  if (menu instanceof HTMLElement) return menu;

  menu = document.createElement('span');
  menu.className = 'neu-story-grid-menu';
  menu.innerHTML = `
    <span class="neu-story-menu-toggle" data-neu-story-menu-toggle="1" role="button" tabindex="0" aria-label="Opciones">&#x22ef;</span>
    <span class="neu-story-menu-panel" hidden>
      <span class="neu-story-menu-item neu-story-menu-item-danger" data-neu-story-action="delete" role="button" tabindex="0">Eliminar</span>
    </span>
  `;
  tile.append(menu);
  return menu;
}

function neuCloseAllStoryMenus(except = null) {
  document.querySelectorAll('.neu-story-grid-menu').forEach((menu) => {
    if (menu === except) return;
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
  });

  const modalMenu = document.getElementById('neuStoryModalMenu');
  if (modalMenu instanceof HTMLElement && modalMenu !== except) {
    modalMenu.classList.remove('is-open');
    const panel = modalMenu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
  }
}

function neuToggleStoryMenu(menu) {
  if (!(menu instanceof HTMLElement)) return;
  const isOpen = menu.classList.contains('is-open');
  if (isOpen) {
    menu.classList.remove('is-open');
    const panel = menu.querySelector('.neu-story-menu-panel');
    if (panel instanceof HTMLElement) panel.hidden = true;
    return;
  }

  neuCloseAllStoryMenus(menu);
  menu.classList.add('is-open');
  const panel = menu.querySelector('.neu-story-menu-panel');
  if (panel instanceof HTMLElement) panel.hidden = false;
}

function neuDecorateStoriesGrid() {
  const grid = document.getElementById('storiesGrid');
  if (!(grid instanceof HTMLElement)) return;

  grid.querySelectorAll('.story-tile[data-story-open]').forEach((tile) => {
    const descriptor = neuStoryDescriptorFromGridTile(tile);
    const match = neuFindOwnStoryCandidate(descriptor);
    const existingMenu = tile.querySelector('.neu-story-grid-menu');

    if (!match) {
      existingMenu?.remove();
      neuClearStoryKey(tile);
      return;
    }

    neuApplyStoryKey(tile, match);
    neuEnsureStoryGridMenu(tile);
  });
}

function neuAnnotateStoriesStrip() {
  const strip = document.getElementById('storiesStrip');
  if (!(strip instanceof HTMLElement)) return;

  strip.querySelectorAll('.story-pill[data-story-open]').forEach((pill) => {
    const descriptor = neuStoryDescriptorFromStripPill(pill);
    const match = neuFindOwnStoryCandidate(descriptor);
    if (!match) {
      neuClearStoryKey(pill);
      return;
    }
    neuApplyStoryKey(pill, match);
  });
}

function neuEnsureStoryModalMenu() {
  const actions = document.querySelector('#storyModal .story-modal-actions');
  if (!(actions instanceof HTMLElement)) return null;

  let menu = document.getElementById('neuStoryModalMenu');
  if (menu instanceof HTMLElement) return menu;

  menu = document.createElement('div');
  menu.id = 'neuStoryModalMenu';
  menu.className = 'neu-story-modal-menu';
  menu.hidden = true;
  menu.innerHTML = `
    <button class="neu-story-menu-toggle" data-neu-story-menu-toggle="1" type="button" aria-label="Opciones">&#x22ef;</button>
    <div class="neu-story-menu-panel" hidden>
      <button class="neu-story-menu-item neu-story-menu-item-danger" data-neu-story-action="delete" type="button">Eliminar</button>
    </div>
  `;
  actions.prepend(menu);
  return menu;
}

function neuModalStoryDescriptor() {
  const modal = document.getElementById('storyModal');
  if (!(modal instanceof HTMLElement) || modal.hidden) return null;

  const titleRaw = String(document.getElementById('storyModalTitle')?.textContent || '').trim();
  const author = titleRaw.includes('|') ? titleRaw.split('|')[0].trim() : titleRaw;
  const mediaWrap = document.getElementById('storyModalMediaWrap');
  const media = String(
    mediaWrap?.querySelector('img')?.getAttribute('src') || mediaWrap?.querySelector('video')?.getAttribute('src') || '',
  ).trim();
  if (!author && !media) return null;
  return { author, media };
}

function neuRefreshStoryModalMenu() {
  const menu = neuEnsureStoryModalMenu();
  if (!(menu instanceof HTMLElement)) return;

  const descriptor = neuModalStoryDescriptor();
  if (!descriptor) {
    if (!menu.hidden) menu.hidden = true;
    menu.dataset.neuStoryKey = '';
    return;
  }

  const match = neuFindOwnStoryCandidate(descriptor);
  if (!match) {
    if (!menu.hidden) menu.hidden = true;
    menu.dataset.neuStoryKey = '';
    return;
  }

  const key = neuStoryCandidateKey(match);
  if (menu.hidden) menu.hidden = false;
  menu.dataset.neuStoryKey = key;
}

function neuStoryCandidateByKey(key) {
  return neuStoryCrudState.byKey.get(String(key || '').trim()) || null;
}

function neuEnsureStoryDeleteModal() {
  let modal = document.getElementById('neuStoryDeleteModal');
  if (modal instanceof HTMLElement) return modal;

  modal = document.createElement('div');
  modal.id = 'neuStoryDeleteModal';
  modal.className = 'neu-confirm-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="neu-confirm-backdrop" data-neu-story-delete-close="1"></div>
    <div class="neu-confirm-card" role="dialog" aria-modal="true" aria-labelledby="neuStoryDeleteTitle">
      <h3 id="neuStoryDeleteTitle">Eliminar story</h3>
      <p>Se eliminará de stories y del perfil.</p>
      <div class="neu-confirm-actions">
        <button class="btn-white-outline" id="neuStoryDeleteCancelBtn" type="button">Cancelar</button>
        <button class="btn-yellow neu-danger-btn" id="neuStoryDeleteConfirmBtn" type="button">Eliminar</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

function neuOpenStoryDeleteModal(storyKey) {
  const modal = neuEnsureStoryDeleteModal();
  neuStoryCrudState.pendingDeleteKey = String(storyKey || '');
  modal.hidden = false;
}

function neuCloseStoryDeleteModal() {
  const modal = document.getElementById('neuStoryDeleteModal');
  if (modal instanceof HTMLElement) modal.hidden = true;
  neuStoryCrudState.pendingDeleteKey = '';
}

function neuResolveStoryStorageRef(item) {
  const path = String(item?.storagePath || '').trim();
  if (path) {
    try {
      return storageRef(storage, path);
    } catch {
      return null;
    }
  }

  const media = String(item?.media || '').trim();
  if (!media) return null;
  if (!media.startsWith('gs://') && !media.includes('firebasestorage.googleapis.com')) return null;

  try {
    return storageRef(storage, media);
  } catch {
    return null;
  }
}

function neuRemoveDeletedStoryFromUi(storyKey) {
  const key = String(storyKey || '').trim();
  if (!key) return;
  document.querySelectorAll(`[data-neu-story-key="${key}"]`).forEach((node) => node.remove());

  const modalMenu = document.getElementById('neuStoryModalMenu');
  if (modalMenu instanceof HTMLElement && String(modalMenu.dataset.neuStoryKey || '') === key) {
    modalMenu.hidden = true;
    modalMenu.dataset.neuStoryKey = '';
    const closeBtn = document.getElementById('storyCloseBtn');
    if (closeBtn instanceof HTMLElement) closeBtn.click();
  }
}

async function neuDeleteStoryByKey(storyKey) {
  if (neuStoryCrudState.deleting) return;

  const item = neuStoryCandidateByKey(storyKey);
  const meUid = neuCurrentUid();
  if (!item || !meUid || item.ownerUid !== meUid) {
    neuSetComposerInlineMsg('Solo puedes eliminar tus stories.', true);
    neuCloseStoryDeleteModal();
    return;
  }

  const confirmBtn = document.getElementById('neuStoryDeleteConfirmBtn');
  if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
  neuStoryCrudState.deleting = true;

  try {
    await deleteDoc(item.ref);

    const sRef = neuResolveStoryStorageRef(item);
    if (sRef) {
      try {
        await deleteObject(sRef);
      } catch (storageError) {
        console.warn('[neu-story] storage delete failed', storageError);
      }
    } else {
      // TODO: Add explicit storage cleanup once raw storage path is available for every story source.
      console.info('[neu-story] TODO storage cleanup for story', item.id);
    }

    neuStoryCrudState.byKey.delete(storyKey);
    neuStoryCrudState.stories = neuStoryCrudState.stories.filter((candidate) => neuStoryCandidateKey(candidate) !== storyKey);
    neuRebuildStoryLookup(neuStoryCrudState.stories);

    neuRemoveDeletedStoryFromUi(storyKey);
    neuSetComposerInlineMsg('Story eliminada.');
    neuCloseStoryDeleteModal();

    window.setTimeout(() => location.reload(), 180);
  } catch (error) {
    console.error('[neu-story] delete failed', error);
    neuSetComposerInlineMsg('No se pudo eliminar la story.', true);
    neuCloseStoryDeleteModal();
  } finally {
    neuStoryCrudState.deleting = false;
    if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = false;
  }
}

function neuScheduleStoryDecorate({ forceReload = false } = {}) {
  if (neuStoryCrudState.refreshTimer) {
    window.clearTimeout(neuStoryCrudState.refreshTimer);
  }
  if (neuStoryCrudState.refreshInFlight) {
    neuStoryCrudState.refreshQueued = true;
    return;
  }

  const minDelay = 120;
  const sinceLast = Date.now() - neuStoryCrudState.refreshLastAt;
  const delay = sinceLast >= minDelay ? 90 : Math.max(90, minDelay - sinceLast);

  neuStoryCrudState.refreshTimer = window.setTimeout(async () => {
    neuStoryCrudState.refreshInFlight = true;
    neuStoryCrudState.refreshLastAt = Date.now();
    try {
      await neuLoadOwnStoryCandidates({ force: forceReload });
      neuDecorateStoriesGrid();
      neuAnnotateStoriesStrip();
      neuRefreshStoryModalMenu();
    } catch (error) {
      console.warn('[neu-story] refresh failed', error);
    } finally {
      neuStoryCrudState.refreshInFlight = false;
      if (neuStoryCrudState.refreshQueued) {
        neuStoryCrudState.refreshQueued = false;
        neuScheduleStoryDecorate({ forceReload: false });
      }
    }
  }, delay);
}

function neuGetStoryKeyFromActionTarget(node) {
  const fromModal = node.closest('#neuStoryModalMenu');
  if (fromModal instanceof HTMLElement) return String(fromModal.dataset.neuStoryKey || '').trim();

  const fromTile = node.closest('.story-tile[data-neu-story-key], .story-pill[data-neu-story-key]');
  if (fromTile instanceof HTMLElement) return String(fromTile.dataset.neuStoryKey || '').trim();
  return '';
}

function neuWireStoryCrudEvents() {
  if (neuStoryCrudState.wired) return;
  neuStoryCrudState.wired = true;

  neuEnsureStoryModalMenu();
  neuEnsureStoryDeleteModal();
  neuScheduleStoryDecorate({ forceReload: true });

  const storiesGrid = document.getElementById('storiesGrid');
  if (storiesGrid instanceof HTMLElement) {
    neuStoryCrudState.gridObserver = new MutationObserver(() => {
      neuScheduleStoryDecorate();
    });
    // Root childList is enough because legacy renderer replaces tile list at root.
    neuStoryCrudState.gridObserver.observe(storiesGrid, { childList: true });
  }

  const storiesStrip = document.getElementById('storiesStrip');
  if (storiesStrip instanceof HTMLElement) {
    neuStoryCrudState.stripObserver = new MutationObserver(() => {
      neuScheduleStoryDecorate();
    });
    neuStoryCrudState.stripObserver.observe(storiesStrip, { childList: true });
  }

  const storyModal = document.getElementById('storyModal');
  if (storyModal instanceof HTMLElement) {
    neuStoryCrudState.modalObserver = new MutationObserver(() => {
      neuRefreshStoryModalMenu();
    });
    // Observe only modal open/close; subtree watchers can trigger high-frequency loops.
    neuStoryCrudState.modalObserver.observe(storyModal, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeDelete = target.closest('[data-neu-story-delete-close], #neuStoryDeleteCancelBtn');
      if (closeDelete) {
        event.preventDefault();
        neuCloseStoryDeleteModal();
        return;
      }

      const confirmDelete = target.closest('#neuStoryDeleteConfirmBtn');
      if (confirmDelete) {
        event.preventDefault();
        event.stopImmediatePropagation();
        neuDeleteStoryByKey(neuStoryCrudState.pendingDeleteKey).catch((error) => {
          console.error('[neu-story] delete handler failed', error);
          neuSetComposerInlineMsg('No se pudo eliminar la story.', true);
        });
        return;
      }

      const menuToggle = target.closest('.neu-story-menu-toggle');
      if (menuToggle) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const menu = menuToggle.closest('.neu-story-grid-menu, #neuStoryModalMenu');
        neuToggleStoryMenu(menu);
        return;
      }

      const menuAction = target.closest('[data-neu-story-action="delete"]');
      if (menuAction) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const key = neuGetStoryKeyFromActionTarget(menuAction);
        neuCloseAllStoryMenus();
        if (!key) return;
        neuOpenStoryDeleteModal(key);
        return;
      }

      if (!target.closest('.neu-story-grid-menu, #neuStoryModalMenu')) {
        neuCloseAllStoryMenus();
      }

      const storyNavigationTrigger = target.closest(
        '[data-story-open], #storyPrevBtn, #storyNextBtn, #storyCloseBtn, [data-story-close]',
      );
      if (storyNavigationTrigger) {
        window.setTimeout(() => {
          neuRefreshStoryModalMenu();
        }, 0);
      }
    },
    true,
  );

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const isToggle = target.matches('.neu-story-menu-toggle, [data-neu-story-action]');
    if (!isToggle) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

const NEU_PROFILE_PARAM = 'profile';
const NEU_PROFILE_ME = 'me';
const NEU_PORTAL_ALLOWED = new Set(['feed', 'reels', 'stories', 'network', 'pulse']);
const NEU_BOTTOM_KEYS = Object.freeze({
  FEED: 'inicio',
  REELS: 'mapa',
  PULSE: 'chats',
  CREATE: 'crear',
  PROFILE: 'perfil',
});

let neuBottomNavWired = false;
let neuPortalProxyRoot = null;

function getBottomNavKey(button) {
  if (!(button instanceof HTMLElement)) return '';
  if (button.id === 'btnBottomCreate') return NEU_BOTTOM_KEYS.CREATE;
  if (button.id === 'btnBottomProfile') return NEU_BOTTOM_KEYS.PROFILE;

  const target = String(button.dataset.bottomTarget || button.dataset.portalTarget || '')
    .trim()
    .toLowerCase();
  if (target === 'feed') return NEU_BOTTOM_KEYS.FEED;
  if (target === 'reels') return NEU_BOTTOM_KEYS.REELS;
  if (target === 'pulse') return NEU_BOTTOM_KEYS.PULSE;
  return '';
}

function isProfileRouteActive() {
  const params = new URLSearchParams(location.search);
  return String(params.get(NEU_PROFILE_PARAM) || '').trim().toLowerCase() === NEU_PROFILE_ME;
}

function getPortalFromQuery() {
  const params = new URLSearchParams(location.search);
  const portal = String(params.get('portal') || '')
    .trim()
    .toLowerCase();
  return NEU_PORTAL_ALLOWED.has(portal) ? portal : '';
}

function getCurrentFeedSource() {
  const active = document.querySelector('.feed-source-btn.is-active');
  return String(active?.getAttribute?.('data-feed-source') || '')
    .trim()
    .toLowerCase();
}

function updateNeuRouteParams({ portal, profileMode } = {}) {
  const url = new URL(location.href);
  if (typeof portal === 'string' && portal) {
    url.searchParams.set('portal', portal);
  }

  if (profileMode === true) url.searchParams.set(NEU_PROFILE_PARAM, NEU_PROFILE_ME);
  if (profileMode === false) url.searchParams.delete(NEU_PROFILE_PARAM);

  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
}

function syncRouteFromPortalState(portalName) {
  const portal = String(portalName || '').trim().toLowerCase();
  if (!NEU_PORTAL_ALLOWED.has(portal)) return;

  if (portal !== 'feed') {
    updateNeuRouteParams({ portal, profileMode: false });
    return;
  }

  const feedSource = getCurrentFeedSource();
  const keepProfile = isProfileRouteActive() && (!feedSource || feedSource === 'target');
  updateNeuRouteParams({ portal, profileMode: keepProfile ? true : false });
}

function ensurePortalProxyRoot() {
  if (neuPortalProxyRoot instanceof HTMLElement) return neuPortalProxyRoot;

  const root = document.createElement('div');
  root.id = 'neuPortalProxyRoot';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  document.body.append(root);
  neuPortalProxyRoot = root;
  return root;
}

function ensurePortalProxyButton(portal) {
  const normalized = String(portal || '').trim().toLowerCase();
  if (!NEU_PORTAL_ALLOWED.has(normalized)) return null;

  const root = ensurePortalProxyRoot();
  const selector = `[data-neu-proxy-portal="${normalized}"]`;
  const existing = root.querySelector(selector);
  if (existing instanceof HTMLButtonElement) return existing;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.portalTarget = normalized;
  button.dataset.neuProxyPortal = normalized;
  root.append(button);
  return button;
}

function activatePortal(portal) {
  const trigger = ensurePortalProxyButton(portal);
  if (!(trigger instanceof HTMLButtonElement)) return;
  trigger.click();
}

function activateFeedSource(source) {
  const normalized = String(source || '').trim().toLowerCase();
  const trigger = document.querySelector(`[data-feed-source="${normalized}"]`);
  if (trigger instanceof HTMLElement) trigger.click();
}

function openComposerModalFromBottom() {
  const trigger = document.getElementById('btnOpenComposer') || document.querySelector('[data-open-composer]');
  if (trigger instanceof HTMLElement) {
    trigger.click();
    return;
  }

  const modal = document.getElementById('composerModal');
  if (modal instanceof HTMLElement) {
    modal.hidden = false;
    document.body.classList.add('modal-open');
  }
}

function resolveBottomNavActiveKey() {
  const activePortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
  if (activePortal === 'feed') {
    const feedSource = getCurrentFeedSource();
    if (isProfileRouteActive() && (!feedSource || feedSource === 'target')) return NEU_BOTTOM_KEYS.PROFILE;
    return NEU_BOTTOM_KEYS.FEED;
  }
  if (activePortal === 'reels') return NEU_BOTTOM_KEYS.REELS;
  if (activePortal === 'pulse') return NEU_BOTTOM_KEYS.PULSE;
  return '';
}

function syncBottomNavActiveState() {
  const activeKey = resolveBottomNavActiveKey();
  document.querySelectorAll('.fusion-bottom-nav .bottom-nav-btn').forEach((button) => {
    const key = getBottomNavKey(button);
    const isActive = !!key && key === activeKey;
    button.classList.toggle('is-active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function scrollTopSmooth() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function routeBottomNav(key) {
  qaDebug('bottom-nav click', {
    key,
    portalBefore: String(document.body?.dataset?.portal || '').toLowerCase(),
    profileRoute: isProfileRouteActive(),
  });

  if (key === NEU_BOTTOM_KEYS.FEED) {
    updateNeuRouteParams({ portal: 'feed', profileMode: false });
    activatePortal('feed');
    activateFeedSource('discover');
    scrollTopSmooth();
    syncBottomNavActiveState();
    return;
  }

  if (key === NEU_BOTTOM_KEYS.REELS) {
    updateNeuRouteParams({ portal: 'reels', profileMode: false });
    activatePortal('reels');
    scrollTopSmooth();
    syncBottomNavActiveState();
    return;
  }

  if (key === NEU_BOTTOM_KEYS.PULSE) {
    updateNeuRouteParams({ portal: 'pulse', profileMode: false });
    activatePortal('pulse');
    scrollTopSmooth();
    syncBottomNavActiveState();
    return;
  }

  if (key === NEU_BOTTOM_KEYS.PROFILE) {
    updateNeuRouteParams({ portal: 'feed', profileMode: true });
    activatePortal('feed');
    activateFeedSource('target');
    scrollTopSmooth();
    syncBottomNavActiveState();
    return;
  }

  if (key === NEU_BOTTOM_KEYS.CREATE) {
    updateNeuRouteParams({ portal: 'feed', profileMode: false });
    activatePortal('feed');
    openComposerModalFromBottom();
    syncBottomNavActiveState();
  }
}

function applyInitialBottomNavRoute() {
  const portalFromQuery = getPortalFromQuery();
  qaDebug('initial-route', {
    portalFromQuery: portalFromQuery || '(none)',
    profileRoute: isProfileRouteActive(),
  });

  if (isProfileRouteActive()) {
    updateNeuRouteParams({ portal: 'feed', profileMode: true });
    activatePortal('feed');
    activateFeedSource('target');
  } else if (portalFromQuery) {
    updateNeuRouteParams({ portal: portalFromQuery, profileMode: false });
    activatePortal(portalFromQuery);
  }
  window.setTimeout(syncBottomNavActiveState, 0);
}

function wireNeuBottomNavRouter() {
  if (neuBottomNavWired) return;
  neuBottomNavWired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest('.fusion-bottom-nav .bottom-nav-btn');
      if (!(button instanceof HTMLElement)) return;

      const key = getBottomNavKey(button);
      if (!key) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      routeBottomNav(key);
    },
    true,
  );

  if (SAFE_ENABLE_PORTAL_OBS) {
    let lastPortal = '';
    const observer = new MutationObserver(() => {
      const activePortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
      if (!NEU_PORTAL_ALLOWED.has(activePortal)) {
        syncBottomNavActiveState();
        return;
      }

      if (activePortal !== lastPortal) {
        qaDebug('portal-change', { from: lastPortal || '(none)', to: activePortal });
        lastPortal = activePortal;
      }

      syncRouteFromPortalState(activePortal);
      syncBottomNavActiveState();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-portal'] });
  }

  window.addEventListener('popstate', () => {
    qaDebug('popstate', {
      portalQuery: getPortalFromQuery() || '(none)',
      profileRoute: isProfileRouteActive(),
    });
    syncBottomNavActiveState();
  });

  applyInitialBottomNavRoute();
}

let neuLogoutWired = false;
function wireNeuDropdownLogout() {
  if (neuLogoutWired) return;
  neuLogoutWired = true;

  document.addEventListener(
    'click',
    async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const logoutItem = target.closest('#navProfileLogout');
      if (!logoutItem) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        await signOut(auth);
        location.href = 'neu-login.html';
      } catch (error) {
        console.error('[neu-auth] signOut failed', error);
        window.alert('No se pudo cerrar sesion. Intenta de nuevo.');
      }
    },
    true,
  );
}

async function neuBootModule(name, fn, timeout = 1200) {
  const start = performance.now();
  let finished = false;
  let timedOut = false;
  let timeoutId = 0;

  const timer = new Promise((resolve) => {
    timeoutId = window.setTimeout(() => {
      if (!finished) {
        timedOut = true;
        console.error('[NEU WATCHDOG] module timeout:', name);
        resolve('timeout');
      }
    }, timeout);
  });

  const run = (async () => {
    try {
      await fn();
      finished = true;
      if (timedOut) return 'timeout';
      const dur = Math.round(performance.now() - start);
      console.debug('[NEU WATCHDOG] module ok:', name, `${dur}ms`);
      return 'ok';
    } catch (e) {
      finished = true;
      console.error('[NEU WATCHDOG] module crash:', name, e);
      return 'error';
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  })();

  const result = await Promise.race([run, timer]);
  if (result !== 'ok' && document.body?.dataset) {
    document.body.dataset[`neuDisabled_${name}`] = '1';
  }
}

async function startNeuSocialApp() {
  wireQaLongTaskProbe();
  qaDebug('auth-check-start', {
    cachedUid: String(auth.currentUser?.uid || ''),
    safeMode: SAFE_MODE,
  });
  const user = await requireNeuAuth();
  qaDebug('auth-state', {
    authenticated: !!user,
    uid: String(user?.uid || ''),
    email: String(user?.email || ''),
  });
  wireNeuDropdownLogout();

  // Keep legacy profile fusion logic untouched; run it only after neu auth gate passed.
  await import('./perfil-fusion-page.js');
  if (SAFE_ENABLE_CRUD_POSTS) {
    await neuBootModule('crud_posts', () => neuWirePostCrudEvents());
  }
  if (SAFE_ENABLE_CRUD_STORIES) {
    await neuBootModule('crud_stories', () => neuWireStoryCrudEvents());
  }
  if (SAFE_ENABLE_FLOW_BRIDGE) {
    await neuBootModule('flow_bridge', () => initNeuFlowBridge());
  }
  if (SAFE_MODE) {
    qaDebug('safe-mode-active', {
      mod: SAFE_MODE_MOD || 'minimal',
      modules: {
        portalObs: SAFE_ENABLE_PORTAL_OBS,
        flowBridge: SAFE_ENABLE_FLOW_BRIDGE,
        crudPosts: SAFE_ENABLE_CRUD_POSTS,
        crudStories: SAFE_ENABLE_CRUD_STORIES,
      },
    });
  }
  wireNeuBottomNavRouter();
}

function boot() {
  startNeuSocialApp().catch((error) => {
    const message = String(error?.message || error || 'unknown');
    qaDebug('bootstrap-failed', { message });
    if (message === 'auth-timeout') return;
    showFatalOverlay(error, { source: 'bootstrap' });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
