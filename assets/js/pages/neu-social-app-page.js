import { signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import { requireNeuAuth } from '../neu-auth-gate.js?v=20260222c';
import { auth, db, storage } from '../neu-firebase-init.js?v=20260222c';

if (new URLSearchParams(location.search).get('qa') === '1') {
  console.log('[NEU PAGE] neu-social-app-page.js loaded');
}

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

const NEU_USERS_COLLECTION = 'neuUsers';
const NEU_FOLLOWS_COLLECTION = 'neuFollows';
const NEU_PROFILE_AVATAR_PREFIX = 'awatary/neu/';
const NEU_PROFILE_BIO_MAX = 160;
const NEU_PROFILE_FEED_LIMIT = 80;

const neuProfileState = {
  wired: false,
  loading: false,
  saving: false,
  readOnly: false,
  profile: null,
  pendingAvatarFile: null,
  pendingAvatarPreviewUrl: '',
  removeAvatar: false,
};

const neuProfileSyncState = {
  wired: false,
  applying: false,
  tick: 0,
};

const neuPublicProfileState = {
  wired: false,
  feedWired: false,
  initializing: false,
  meUid: '',
  targetUid: '',
  profileMode: false,
  isOwn: true,
  isFollowing: false,
  followLoading: false,
  followersCount: 0,
  followingCount: 0,
  posts: [],
  postsLoadedFor: '',
  postsLoading: false,
};

function neuProfileDocRef(uid) {
  return doc(db, NEU_USERS_COLLECTION, uid);
}

function neuEmailLocalPart(email) {
  const raw = String(email || '').trim();
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function neuHandleSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[@._-]+|[@._-]+$/g, '')
    .slice(0, 24);
}

function neuCleanCity(raw) {
  const city = String(raw || '').trim();
  if (!city) return '';
  const normalized = city.toLowerCase();
  if (normalized === 'online' || normalized === 'tu ciudad') return '';
  return city;
}

function neuEnsureHandle(rawHandle, displayName, uid) {
  const uidSuffix = String(uid || '').trim().slice(0, 6) || 'user';
  const withoutAt = String(rawHandle || '').replace(/^@+/, '').trim();
  const fromHandle = neuHandleSlug(withoutAt);
  const fromName = neuHandleSlug(displayName);
  const fromEmail = neuHandleSlug(neuEmailLocalPart(auth.currentUser?.email || ''));
  const token = fromHandle || fromName || fromEmail || `user${uidSuffix}`;
  return `@${token}`;
}

function neuDefaultProfile(uid) {
  const user = auth.currentUser || {};
  const emailName = neuEmailLocalPart(user.email);
  const displayName = String(user.displayName || emailName || 'Usuario').trim() || 'Usuario';
  const fallbackCity = neuCleanCity(readCity());
  return {
    displayName,
    handle: neuEnsureHandle('', displayName, uid),
    city: fallbackCity,
    bio: '',
    avatarUrl: String(user.photoURL || '').trim(),
    avatarStoragePath: '',
  };
}

function neuIsPermissionDenied(error) {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim().toLowerCase();
  return code.includes('permission-denied') || message.includes('missing or insufficient permissions');
}

function neuNormalizeProfile(raw = {}, uid = '') {
  const fallback = neuDefaultProfile(uid);
  const displayName = String(raw.displayName || raw.name || fallback.displayName).trim() || fallback.displayName;
  const handle = neuEnsureHandle(raw.handle || raw.username || '', displayName, uid);
  const city = neuCleanCity(raw.city || raw.ciudad || raw.location || raw.cityName || raw.region || fallback.city);
  const avatarUrl = String(
    raw.avatarUrl || raw.avatarURL || raw.photoURL || raw.photoUrl || raw.avatar || fallback.avatarUrl || '',
  ).trim();
  const avatarStoragePath = String(raw.avatarStoragePath || raw.avatarPath || raw.storagePath || '').trim();
  return {
    displayName,
    handle,
    city,
    bio: String(raw.bio || '').trim().slice(0, NEU_PROFILE_BIO_MAX),
    avatarUrl,
    avatarStoragePath,
  };
}

function neuAvatarLetter(label) {
  const text = String(label || '').trim();
  return text ? text.charAt(0).toUpperCase() : 'U';
}

function neuProfileFromUi(uid) {
  const name = String(document.getElementById('leftName')?.textContent || auth.currentUser?.displayName || '').trim();
  const handleRaw = String(document.getElementById('leftHandle')?.textContent || '').trim();
  const city = String(document.getElementById('profileCity')?.textContent || '').trim();
  const base = neuDefaultProfile(uid);
  const displayName = name || base.displayName;
  const avatarFromUi = String(document.getElementById('leftAvatarImg')?.getAttribute('src') || '').trim();
  return {
    displayName,
    handle: neuEnsureHandle(handleRaw, displayName, uid),
    city: neuCleanCity(city),
    bio: '',
    avatarUrl: avatarFromUi || base.avatarUrl,
    avatarStoragePath: '',
  };
}

function neuSetAvatarElements(imgEl, fallbackEl, photoURL, label) {
  if (!(imgEl instanceof HTMLElement) || !(fallbackEl instanceof HTMLElement)) return;
  const url = String(photoURL || '').trim();
  fallbackEl.textContent = neuAvatarLetter(label);
  if (!url) {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    fallbackEl.style.display = 'grid';
    return;
  }
  imgEl.setAttribute('src', url);
  imgEl.style.display = 'block';
  imgEl.style.visibility = 'visible';
  imgEl.style.opacity = '1';
  fallbackEl.style.display = 'none';
}

function neuSetNavAvatarNode(node, photoURL, displayName) {
  if (!(node instanceof HTMLElement)) return;
  const url = String(photoURL || '').trim();
  const letter = neuAvatarLetter(displayName);
  let img = node.querySelector('img');
  let span = node.querySelector('span');

  if (!(span instanceof HTMLElement)) {
    span = document.createElement('span');
    node.append(span);
  }
  span.textContent = letter;

  if (!url) {
    if (img instanceof HTMLElement) img.remove();
    node.classList.remove('nav-avatar--img');
    span.style.display = '';
    return;
  }

  if (!(img instanceof HTMLImageElement)) {
    img = document.createElement('img');
    img.alt = 'Foto de perfil';
    node.prepend(img);
  }
  img.src = url;
  node.classList.add('nav-avatar--img');
  span.style.display = 'none';
}

function neuApplyProfileToUi(profile) {
  if (!profile) return;
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, auth.currentUser?.uid || '');
  const city = neuCleanCity(profile.city) || neuCleanCity(readCity()) || 'Online';
  const avatarUrl = String(profile.avatarUrl || '').trim();
  const bio = String(profile.bio || '').trim();

  const leftName = document.getElementById('leftName');
  const leftHandle = document.getElementById('leftHandle');
  const profileCity = document.getElementById('profileCity');
  if (leftName) leftName.textContent = displayName;
  if (leftHandle) leftHandle.textContent = handle;
  if (profileCity) profileCity.textContent = city;

  neuSetAvatarElements(
    document.getElementById('leftAvatarImg'),
    document.getElementById('leftAvatarFallback'),
    avatarUrl,
    displayName,
  );
  neuSetAvatarElements(
    document.getElementById('composerInlineAvatarImg'),
    document.getElementById('composerInlineAvatarFallback'),
    avatarUrl,
    displayName,
  );

  neuSetAvatarElements(
    document.getElementById('topAvatarImg'),
    document.getElementById('topAvatarFallback'),
    avatarUrl,
    displayName,
  );
  neuSetAvatarElements(
    document.getElementById('heroAvatarImg'),
    document.getElementById('heroAvatarFallback'),
    avatarUrl,
    displayName,
  );

  neuSetNavAvatarNode(document.getElementById('navProfileToggle'), avatarUrl, displayName);
  neuSetNavAvatarNode(document.querySelector('#navProfileMenu .nav-avatar'), avatarUrl, displayName);
  const navName = document.querySelector('#navProfileMenu .nav-profile-name');
  if (navName instanceof HTMLElement) navName.textContent = displayName;
  const navHandle = document.querySelector('#navProfileMenu .nav-profile-handle');
  if (navHandle instanceof HTMLElement) navHandle.textContent = handle;

  const leftStatus = document.getElementById('leftStatus');
  if (leftStatus instanceof HTMLElement) {
    leftStatus.textContent = bio;
    leftStatus.classList.toggle('is-hidden', !bio);
  }
}

function neuNeedsProfileUiSync(profile = neuProfileState.profile) {
  if (!profile || !isProfileRouteActive()) return false;
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, auth.currentUser?.uid || '');
  const city = neuCleanCity(profile.city) || neuCleanCity(readCity()) || 'Online';
  const avatarUrl = String(profile.avatarUrl || '').trim();

  const leftName = String(document.getElementById('leftName')?.textContent || '').trim();
  const leftHandle = String(document.getElementById('leftHandle')?.textContent || '').trim();
  const leftCity = String(document.getElementById('profileCity')?.textContent || '').trim();
  if (leftName !== displayName || leftHandle !== handle || leftCity !== city) return true;

  const leftAvatarAttr = String(document.getElementById('leftAvatarImg')?.getAttribute('src') || '').trim();
  const composerAvatarAttr = String(document.getElementById('composerInlineAvatarImg')?.getAttribute('src') || '').trim();
  if (avatarUrl) {
    if (leftAvatarAttr !== avatarUrl || composerAvatarAttr !== avatarUrl) return true;
  } else if (leftAvatarAttr || composerAvatarAttr) {
    return true;
  }

  return false;
}

function neuRunProfileUiSync() {
  if (neuProfileSyncState.applying) return;
  if (!neuNeedsProfileUiSync()) return;
  neuProfileSyncState.applying = true;
  neuApplyProfileToUi(neuProfileState.profile);
  neuSyncProfileActionsUi();
  neuSyncProfileCountsUi();
  window.setTimeout(() => {
    neuProfileSyncState.applying = false;
  }, 0);
}

function neuQueueProfileUiSync(delay = 70) {
  if (neuProfileSyncState.tick) window.clearTimeout(neuProfileSyncState.tick);
  neuProfileSyncState.tick = window.setTimeout(() => {
    neuProfileSyncState.tick = 0;
    neuRunProfileUiSync();
  }, delay);
}

