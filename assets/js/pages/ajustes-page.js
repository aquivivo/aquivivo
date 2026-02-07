import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

const $ = (id) => document.getElementById(id);

const storage = getStorage();

const avatarWrap = $('settingsAvatarWrap');
const avatarImg = $('settingsAvatarImg');
const avatarFallback = $('settingsAvatarFallback');
const avatarFile = $('settingsAvatarFile');
const btnAvatarUpload = $('btnSettingsAvatarUpload');
const btnAvatarRemove = $('btnSettingsAvatarRemove');
const avatarMsg = $('settingsAvatarMsg');

const displayNameInput = $('settingsDisplayName');
const handleInput = $('settingsHandle');
const btnSaveProfile = $('btnSettingsSaveProfile');
const profileMsg = $('settingsProfileMsg');

const langSelect = $('settingsLang');
const genderSelect = $('settingsGender');
const goalSelect = $('settingsGoal');
const reviewRemindersToggle = $('settingsReviewReminders');
const publicProfileToggle = $('settingsPublicProfile');
const allowFriendReqToggle = $('settingsAllowFriendRequests');
const allowMessagesToggle = $('settingsAllowMessages');
const btnSavePrefs = $('btnSettingsSavePrefs');
const prefsMsg = $('settingsPrefsMsg');

const bioWhyInput = $('settingsBioWhy');
const bioHardInput = $('settingsBioHard');
const bioGoalInput = $('settingsBioGoal');
const bioLocationInput = $('settingsBioLocation');
const bioWebsiteInput = $('settingsBioWebsite');
const bioLanguagesInput = $('settingsBioLanguages');
const bioInterestsInput = $('settingsBioInterests');
const btnSaveBio = $('btnSettingsSaveBio');
const bioMsg = $('settingsBioMsg');

const postsVisibilitySelect = $('settingsPostsVisibility');
const rewardsVisibilitySelect = $('settingsRewardsVisibility');
const statusVisibilitySelect = $('settingsStatusVisibility');
const btnSavePrivacy = $('btnSettingsSavePrivacy');
const privacyMsg = $('settingsPrivacyMsg');

const reviewMinutesSelect = $('settingsReviewMinutes');
const reviewLimitSelect = $('settingsReviewLimit');
const reviewDirectionSelect = $('settingsReviewDirection');
const btnSaveReview = $('settingsReviewSave');
const reviewSaveStatus = $('settingsReviewSaveStatus');

let CURRENT_UID = '';
let CURRENT_EMAIL_LOWER = '';
let currentPhotoPath = '';
let currentHandleLower = '';
let currentPhotoUrl = '';

function setInlineMsg(el, text, bad = false) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function avatarInitial(nameOrEmail) {
  const text = String(nameOrEmail || '').trim();
  if (!text) return 'U';
  return text[0].toUpperCase();
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeHandle(value) {
  return String(value || '').trim().toLowerCase();
}

function isHandleValid(value) {
  if (!value) return true;
  return /^[a-z0-9._-]{3,20}$/.test(value);
}

function renderAvatar(url, nameOrEmail) {
  if (!avatarWrap || !avatarImg) return;
  const letter = avatarInitial(nameOrEmail);
  if (avatarFallback) avatarFallback.textContent = letter;

  const value = String(url || '').trim();
  currentPhotoUrl = value;
  if (value) {
    avatarImg.src = value;
    avatarWrap.classList.add('hasImage');
    if (btnAvatarRemove) btnAvatarRemove.disabled = false;
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
    if (btnAvatarRemove) btnAvatarRemove.disabled = true;
  }
}

async function ensureUserDoc(user) {
  if (!user?.uid) return {};
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() || {};

  const payload = {
    email: user.email || '',
    emailLower: (user.email || '').toLowerCase(),
    admin: false,
    blocked: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: true });
  return payload;
}

async function loadPublicUser(uid) {
  if (!uid) return {};
  const snap = await getDoc(doc(db, 'public_users', uid));
  return snap.exists() ? snap.data() || {} : {};
}

async function isHandleAvailable(handleLower, myUid) {
  const value = String(handleLower || '').trim();
  const uid = String(myUid || '').trim();
  if (!value) return true;

  try {
    const idx = await getDoc(doc(db, 'login_index', value));
    if (idx.exists() && idx.data()?.uid && idx.data().uid !== uid) return false;
  } catch {
    // ignore
  }

  try {
    const snap = await getDocs(
      query(collection(db, 'public_users'), where('handleLower', '==', value), limit(1)),
    );
    if (snap.empty) return true;
    return snap.docs[0].id === uid;
  } catch {
    return true;
  }
}