function neuWireProfileIdentitySync() {
  if (neuProfileSyncState.wired) return;
  neuProfileSyncState.wired = true;

  const onWake = () => neuQueueProfileUiSync(0);
  window.addEventListener('focus', onWake);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onWake();
  });

  if (isDisabled('observers')) return;

  const observeTargets = [
    document.querySelector('.profile-compact'),
    document.getElementById('fusionComposer'),
    document.getElementById('navProfile'),
  ].filter((node) => node instanceof HTMLElement);

  observeTargets.forEach((node) => {
    const observer = new MutationObserver(() => {
      neuQueueProfileUiSync(50);
    });
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'style', 'class'],
    });
  });
}

function neuSetProfileEditorVisible(visible) {
  const btn = document.getElementById('btnNeuEditProfile');
  if (!(btn instanceof HTMLElement)) return;
  btn.classList.toggle('is-hidden', !visible);
}

function neuSetProfileMsg(text, bad = false) {
  const node = document.getElementById('neuProfileMsg');
  if (!(node instanceof HTMLElement)) return;
  node.textContent = String(text || '');
  node.style.color = bad ? '#ffb2bf' : 'rgba(230,236,255,0.92)';
}

function neuSetProfileModalOpen(open) {
  const modal = document.getElementById('neuProfileModal');
  if (!(modal instanceof HTMLElement)) return;
  modal.hidden = !open;
  document.body.classList.toggle('modal-open', !!open);
}

function neuRevokeProfilePreviewUrl() {
  const url = String(neuProfileState.pendingAvatarPreviewUrl || '').trim();
  if (!url) return;
  URL.revokeObjectURL(url);
  neuProfileState.pendingAvatarPreviewUrl = '';
}

function neuCurrentProfileAvatarUrl() {
  if (neuProfileState.pendingAvatarPreviewUrl) return neuProfileState.pendingAvatarPreviewUrl;
  if (neuProfileState.removeAvatar) return '';
  return String(neuProfileState.profile?.avatarUrl || '').trim();
}

function neuUpdateProfileBioCount() {
  const input = document.getElementById('neuProfileBioInput');
  const count = document.getElementById('neuProfileBioCount');
  if (!(input instanceof HTMLTextAreaElement) || !(count instanceof HTMLElement)) return;
  const len = String(input.value || '').trim().length;
  count.textContent = `${len}/${NEU_PROFILE_BIO_MAX}`;
}

function neuRenderProfileAvatarPreview() {
  const name = String(document.getElementById('neuProfileNameInput')?.value || neuProfileState.profile?.displayName || 'Usuario').trim();
  neuSetAvatarElements(
    document.getElementById('neuProfileAvatarPreviewImg'),
    document.getElementById('neuProfileAvatarPreviewFallback'),
    neuCurrentProfileAvatarUrl(),
    name,
  );
}

function neuHydrateProfileForm(profile) {
  const data = profile || neuProfileState.profile || {};
  const nameInput = document.getElementById('neuProfileNameInput');
  const cityInput = document.getElementById('neuProfileCityInput');
  const bioInput = document.getElementById('neuProfileBioInput');
  if (nameInput instanceof HTMLInputElement) nameInput.value = String(data.displayName || '').trim();
  if (cityInput instanceof HTMLInputElement) cityInput.value = String(data.city || '').trim();
  if (bioInput instanceof HTMLTextAreaElement) bioInput.value = String(data.bio || '').trim().slice(0, NEU_PROFILE_BIO_MAX);
  neuUpdateProfileBioCount();
  neuRenderProfileAvatarPreview();
}

function neuIsOwnProfileContext() {
  const meUid = String(auth.currentUser?.uid || '').trim();
  if (!meUid) return false;
  const targetUid = getProfileUidFromQuery(meUid);
  if (!targetUid) return false;
  return targetUid === meUid;
}

function neuIsManagedAvatarPath(path) {
  return String(path || '').trim().startsWith(NEU_PROFILE_AVATAR_PREFIX);
}

async function neuDeleteManagedAvatar(path) {
  const clean = String(path || '').trim();
  if (!clean || !neuIsManagedAvatarPath(clean)) return;
  try {
    await deleteObject(storageRef(storage, clean));
  } catch (error) {
    console.warn('[neu-profile] avatar delete failed', error);
  }
}

async function neuUploadProfileAvatar(uid, file) {
  const path = `${NEU_PROFILE_AVATAR_PREFIX}${uid}/${Date.now()}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file, {
    contentType: String(file?.type || 'image/jpeg').trim() || 'image/jpeg',
  });
  const url = await getDownloadURL(ref);
  return { avatarUrl: url, avatarStoragePath: path };
}

async function neuLoadOrCreateProfile(uid) {
  const ref = neuProfileDocRef(uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = neuDefaultProfile(uid);
      await setDoc(
        ref,
        {
          ...profile,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return { profile, readOnly: false };
    }

    const raw = snap.data() || {};
    const profile = neuNormalizeProfile(raw, uid);
    const patch = {};
    if (!String(raw.displayName || '').trim()) patch.displayName = profile.displayName;
    if (!String(raw.handle || '').trim()) patch.handle = profile.handle;
    if (Object.keys(patch).length) {
      patch.updatedAt = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
    }
    return { profile, readOnly: false };
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      return { profile: neuProfileFromUi(uid), readOnly: true };
    }
    throw error;
  }
}

function neuSetProfileSaving(saving) {
  const on = saving === true;
  const saveBtn = document.getElementById('btnNeuProfileSave');
  const cancelBtn = document.getElementById('btnNeuProfileCancel');
  const closeBtn = document.getElementById('btnNeuProfileClose');
  const removeBtn = document.getElementById('btnNeuProfileAvatarRemove');
  const fileInput = document.getElementById('neuProfileAvatarFile');
  const nameInput = document.getElementById('neuProfileNameInput');
  const cityInput = document.getElementById('neuProfileCityInput');
  const bioInput = document.getElementById('neuProfileBioInput');
  const disabled = on || neuProfileState.readOnly;
  if (saveBtn instanceof HTMLButtonElement) {
    saveBtn.disabled = disabled;
    saveBtn.textContent = neuProfileState.readOnly ? 'Sin permisos' : on ? 'Guardando...' : 'Guardar cambios';
  }
  if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = on;
  if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = on;
  if (removeBtn instanceof HTMLButtonElement) removeBtn.disabled = disabled;
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = disabled;
  if (nameInput instanceof HTMLInputElement) nameInput.disabled = neuProfileState.readOnly;
  if (cityInput instanceof HTMLInputElement) cityInput.disabled = neuProfileState.readOnly;
  if (bioInput instanceof HTMLTextAreaElement) bioInput.disabled = neuProfileState.readOnly;
}

function neuSetProfileReadOnly(readOnly, message = '') {
  neuProfileState.readOnly = readOnly === true;
  neuSetProfileSaving(neuProfileState.saving);
  if (neuProfileState.readOnly) {
    neuSetProfileMsg(message || 'Sin permisos para editar el perfil.', true);
  }
}

async function neuSaveProfileChanges() {
  if (neuProfileState.saving) return;
  if (neuProfileState.readOnly) {
    neuSetProfileMsg('Sin permisos para guardar cambios.', true);
    return;
  }
  const uid = String(auth.currentUser?.uid || '').trim();
  if (!uid) return;

  const nameInput = document.getElementById('neuProfileNameInput');
  const cityInput = document.getElementById('neuProfileCityInput');
  const bioInput = document.getElementById('neuProfileBioInput');

  const displayName = String(nameInput instanceof HTMLInputElement ? nameInput.value : '')
    .trim()
    .slice(0, 60) || 'Usuario';
  const city = String(cityInput instanceof HTMLInputElement ? cityInput.value : '')
    .trim()
    .slice(0, 60);
  const bio = String(bioInput instanceof HTMLTextAreaElement ? bioInput.value : '')
    .trim()
    .slice(0, NEU_PROFILE_BIO_MAX);
  const handle = neuEnsureHandle(neuProfileState.profile?.handle || '', displayName, uid);

  let avatarUrl = String(neuProfileState.profile?.avatarUrl || '').trim();
  let avatarStoragePath = String(neuProfileState.profile?.avatarStoragePath || '').trim();

  neuProfileState.saving = true;
  neuSetProfileSaving(true);
  neuSetProfileMsg('Guardando cambios...');

  try {
    if (neuProfileState.removeAvatar) {
      if (avatarStoragePath) await neuDeleteManagedAvatar(avatarStoragePath);
      avatarStoragePath = '';
      avatarUrl = '';
    }

    if (neuProfileState.pendingAvatarFile instanceof File) {
      const uploaded = await neuUploadProfileAvatar(uid, neuProfileState.pendingAvatarFile);
      if (avatarStoragePath && avatarStoragePath !== uploaded.avatarStoragePath) {
        await neuDeleteManagedAvatar(avatarStoragePath);
      }
      avatarUrl = uploaded.avatarUrl;
      avatarStoragePath = uploaded.avatarStoragePath;
    }

    await setDoc(
      neuProfileDocRef(uid),
      {
        displayName,
        handle,
        city,
        bio,
        avatarUrl,
        avatarStoragePath,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    neuProfileState.profile = {
      ...(neuProfileState.profile || {}),
      displayName,
      handle,
      city,
      bio,
      avatarUrl,
      avatarStoragePath,
    };
    neuProfileState.pendingAvatarFile = null;
    neuProfileState.removeAvatar = false;
    neuRevokeProfilePreviewUrl();
    neuApplyProfileToUi(neuProfileState.profile);
    neuQueueProfileUiSync(0);
    neuSetProfileMsg('Perfil actualizado.');
    neuSetProfileModalOpen(false);
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      neuSetProfileReadOnly(true, 'Sin permisos para guardar cambios.');
    } else {
      console.error('[neu-profile] save failed', error);
      neuSetProfileMsg('No se pudo guardar el perfil.', true);
    }
  } finally {
    neuProfileState.saving = false;
    neuSetProfileSaving(false);
  }
}

function neuWireProfileEditorEvents() {
  if (neuProfileState.wired) return;
  neuProfileState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const openBtn = target.closest('#btnNeuEditProfile');
      if (openBtn) {
        event.preventDefault();
        if (neuProfileState.readOnly) neuSetProfileMsg('Sin permisos para editar el perfil.', true);
        else neuSetProfileMsg('');
        neuHydrateProfileForm(neuProfileState.profile);
        neuSetProfileModalOpen(true);
        return;
      }

      const closeBtn = target.closest('[data-neu-profile-close], #btnNeuProfileClose, #btnNeuProfileCancel');
      if (closeBtn) {
        event.preventDefault();
        neuSetProfileModalOpen(false);
        neuSetProfileMsg('');
        return;
      }

      const removeAvatarBtn = target.closest('#btnNeuProfileAvatarRemove');
      if (removeAvatarBtn) {
        event.preventDefault();
        neuProfileState.pendingAvatarFile = null;
        neuRevokeProfilePreviewUrl();
        neuProfileState.removeAvatar = true;
        const input = document.getElementById('neuProfileAvatarFile');
        if (input instanceof HTMLInputElement) input.value = '';
        neuRenderProfileAvatarPreview();
        return;
      }

      const saveBtn = target.closest('#btnNeuProfileSave');
      if (saveBtn) {
        event.preventDefault();
        neuSaveProfileChanges();
      }
    },
    true,
  );

  document.getElementById('neuProfileAvatarFile')?.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0] || null;
    if (!file) return;
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      neuSetProfileMsg('Selecciona una imagen válida.', true);
      input.value = '';
      return;
    }
    neuSetProfileMsg('');
    neuRevokeProfilePreviewUrl();
    neuProfileState.pendingAvatarFile = file;
    neuProfileState.pendingAvatarPreviewUrl = URL.createObjectURL(file);
    neuProfileState.removeAvatar = false;
    neuRenderProfileAvatarPreview();
  });

  document.getElementById('neuProfileBioInput')?.addEventListener('input', () => {
    neuUpdateProfileBioCount();
  });

  window.addEventListener('beforeunload', neuRevokeProfilePreviewUrl, { once: true });
}

async function neuInitProfileEditor(user) {
  const uid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return;

  const canEdit = neuIsOwnProfileContext();
  neuSetProfileEditorVisible(canEdit);
  if (!canEdit) return;
  if (neuProfileState.loading) return;

  neuProfileState.loading = true;
  try {
    const loaded = await neuLoadOrCreateProfile(uid);
    neuProfileState.profile = loaded.profile;
    neuSetProfileReadOnly(loaded.readOnly, loaded.readOnly ? 'Sin permisos para editar el perfil.' : '');
    neuApplyProfileToUi(neuProfileState.profile);
    neuWireProfileIdentitySync();
    neuHydrateProfileForm(neuProfileState.profile);
    neuWireProfileEditorEvents();
    window.setTimeout(() => {
      neuApplyProfileToUi(neuProfileState.profile);
    }, 220);
    window.setTimeout(() => {
      neuApplyProfileToUi(neuProfileState.profile);
    }, 900);
    window.setTimeout(() => {
      neuApplyProfileToUi(neuProfileState.profile);
    }, 2200);
    window.setTimeout(() => {
      neuApplyProfileToUi(neuProfileState.profile);
    }, 4200);
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      neuProfileState.profile = neuProfileFromUi(uid);
      neuSetProfileReadOnly(true, 'Sin permisos para editar el perfil.');
      neuApplyProfileToUi(neuProfileState.profile);
      neuWireProfileIdentitySync();
      neuHydrateProfileForm(neuProfileState.profile);
      neuWireProfileEditorEvents();
    } else {
      console.error('[neu-profile] init failed', error);
    }
  } finally {
    neuProfileState.loading = false;
  }
}

function neuProfileFallback(uid) {
  const cleanUid = String(uid || '').trim();
  const displayName = cleanUid ? `Usuario ${cleanUid.slice(0, 6)}` : 'Usuario';
  return {
    displayName,
    handle: neuEnsureHandle('', displayName, cleanUid),
    city: '',
    bio: '',
    avatarUrl: '',
    avatarStoragePath: '',
  };
}

function neuApplyProfileRouteDefault(meUid) {
  const params = new URLSearchParams(location.search);
  const currentProfile = String(params.get(NEU_PROFILE_PARAM) || '').trim();

  if (!currentProfile) {
    if (!String(params.get('portal') || '').trim()) {
      params.set('portal', 'feed');
    }
    params.set(NEU_PROFILE_PARAM, NEU_PROFILE_ME);
  } else if (currentProfile) {
    const normalized = normalizeProfileParam(currentProfile, meUid);
    if (normalized && normalized !== currentProfile) params.set(NEU_PROFILE_PARAM, normalized);
  }

  const nextHref = `${location.pathname}?${params.toString()}${location.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
}

async function neuLoadViewedProfile(targetUid, isOwn) {
  if (isOwn) {
    const loaded = await neuLoadOrCreateProfile(targetUid);
    return { profile: loaded.profile, readOnly: loaded.readOnly };
  }

  try {
    const snap = await getDoc(neuProfileDocRef(targetUid));
    if (!snap.exists()) return { profile: neuProfileFallback(targetUid), readOnly: true };
    return { profile: neuNormalizeProfile(snap.data() || {}, targetUid), readOnly: true };
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      return { profile: neuProfileFallback(targetUid), readOnly: true };
    }
    throw error;
  }
}

async function neuLoadFollowCounts(targetUid) {
  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(collection(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers')),
      getDocs(collection(db, NEU_FOLLOWS_COLLECTION, targetUid, 'following')),
    ]);
    return { followers: followersSnap.size, following: followingSnap.size };
  } catch (error) {
    if (NEU_QA) console.warn('[neu-follow] count failed', error);
    return { followers: 0, following: 0 };
  }
}

async function neuLoadFollowingFlag(meUid, targetUid) {
  if (!meUid || !targetUid || meUid === targetUid) return false;
  try {
    const snap = await getDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid));
    return snap.exists();
  } catch (error) {
    if (NEU_QA) console.warn('[neu-follow] flag failed', error);
    return false;
  }
}

function neuSyncProfileCountsUi() {
  if (!neuPublicProfileState.profileMode) return;

  const followers = Math.max(0, Number(neuPublicProfileState.followersCount || 0));
  const following = Math.max(0, Number(neuPublicProfileState.followingCount || 0));

  const followersEl = document.getElementById('countFollowers');
  const friendsEl = document.getElementById('countFriends');
  const followingEl = document.getElementById('countFollowing');

  if (followersEl instanceof HTMLElement) followersEl.textContent = String(followers);
  if (friendsEl instanceof HTMLElement) friendsEl.textContent = String(following);
  if (followingEl instanceof HTMLElement) {
    followingEl.textContent = String(following);
    followingEl.classList.remove('is-hidden');
  }
}

function neuSyncProfileActionsUi() {
  const followBtn = document.getElementById('btnFusionFollow');
  const editBtn = document.getElementById('btnNeuEditProfile');
  const friendBtn = document.getElementById('btnFusionFriend');
  const shareBtn = document.getElementById('btnFusionShare');
  const messageBtn = document.getElementById('btnFusionMessage');
  const sourceSwitch = document.getElementById('feedSourceSwitch');

  const isProfileMode = neuPublicProfileState.profileMode;
  const isOwn = neuPublicProfileState.isOwn;

  if (sourceSwitch instanceof HTMLElement) sourceSwitch.style.display = isProfileMode ? 'none' : '';
  if (friendBtn instanceof HTMLElement) friendBtn.classList.add('is-hidden');
  if (shareBtn instanceof HTMLElement) shareBtn.classList.add('is-hidden');

  if (messageBtn instanceof HTMLAnchorElement) {
    if (isProfileMode && !isOwn && neuPublicProfileState.targetUid) {
      // JS handler opens NEU chat modal; href is only safe fallback within NEU.
      messageBtn.href = neuProfileHref(neuPublicProfileState.targetUid);
    } else {
      messageBtn.href = 'neu-social-app.html?portal=pulse';
    }
  }

  if (!(followBtn instanceof HTMLButtonElement)) return;
  if (!(editBtn instanceof HTMLElement)) return;

  if (!isProfileMode) {
    editBtn.classList.add('is-hidden');
    followBtn.classList.remove('is-hidden');
    return;
  }

  if (isOwn) {
    editBtn.classList.remove('is-hidden');
    followBtn.classList.add('is-hidden');
    return;
  }

  editBtn.classList.add('is-hidden');
  followBtn.classList.remove('is-hidden');
  followBtn.disabled = neuPublicProfileState.followLoading;
  followBtn.textContent = neuPublicProfileState.followLoading
    ? 'Cargando...'
    : neuPublicProfileState.isFollowing
      ? 'Siguiendo'
      : 'Seguir';
  followBtn.classList.toggle('btn-yellow', !neuPublicProfileState.isFollowing);
  followBtn.classList.toggle('btn-white-outline', neuPublicProfileState.isFollowing);
}

async function neuRefreshFollowUiState() {
  if (!neuPublicProfileState.profileMode) return;
  const { meUid, targetUid, isOwn } = neuPublicProfileState;
  const [counts, following] = await Promise.all([
    neuLoadFollowCounts(targetUid),
    neuLoadFollowingFlag(meUid, targetUid),
  ]);

  neuPublicProfileState.followersCount = Number(counts.followers || 0);
  neuPublicProfileState.followingCount = Number(counts.following || 0);
  neuPublicProfileState.isFollowing = isOwn ? false : !!following;
  neuSyncProfileCountsUi();
  neuSyncProfileActionsUi();
}

function neuProfilePostFromDoc(docSnap, targetUid, profile) {
  const data = docSnap.data() || {};
  const ownerUid = String(data.ownerUid || '').trim();
  if (!ownerUid || ownerUid !== targetUid) return null;

  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => String(tag || '').replace(/^#/, '').trim()).filter(Boolean)
    : [];

  const displayName = String(data.authorName || data.displayName || profile?.displayName || 'Usuario').trim() || 'Usuario';
  const handle = neuEnsureHandle(data.authorHandle || profile?.handle || '', displayName, ownerUid);
  return {
    id: String(docSnap.id || '').trim(),
    ownerUid,
    text: String(data.text || '').trim(),
    tags,
    type: String(data.type || 'post').trim().toLowerCase() || 'post',
    media: String(data.videoURL || data.mediaURL || data.imageURL || data.imageUrl || data.media || '').trim(),
    createdAt: data.createdAt || data.updatedAt || null,
    authorName: displayName,
    authorHandle: handle,
  };
}

async function neuLoadProfilePosts(targetUid, profile) {
  const attempts = [
    query(collection(db, NEU_POST_PRIMARY_COLLECTION), where('ownerUid', '==', targetUid), orderBy('createdAt', 'desc'), limit(NEU_PROFILE_FEED_LIMIT)),
    query(collection(db, NEU_POST_PRIMARY_COLLECTION), where('ownerUid', '==', targetUid), limit(NEU_PROFILE_FEED_LIMIT)),
  ];

  const byId = new Map();
  for (const q of attempts) {
    try {
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const post = neuProfilePostFromDoc(docSnap, targetUid, profile);
        if (post && post.id) byId.set(post.id, post);
      });
    } catch {
      // keep trying fallback query variants
    }
  }

  return Array.from(byId.values()).sort((a, b) => neuTs(b.createdAt) - neuTs(a.createdAt));
}