async function claimHandle(uid, handleLower, emailLower) {
  if (!uid || !handleLower) return;
  const ref = doc(db, 'login_index', handleLower);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.uid && snap.data()?.uid !== uid) {
    throw new Error('handle_taken');
  }
  await setDoc(
    ref,
    {
      uid,
      handleLower,
      emailLower: emailLower || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function releaseHandle(uid, handleLower) {
  if (!uid || !handleLower) return;
  const ref = doc(db, 'login_index', handleLower);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data()?.uid === uid) {
    await deleteDoc(ref);
  }
}

async function uploadAvatar(uid, emailLower, file, prevPath) {
  if (!uid || !file) return null;
  if (!String(file.type || '').startsWith('image/')) {
    setInlineMsg(avatarMsg, 'Selecciona una imagen.', true);
    return null;
  }
  if (file.size > 10 * 1024 * 1024) {
    setInlineMsg(avatarMsg, 'La imagen es demasiado grande (máx. 10MB).', true);
    return null;
  }

  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/avatar_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);

  setInlineMsg(avatarMsg, 'Subiendo...');
  await uploadBytes(ref, file, { contentType: file.type });
  const url = await getDownloadURL(ref);

  await updateDoc(doc(db, 'users', uid), {
    photoURL: url,
    photoPath: filePath,
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'public_users', uid),
    {
      photoURL: url,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (prevPath) {
    try {
      await deleteObject(storageRef(storage, prevPath));
    } catch {
      // ignore
    }
  }

  return { url, path: filePath };
}

async function removeAvatar(uid, prevPath) {
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    photoURL: '',
    photoPath: '',
    updatedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'public_users', uid),
    { photoURL: '', updatedAt: serverTimestamp() },
    { merge: true },
  );
  if (prevPath) {
    try {
      await deleteObject(storageRef(storage, prevPath));
    } catch {
      // ignore
    }
  }
}

function applyDocsToForm(userDoc, publicDoc, user) {
  const email = user?.email || '';
  const displayName =
    String(userDoc?.displayName || userDoc?.name || publicDoc?.displayName || '').trim() ||
    String(email).split('@')[0] ||
    'Usuario';
  const handle = String(userDoc?.handle || publicDoc?.handle || '').trim();
  const photoURL = String(userDoc?.photoURL || publicDoc?.photoURL || '').trim();

  if (displayNameInput) displayNameInput.value = displayName;
  if (handleInput) handleInput.value = handle;

  if (langSelect) langSelect.value = String(userDoc?.lang || 'es');
  if (genderSelect) genderSelect.value = String(userDoc?.gender || '');
  if (goalSelect) goalSelect.value = String(userDoc?.studyGoalMin || 10);

  if (reviewRemindersToggle)
    reviewRemindersToggle.checked = userDoc?.reviewReminders !== false;

  const publicProfileValue =
    (typeof userDoc?.publicProfile === 'boolean'
      ? userDoc.publicProfile
      : publicDoc?.publicProfile) !== false;
  const allowFriendReqValue =
    (typeof userDoc?.allowFriendRequests === 'boolean'
      ? userDoc.allowFriendRequests
      : publicDoc?.allowFriendRequests) !== false;
  const allowMessagesValue =
    (typeof userDoc?.allowMessages === 'boolean'
      ? userDoc.allowMessages
      : publicDoc?.allowMessages) !== false;

  if (publicProfileToggle) publicProfileToggle.checked = publicProfileValue;
  if (allowFriendReqToggle) allowFriendReqToggle.checked = allowFriendReqValue;
  if (allowMessagesToggle) allowMessagesToggle.checked = allowMessagesValue;

  if (bioWhyInput) bioWhyInput.value = String(publicDoc?.bioWhy || '').trim();
  if (bioHardInput) bioHardInput.value = String(publicDoc?.bioHard || '').trim();
  if (bioGoalInput) bioGoalInput.value = String(publicDoc?.bioGoal || '').trim();
  if (bioLocationInput) bioLocationInput.value = String(publicDoc?.bioLocation || '').trim();
  if (bioWebsiteInput) bioWebsiteInput.value = String(publicDoc?.bioWebsite || '').trim();
  if (bioLanguagesInput) bioLanguagesInput.value = String(publicDoc?.bioLanguages || '').trim();
  if (bioInterestsInput) bioInterestsInput.value = String(publicDoc?.bioInterests || '').trim();

  const effectiveDefault = publicProfileValue ? 'public' : 'private';
  const postsV = String(publicDoc?.postsVisibility || effectiveDefault);
  const rewardsV = String(publicDoc?.rewardsVisibility || 'public');
  const statusV = String(publicDoc?.statusVisibility || effectiveDefault);
  if (postsVisibilitySelect)
    postsVisibilitySelect.value = ['public', 'friends', 'private'].includes(postsV)
      ? postsV
      : effectiveDefault;
  if (rewardsVisibilitySelect)
    rewardsVisibilitySelect.value = ['public', 'private'].includes(rewardsV) ? rewardsV : 'public';
  if (statusVisibilitySelect)
    statusVisibilitySelect.value = ['public', 'private'].includes(statusV)
      ? statusV
      : effectiveDefault;

  if (reviewMinutesSelect)
    reviewMinutesSelect.value = String(userDoc?.reviewDailyMinutes || 10);
  if (reviewLimitSelect) reviewLimitSelect.value = String(userDoc?.reviewDailyLimit || 20);
  if (reviewDirectionSelect)
    reviewDirectionSelect.value = String(userDoc?.reviewDirection || 'pl_es');

  renderAvatar(photoURL, displayName || email);
}