function neuFormatAgoShort(value) {
  const ts = neuTs(value);
  if (!ts) return 'ahora';
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 6) return `${weeks}sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mes`;
  const years = Math.floor(days / 365);
  return `${years}a`;
}

function neuRenderProfileEmptyState() {
  const feed = neuGetFeedList();
  if (!(feed instanceof HTMLElement)) return;
  const text = neuPublicProfileState.isOwn
    ? 'Aun no has publicado nada'
    : 'Este usuario aun no ha publicado nada';
  feed.innerHTML = `
    <div class="empty-feed-state">
      <p class="empty-feed-title">${esc(text)}</p>
      <p class="empty-feed-sub">${esc(neuPublicProfileState.isOwn ? 'Comparte tu primera publicacion' : 'Vuelve pronto para ver novedades')}</p>
    </div>
  `;
}

function neuFilterProfilePosts(posts, queryText) {
  const q = String(queryText || '').trim().toLowerCase();
  if (!q) return posts;
  return posts.filter((post) => {
    const haystack = [
      post.authorName,
      post.authorHandle,
      post.text,
      post.type,
      ...(Array.isArray(post.tags) ? post.tags : []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function neuRenderProfileFeedPosts(posts) {
  const feed = neuGetFeedList();
  if (!(feed instanceof HTMLElement)) return;
  if (!Array.isArray(posts) || !posts.length) {
    neuRenderProfileEmptyState();
    return;
  }

  const items = posts.map((post) => {
    const authorHref = neuProfileHref(post.ownerUid);
    const media = String(post.media || '').trim();
    const mediaHtml = media
      ? neuIsVideoUrl(media)
        ? `<div class="media-block"><video controls preload="metadata" src="${esc(media)}"></video></div>`
        : `<div class="media-block"><img loading="lazy" src="${esc(media)}" alt="post" /></div>`
      : '';
    const tagsHtml =
      Array.isArray(post.tags) && post.tags.length
        ? `<div class="post-tags">${post.tags.map((tag) => `#${esc(tag)}`).join(' ')}</div>`
        : '';
    const meta = `${esc(String(post.type || 'post').toUpperCase())} | ${esc(neuFormatAgoShort(post.createdAt))}`;
    const textHtml = esc(String(post.text || '')).replace(/\n/g, '<br />');

    return `
      <article class="post-card" data-owner="${esc(post.ownerUid)}" data-post="${esc(post.id)}">
        <div class="post-head">
          <a class="post-author" href="${authorHref}">
            <span class="post-avatar">${esc(neuAvatarLetter(post.authorName))}</span>
            <span class="post-author-meta">
              <strong>${esc(post.authorName || 'Usuario')}</strong>
              <span>${esc(post.authorHandle || '')}</span>
            </span>
          </a>
        </div>
        <p class="post-text">${textHtml || '-'}</p>
        ${mediaHtml}
        ${tagsHtml}
        <div class="post-meta">${meta}</div>
      </article>
    `;
  });

  feed.innerHTML = items.join('');
}

async function neuRefreshProfileFeed(forceReload = false) {
  if (!isProfileRouteActive()) {
    if (neuPublicProfileState.profileMode) {
      neuPublicProfileState.profileMode = false;
      neuSyncProfileActionsUi();
    }
    return;
  }
  if (!neuPublicProfileState.profileMode) return;
  if (neuPublicProfileState.postsLoading) return;
  if (!neuPublicProfileState.targetUid) return;

  const shouldReload =
    forceReload ||
    neuPublicProfileState.postsLoadedFor !== neuPublicProfileState.targetUid ||
    !Array.isArray(neuPublicProfileState.posts);

  if (shouldReload) {
    neuPublicProfileState.postsLoading = true;
    try {
      neuPublicProfileState.posts = await neuLoadProfilePosts(neuPublicProfileState.targetUid, neuProfileState.profile);
      neuPublicProfileState.postsLoadedFor = neuPublicProfileState.targetUid;
    } catch (error) {
      console.error('[neu-profile] posts load failed', error);
      neuPublicProfileState.posts = [];
      neuPublicProfileState.postsLoadedFor = neuPublicProfileState.targetUid;
    } finally {
      neuPublicProfileState.postsLoading = false;
    }
  }

  const queryText = String(document.getElementById('feedSearchInput')?.value || '').trim();
  const filtered = neuFilterProfilePosts(neuPublicProfileState.posts, queryText);
  neuRenderProfileFeedPosts(filtered);

  if (!isDisabled('decorators')) {
    window.setTimeout(() => {
      neuDecorateFeedPostMenus();
    }, 0);
  }
}

async function neuToggleFollowForViewedProfile() {
  const { meUid, targetUid, isOwn } = neuPublicProfileState;
  if (!neuPublicProfileState.profileMode || !meUid || !targetUid || isOwn) return;
  if (neuPublicProfileState.followLoading) return;

  const wasFollowing = neuPublicProfileState.isFollowing;
  const prevFollowers = neuPublicProfileState.followersCount;

  neuPublicProfileState.followLoading = true;
  neuPublicProfileState.isFollowing = !wasFollowing;
  neuPublicProfileState.followersCount = Math.max(0, prevFollowers + (wasFollowing ? -1 : 1));
  neuSyncProfileCountsUi();
  neuSyncProfileActionsUi();

  try {
    if (wasFollowing) {
      await Promise.all([
        deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid)),
        deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers', meUid)),
      ]);
    } else {
      const now = serverTimestamp();
      await Promise.all([
        setDoc(
          doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid),
          { sourceUid: meUid, targetUid, createdAt: now, updatedAt: now },
          { merge: true },
        ),
        setDoc(
          doc(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers', meUid),
          { sourceUid: meUid, targetUid, createdAt: now, updatedAt: now },
          { merge: true },
        ),
      ]);
    }
  } catch (error) {
    console.error('[neu-follow] toggle failed', error);
    neuPublicProfileState.isFollowing = wasFollowing;
    neuPublicProfileState.followersCount = prevFollowers;
  } finally {
    neuPublicProfileState.followLoading = false;
    neuSyncProfileCountsUi();
    neuSyncProfileActionsUi();
  }
}

function neuProfileHref(uid) {
  const clean = String(uid || '').trim();
  if (!clean) return 'neu-social-app.html?profile=me';
  const meUid = String(neuPublicProfileState.meUid || neuCurrentUid() || '').trim();
  const value = clean === meUid ? NEU_PROFILE_ME : clean;
  return `neu-social-app.html?profile=${encodeURIComponent(value)}`;
}

function neuParseLegacyChatUidFromHref(hrefValue) {
  const raw = String(hrefValue || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, location.href);
    const path = String(parsed.pathname || '').toLowerCase();
    if (!path.endsWith('/mensajes.html') && !path.endsWith('mensajes.html')) return '';
    return String(parsed.searchParams.get('chat') || '').trim();
  } catch {
    return '';
  }
}

function neuChatIntentHref(uid) {
  const clean = String(uid || '').trim();
  if (!clean) return 'neu-social-app.html?portal=pulse';
  const profileHref = neuProfileHref(clean);
  const join = profileHref.includes('?') ? '&' : '?';
  return `${profileHref}${join}chat=${encodeURIComponent(clean)}`;
}

function neuParseLegacyProfileUidFromHref(hrefValue) {
  const raw = String(hrefValue || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, location.href);
    const path = String(parsed.pathname || '').toLowerCase();
    if (!path.endsWith('/perfil-fusion.html') && !path.endsWith('perfil-fusion.html')) return '';
    return String(parsed.searchParams.get('uid') || '').trim();
  } catch {
    return '';
  }
}

function neuPatchLegacyProfileLinkHref(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return '';
  const uid = neuParseLegacyProfileUidFromHref(anchor.getAttribute('href') || anchor.href);
  if (!uid) return '';
  const nextHref = neuProfileHref(uid);
  if (anchor.getAttribute('href') !== nextHref) anchor.setAttribute('href', nextHref);
  return uid;
}

function neuPatchLegacyChatLinkHref(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return '';
  const uid = neuParseLegacyChatUidFromHref(anchor.getAttribute('href') || anchor.href);
  if (!uid) return '';
  const nextHref = neuChatIntentHref(uid);
  if (anchor.getAttribute('href') !== nextHref) anchor.setAttribute('href', nextHref);
  return uid;
}

function neuHasModifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
}

let neuLegacyProfileLinkBridgeWired = false;
function wireNeuLegacyProfileLinkBridge() {
  if (neuLegacyProfileLinkBridgeWired) return;
  neuLegacyProfileLinkBridgeWired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const openProfileBtn = target.closest('[data-post-action="open-profile"][data-owner]');
      if (openProfileBtn instanceof HTMLElement) {
        const ownerUid = String(openProfileBtn.getAttribute('data-owner') || '').trim();
        if (ownerUid) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          location.href = neuProfileHref(ownerUid);
          return;
        }
      }

      const chatAnchor = target.closest('a[href*="mensajes.html"]');
      if (chatAnchor instanceof HTMLAnchorElement) {
        const chatUid = neuPatchLegacyChatLinkHref(chatAnchor);
        if (chatUid) {
          if (neuHasModifiedClick(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuOpenOrStartDirectChat(chatUid).catch((error) => {
            if (NEU_QA) console.warn('[neu-chat] legacy chat bridge failed', error);
          });
          return;
        }
      }

      const anchor = target.closest('a[href*="perfil-fusion.html"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const uid = neuPatchLegacyProfileLinkHref(anchor);
      if (!uid) return;
      if (neuHasModifiedClick(event)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      location.href = neuProfileHref(uid);
    },
    true,
  );
}

function neuWirePublicProfileEvents() {
  if (neuPublicProfileState.wired) return;
  neuPublicProfileState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const followBtn = target.closest('#btnFusionFollow');
      if (followBtn && neuPublicProfileState.profileMode) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        neuToggleFollowForViewedProfile().catch((error) => {
          console.error('[neu-follow] click handler failed', error);
        });
        return;
      }

      const feedSourceBtn = target.closest('[data-feed-source]');
      if (feedSourceBtn && neuPublicProfileState.profileMode) {
        const source = String(feedSourceBtn.getAttribute('data-feed-source') || '')
          .trim()
          .toLowerCase();
        if (source !== 'target') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          activateFeedSource('target');
        }
        window.setTimeout(() => {
          neuRefreshProfileFeed(false).catch(() => null);
        }, 0);
        return;
      }

      const portalTrigger = target.closest('[data-portal-target], .fusion-bottom-nav .bottom-nav-btn');
      if (portalTrigger) {
        window.setTimeout(() => {
          neuInitPublicProfile(auth.currentUser).catch(() => null);
        }, 120);
      }
    },
    true,
  );

  if (neuPublicProfileState.feedWired) return;
  neuPublicProfileState.feedWired = true;
  document.getElementById('feedSearchInput')?.addEventListener('input', () => {
    if (!neuPublicProfileState.profileMode) return;
    neuRefreshProfileFeed(false).catch(() => null);
  });

  window.addEventListener('popstate', () => {
    neuInitPublicProfile(auth.currentUser).catch(() => null);
  });
}