async function saveProfileBasics() {
  if (!CURRENT_UID) return;
  if (!btnSaveProfile) return;

  const displayNameRaw = String(displayNameInput?.value || '').trim();
  const displayName = displayNameRaw.slice(0, 60);
  const handleRaw = String(handleInput?.value || '').trim();
  const handleLower = normalizeHandle(handleRaw);

  if (handleRaw && !isHandleValid(handleLower)) {
    setInlineMsg(profileMsg, 'Usuario inválido. Usa 3–20 letras/números y . _ -', true);
    return;
  }

  if (handleLower && handleLower !== currentHandleLower) {
    const available = await isHandleAvailable(handleLower, CURRENT_UID);
    if (!available) {
      setInlineMsg(profileMsg, 'Ese usuario ya existe.', true);
      return;
    }
  }

  btnSaveProfile.disabled = true;
  setInlineMsg(profileMsg, 'Guardando...');
  try {
    if (handleLower !== currentHandleLower) {
      if (handleLower) await claimHandle(CURRENT_UID, handleLower, CURRENT_EMAIL_LOWER);
      if (currentHandleLower) await releaseHandle(CURRENT_UID, currentHandleLower);
    }

    const displayNameLower = normalizeName(displayName);
    const payloadPublic = {
      displayName: displayName || null,
      displayNameLower: displayNameLower || null,
      handle: handleLower || null,
      handleLower: handleLower || null,
      updatedAt: serverTimestamp(),
    };
    const payloadUser = {
      displayName: displayName || null,
      handle: handleLower || null,
      handleLower: handleLower || null,
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'public_users', CURRENT_UID), payloadPublic, { merge: true });
    await updateDoc(doc(db, 'users', CURRENT_UID), payloadUser);

    currentHandleLower = handleLower || '';
    if (handleInput) handleInput.value = handleLower;

    renderAvatar(currentPhotoUrl, displayName || CURRENT_EMAIL_LOWER);
    setInlineMsg(profileMsg, 'Guardado ✅');
    setTimeout(() => setInlineMsg(profileMsg, ''), 2000);
  } catch (e) {
    console.warn('save profile basics failed', e);
    const msg = String(e?.message || '');
    if (msg.includes('handle_taken')) {
      setInlineMsg(profileMsg, 'Ese usuario ya existe.', true);
    } else {
      setInlineMsg(profileMsg, 'No se pudo guardar.', true);
    }
  } finally {
    btnSaveProfile.disabled = false;
  }
}

async function savePreferences() {
  if (!CURRENT_UID) return;
  if (!btnSavePrefs) return;

  const lang = String(langSelect?.value || 'es').trim();
  const gender = String(genderSelect?.value || '').trim();
  const goal = Number(goalSelect?.value || 10);
  const reviewReminders = !!reviewRemindersToggle?.checked;

  btnSavePrefs.disabled = true;
  setInlineMsg(prefsMsg, 'Guardando...');
  try {
    await updateDoc(doc(db, 'users', CURRENT_UID), {
      lang,
      gender,
      studyGoalMin: Number.isFinite(goal) ? goal : 10,
      reviewReminders,
      updatedAt: serverTimestamp(),
    });
    setInlineMsg(prefsMsg, 'Guardado ✅');
    setTimeout(() => setInlineMsg(prefsMsg, ''), 2000);
  } catch (e) {
    console.warn('save preferences failed', e);
    setInlineMsg(prefsMsg, 'No se pudo guardar.', true);
  } finally {
    btnSavePrefs.disabled = false;
  }
}

async function saveBio() {
  if (!CURRENT_UID) return;
  if (!btnSaveBio) return;

  btnSaveBio.disabled = true;
  setInlineMsg(bioMsg, 'Guardando...');
  try {
    await setDoc(
      doc(db, 'public_users', CURRENT_UID),
      {
        bioWhy: String(bioWhyInput?.value || '').trim(),
        bioHard: String(bioHardInput?.value || '').trim(),
        bioGoal: String(bioGoalInput?.value || '').trim(),
        bioLocation: String(bioLocationInput?.value || '').trim(),
        bioWebsite: String(bioWebsiteInput?.value || '').trim(),
        bioLanguages: String(bioLanguagesInput?.value || '').trim(),
        bioInterests: String(bioInterestsInput?.value || '').trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    setInlineMsg(bioMsg, 'Guardado ✅');
    setTimeout(() => setInlineMsg(bioMsg, ''), 2000);
  } catch (e) {
    console.warn('save bio failed', e);
    setInlineMsg(bioMsg, 'No se pudo guardar.', true);
  } finally {
    btnSaveBio.disabled = false;
  }
}

async function savePrivacy() {
  if (!CURRENT_UID) return;
  if (!btnSavePrivacy) return;

  const publicProfile = !!publicProfileToggle?.checked;
  const allowFriendRequests = !!allowFriendReqToggle?.checked;
  const allowMessages = !!allowMessagesToggle?.checked;

  const postsVisibilityRaw = String(postsVisibilitySelect?.value || '').trim();
  const rewardsVisibilityRaw = String(rewardsVisibilitySelect?.value || '').trim();
  const statusVisibilityRaw = String(statusVisibilitySelect?.value || '').trim();

  const postsVisibility = ['public', 'friends', 'private'].includes(postsVisibilityRaw)
    ? postsVisibilityRaw
    : 'public';
  const rewardsVisibility = ['public', 'private'].includes(rewardsVisibilityRaw)
    ? rewardsVisibilityRaw
    : 'public';
  const statusVisibility = ['public', 'private'].includes(statusVisibilityRaw)
    ? statusVisibilityRaw
    : 'public';

  btnSavePrivacy.disabled = true;
  setInlineMsg(privacyMsg, 'Guardando...');
  try {
    await setDoc(
      doc(db, 'public_users', CURRENT_UID),
      {
        publicProfile,
        allowFriendRequests,
        allowMessages,
        postsVisibility,
        rewardsVisibility,
        statusVisibility,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await updateDoc(doc(db, 'users', CURRENT_UID), {
      publicProfile,
      allowFriendRequests,
      allowMessages,
      updatedAt: serverTimestamp(),
    });

    setInlineMsg(privacyMsg, 'Guardado ✅');
    setTimeout(() => setInlineMsg(privacyMsg, ''), 2000);
  } catch (e) {
    console.warn('save privacy failed', e);
    setInlineMsg(privacyMsg, 'No se pudo guardar.', true);
  } finally {
    btnSavePrivacy.disabled = false;
  }
}

async function saveReviewPlan() {
  if (!CURRENT_UID) return;
  if (!btnSaveReview) return;

  const minutes = Number(reviewMinutesSelect?.value || 10);
  const limitValue = Number(reviewLimitSelect?.value || 20);
  const direction = String(reviewDirectionSelect?.value || 'pl_es');

  btnSaveReview.disabled = true;
  setInlineMsg(reviewSaveStatus, 'Guardando...');
  try {
    await updateDoc(doc(db, 'users', CURRENT_UID), {
      reviewDailyMinutes: Number.isFinite(minutes) ? minutes : 10,
      reviewDailyLimit: Number.isFinite(limitValue) ? limitValue : 20,
      reviewDirection: direction,
      updatedAt: serverTimestamp(),
    });
    setInlineMsg(reviewSaveStatus, 'Guardado ✅');
    setTimeout(() => setInlineMsg(reviewSaveStatus, ''), 2000);
  } catch (e) {
    console.warn('save review plan failed', e);
    setInlineMsg(reviewSaveStatus, 'No se pudo guardar.', true);
  } finally {
    btnSaveReview.disabled = false;
  }
}

function wireActions() {
  if (btnAvatarUpload && !btnAvatarUpload.dataset.wired) {
    btnAvatarUpload.dataset.wired = '1';
    btnAvatarUpload.addEventListener('click', () => avatarFile?.click());
  }
  if (avatarFile && !avatarFile.dataset.wired) {
    avatarFile.dataset.wired = '1';
    avatarFile.addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        btnAvatarUpload && (btnAvatarUpload.disabled = true);
        btnAvatarRemove && (btnAvatarRemove.disabled = true);
        const res = await uploadAvatar(CURRENT_UID, CURRENT_EMAIL_LOWER, file, currentPhotoPath);
        if (res?.url) {
          currentPhotoPath = res.path || '';
          renderAvatar(res.url, displayNameInput?.value || CURRENT_EMAIL_LOWER);
          setInlineMsg(avatarMsg, 'Foto guardada ✅');
          setTimeout(() => setInlineMsg(avatarMsg, ''), 2000);
        }
      } catch (err) {
        console.warn('avatar upload failed', err);
        setInlineMsg(avatarMsg, 'No se pudo subir la foto.', true);
      } finally {
        if (btnAvatarUpload) btnAvatarUpload.disabled = false;
        if (btnAvatarRemove) btnAvatarRemove.disabled = !currentPhotoUrl;
        if (avatarFile) avatarFile.value = '';
      }
    });
  }
  if (btnAvatarRemove && !btnAvatarRemove.dataset.wired) {
    btnAvatarRemove.dataset.wired = '1';
    btnAvatarRemove.addEventListener('click', async () => {
      if (!CURRENT_UID) return;
      try {
        if (btnAvatarUpload) btnAvatarUpload.disabled = true;
        if (btnAvatarRemove) btnAvatarRemove.disabled = true;
        setInlineMsg(avatarMsg, 'Eliminando...');
        await removeAvatar(CURRENT_UID, currentPhotoPath);
        currentPhotoPath = '';
        renderAvatar('', displayNameInput?.value || CURRENT_EMAIL_LOWER);
        setInlineMsg(avatarMsg, 'Foto eliminada ✅');
        setTimeout(() => setInlineMsg(avatarMsg, ''), 2000);
      } catch (e) {
        console.warn('avatar remove failed', e);
        setInlineMsg(avatarMsg, 'No se pudo eliminar.', true);
      } finally {
        if (btnAvatarUpload) btnAvatarUpload.disabled = false;
        if (btnAvatarRemove) btnAvatarRemove.disabled = true;
      }
    });
  }

  if (btnSaveProfile && !btnSaveProfile.dataset.wired) {
    btnSaveProfile.dataset.wired = '1';
    btnSaveProfile.addEventListener('click', saveProfileBasics);
  }
  if (btnSavePrefs && !btnSavePrefs.dataset.wired) {
    btnSavePrefs.dataset.wired = '1';
    btnSavePrefs.addEventListener('click', savePreferences);
  }
  if (btnSaveBio && !btnSaveBio.dataset.wired) {
    btnSaveBio.dataset.wired = '1';
    btnSaveBio.addEventListener('click', saveBio);
  }
  if (btnSavePrivacy && !btnSavePrivacy.dataset.wired) {
    btnSavePrivacy.dataset.wired = '1';
    btnSavePrivacy.addEventListener('click', savePrivacy);
  }
  if (btnSaveReview && !btnSaveReview.dataset.wired) {
    btnSaveReview.dataset.wired = '1';
    btnSaveReview.addEventListener('click', saveReviewPlan);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html?next=ajustes.html';
      return;
    }

    CURRENT_UID = user.uid;
    CURRENT_EMAIL_LOWER = String(user.email || '').toLowerCase();

    try {
      const userDoc = await ensureUserDoc(user);
      const publicDoc = await loadPublicUser(user.uid);

      currentPhotoPath = String(userDoc?.photoPath || '').trim();
      currentHandleLower = String(userDoc?.handleLower || publicDoc?.handleLower || '').trim();

      applyDocsToForm(userDoc, publicDoc, user);
      wireActions();
    } catch (e) {
      console.warn('ajustes init failed', e);
      setInlineMsg(profileMsg, 'No se pudieron cargar tus ajustes.', true);
    }
  });
});