async function neuInitPublicProfile(user) {
  const meUid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!meUid) return;
  if (neuPublicProfileState.initializing) return;
  neuPublicProfileState.initializing = true;

  try {
    neuApplyProfileRouteDefault(meUid);

    const rawProfile = getProfileParamRaw();
    const profileMode = !!rawProfile;
    if (!profileMode) {
      neuPublicProfileState.profileMode = false;
      neuSyncProfileActionsUi();
      neuWirePublicProfileEvents();
      return;
    }

    const targetUid = getProfileUidFromQuery(meUid) || meUid;
    const isOwn = targetUid === meUid;
    const changedTarget = neuPublicProfileState.targetUid !== targetUid;
    neuPublicProfileState.meUid = meUid;
    neuPublicProfileState.targetUid = targetUid;
    neuPublicProfileState.profileMode = true;
    neuPublicProfileState.isOwn = isOwn;
    if (changedTarget) {
      neuPublicProfileState.posts = [];
      neuPublicProfileState.postsLoadedFor = '';
      neuPublicProfileState.postsLoading = false;
    }

    if (!isOwn && getProfileParamRaw() !== targetUid) {
      updateNeuRouteParams({ profileMode: true, profileUid: targetUid });
    }

    if (isOwn) {
      await neuInitProfileEditor(user);
    } else {
      const loaded = await neuLoadViewedProfile(targetUid, false);
      neuProfileState.profile = loaded.profile;
      neuSetProfileReadOnly(true, '');
      neuSetProfileEditorVisible(false);
      neuSetProfileModalOpen(false);
      neuApplyProfileToUi(neuProfileState.profile);
      neuWireProfileIdentitySync();
    }

    await neuRefreshFollowUiState();
    neuSyncProfileCountsUi();
    neuSyncProfileActionsUi();
    neuWirePublicProfileEvents();
    activateFeedSource('target');
    await neuRefreshProfileFeed(true);
  } finally {
    neuPublicProfileState.initializing = false;
  }
}

const NEU_CHAT_MAX_MESSAGES = 50;

const neuChatState = {
  wired: false,
  meUid: '',
  listRows: [],
  listUnsub: null,
  listUid: '',
  messageUnsub: null,
  currentConversationId: '',
  currentMembers: [],
  currentMemberKey: '',
  peerUid: '',
  messages: [],
  sending: false,
  profileCache: new Map(),
  profileLoading: new Map(),
  listObserver: null,
  totalUnread: 0,
};

function neuUnreadValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.floor(n));
}

function neuUnreadBadgeLabel(value) {
  const count = neuUnreadValue(value);
  if (count <= 0) return '';
  if (count >= 10) return '9+';
  return String(count);
}

function neuTotalUnreadFromRows(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => sum + neuUnreadValue(row?.unreadCount), 0);
}

function neuChatsBottomButton() {
  const selector = '.fusion-bottom-nav .bottom-nav-btn[data-bottom-target="pulse"], .fusion-bottom-nav .bottom-nav-btn[data-portal-target="pulse"]';
  const node = document.querySelector(selector);
  return node instanceof HTMLButtonElement ? node : null;
}

function neuEnsureBottomUnreadBadge() {
  const button = neuChatsBottomButton();
  if (!(button instanceof HTMLButtonElement)) return null;

  let badge = button.querySelector('.neu-bottom-unread-badge');
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement('span');
    badge.className = 'neu-unread-badge neu-bottom-unread-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    button.append(badge);
  }
  return badge;
}

function neuRenderBottomUnreadBadge() {
  const button = neuChatsBottomButton();
  const badge = neuEnsureBottomUnreadBadge();
  if (!(button instanceof HTMLButtonElement) || !(badge instanceof HTMLElement)) return;

  const count = neuUnreadValue(neuChatState.totalUnread);
  const label = neuUnreadBadgeLabel(count);
  if (!label) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }

  badge.hidden = false;
  badge.textContent = label;
  badge.setAttribute('aria-label', `Chats sin leer: ${count}`);
}

function neuSyncUnreadUi() {
  neuChatState.totalUnread = neuTotalUnreadFromRows(neuChatState.listRows);
  neuRenderBottomUnreadBadge();
}

function neuSetConversationUnreadLocal(conversationId, unreadCount) {
  const convId = String(conversationId || '').trim();
  if (!convId || !Array.isArray(neuChatState.listRows) || !neuChatState.listRows.length) return;
  const targetUnread = neuUnreadValue(unreadCount);
  let changed = false;

  neuChatState.listRows = neuChatState.listRows.map((row) => {
    if (!row || String(row.conversationId || '').trim() !== convId) return row;
    if (neuUnreadValue(row.unreadCount) === targetUnread) return row;
    changed = true;
    return { ...row, unreadCount: targetUnread };
  });

  if (!changed) return;
  neuSyncUnreadUi();
  neuRenderChatList();
}

function neuChatSetHint(text, bad = false) {
  const hint = document.getElementById('neuChatHint');
  if (!(hint instanceof HTMLElement)) return;
  hint.textContent = String(text || '');
  hint.style.color = bad ? '#ffb2bf' : 'rgba(230,236,255,0.85)';
}

function neuChatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function neuChatFormatClock(value) {
  const date = neuChatDate(value);
  if (!date) return '';
  try {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

function neuChatMembers(uidA, uidB) {
  return [String(uidA || '').trim(), String(uidB || '').trim()].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function neuChatMemberKey(uidA, uidB) {
  const members = neuChatMembers(uidA, uidB);
  return members.length === 2 ? `${members[0]}_${members[1]}` : '';
}

function neuChatModalNode() {
  return document.getElementById('neuChatModal');
}

function neuChatRecomputeModalLock() {
  const hasOpenModal = Array.from(document.querySelectorAll('.composer-modal')).some(
    (node) => node instanceof HTMLElement && !node.hidden,
  );
  document.body.classList.toggle('modal-open', hasOpenModal);
}

function neuSetChatModalOpen(open) {
  const modal = neuChatModalNode();
  if (!(modal instanceof HTMLElement)) return;
  modal.hidden = !open;
  neuChatRecomputeModalLock();
}

function neuChatBodyNode() {
  return document.getElementById('neuChatMessages');
}

function neuChatInputNode() {
  return document.getElementById('neuChatInput');
}

function neuChatSendButtonNode() {
  return document.getElementById('neuChatSendBtn');
}

function neuSetChatSending(on) {
  const active = on === true;
  neuChatState.sending = active;
  const input = neuChatInputNode();
  const sendBtn = neuChatSendButtonNode();
  if (input instanceof HTMLInputElement) input.disabled = active;
  if (sendBtn instanceof HTMLButtonElement) {
    sendBtn.disabled = active;
    sendBtn.textContent = active ? 'Enviando...' : 'Enviar';
  }
}

function neuChatIsNearBottom() {
  const body = neuChatBodyNode();
  if (!(body instanceof HTMLElement)) return true;
  return body.scrollHeight - body.scrollTop - body.clientHeight < 72;
}

function neuChatScrollBottom() {
  const body = neuChatBodyNode();
  if (!(body instanceof HTMLElement)) return;
  body.scrollTop = body.scrollHeight;
}

async function neuFindConversationByMemberKey(memberKey) {
  const key = String(memberKey || '').trim();
  if (!key) return null;
  try {
    const snap = await getDocs(query(collection(db, 'neuConversations'), where('memberKey', '==', key), limit(1)));
    if (snap.empty) return null;
    const row = snap.docs[0];
    return { id: row.id, data: row.data() || {} };
  } catch {
    return null;
  }
}

function neuMapUserChatRow(docSnap, meUid) {
  const data = docSnap.data() || {};
  const members = Array.isArray(data.members)
    ? data.members.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  let otherUid = String(data.otherUid || '').trim();
  if (!otherUid && members.length === 2) {
    otherUid = members.find((uid) => uid !== meUid) || '';
  }
  return {
    id: String(docSnap.id || '').trim(),
    conversationId: String(docSnap.id || '').trim(),
    otherUid,
    members,
    memberKey: String(data.memberKey || '').trim(),
    lastMessageText: String(data.lastMessageText || '').trim(),
    lastMessageAt: data.lastMessageAt || data.updatedAt || null,
    updatedAt: data.updatedAt || data.lastMessageAt || null,
    unreadCount: neuUnreadValue(data.unreadCount),
    lastReadAt: data.lastReadAt || null,
  };
}

function neuChatProfileCached(uid) {
  const key = String(uid || '').trim();
  if (!key) return neuProfileFallback('');
  return neuChatState.profileCache.get(key) || neuProfileFallback(key);
}

async function neuEnsureChatProfile(uid) {
  const key = String(uid || '').trim();
  if (!key) return neuProfileFallback('');
  if (neuChatState.profileCache.has(key)) return neuChatState.profileCache.get(key);
  if (neuChatState.profileLoading.has(key)) return neuChatState.profileLoading.get(key);

  const loading = (async () => {
    let profile = neuProfileFallback(key);
    try {
      const snap = await getDoc(neuProfileDocRef(key));
      if (snap.exists()) {
        profile = neuNormalizeProfile(snap.data() || {}, key);
      }
    } catch {
      // ignore and keep fallback
    }
    neuChatState.profileCache.set(key, profile);
    return profile;
  })();

  neuChatState.profileLoading.set(key, loading);
  try {
    const profile = await loading;
    if (neuChatState.peerUid === key) neuRenderChatHeader();
    neuRenderChatList();
    return profile;
  } finally {
    neuChatState.profileLoading.delete(key);
  }
}

function neuRenderChatList() {
  const root = document.getElementById('pulseConversations');
  if (!(root instanceof HTMLElement)) return;

  const rows = Array.isArray(neuChatState.listRows) ? neuChatState.listRows : [];
  if (!rows.length) {
    root.dataset.neuChatRendering = '1';
    root.innerHTML = `
      <div class="empty-state neu-chat-empty-state" data-neu-chat-root="1">
        <p class="neu-chat-empty-title">Sin conversaciones.</p>
        <p class="neu-chat-empty-sub">Abre un perfil y pulsa "Mensaje" para iniciar chat.</p>
        <a class="btn-white-outline neu-chat-empty-cta" href="neu-social-app.html?portal=feed">Ir al feed</a>
      </div>
    `;
    delete root.dataset.neuChatRendering;
    return;
  }

  const html = rows
    .map((row) => {
      const profile = neuChatProfileCached(row.otherUid);
      const displayName = String(profile.displayName || '').trim() || 'Usuario';
      const handle = neuEnsureHandle(profile.handle, displayName, row.otherUid);
      const avatarUrl = String(profile.avatarUrl || '').trim();
      const lastText = row.lastMessageText || 'Sin mensajes todavia';
      const timeLabel = row.lastMessageAt ? neuFormatAgoShort(row.lastMessageAt) : '';
      const unread = neuUnreadValue(row.unreadCount);
      const unreadLabel = neuUnreadBadgeLabel(unread);
      const unreadBadge = unreadLabel
        ? `<span class="neu-unread-badge neu-chat-unread-badge" aria-label="${esc(`Sin leer: ${unread}`)}">${esc(unreadLabel)}</span>`
        : '';
      const avatarHtml = avatarUrl
        ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
        : `<span>${esc(neuAvatarLetter(displayName))}</span>`;

      return `
        <button
          class="neu-chat-item${unread > 0 ? ' is-unread' : ''}"
          type="button"
          data-neu-chat-open="${esc(row.conversationId)}"
          data-neu-chat-other="${esc(row.otherUid)}"
        >
          <span class="avatar-frame neu-chat-avatar">${avatarHtml}</span>
          <span class="neu-chat-copy">
            <span class="neu-chat-title">${esc(displayName)} <small>${esc(handle)}</small></span>
            <span class="neu-chat-last">${esc(lastText)}</span>
          </span>
          <span class="neu-chat-right">
            <span class="neu-chat-time">${esc(timeLabel)}</span>
            ${unreadBadge}
          </span>
        </button>
      `;
    })
    .join('');

  root.dataset.neuChatRendering = '1';
  root.innerHTML = `<div class="neu-chat-list" data-neu-chat-root="1">${html}</div>`;
  delete root.dataset.neuChatRendering;

  rows.forEach((row) => {
    if (row.otherUid) neuEnsureChatProfile(row.otherUid).catch(() => null);
  });
}

function neuWireChatListGuard() {
  if (isDisabled('observers')) return;
  if (neuChatState.listObserver instanceof MutationObserver) return;
  const root = document.getElementById('pulseConversations');
  if (!(root instanceof HTMLElement)) return;

  neuChatState.listObserver = new MutationObserver(() => {
    if (root.dataset.neuChatRendering === '1') return;
    if (root.querySelector('[data-neu-chat-root="1"]')) return;
    window.setTimeout(() => {
      neuRenderChatList();
    }, 0);
  });

  neuChatState.listObserver.observe(root, { childList: true });
}

function neuRenderChatHeader() {
  const profile = neuChatProfileCached(neuChatState.peerUid);
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, neuChatState.peerUid);
  const avatarUrl = String(profile.avatarUrl || '').trim();
  neuSetAvatarElements(
    document.getElementById('neuChatPeerAvatarImg'),
    document.getElementById('neuChatPeerAvatarFallback'),
    avatarUrl,
    displayName,
  );
  const nameNode = document.getElementById('neuChatPeerName');
  const handleNode = document.getElementById('neuChatPeerHandle');
  if (nameNode instanceof HTMLElement) nameNode.textContent = displayName;
  if (handleNode instanceof HTMLElement) handleNode.textContent = handle;
}

function neuRenderChatMessages() {
  const body = neuChatBodyNode();
  if (!(body instanceof HTMLElement)) return;
  const meUid = neuCurrentUid();
  const list = Array.isArray(neuChatState.messages) ? neuChatState.messages : [];
  if (!list.length) {
    body.innerHTML = '<div class="neu-chat-empty">Aun no hay mensajes.</div>';
    return;
  }

  body.innerHTML = list
    .map((item) => {
      const mine = String(item.senderUid || '').trim() === meUid;
      const bubbleClass = mine ? 'neu-chat-bubble neu-chat-bubble-mine' : 'neu-chat-bubble neu-chat-bubble-peer';
      const text = esc(String(item.text || '').trim()).replace(/\n/g, '<br />');
      const meta = neuChatFormatClock(item.createdAt);
      return `
        <article class="${bubbleClass}">
          <div class="neu-chat-text">${text || '-'}</div>
          <div class="neu-chat-meta">${esc(meta)}</div>
        </article>
      `;
    })
    .join('');
}

function neuCloseChatModal() {
  neuSetChatModalOpen(false);
  neuChatSetHint('');
  neuStopChatMessageListener();
  neuChatState.currentConversationId = '';
  neuChatState.currentMembers = [];
  neuChatState.currentMemberKey = '';
  neuChatState.peerUid = '';
  neuChatState.messages = [];
}

function neuStopChatListListener() {
  if (typeof neuChatState.listUnsub === 'function') {
    neuChatState.listUnsub();
  }
  neuChatState.listUnsub = null;
  neuChatState.listUid = '';
  neuChatState.totalUnread = 0;
  neuRenderBottomUnreadBadge();
}

function neuStopChatMessageListener() {
  if (typeof neuChatState.messageUnsub === 'function') {
    neuChatState.messageUnsub();
  }
  neuChatState.messageUnsub = null;
}

function neuStartChatListListener(meUid) {
  const uid = String(meUid || '').trim();
  if (!uid) return;
  if (neuChatState.listUid === uid && typeof neuChatState.listUnsub === 'function') return;
  neuStopChatListListener();

  const q = query(collection(db, 'neuUserChats', uid, 'chats'), orderBy('lastMessageAt', 'desc'), limit(80));
  neuChatState.listUnsub = onSnapshot(
    q,
    (snap) => {
      neuChatState.listRows = snap.docs.map((row) => neuMapUserChatRow(row, uid));
      neuSyncUnreadUi();
      neuRenderChatList();
    },
    (error) => {
      console.error('[neu-chat] list subscription failed', error);
      neuChatState.listRows = [];
      neuSyncUnreadUi();
      neuRenderChatList();
    },
  );
  neuChatState.listUid = uid;
}

async function neuMarkConversationRead(conversationId, { members = [], peerUid = '', force = false } = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;

  const row = Array.isArray(neuChatState.listRows)
    ? neuChatState.listRows.find((item) => String(item?.conversationId || '').trim() === convId)
    : null;
  const currentUnread = neuUnreadValue(row?.unreadCount);
  if (!force && currentUnread <= 0) return;

  const memberList = Array.isArray(members)
    ? members.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  let normalizedMembers =
    memberList.length === 2
      ? neuChatMembers(memberList[0], memberList[1])
      : Array.isArray(row?.members) && row.members.length === 2
        ? neuChatMembers(row.members[0], row.members[1])
        : [];
  if (normalizedMembers.length !== 2 && Array.isArray(neuChatState.currentMembers) && neuChatState.currentMembers.length === 2) {
    normalizedMembers = neuChatMembers(neuChatState.currentMembers[0], neuChatState.currentMembers[1]);
  }

  const resolvedPeerUid =
    String(peerUid || '').trim() ||
    String(row?.otherUid || '').trim() ||
    normalizedMembers.find((uid) => uid !== meUid) ||
    String(neuChatState.peerUid || '').trim();
  const payload = {
    unreadCount: 0,
    lastReadAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (normalizedMembers.length === 2) {
    payload.members = normalizedMembers;
    payload.memberKey = neuChatMemberKey(normalizedMembers[0], normalizedMembers[1]);
    payload.otherUid = resolvedPeerUid || normalizedMembers.find((uid) => uid !== meUid) || '';
  }

  try {
    await setDoc(doc(db, 'neuUserChats', meUid, 'chats', convId), payload, { merge: true });
    neuSetConversationUnreadLocal(convId, 0);
  } catch (error) {
    if (NEU_QA) console.warn('[neu-chat] mark read failed', error);
  }
}

function neuStartChatMessagesListener(conversationId, members) {
  const meUid = neuCurrentUid();
  const memberList = Array.isArray(members) ? members : [];
  if (!memberList.includes(meUid)) {
    neuChatSetHint('Sin acceso a este chat.', true);
    return;
  }

  neuStopChatMessageListener();
  const q = query(
    collection(db, 'neuConversations', conversationId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(NEU_CHAT_MAX_MESSAGES),
  );
  let firstSnapshot = true;

  neuChatState.messageUnsub = onSnapshot(
    q,
    (snap) => {
      const stickBottom = neuChatIsNearBottom();
      neuChatState.messages = snap.docs
        .map((row) => ({ id: row.id, ...(row.data() || {}) }))
        .reverse();
      neuRenderChatMessages();
      if (stickBottom) window.setTimeout(neuChatScrollBottom, 0);

      const incomingAdded = snap.docChanges().some((change) => {
        if (change.type !== 'added') return false;
        const senderUid = String(change.doc.data()?.senderUid || '').trim();
        return !!senderUid && senderUid !== meUid;
      });
      const shouldMarkRead = firstSnapshot || incomingAdded;
      if (shouldMarkRead) {
        neuMarkConversationRead(conversationId, {
          members: memberList,
          peerUid: memberList.find((uid) => uid !== meUid) || neuChatState.peerUid,
          force: firstSnapshot,
        }).catch(() => null);
      }
      firstSnapshot = false;
    },
    (error) => {
      console.error('[neu-chat] message subscription failed', error);
      neuChatSetHint('No se pudo cargar mensajes.', true);
    },
  );
}

async function neuOpenConversation(conversationId, seed = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;

  const convRef = doc(db, 'neuConversations', convId);
  const snap = await getDoc(convRef);
  if (!snap.exists()) {
    neuChatSetHint('Conversacion no encontrada.', true);
    return;
  }

  const data = snap.data() || {};
  const members = Array.isArray(data.members)
    ? data.members.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!members.includes(meUid)) {
    neuChatSetHint('Sin acceso a esta conversacion.', true);
    return;
  }

  const peerUid = String(seed.otherUid || members.find((uid) => uid !== meUid) || '').trim();
  const memberKey = String(data.memberKey || seed.memberKey || neuChatMemberKey(members[0], members[1])).trim();

  neuChatState.currentConversationId = convId;
  neuChatState.currentMembers = members;
  neuChatState.currentMemberKey = memberKey;
  neuChatState.peerUid = peerUid;
  neuChatState.messages = [];
  neuChatSetHint('');
  neuRenderChatHeader();
  neuRenderChatMessages();
  neuSetChatModalOpen(true);
  if (peerUid) await neuEnsureChatProfile(peerUid);
  neuRenderChatHeader();
  neuStartChatMessagesListener(convId, members);
  window.setTimeout(neuChatScrollBottom, 40);
}

async function neuEnsureDirectConversation(uidA, uidB) {
  const members = neuChatMembers(uidA, uidB);
  if (members.length !== 2) return null;
  const memberKey = `${members[0]}_${members[1]}`;

  const found = await neuFindConversationByMemberKey(memberKey);
  if (found?.id) {
    return { conversationId: found.id, members, memberKey };
  }

  const conversationId = memberKey;
  const now = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'neuConversations', conversationId),
    {
      members,
      memberKey,
      lastMessageText: '',
      lastMessageAt: now,
      lastSenderUid: '',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(
    doc(db, 'neuUserChats', members[0], 'chats', conversationId),
    {
      otherUid: members[1],
      members,
      memberKey,
      lastMessageText: '',
      lastMessageAt: now,
      unreadCount: 0,
      lastReadAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(
    doc(db, 'neuUserChats', members[1], 'chats', conversationId),
    {
      otherUid: members[0],
      members,
      memberKey,
      lastMessageText: '',
      lastMessageAt: now,
      unreadCount: 0,
      lastReadAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  await batch.commit();
  return { conversationId, members, memberKey };
}

async function neuOpenOrStartDirectChat(otherUid) {
  const meUid = neuCurrentUid();
  const targetUid = String(otherUid || '').trim();
  if (!meUid || !targetUid || targetUid === meUid) return;
  const ensured = await neuEnsureDirectConversation(meUid, targetUid);
  if (!ensured?.conversationId) return;
  await neuOpenConversation(ensured.conversationId, {
    otherUid: targetUid,
    memberKey: ensured.memberKey,
  });
}

async function neuSendChatMessage() {
  const meUid = neuCurrentUid();
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const textInput = neuChatInputNode();
  const rawText = String(textInput instanceof HTMLInputElement ? textInput.value : '').trim();
  if (!meUid || !conversationId || !rawText) return;
  if (neuChatState.sending) return;

  const members = Array.isArray(neuChatState.currentMembers)
    ? neuChatState.currentMembers.map((uid) => String(uid || '').trim()).filter(Boolean)
    : [];
  if (!members.includes(meUid)) {
    neuChatSetHint('Sin acceso a esta conversacion.', true);
    return;
  }

  const memberKey = String(neuChatState.currentMemberKey || neuChatMemberKey(members[0], members[1])).trim();
  const safeText = rawText.slice(0, 1000);
  const now = serverTimestamp();

  neuSetChatSending(true);
  neuChatSetHint('');
  try {
    const batch = writeBatch(db);
    const conversationRef = doc(db, 'neuConversations', conversationId);
    const messageRef = doc(collection(db, 'neuConversations', conversationId, 'messages'));
    batch.set(messageRef, {
      senderUid: meUid,
      text: safeText,
      createdAt: now,
    });
    batch.set(
      conversationRef,
      {
        members,
        memberKey,
        lastMessageText: safeText,
        lastMessageAt: now,
        lastSenderUid: meUid,
        updatedAt: now,
      },
      { merge: true },
    );

    members.forEach((uid) => {
      const otherUid = members.find((candidate) => candidate !== uid) || '';
      const isSender = uid === meUid;
      batch.set(
        doc(db, 'neuUserChats', uid, 'chats', conversationId),
        {
          otherUid,
          members,
          memberKey,
          lastMessageText: safeText,
          lastMessageAt: now,
          unreadCount: isSender ? 0 : increment(1),
          ...(isSender ? { lastReadAt: now } : {}),
          updatedAt: now,
        },
        { merge: true },
      );
    });

    await batch.commit();
    neuSetConversationUnreadLocal(conversationId, 0);
    if (textInput instanceof HTMLInputElement) textInput.value = '';
    window.setTimeout(neuChatScrollBottom, 20);
  } catch (error) {
    console.error('[neu-chat] send failed', error);
    neuChatSetHint('No se pudo enviar el mensaje.', true);
  } finally {
    neuSetChatSending(false);
  }
}

function neuWireChatEvents() {
  if (neuChatState.wired) return;
  neuChatState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const openRow = target.closest('[data-neu-chat-open]');
      if (openRow) {
        event.preventDefault();
        const conversationId = String(openRow.getAttribute('data-neu-chat-open') || '').trim();
        const otherUid = String(openRow.getAttribute('data-neu-chat-other') || '').trim();
        neuOpenConversation(conversationId, { otherUid }).catch((error) => {
          console.error('[neu-chat] open conversation failed', error);
          neuChatSetHint('No se pudo abrir la conversacion.', true);
        });
        return;
      }

      const closeChat = target.closest('[data-neu-chat-close], #neuChatCloseBtn');
      if (closeChat) {
        event.preventDefault();
        neuCloseChatModal();
        return;
      }

      const messageProfileBtn = target.closest('#btnFusionMessage');
      if (messageProfileBtn && neuPublicProfileState.profileMode && !neuPublicProfileState.isOwn) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        neuOpenOrStartDirectChat(neuPublicProfileState.targetUid).catch((error) => {
          console.error('[neu-chat] profile message start failed', error);
          neuChatSetHint('No se pudo iniciar el chat.', true);
        });
      }
    },
    true,
  );

  document.getElementById('neuChatForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    neuSendChatMessage().catch((error) => {
      console.error('[neu-chat] send handler failed', error);
      neuChatSetHint('No se pudo enviar.', true);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = neuChatModalNode();
    if (!(modal instanceof HTMLElement) || modal.hidden) return;
    neuCloseChatModal();
  });
}

async function neuInitChatMvp(user) {
  const meUid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!meUid) return;

  neuChatState.meUid = meUid;
  neuSyncUnreadUi();
  neuRenderBottomUnreadBadge();
  neuWireChatEvents();
  neuStartChatListListener(meUid);
  neuWireChatListGuard();
  neuRenderChatList();
}

function getRouteChatUid() {
  const raw = String(new URLSearchParams(location.search).get('chat') || '').trim();
  const meUid = String(neuCurrentUid() || '').trim();
  if (!raw || (meUid && raw === meUid)) return '';
  return raw;
}

function clearRouteChatUid() {
  const url = new URL(location.href);
  if (!url.searchParams.has('chat')) return;
  url.searchParams.delete('chat');
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
}

async function neuRunRouteChatIntent() {
  const targetUid = getRouteChatUid();
  if (!targetUid) return;
  clearRouteChatUid();
  await neuOpenOrStartDirectChat(targetUid);
}

const NEU_URL_PARAMS = new URLSearchParams(location.search);
const NEU_PARAMS = new URLSearchParams(location.search);
const SAFE_MODE = NEU_URL_PARAMS.get('safe') === '1';
const NEU_QA = NEU_PARAMS.get('qa') === '1';
const NEU_QA_MODE = NEU_QA;
const NEU_SAFE_MOD_ALLOWED = new Set(['portal_obs', 'flow_bridge', 'crud_posts', 'crud_stories']);
const DISABLE = new Set(
  NEU_PARAMS.getAll('disable')
    .flatMap((raw) => String(raw || '').split(','))
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean),
);
const isDisabled = (key) => DISABLE.has(String(key || '').trim().toLowerCase());

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
const NEU_SAFE_MOD = SAFE_MODE_MOD;
const SAFE_ENABLE_PORTAL_OBS = !SAFE_MODE || SAFE_MODE_MOD === 'portal_obs';
const SAFE_ENABLE_FLOW_BRIDGE = !SAFE_MODE || SAFE_MODE_MOD === 'flow_bridge';
const SAFE_ENABLE_CRUD_POSTS = !SAFE_MODE || SAFE_MODE_MOD === 'crud_posts';
const SAFE_ENABLE_CRUD_STORIES = !SAFE_MODE || SAFE_MODE_MOD === 'crud_stories';

function neuQaPanel(lines) {
  if (!NEU_QA) return;
  let el = document.getElementById('neuQaPanel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'neuQaPanel';
    el.style.position = 'fixed';
    el.style.right = '12px';
    el.style.top = '12px';
    el.style.zIndex = '999999';
    el.style.maxWidth = '420px';
    el.style.padding = '10px 12px';
    el.style.background = 'rgba(0,0,0,.75)';
    el.style.color = '#fff';
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '12px';
    el.style.borderRadius = '10px';
    el.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = lines.join('\n');
}

const __neuQaLines = [];
function neuQaPush(line) {
  if (!NEU_QA) return;
  __neuQaLines.push(String(line || ''));
  if (__neuQaLines.length > 14) __neuQaLines.shift();
  neuQaPanel([
    '[NEU QA] boot: OK',
    `SAFE=${SAFE_MODE}`,
    `mod=${SAFE_MODE_MOD || 'none'}`,
    '',
    '[NEU QA] trace:',
    ...__neuQaLines,
  ]);
}

async function neuBootModule(name, fn, timeout = 1200) {
  const t0 = performance.now();
  let done = false;

  const timer = new Promise((resolve) => {
    setTimeout(() => {
      if (!done) resolve({ status: 'timeout' });
    }, timeout);
  });

  const run = (async () => {
    try {
      await fn();
      done = true;
      return { status: 'ok' };
    } catch (e) {
      return { status: 'error', error: e };
    }
  })();

  const res = await Promise.race([run, timer]);
  const ms = Math.round(performance.now() - t0);

  if (NEU_QA) console.debug('[NEU WATCHDOG]', name, res.status, `${ms}ms`);

  if (res.status !== 'ok') {
    document.body.dataset[`neuDisabled_${name}`] = '1';
  }

  return { name, ...res, ms };
}

function neuLongTaskHint(entry) {
  const attrib = Array.isArray(entry?.attribution) ? entry.attribution : [];
  for (const item of attrib) {
    const scriptUrl = String(item?.scriptUrl || '').trim();
    if (scriptUrl) {
      try {
        return new URL(scriptUrl, location.href).pathname.split('/').pop() || 'script';
      } catch {
        return scriptUrl;
      }
    }
    const container = String(item?.containerName || item?.containerType || '').trim();
    if (container) return container;
  }
  return String(entry?.name || 'main');
}

function wireQaRuntimeTrace() {
  if (!NEU_QA) return;
  if (wireQaRuntimeTrace._wired) return;
  wireQaRuntimeTrace._wired = true;

  if ('PerformanceObserver' in window) {
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const duration = Math.round(Number(e?.duration || 0));
          const hint = neuLongTaskHint(e);
          neuQaPush(`longtask ${duration}ms ${hint}`);
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {
      // ignore unsupported modes
    }
  }

  const counts = Object.create(null);
  const mark = (k) => {
    counts[k] = (counts[k] || 0) + 1;
  };

  window.addEventListener(
    'scroll',
    () => {
      mark('scroll');
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    'resize',
    () => {
      mark('resize');
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    'click',
    () => {
      mark('click');
    },
    { capture: true },
  );

  if (!isDisabled('observers') && document.body instanceof HTMLElement) {
    const mo = new MutationObserver((m) => mark(`mut:${m.length}`));
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.setInterval(() => {
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (top.length) neuQaPush(`events ${top.map(([k, v]) => `${k}:${v}`).join(' ')}`);
    for (const k in counts) counts[k] = 0;
  }, 1000);
}

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
  if (isProfileRouteActive()) return;
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
  if (!SAFE_ENABLE_FLOW_BRIDGE || isDisabled('flow_bridge')) return;
  if (initNeuFlowBridge._wired) return;
  initNeuFlowBridge._wired = true;

  const feed = document.getElementById('feedList');
  if (!feed) return;

  if (!isDisabled('observers')) {
    const observer = new MutationObserver(() => {
      window.setTimeout(showWelcomeEmptyState, 0);
    });
    observer.observe(feed, { childList: true });
  }

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
  if (isDisabled('decorators')) return;
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
  if (feed instanceof HTMLElement && !isDisabled('observers') && !isDisabled('decorators')) {
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
  if (composerModal instanceof HTMLElement && !isDisabled('observers')) {
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

  if (!isDisabled('decorators')) {
    window.setTimeout(neuDecorateFeedPostMenus, 0);
    window.setTimeout(neuDecorateFeedPostMenus, 300);
    window.setTimeout(neuDecorateFeedPostMenus, 900);
  }
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
  if (isDisabled('decorators')) return;
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
  if (isDisabled('decorators')) return;
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
  if (isDisabled('decorators')) return;
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
  if (isDisabled('decorators')) return;
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

  if (!isDisabled('decorators')) neuEnsureStoryModalMenu();
  neuEnsureStoryDeleteModal();
  neuScheduleStoryDecorate({ forceReload: true });

  const storiesGrid = document.getElementById('storiesGrid');
  if (storiesGrid instanceof HTMLElement && !isDisabled('observers')) {
    neuStoryCrudState.gridObserver = new MutationObserver(() => {
      neuScheduleStoryDecorate();
    });
    // Root childList is enough because legacy renderer replaces tile list at root.
    neuStoryCrudState.gridObserver.observe(storiesGrid, { childList: true });
  }

  const storiesStrip = document.getElementById('storiesStrip');
  if (storiesStrip instanceof HTMLElement && !isDisabled('observers')) {
    neuStoryCrudState.stripObserver = new MutationObserver(() => {
      neuScheduleStoryDecorate();
    });
    neuStoryCrudState.stripObserver.observe(storiesStrip, { childList: true });
  }

  const storyModal = document.getElementById('storyModal');
  if (storyModal instanceof HTMLElement && !isDisabled('observers')) {
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
      if (storyNavigationTrigger && !isDisabled('decorators')) {
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

function getProfileParamRaw() {
  return String(new URLSearchParams(location.search).get(NEU_PROFILE_PARAM) || '').trim();
}

function normalizeProfileParam(rawValue, meUid = '') {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase() === NEU_PROFILE_ME) return NEU_PROFILE_ME;
  if (meUid && raw === meUid) return NEU_PROFILE_ME;
  return raw;
}

function getProfileUidFromQuery(meUid = '') {
  const raw = getProfileParamRaw();
  if (!raw) return '';
  if (raw.toLowerCase() === NEU_PROFILE_ME) return String(meUid || neuCurrentUid() || '').trim();
  return raw;
}

function isProfileRouteActive() {
  return !!getProfileParamRaw();
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

function updateNeuRouteParams({ portal, profileMode, profileUid } = {}) {
  const url = new URL(location.href);
  if (typeof portal === 'string' && portal) {
    url.searchParams.set('portal', portal);
  }

  if (profileMode === true) {
    const meUid = neuCurrentUid();
    const explicit = normalizeProfileParam(profileUid, meUid);
    const current = normalizeProfileParam(url.searchParams.get(NEU_PROFILE_PARAM), meUid);
    const nextProfile = explicit || current || NEU_PROFILE_ME;
    url.searchParams.set(NEU_PROFILE_PARAM, nextProfile);
  }
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
    updateNeuRouteParams({ portal: 'feed', profileMode: true, profileUid: NEU_PROFILE_ME });
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

  if (SAFE_ENABLE_PORTAL_OBS && !isDisabled('portal_obs') && !isDisabled('observers')) {
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
  wireNeuLegacyProfileLinkBridge();

  // Keep legacy profile fusion logic untouched; run it only after neu auth gate passed.
  await import('./perfil-fusion-page.js');
  await neuInitPublicProfile(user);
  if (!SAFE_MODE) {
    await neuInitChatMvp(user);
    await neuRunRouteChatIntent();
  }
  if (SAFE_MODE) {
    if (SAFE_ENABLE_CRUD_POSTS && !isDisabled('crud_posts')) {
      await neuBootModule('crud_posts', () => neuWirePostCrudEvents());
    }
    if (SAFE_ENABLE_CRUD_STORIES && !isDisabled('crud_stories')) {
      await neuBootModule('crud_stories', () => neuWireStoryCrudEvents());
    }
    if (SAFE_ENABLE_FLOW_BRIDGE && !isDisabled('flow_bridge')) {
      await neuBootModule('flow_bridge', () => initNeuFlowBridge());
    }
    qaDebug('safe-mode-active', {
      mod: SAFE_MODE_MOD || 'minimal',
      modules: {
        portalObs: SAFE_ENABLE_PORTAL_OBS && !isDisabled('portal_obs') && !isDisabled('observers'),
        flowBridge: SAFE_ENABLE_FLOW_BRIDGE && !isDisabled('flow_bridge'),
        crudPosts: SAFE_ENABLE_CRUD_POSTS && !isDisabled('crud_posts'),
        crudStories: SAFE_ENABLE_CRUD_STORIES && !isDisabled('crud_stories'),
      },
    });
  }
  wireNeuBottomNavRouter();
  if (isProfileRouteActive()) {
    window.setTimeout(() => {
      neuRefreshProfileFeed(false).catch(() => null);
      neuSyncProfileActionsUi();
      neuSyncProfileCountsUi();
    }, 180);
  }
}

let __neuBooted = false;

async function neuBoot() {
  if (__neuBooted) return;
  __neuBooted = true;
  wireQaRuntimeTrace();
  neuQaPanel(['[NEU QA] boot: start', `url: ${location.href}`]);
  if (NEU_QA) {
    neuQaPush(`disable=${DISABLE.size ? [...DISABLE].join(',') : 'none'}`);
  }

  try {
    await startNeuSocialApp();
    if (!SAFE_MODE) {
      const results = [];
      if (!isDisabled('crud_posts')) {
        results.push(await neuBootModule('crud_posts', () => neuWirePostCrudEvents()));
      } else {
        results.push({ name: 'crud_posts', status: 'skipped', ms: 0 });
      }
      if (!isDisabled('crud_stories')) {
        results.push(await neuBootModule('crud_stories', () => neuWireStoryCrudEvents()));
      } else {
        results.push({ name: 'crud_stories', status: 'skipped', ms: 0 });
      }
      if (!isDisabled('flow_bridge')) {
        results.push(await neuBootModule('flow_bridge', () => initNeuFlowBridge()));
      } else {
        results.push({ name: 'flow_bridge', status: 'skipped', ms: 0 });
      }

      const lines = [
        '[NEU QA] boot: OK',
        `SAFE=${SAFE_MODE}`,
        `mod=${String(NEU_SAFE_MOD || 'none')}`,
        `disable=${DISABLE.size ? [...DISABLE].join(',') : 'none'}`,
      ];
      if (NEU_QA_MODE) {
        lines.push('[NEU QA] modules:');
        results.forEach((result) => {
          lines.push(`${result.name}: ${result.status} ${result.ms}ms`);
          neuQaPush(`module ${result.name}: ${result.status} ${result.ms}ms`);
        });
      }
      neuQaPanel(lines);
    } else {
      neuQaPanel([
        '[NEU QA] boot: OK',
        `SAFE=${SAFE_MODE}`,
        `mod=${String(NEU_SAFE_MOD || 'none')}`,
        `disable=${DISABLE.size ? [...DISABLE].join(',') : 'none'}`,
      ]);
    }
    if (NEU_QA) console.log('[NEU PAGE] startNeuSocialApp OK');
  } catch (e) {
    if (NEU_QA) console.error('[NEU PAGE] startNeuSocialApp FAILED', e);
    neuQaPanel(['[NEU QA] boot: FAILED', String(e?.message || e), String(e?.stack || '')].slice(0, 3));
    const message = String(e?.message || e || '').trim().toLowerCase();
    if (message === 'auth-timeout') return;
    showFatalOverlay(e, { source: 'startNeuSocialApp' });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', neuBoot, { once: true });
} else {
  neuBoot();
}
