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
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteObject,
  getStorage,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import { requireNeuAuth } from '../neu-auth-gate.js?v=20260222c';
import { app, auth, db, storage } from '../neu-firebase-init.js?v=20260222c';

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
const NEU_USER_SETTINGS_COLLECTION = 'neuUserSettings';
const NEU_PROFILE_AVATAR_PREFIX = 'awatary/neu/';
const NEU_PROFILE_BIO_MAX = 160;
const NEU_PROFILE_FEED_LIMIT = 80;
const NEU_USERNAMES_COLLECTION = 'neuUsernames';
const NEU_ONBOARDING_MIN_CITY = 2;
const NEU_ONBOARDING_MIN_NAME = 2;
const NEU_ONBOARDING_MIN_USERNAME = 3;
const NEU_ONBOARDING_MAX_USERNAME = 24;
const NEU_ONBOARDING_STEP_TOTAL = 2;

const neuProfileState = {
  wired: false,
  loading: false,
  saving: false,
  readOnly: false,
  profile: null,
  pendingAvatarFile: null,
  pendingAvatarPreviewUrl: '',
  pendingAvatarUrlDraft: '',
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

const neuOnboardingState = {
  active: false,
  wired: false,
  step: 1,
  uid: '',
  saving: false,
  touched: false,
  form: {},
  errors: {},
};

const neuPostOnboardingState = {
  active: false,
  wired: false,
  uid: '',
  profile: null,
  finishing: false,
};

const neuSuggestedState = {
  wired: false,
  loading: false,
  uid: '',
  rows: [],
  followingSet: new Set(),
  focusPulseCard: false,
};

const neuQuickPostState = {
  wired: false,
  submitting: false,
};

const NEU_ONBOARDING_STEP_FIELDS = {
  1: ['firstName', 'lastName', 'username', 'countryOfOrigin', 'countryOfOriginOther', 'gender', 'language', 'birthYear'],
  2: ['phone', 'cityPl', 'termsAccepted'],
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

function neuOnboardingViewNode() {
  const node = document.getElementById('onboardingView');
  return node instanceof HTMLElement ? node : null;
}

function neuOnboardingFormNode() {
  const node = document.getElementById('neuOnboardingForm');
  return node instanceof HTMLFormElement ? node : null;
}

function neuOnboardingFieldNode(field) {
  const map = {
    firstName: 'onbFirstName',
    lastName: 'onbLastName',
    username: 'onbUsername',
    countryOfOrigin: 'onbCountry',
    countryOfOriginOther: 'onbCountryOther',
    gender: 'onbGender',
    language: 'onbLanguage',
    birthYear: 'onbBirthYear',
    phone: 'onbPhone',
    cityPl: 'onbCityPl',
    marketingConsent: 'onbMarketingConsent',
    termsAccepted: 'onbTermsAccepted',
  };
  const id = map[field];
  if (!id) return null;
  return document.getElementById(id);
}

function neuOnboardingErrorNode(field) {
  const node = document.getElementById(`onbError-${field}`);
  return node instanceof HTMLElement ? node : null;
}

function neuOnboardingSetGlobalMsg(text, bad = false) {
  const node = document.getElementById('onbGlobalMsg');
  if (!(node instanceof HTMLElement)) return;
  node.textContent = String(text || '').trim();
  node.classList.toggle('is-bad', bad === true);
}

function neuOnboardingSetActive(active) {
  const enabled = active === true;
  const view = neuOnboardingViewNode();
  if (view) view.hidden = !enabled;
  document.body.classList.toggle('neu-onboarding-active', enabled);
  neuOnboardingState.active = enabled;
}

function neuOnboardingSetFieldError(field, text) {
  const node = neuOnboardingErrorNode(field);
  if (!(node instanceof HTMLElement)) return;
  node.textContent = String(text || '');
}

function neuOnboardingNormalizeName(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function neuOnboardingNormalizeUsername(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, NEU_ONBOARDING_MAX_USERNAME);
}

function neuOnboardingNormalizeCity(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function neuOnboardingNormalizePhone(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';

  value = value.replace(/[^\d+]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;

  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('48') && digits.length >= 9) return `+${digits}`;
  if (digits.startsWith('0') && digits.length > 1) return `+48${digits.slice(1)}`;
  return digits.length === 9 ? `+48${digits}` : `+48${digits}`;
}

function neuOnboardingIsE164(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || '').trim());
}

function neuOnboardingCountryOptions() {
  return new Set([
    'Argentina',
    'Bolivia',
    'Brazil',
    'Chile',
    'Colombia',
    'Cuba',
    'Dominican Republic',
    'Ecuador',
    'El Salvador',
    'Guatemala',
    'Honduras',
    'Mexico',
    'Nicaragua',
    'Panama',
    'Paraguay',
    'Peru',
    'Poland',
    'Spain',
    'Ukraine',
    'Uruguay',
    'Venezuela',
  ]);
}

function neuOnboardingDefaultForm(user, rawProfile = {}) {
  const uid = String(user?.uid || '').trim();
  const profile = neuNormalizeProfile(rawProfile || {}, uid);
  const displayName = String(profile.displayName || user?.displayName || '').trim();
  const displayParts = displayName.split(/\s+/).filter(Boolean);
  const firstFromDisplay = displayParts[0] || '';
  const lastFromDisplay = displayParts.slice(1).join(' ');
  const existingUsername = neuOnboardingNormalizeUsername(rawProfile.username || String(profile.handle || '').replace(/^@/, ''));
  const emailCandidate = neuOnboardingNormalizeUsername(neuEmailLocalPart(user?.email || ''));
  const usernameSeed = existingUsername || emailCandidate || neuOnboardingNormalizeUsername(`user${uid.slice(0, 6)}`);
  const countrySet = neuOnboardingCountryOptions();
  const rawCountry = String(rawProfile.countryOfOrigin || rawProfile.country || '').trim();
  const hasCountry = countrySet.has(rawCountry);
  const language = ['pl', 'es', 'uk', 'en'].includes(String(rawProfile.language || '').trim())
    ? String(rawProfile.language || '').trim()
    : 'es';

  return {
    firstName: neuOnboardingNormalizeName(rawProfile.firstName || firstFromDisplay),
    lastName: neuOnboardingNormalizeName(rawProfile.lastName || lastFromDisplay),
    username: usernameSeed,
    countryOfOrigin: hasCountry ? rawCountry : rawCountry ? 'other' : '',
    countryOfOriginOther: hasCountry ? '' : rawCountry,
    gender: ['female', 'male', 'nonbinary', 'prefer_not_to_say'].includes(String(rawProfile.gender || '').trim())
      ? String(rawProfile.gender || '').trim()
      : '',
    language,
    birthYear: rawProfile.birthYear ? String(rawProfile.birthYear) : '',
    phone: neuOnboardingNormalizePhone(rawProfile.phone || ''),
    cityPl: neuOnboardingNormalizeCity(rawProfile.cityPl || rawProfile.city || ''),
    marketingConsent: rawProfile.marketingConsent === true,
    termsAccepted: rawProfile.termsAccepted === true,
  };
}

function neuOnboardingReadFormUi() {
  return {
    firstName: neuOnboardingNormalizeName(neuOnboardingFieldNode('firstName')?.value || ''),
    lastName: neuOnboardingNormalizeName(neuOnboardingFieldNode('lastName')?.value || ''),
    username: neuOnboardingNormalizeUsername(neuOnboardingFieldNode('username')?.value || ''),
    countryOfOrigin: String(neuOnboardingFieldNode('countryOfOrigin')?.value || '').trim(),
    countryOfOriginOther: neuOnboardingNormalizeName(neuOnboardingFieldNode('countryOfOriginOther')?.value || ''),
    gender: String(neuOnboardingFieldNode('gender')?.value || '').trim(),
    language: String(neuOnboardingFieldNode('language')?.value || '').trim(),
    birthYear: String(neuOnboardingFieldNode('birthYear')?.value || '').trim(),
    phone: neuOnboardingNormalizePhone(neuOnboardingFieldNode('phone')?.value || ''),
    cityPl: neuOnboardingNormalizeCity(neuOnboardingFieldNode('cityPl')?.value || ''),
    marketingConsent: !!neuOnboardingFieldNode('marketingConsent')?.checked,
    termsAccepted: !!neuOnboardingFieldNode('termsAccepted')?.checked,
  };
}

function neuOnboardingWriteFormUi(form) {
  const data = form || {};
  const assign = (field, value) => {
    const node = neuOnboardingFieldNode(field);
    if (!node) return;
    if (node instanceof HTMLInputElement && node.type === 'checkbox') node.checked = value === true;
    else node.value = String(value || '');
  };

  assign('firstName', data.firstName);
  assign('lastName', data.lastName);
  assign('username', data.username);
  assign('countryOfOrigin', data.countryOfOrigin);
  assign('countryOfOriginOther', data.countryOfOriginOther);
  assign('gender', data.gender);
  assign('language', data.language);
  assign('birthYear', data.birthYear);
  assign('phone', data.phone);
  assign('cityPl', data.cityPl);
  assign('marketingConsent', data.marketingConsent === true);
  assign('termsAccepted', data.termsAccepted === true);
}

function neuOnboardingToggleCountryOtherInput() {
  const wrap = document.getElementById('onbCountryOtherWrap');
  const country = String(neuOnboardingFieldNode('countryOfOrigin')?.value || '').trim();
  if (!(wrap instanceof HTMLElement)) return;
  wrap.hidden = country !== 'other';
}

function neuOnboardingValidateField(field, form) {
  const data = form || neuOnboardingState.form || {};
  const currentYear = new Date().getFullYear();
  const usernameRegex = /^[a-z0-9._]{3,24}$/;

  if (field === 'firstName') {
    if (String(data.firstName || '').trim().length < NEU_ONBOARDING_MIN_NAME) return 'Min. 2 caracteres.';
    return '';
  }

  if (field === 'lastName') {
    if (String(data.lastName || '').trim().length < NEU_ONBOARDING_MIN_NAME) return 'Min. 2 caracteres.';
    return '';
  }

  if (field === 'username') {
    const value = String(data.username || '').trim();
    if (value.length < NEU_ONBOARDING_MIN_USERNAME) return 'Min. 3 caracteres.';
    if (!usernameRegex.test(value)) return 'Solo a-z, 0-9, punto y guion bajo.';
    return '';
  }

  if (field === 'countryOfOrigin') {
    if (!String(data.countryOfOrigin || '').trim()) return 'Selecciona un pais.';
    return '';
  }

  if (field === 'countryOfOriginOther') {
    if (String(data.countryOfOrigin || '').trim() !== 'other') return '';
    if (String(data.countryOfOriginOther || '').trim().length < 2) return 'Escribe tu pais.';
    return '';
  }

  if (field === 'gender') {
    const allowed = new Set(['female', 'male', 'nonbinary', 'prefer_not_to_say']);
    if (!allowed.has(String(data.gender || '').trim())) return 'Selecciona una opcion.';
    return '';
  }

  if (field === 'language') {
    const allowed = new Set(['pl', 'es', 'uk', 'en']);
    if (!allowed.has(String(data.language || '').trim())) return 'Selecciona un idioma.';
    return '';
  }

  if (field === 'birthYear') {
    const value = String(data.birthYear || '').trim();
    if (!value) return '';
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1900 || year > currentYear) return 'Ano invalido.';
    return '';
  }

  if (field === 'phone') {
    const value = String(data.phone || '').trim();
    if (!value) return 'Telefono obligatorio.';
    if (!neuOnboardingIsE164(value)) return 'Formato invalido. Usa E.164.';
    return '';
  }

  if (field === 'cityPl') {
    if (String(data.cityPl || '').trim().length < NEU_ONBOARDING_MIN_CITY) return 'Min. 2 caracteres.';
    return '';
  }

  if (field === 'termsAccepted') {
    if (data.termsAccepted !== true) return 'Debes aceptar los terminos.';
    return '';
  }

  return '';
}

function neuOnboardingValidateStep(step, { showErrors = true } = {}) {
  const stepNumber = Number(step);
  const fields = NEU_ONBOARDING_STEP_FIELDS[stepNumber] || [];
  const form = neuOnboardingReadFormUi();
  neuOnboardingState.form = form;
  let valid = true;

  fields.forEach((field) => {
    const message = neuOnboardingValidateField(field, form);
    if (showErrors) neuOnboardingSetFieldError(field, message);
    if (message) valid = false;
  });

  return valid;
}

function neuOnboardingRenderStep() {
  const step = Number(neuOnboardingState.step || 1);
  const touched = neuOnboardingState.touched === true;
  document.querySelectorAll('.neu-onboarding-step').forEach((node) => {
    const match = Number(node.getAttribute('data-onboarding-step') || 0) === step;
    node.classList.toggle('is-active', match);
  });

  document.querySelectorAll('[data-onb-step-label]').forEach((node) => {
    const match = Number(node.getAttribute('data-onb-step-label') || 0) === step;
    node.classList.toggle('is-active', match);
  });

  const fill = document.getElementById('neuOnboardingProgressFill');
  if (fill instanceof HTMLElement) {
    const ratio = step <= 1 ? 50 : 100;
    fill.style.width = `${ratio}%`;
  }

  const prevBtn = document.getElementById('onbPrevBtn');
  const nextBtn = document.getElementById('onbNextBtn');
  const submitBtn = document.getElementById('onbSubmitBtn');
  if (prevBtn instanceof HTMLElement) prevBtn.hidden = step <= 1;
  if (nextBtn instanceof HTMLElement) nextBtn.hidden = step >= NEU_ONBOARDING_STEP_TOTAL;
  if (submitBtn instanceof HTMLElement) submitBtn.hidden = step < NEU_ONBOARDING_STEP_TOTAL;

  const stepValid = neuOnboardingValidateStep(step, { showErrors: touched });
  if (nextBtn instanceof HTMLButtonElement) nextBtn.disabled = neuOnboardingState.saving || !stepValid;
  if (submitBtn instanceof HTMLButtonElement) {
    const finalValid = neuOnboardingValidateStep(NEU_ONBOARDING_STEP_TOTAL, {
      showErrors: touched && step >= NEU_ONBOARDING_STEP_TOTAL,
    });
    submitBtn.disabled = neuOnboardingState.saving || !finalValid;
    submitBtn.textContent = neuOnboardingState.saving ? 'Guardando...' : 'Finalizar';
  }
  if (prevBtn instanceof HTMLButtonElement) prevBtn.disabled = neuOnboardingState.saving;
}

function neuOnboardingSetStep(step) {
  const next = Math.min(NEU_ONBOARDING_STEP_TOTAL, Math.max(1, Number(step) || 1));
  neuOnboardingState.step = next;
  neuOnboardingRenderStep();
}

function neuOnboardingFinalCountry(form) {
  const value = String(form.countryOfOrigin || '').trim();
  if (value === 'other') return String(form.countryOfOriginOther || '').trim();
  return value;
}

function neuOnboardingHandleInputUpdate(target, { normalizePhone = false } = {}) {
  if (!(target instanceof HTMLElement)) return;
  neuOnboardingState.touched = true;
  if (target.id === 'onbUsername' && target instanceof HTMLInputElement) {
    const normalized = neuOnboardingNormalizeUsername(target.value);
    if (target.value !== normalized) target.value = normalized;
  }
  if (target.id === 'onbCountry') neuOnboardingToggleCountryOtherInput();
  if (normalizePhone && target.id === 'onbPhone' && target instanceof HTMLInputElement && target.value.trim()) {
    target.value = neuOnboardingNormalizePhone(target.value);
  }
  neuOnboardingState.form = neuOnboardingReadFormUi();
  neuOnboardingValidateStep(neuOnboardingState.step, { showErrors: true });
  neuOnboardingRenderStep();
}

function neuOnboardingIsUsernameTakenError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toUpperCase();
  return code.includes('username-taken') || message.includes('USERNAME_TAKEN');
}

function neuOnboardingErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase();
  if (!code) return 'No se pudo guardar onboarding. Intenta de nuevo.';
  if (code.includes('permission-denied')) {
    return 'Brak uprawnień Firestore. Sprawdź reguły neuUsers/neuUsernames i deploy.';
  }
  if (code.includes('unavailable') || code.includes('network-request-failed')) {
    return 'Brak połączenia z Firebase. Sprawdź internet i spróbuj ponownie.';
  }
  if (code.includes('deadline-exceeded') || code.includes('aborted')) {
    return 'Firebase timeout. Spróbuj ponownie za chwilę.';
  }
  if (code.includes('failed-precondition')) {
    return 'Brakuje konfiguracji Firestore (reguły/index).';
  }
  return `No se pudo guardar onboarding (${code}).`;
}

function neuBuildOnboardingPayload({
  form,
  username,
  countryValue,
  displayName,
  normalizedPhone,
  existingUser = {},
} = {}) {
  const payload = {
    firstName: String(form?.firstName || '').trim(),
    lastName: String(form?.lastName || '').trim(),
    displayName: String(displayName || '').trim() || 'Usuario',
    username,
    handle: `@${username}`,
    countryOfOrigin: countryValue,
    gender: form?.gender,
    phone: normalizedPhone,
    cityPl: form?.cityPl,
    city: form?.cityPl,
    language: form?.language,
    marketingConsent: form?.marketingConsent === true,
    termsAccepted: form?.termsAccepted === true,
    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),
    postOnboardingDone: false,
    postOnboardingDoneAt: deleteField(),
    updatedAt: serverTimestamp(),
    birthYear: form?.birthYear ? Number(form.birthYear) : deleteField(),
  };
  if (!existingUser?.createdAt) payload.createdAt = serverTimestamp();
  return payload;
}

async function neuOnboardingSaveDirect(uid, form, username, countryValue, displayName, normalizedPhone) {
  const userRef = doc(db, NEU_USERS_COLLECTION, uid);
  const userSnap = await getDoc(userRef);
  const existingUser = userSnap.exists() ? userSnap.data() || {} : {};

  const usernameSnap = await getDocs(query(collection(db, NEU_USERS_COLLECTION), where('username', '==', username), limit(3)));
  const takenByOther = usernameSnap.docs.some((row) => String(row.id || '').trim() !== uid);
  if (takenByOther) {
    const conflict = new Error('USERNAME_TAKEN');
    conflict.code = 'username-taken';
    throw conflict;
  }

  const payload = neuBuildOnboardingPayload({
    form,
    username,
    countryValue,
    displayName,
    normalizedPhone,
    existingUser,
  });
  await setDoc(userRef, payload, { merge: true });
}

async function neuOnboardingSubmit() {
  if (neuOnboardingState.saving) return;
  neuOnboardingState.touched = true;
  const uid = String(neuOnboardingState.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return;

  const step1Valid = neuOnboardingValidateStep(1, { showErrors: true });
  if (!step1Valid) {
    neuOnboardingSetStep(1);
    return;
  }
  const step2Valid = neuOnboardingValidateStep(2, { showErrors: true });
  if (!step2Valid) {
    neuOnboardingSetStep(2);
    return;
  }

  const form = neuOnboardingReadFormUi();
  const username = neuOnboardingNormalizeUsername(form.username);
  const countryValue = neuOnboardingFinalCountry(form);
  const displayName = `${form.firstName} ${form.lastName}`.replace(/\s+/g, ' ').trim();
  const normalizedPhone = neuOnboardingNormalizePhone(form.phone);
  if (!neuOnboardingIsE164(normalizedPhone)) {
    neuOnboardingSetFieldError('phone', 'Formato invalido. Usa E.164.');
    return;
  }

  const userRef = doc(db, NEU_USERS_COLLECTION, uid);
  const usernameRef = doc(db, NEU_USERNAMES_COLLECTION, username);
  neuOnboardingState.saving = true;
  neuOnboardingSetGlobalMsg('Guardando datos...');
  neuOnboardingRenderStep();

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const existingUser = userSnap.exists() ? userSnap.data() || {} : {};
      const previousUsername = neuOnboardingNormalizeUsername(existingUser.username || '');

      const usernameSnap = await tx.get(usernameRef);
      const usernameOwner = String(usernameSnap.data()?.uid || '').trim();
      if (usernameSnap.exists() && usernameOwner && usernameOwner !== uid) {
        const conflict = new Error('USERNAME_TAKEN');
        conflict.code = 'username-taken';
        throw conflict;
      }

      if (previousUsername && previousUsername !== username) {
        const prevRef = doc(db, NEU_USERNAMES_COLLECTION, previousUsername);
        const prevSnap = await tx.get(prevRef);
        if (prevSnap.exists() && String(prevSnap.data()?.uid || '').trim() === uid) {
          tx.delete(prevRef);
        }
      }

      const payload = neuBuildOnboardingPayload({
        form,
        username,
        countryValue,
        displayName,
        normalizedPhone,
        existingUser,
      });

      tx.set(userRef, payload, { merge: true });
      tx.set(
        usernameRef,
        {
          uid,
          updatedAt: serverTimestamp(),
          createdAt: usernameSnap.exists() ? usernameSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
        },
        { merge: true },
      );
    });

    neuOnboardingSetGlobalMsg('Listo. Redirigiendo...');
    location.href = 'neu-social-app.html?postOnboarding=1';
  } catch (error) {
    if (neuOnboardingIsUsernameTakenError(error)) {
      neuOnboardingSetFieldError('username', 'Username ocupado.');
      neuOnboardingSetGlobalMsg('Elige otro username.', true);
      neuOnboardingSetStep(1);
    } else if (neuIsPermissionDenied(error)) {
      try {
        await neuOnboardingSaveDirect(uid, form, username, countryValue, displayName, normalizedPhone);
        neuOnboardingSetGlobalMsg('Listo. Redirigiendo...');
        location.href = 'neu-social-app.html?postOnboarding=1';
      } catch (fallbackError) {
        if (neuOnboardingIsUsernameTakenError(fallbackError)) {
          neuOnboardingSetFieldError('username', 'Username ocupado.');
          neuOnboardingSetGlobalMsg('Elige otro username.', true);
          neuOnboardingSetStep(1);
        } else {
          neuOnboardingSetGlobalMsg(neuOnboardingErrorMessage(fallbackError), true);
          console.error('[neu-onboarding] submit failed', error);
          console.error('[neu-onboarding] fallback failed', fallbackError);
        }
      }
    } else {
      neuOnboardingSetGlobalMsg(neuOnboardingErrorMessage(error), true);
      console.error('[neu-onboarding] submit failed', error);
    }
  } finally {
    neuOnboardingState.saving = false;
    neuOnboardingRenderStep();
  }
}

function neuWireOnboardingEvents() {
  if (neuOnboardingState.wired) return;
  const form = neuOnboardingFormNode();
  if (!(form instanceof HTMLFormElement)) return;
  neuOnboardingState.wired = true;

  form.addEventListener('input', (event) => {
    neuOnboardingHandleInputUpdate(event.target);
  });

  form.addEventListener('change', (event) => {
    neuOnboardingHandleInputUpdate(event.target, { normalizePhone: true });
  });

  form.addEventListener(
    'blur',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === 'onbPhone' || target.id === 'onbUsername') {
        neuOnboardingHandleInputUpdate(target, { normalizePhone: true });
      }
    },
    true,
  );

  document.getElementById('onbPrevBtn')?.addEventListener('click', () => {
    if (neuOnboardingState.saving) return;
    neuOnboardingSetStep(1);
  });

  document.getElementById('onbNextBtn')?.addEventListener('click', () => {
    if (neuOnboardingState.saving) return;
    neuOnboardingState.touched = true;
    if (!neuOnboardingValidateStep(1, { showErrors: true })) {
      neuOnboardingRenderStep();
      return;
    }
    neuOnboardingSetStep(2);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    neuOnboardingSubmit().catch((error) => {
      neuOnboardingSetGlobalMsg('No se pudo guardar onboarding.', true);
      if (NEU_QA) console.error('[neu-onboarding] submit exception', error);
    });
  });
}

async function neuNeedsOnboarding(uid) {
  const targetUid = String(uid || '').trim();
  if (!targetUid) return { needed: false, profile: null };
  try {
    const snap = await getDoc(neuProfileDocRef(targetUid));
    if (!snap.exists()) return { needed: true, profile: null };
    const data = snap.data() || {};
    return { needed: data.onboardingCompleted !== true, profile: data };
  } catch (error) {
    if (NEU_QA) console.warn('[neu-onboarding] gate read failed', error);
    return { needed: true, profile: null };
  }
}

async function neuInitOnboarding(user, profileSeed = null) {
  const uid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return false;
  neuOnboardingSetActive(true);
  neuOnboardingState.uid = uid;
  neuOnboardingState.saving = false;
  neuOnboardingState.touched = false;
  neuOnboardingState.errors = {};
  neuOnboardingState.form = neuOnboardingDefaultForm(user, profileSeed || {});
  neuOnboardingWriteFormUi(neuOnboardingState.form);
  neuOnboardingToggleCountryOtherInput();
  neuOnboardingSetGlobalMsg('');
  neuWireOnboardingEvents();
  neuOnboardingSetStep(1);
  window.scrollTo({ top: 0, behavior: 'auto' });
  return true;
}

function neuPostOnboardingViewNode() {
  const node = document.getElementById('postOnboardingView');
  return node instanceof HTMLElement ? node : null;
}

function neuPostOnboardingSetMsg(text, bad = false) {
  const node = document.getElementById('postOnboardingMsg');
  if (!(node instanceof HTMLElement)) return;
  node.textContent = String(text || '').trim();
  node.classList.toggle('is-bad', bad === true);
}

function neuPostOnboardingSetActive(active) {
  const enabled = active === true;
  const view = neuPostOnboardingViewNode();
  if (view) view.hidden = !enabled;
  document.body.classList.toggle('neu-post-onboarding-active', enabled);
  neuPostOnboardingState.active = enabled;
}

function neuStripQueryParams(names = []) {
  if (!Array.isArray(names) || !names.length) return;
  const url = new URL(location.href);
  let changed = false;
  names.forEach((name) => {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  });
  if (!changed) return;
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
}

async function neuGetOwnUserDoc(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return null;
  try {
    const snap = await getDoc(neuProfileDocRef(cleanUid));
    return snap.exists() ? snap.data() || {} : null;
  } catch {
    return null;
  }
}

async function neuNeedsPostOnboarding(uid, profileSeed = null) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return { needed: false, profile: null };
  const fromQuery = new URLSearchParams(location.search).get('postOnboarding') === '1';

  let profile = profileSeed && typeof profileSeed === 'object' ? profileSeed : null;
  if (!profile) profile = await neuGetOwnUserDoc(cleanUid);
  if (!profile || profile.onboardingCompleted !== true) return { needed: false, profile };

  const done = profile.postOnboardingDone === true;
  if (!done) return { needed: true, profile };
  if (fromQuery) neuStripQueryParams(['postOnboarding']);
  return { needed: false, profile };
}

async function neuSeedUserSettings(uid, language = '') {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  const ref = doc(db, NEU_USER_SETTINGS_COLLECTION, cleanUid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() || {};
    const patch = {};
    if (!String(data.language || '').trim() && language) patch.language = language;
    if (typeof data.notificationsEnabled === 'undefined') patch.notificationsEnabled = true;
    if (!String(data.theme || '').trim()) patch.theme = 'dark';
    if (Object.keys(patch).length) {
      patch.updatedAt = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
    }
    return;
  }

  await setDoc(
    ref,
    {
      language: language || 'es',
      notificationsEnabled: true,
      theme: 'dark',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function neuCompletePostOnboarding(uid, profile = null) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  await setDoc(
    neuProfileDocRef(cleanUid),
    {
      postOnboardingDone: true,
      postOnboardingDoneAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  const language = String(profile?.language || '').trim();
  try {
    await neuSeedUserSettings(cleanUid, language);
  } catch (error) {
    if (NEU_QA) console.warn('[neu-post-onboarding] settings seed skipped', error);
  }
}

function neuPostOnboardingRoute(action) {
  if (action === 'avatar') return 'neu-social-app.html?portal=feed&profile=me&openProfileEdit=1';
  if (action === 'post') return 'neu-social-app.html?portal=feed&openQuickPost=1';
  if (action === 'suggested') return 'neu-social-app.html?portal=pulse&suggested=1';
  return 'neu-social-app.html?portal=pulse';
}

async function neuHandlePostOnboardingAction(action) {
  if (neuPostOnboardingState.finishing) return;
  const uid = String(neuPostOnboardingState.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return;

  neuPostOnboardingState.finishing = true;
  neuPostOnboardingSetMsg('Zapisywanie...');

  try {
    await neuCompletePostOnboarding(uid, neuPostOnboardingState.profile || {});
    if (action === 'suggested') sessionStorage.setItem('neu_open_suggested', '1');
    location.href = neuPostOnboardingRoute(action);
  } catch (error) {
    neuPostOnboardingState.finishing = false;
    neuPostOnboardingSetMsg('No se pudo completar la pantalla inicial. Intenta de nuevo.', true);
    if (NEU_QA) console.error('[neu-post-onboarding] complete failed', error);
  }
}

function neuWirePostOnboardingEvents() {
  if (neuPostOnboardingState.wired) return;
  neuPostOnboardingState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionBtn = target.closest('[data-post-onb-action]');
      if (actionBtn instanceof HTMLElement) {
        event.preventDefault();
        const action = String(actionBtn.getAttribute('data-post-onb-action') || '').trim();
        neuHandlePostOnboardingAction(action).catch(() => null);
        return;
      }

      const skipBtn = target.closest('#postOnboardingSkipBtn');
      if (skipBtn) {
        event.preventDefault();
        neuHandlePostOnboardingAction('skip').catch(() => null);
      }
    },
    true,
  );

}

async function neuInitPostOnboarding(user, profileSeed = null) {
  const uid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!uid) return false;
  neuOnboardingSetActive(false);
  neuPostOnboardingSetActive(true);
  neuPostOnboardingState.uid = uid;
  neuPostOnboardingState.profile = profileSeed && typeof profileSeed === 'object' ? profileSeed : await neuGetOwnUserDoc(uid);
  neuPostOnboardingState.finishing = false;
  neuPostOnboardingSetMsg('');
  neuWirePostOnboardingEvents();
  window.scrollTo({ top: 0, behavior: 'auto' });
  return true;
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

function neuSyncChatProfileAvatarUi(uid, profile) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;
  const data = profile && typeof profile === 'object' ? profile : {};
  try {
    if (neuChatState?.profileCache instanceof Map) {
      neuChatState.profileCache.set(cleanUid, neuNormalizeProfile(data, cleanUid));
    }
    if (String(neuChatState?.peerUid || '').trim() === cleanUid) {
      neuRenderChatHeader();
    }
    if (
      Array.isArray(neuChatState?.listRows) &&
      neuChatState.listRows.some((row) => String(row?.otherUid || '').trim() === cleanUid)
    ) {
      neuRenderChatList();
    }
  } catch {
    // chat module may be unavailable in safe/debug modes
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

function neuNormalizeAvatarUrl(raw, { allowEmpty = true } = {}) {
  const value = String(raw || '').trim();
  if (!value) {
    return allowEmpty ? { value: '' } : { error: 'URL de avatar invalida.' };
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'URL de avatar invalida.' };
    }
    return { value: parsed.href };
  } catch {
    return { error: 'URL de avatar invalida.' };
  }
}

function neuResetProfileAvatarDraft({ keepInputValue = false } = {}) {
  neuProfileState.pendingAvatarFile = null;
  neuProfileState.removeAvatar = false;
  neuProfileState.pendingAvatarUrlDraft = '';
  neuRevokeProfilePreviewUrl();
  const fileInput = document.getElementById('neuProfileAvatarFile');
  if (fileInput instanceof HTMLInputElement) fileInput.value = '';
  if (!keepInputValue) {
    const urlInput = document.getElementById('neuProfileAvatarUrlInput');
    if (urlInput instanceof HTMLInputElement) urlInput.value = '';
  }
}

function neuCurrentProfileAvatarUrl() {
  if (neuProfileState.removeAvatar) return '';
  if (neuProfileState.pendingAvatarPreviewUrl) return neuProfileState.pendingAvatarPreviewUrl;
  if (neuProfileState.pendingAvatarUrlDraft) return String(neuProfileState.pendingAvatarUrlDraft || '').trim();
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
  const avatarUrlInput = document.getElementById('neuProfileAvatarUrlInput');
  const currentAvatarUrl = String(data.avatarUrl || '').trim();
  neuResetProfileAvatarDraft({ keepInputValue: true });
  neuProfileState.pendingAvatarUrlDraft = currentAvatarUrl;
  if (nameInput instanceof HTMLInputElement) nameInput.value = String(data.displayName || '').trim();
  if (cityInput instanceof HTMLInputElement) cityInput.value = String(data.city || '').trim();
  if (bioInput instanceof HTMLTextAreaElement) bioInput.value = String(data.bio || '').trim().slice(0, NEU_PROFILE_BIO_MAX);
  if (avatarUrlInput instanceof HTMLInputElement) avatarUrlInput.value = currentAvatarUrl;
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
  const avatarUrlInput = document.getElementById('neuProfileAvatarUrlInput');
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
  if (avatarUrlInput instanceof HTMLInputElement) avatarUrlInput.disabled = disabled;
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
  const avatarUrlInput = document.getElementById('neuProfileAvatarUrlInput');
  const avatarUrlInputRaw = String(avatarUrlInput instanceof HTMLInputElement ? avatarUrlInput.value : '').trim();
  const normalizedAvatarUrl = neuNormalizeAvatarUrl(avatarUrlInputRaw, { allowEmpty: true });
  if (normalizedAvatarUrl.error) {
    neuSetProfileMsg(normalizedAvatarUrl.error, true);
    if (avatarUrlInput instanceof HTMLInputElement) avatarUrlInput.focus({ preventScroll: true });
    return;
  }
  const manualAvatarUrl = String(normalizedAvatarUrl.value || '').trim();

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
    } else if (!neuProfileState.removeAvatar && manualAvatarUrl && manualAvatarUrl !== avatarUrl) {
      if (avatarStoragePath) await neuDeleteManagedAvatar(avatarStoragePath);
      avatarUrl = manualAvatarUrl;
      avatarStoragePath = '';
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
    neuProfileState.pendingAvatarUrlDraft = avatarUrl;
    neuRevokeProfilePreviewUrl();
    neuApplyProfileToUi(neuProfileState.profile);
    neuSyncChatProfileAvatarUi(uid, neuProfileState.profile);
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
        neuProfileState.pendingAvatarUrlDraft = '';
        neuRevokeProfilePreviewUrl();
        neuProfileState.removeAvatar = true;
        const input = document.getElementById('neuProfileAvatarFile');
        if (input instanceof HTMLInputElement) input.value = '';
        const avatarUrlInput = document.getElementById('neuProfileAvatarUrlInput');
        if (avatarUrlInput instanceof HTMLInputElement) avatarUrlInput.value = '';
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
      neuSetProfileMsg('Selecciona una imagen valida.', true);
      input.value = '';
      return;
    }
    neuSetProfileMsg('');
    neuRevokeProfilePreviewUrl();
    neuProfileState.pendingAvatarFile = file;
    neuProfileState.pendingAvatarPreviewUrl = URL.createObjectURL(file);
    neuProfileState.pendingAvatarUrlDraft = '';
    neuProfileState.removeAvatar = false;
    const avatarUrlInput = document.getElementById('neuProfileAvatarUrlInput');
    if (avatarUrlInput instanceof HTMLInputElement) avatarUrlInput.value = '';
    neuRenderProfileAvatarPreview();
  });

  document.getElementById('neuProfileAvatarUrlInput')?.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const normalized = neuNormalizeAvatarUrl(input.value, { allowEmpty: true });
    if (normalized.error) {
      neuSetProfileMsg(normalized.error, true);
      return;
    }

    neuSetProfileMsg('');
    neuProfileState.pendingAvatarFile = null;
    neuRevokeProfilePreviewUrl();
    neuProfileState.removeAvatar = false;
    neuProfileState.pendingAvatarUrlDraft = String(normalized.value || '').trim();
    const fileInput = document.getElementById('neuProfileAvatarFile');
    if (fileInput instanceof HTMLInputElement) fileInput.value = '';
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
  const legacyUid = String(params.get('uid') || '').trim();

  if (!currentProfile && legacyUid) {
    params.set(NEU_PROFILE_PARAM, legacyUid);
    params.delete('uid');
  }

  const effectiveProfile = String(params.get(NEU_PROFILE_PARAM) || '').trim();
  if (!effectiveProfile) {
    if (!String(params.get('portal') || '').trim()) {
      params.set('portal', 'feed');
    }
    params.set(NEU_PROFILE_PARAM, NEU_PROFILE_ME);
  } else {
    const normalized = normalizeProfileParam(effectiveProfile, meUid);
    if (normalized && normalized !== effectiveProfile) params.set(NEU_PROFILE_PARAM, normalized);
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

  const messageTargetUid = isProfileMode ? String(neuPublicProfileState.targetUid || '').trim() : '';
  if (messageBtn instanceof HTMLElement) {
    messageBtn.setAttribute('data-chat-uid', messageTargetUid);
  }
  if (messageBtn instanceof HTMLAnchorElement) {
    messageBtn.href = 'neu-social-app.html?portal=pulse';
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
    text: String(data.text || data.content || '').trim(),
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

function neuSuggestedRootNode() {
  const node = document.getElementById('pulseSuggestedUsers');
  return node instanceof HTMLElement ? node : null;
}

function neuSuggestedCardNode() {
  const node = document.getElementById('pulseSuggestedCard');
  return node instanceof HTMLElement ? node : null;
}

function neuSuggestedButtonLabel(uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return 'Seguir';
  return neuSuggestedState.followingSet.has(cleanUid) ? 'Siguiendo' : 'Seguir';
}

function neuRenderSuggestedUsers() {
  const root = neuSuggestedRootNode();
  if (!(root instanceof HTMLElement)) return;

  if (neuSuggestedState.loading) {
    root.innerHTML = '<div class="empty-state">Cargando sugerencias...</div>';
    return;
  }

  if (!Array.isArray(neuSuggestedState.rows) || !neuSuggestedState.rows.length) {
    root.innerHTML = '<div class="empty-state">Sin sugerencias por ahora.</div>';
    return;
  }

  const items = neuSuggestedState.rows
    .map((row) => {
      const uid = String(row.uid || '').trim();
      const displayName = String(row.displayName || 'Usuario').trim() || 'Usuario';
      const handle = neuEnsureHandle(row.handle || row.username || '', displayName, uid);
      const city = String(row.cityPl || row.city || '').trim();
      const avatarUrl = String(row.avatarUrl || '').trim();
      const followLabel = neuSuggestedButtonLabel(uid);
      const isFollowing = followLabel === 'Siguiendo';
      const avatarHtml = avatarUrl
        ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
        : `<span>${esc(neuAvatarLetter(displayName))}</span>`;
      return `
        <article class="neu-suggested-item" data-neu-suggested-item="${esc(uid)}">
          <a class="avatar-frame neu-suggested-avatar" href="${esc(neuProfileHref(uid))}">${avatarHtml}</a>
          <a class="neu-suggested-copy" href="${esc(neuProfileHref(uid))}">
            <strong>${esc(displayName)}</strong>
            <span>${esc(handle)}${city ? ` Â· ${esc(city)}` : ''}</span>
          </a>
          <button
            class="${isFollowing ? 'btn-white-outline' : 'btn-yellow'} neu-suggested-follow-btn${isFollowing ? ' is-following' : ''}"
            type="button"
            data-neu-suggest-follow="${esc(uid)}"
          >${esc(followLabel)}</button>
        </article>
      `;
    })
    .join('');

  root.innerHTML = `<div class="neu-suggested-list">${items}</div>`;
}

async function neuLoadFollowingSet(meUid) {
  const cleanUid = String(meUid || '').trim();
  if (!cleanUid) return new Set();
  try {
    const snap = await getDocs(query(collection(db, NEU_FOLLOWS_COLLECTION, cleanUid, 'following'), limit(400)));
    const next = new Set();
    snap.forEach((row) => {
      const id = String(row.id || '').trim();
      const targetUid = String(row.data()?.targetUid || '').trim();
      if (id) next.add(id);
      if (targetUid) next.add(targetUid);
    });
    return next;
  } catch {
    return new Set();
  }
}

async function neuFetchSuggestedUsers(meUid) {
  const cleanUid = String(meUid || '').trim();
  if (!cleanUid) return [];

  const attempts = [
    query(
      collection(db, NEU_USERS_COLLECTION),
      where('onboardingCompleted', '==', true),
      orderBy('followersCount', 'desc'),
      limit(20),
    ),
    query(
      collection(db, NEU_USERS_COLLECTION),
      where('onboardingCompleted', '==', true),
      orderBy('createdAt', 'desc'),
      limit(20),
    ),
    query(collection(db, NEU_USERS_COLLECTION), where('onboardingCompleted', '==', true), limit(20)),
  ];

  const byUid = new Map();
  for (const q of attempts) {
    try {
      const snap = await getDocs(q);
      snap.forEach((row) => {
        const uid = String(row.id || '').trim();
        if (!uid || uid === cleanUid || byUid.has(uid)) return;
        const profile = neuNormalizeProfile(row.data() || {}, uid);
        byUid.set(uid, {
          uid,
          displayName: profile.displayName,
          handle: profile.handle,
          username: String(row.data()?.username || '').trim(),
          city: profile.city,
          cityPl: String(row.data()?.cityPl || '').trim(),
          avatarUrl: profile.avatarUrl,
        });
      });
      if (byUid.size >= 10) break;
    } catch {
      // try next fallback
    }
  }

  return Array.from(byUid.values()).slice(0, 10);
}

function neuFocusSuggestedCard() {
  const card = neuSuggestedCardNode();
  if (!(card instanceof HTMLElement)) return;
  card.classList.add('is-focus');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    card.classList.remove('is-focus');
  }, 1800);
}

async function neuLoadSuggestedUsers({ force = false, focus = false } = {}) {
  const meUid = String(neuCurrentUid() || '').trim();
  if (!meUid) return;
  if (neuSuggestedState.loading) return;
  if (!force && neuSuggestedState.uid === meUid && neuSuggestedState.rows.length) {
    if (focus) neuFocusSuggestedCard();
    return;
  }

  neuSuggestedState.loading = true;
  neuRenderSuggestedUsers();
  try {
    const [rows, followingSet] = await Promise.all([neuFetchSuggestedUsers(meUid), neuLoadFollowingSet(meUid)]);
    neuSuggestedState.uid = meUid;
    neuSuggestedState.rows = rows;
    neuSuggestedState.followingSet = followingSet;
  } catch (error) {
    neuSuggestedState.rows = [];
    neuSuggestedState.followingSet = new Set();
    if (NEU_QA) console.warn('[neu-suggested] load failed', error);
  } finally {
    neuSuggestedState.loading = false;
    neuRenderSuggestedUsers();
    if (focus) neuFocusSuggestedCard();
  }
}

async function neuToggleSuggestedFollow(targetUid) {
  const meUid = String(neuCurrentUid() || '').trim();
  const cleanTarget = String(targetUid || '').trim();
  if (!meUid || !cleanTarget || cleanTarget === meUid) return;
  if (neuSuggestedState.loading) return;

  const wasFollowing = neuSuggestedState.followingSet.has(cleanTarget);
  if (wasFollowing) neuSuggestedState.followingSet.delete(cleanTarget);
  else neuSuggestedState.followingSet.add(cleanTarget);
  neuRenderSuggestedUsers();

  if (neuPublicProfileState.profileMode && !neuPublicProfileState.isOwn && neuPublicProfileState.targetUid === cleanTarget) {
    neuPublicProfileState.isFollowing = !wasFollowing;
    neuPublicProfileState.followersCount = Math.max(0, Number(neuPublicProfileState.followersCount || 0) + (wasFollowing ? -1 : 1));
    neuSyncProfileCountsUi();
    neuSyncProfileActionsUi();
  }

  try {
    if (wasFollowing) {
      await Promise.all([
        deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', cleanTarget)),
        deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, cleanTarget, 'followers', meUid)),
      ]);
    } else {
      const now = serverTimestamp();
      await Promise.all([
        setDoc(
          doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', cleanTarget),
          { sourceUid: meUid, targetUid: cleanTarget, createdAt: now, updatedAt: now },
          { merge: true },
        ),
        setDoc(
          doc(db, NEU_FOLLOWS_COLLECTION, cleanTarget, 'followers', meUid),
          { sourceUid: meUid, targetUid: cleanTarget, createdAt: now, updatedAt: now },
          { merge: true },
        ),
      ]);
    }
  } catch (error) {
    if (wasFollowing) neuSuggestedState.followingSet.add(cleanTarget);
    else neuSuggestedState.followingSet.delete(cleanTarget);
    neuRenderSuggestedUsers();
    if (NEU_QA) console.warn('[neu-suggested] follow failed', error);
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

function neuRewriteLegacyLinksInRoot(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const profileLinks = root.querySelectorAll('a[href*="perfil-fusion.html"]');
  profileLinks.forEach((anchor) => {
    if (anchor instanceof HTMLAnchorElement) neuPatchLegacyProfileLinkHref(anchor);
  });

  const chatLinks = root.querySelectorAll('a[href*="mensajes.html"]');
  chatLinks.forEach((anchor) => {
    if (anchor instanceof HTMLAnchorElement) neuPatchLegacyChatLinkHref(anchor);
  });
}

let neuLegacyProfileLinkBridgeWired = false;
const neuLegacyLinkRewriteState = {
  observer: null,
  tick: null,
};

function neuScheduleLegacyLinkRewrite() {
  if (neuLegacyLinkRewriteState.tick) window.clearTimeout(neuLegacyLinkRewriteState.tick);
  neuLegacyLinkRewriteState.tick = window.setTimeout(() => {
    neuLegacyLinkRewriteState.tick = null;
    neuRewriteLegacyLinksInRoot(document);
  }, 40);
}

function wireNeuLegacyLinkRewriteObserver() {
  if (isDisabled('observers')) return;
  if (neuLegacyLinkRewriteState.observer instanceof MutationObserver) return;

  const watchIds = [
    'feedList',
    'networkFollowers',
    'networkFollowing',
    'networkFriends',
    'networkSuggestions',
    'nearPeople',
    'popularQuestions',
    'pulseConversations',
    'pulseSaves',
  ];

  const nodes = watchIds
    .map((id) => document.getElementById(id))
    .filter((node) => node instanceof HTMLElement);
  if (!nodes.length) return;

  neuLegacyLinkRewriteState.observer = new MutationObserver(() => {
    neuScheduleLegacyLinkRewrite();
  });

  nodes.forEach((node) => {
    neuLegacyLinkRewriteState.observer.observe(node, { childList: true, subtree: true });
  });
}

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
        if (neuHasModifiedClick(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (chatUid) {
          neuOpenChatWithUser(chatUid).catch((error) => {
            if (NEU_QA) console.warn('[neu-chat] legacy chat bridge failed', error);
          });
        } else if (NEU_QA) {
          console.warn('[neu-chat] ignored legacy chat link without uid', chatAnchor.getAttribute('href'));
        }
        return;
      }

      const anchor = target.closest('a[href*="perfil-fusion.html"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const uid = neuPatchLegacyProfileLinkHref(anchor);
      if (neuHasModifiedClick(event)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (uid) {
        location.href = neuProfileHref(uid);
      } else if (NEU_QA) {
        console.warn('[neu-profile] ignored legacy profile link without uid', anchor.getAttribute('href'));
      }
    },
    true,
  );

  const scheduleRewrite = () => {
    window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 0);
    window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 240);
    window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 900);
  };
  scheduleRewrite();
  wireNeuLegacyLinkRewriteObserver();
}

function neuWirePublicProfileEvents() {
  if (neuPublicProfileState.wired) return;
  neuPublicProfileState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const suggestFollowBtn = target.closest('[data-neu-suggest-follow]');
      if (suggestFollowBtn instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const targetUid = String(suggestFollowBtn.getAttribute('data-neu-suggest-follow') || '').trim();
        neuToggleSuggestedFollow(targetUid).catch((error) => {
          if (NEU_QA) console.warn('[neu-suggested] follow click failed', error);
        });
        return;
      }

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

    const targetUid = getProfileUidFromQuery(meUid);
    if (!targetUid) {
      // Invalid/empty profile id should not force redirect to own profile.
      neuPublicProfileState.profileMode = false;
      neuPublicProfileState.targetUid = '';
      neuPublicProfileState.isOwn = true;
      neuSyncProfileActionsUi();
      neuWirePublicProfileEvents();
      return;
    }
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
const NEU_CHAT_SCROLL_NEAR_BOTTOM = 120;
const NEU_CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEU_CHAT_FLOAT_STORAGE_KEY = 'neu_chat_float_pos';
const NEU_CHAT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const NEU_CHAT_UPLOAD_PREFIX = 'neuChatUploads/';
const NEU_CHAT_TYPING_DEBOUNCE_MS = 400;
const NEU_CHAT_TYPING_IDLE_MS = 2000;
const NEU_CHAT_TYPING_STALE_MS = 12000;
const NEU_CHAT_REPLY_SNIPPET_MAX = 80;
const NEU_CHAT_REPLY_LONG_PRESS_MS = 450;
const NEU_CHAT_REPLY_HIGHLIGHT_MS = 1000;
const NEU_CHAT_SEARCH_DEBOUNCE_MS = 150;
const NEU_CHAT_REACTION_TYPES = ['like', 'heart', 'laugh'];
const NEU_CHAT_REACTION_EMOJI = {
  like: '👍',
  heart: '❤️',
  laugh: '😆',
};

const neuChatState = {
  wired: false,
  meUid: '',
  listRows: [],
  listUnsub: null,
  listUid: '',
  messageUnsub: null,
  typingUnsub: null,
  currentConversationId: '',
  currentMembers: [],
  currentMemberKey: '',
  peerUid: '',
  messages: [],
  sending: false,
  uploading: false,
  profileCache: new Map(),
  profileLoading: new Map(),
  listObserver: null,
  totalUnread: 0,
  lastConversationId: '',
  lastPeerUid: '',
  floatWired: false,
  newMessageChipVisible: false,
  peerTyping: false,
  myLastReadAt: null,
  peerLastReadAt: null,
  bodyScrollWired: false,
  bodyScrollRaf: 0,
  nearBottom: true,
  lastRenderedMsgId: '',
  typingDebounceTimer: 0,
  typingIdleTimer: 0,
  typingActive: false,
  typingConversationId: '',
  reactionUnsubs: new Map(),
  reactionCounts: new Map(),
  reactionMine: new Map(),
  reactionChatId: '',
  reactionPickerMsgId: '',
  reactionHideTimers: new Map(),
  reactionLongPressTimer: 0,
  reactionLongPressMsgId: '',
  pendingImageFile: null,
  pendingImagePreviewUrl: '',
  replyDraft: null,
  replyHighlightTimer: 0,
  longPressReplyTimer: 0,
  longPressReplyMsgId: '',
  longPressReplyX: 0,
  longPressReplyY: 0,
  longPressMenuMessageId: '',
  uploadRetryContext: null,
  chatSearchWired: false,
  chatSearchQuery: '',
  chatSearchDebounceTimer: 0,
};

const neuChatFloatState = {
  dragging: false,
  moved: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  suppressClickUntil: 0,
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

function neuChatFloatNode() {
  const node = document.getElementById('neuChatFloatFlag');
  return node instanceof HTMLButtonElement ? node : null;
}

function neuEnsureFloatUnreadBadge() {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return null;
  let badge = flag.querySelector('.neu-chat-float-badge');
  if (!(badge instanceof HTMLElement)) {
    badge = document.createElement('span');
    badge.className = 'neu-unread-badge neu-chat-float-badge hidden';
    flag.append(badge);
  }
  return badge;
}

function neuRenderFloatUnreadBadge() {
  const badge = neuEnsureFloatUnreadBadge();
  if (!(badge instanceof HTMLElement)) return;
  const count = neuUnreadValue(neuChatState.totalUnread);
  const label = neuUnreadBadgeLabel(count);
  if (!label) {
    badge.classList.add('hidden');
    badge.textContent = '';
    return;
  }
  badge.classList.remove('hidden');
  badge.textContent = label;
  badge.setAttribute('aria-label', `Chats sin leer: ${count}`);
}

function neuSyncUnreadUi() {
  neuChatState.totalUnread = neuTotalUnreadFromRows(neuChatState.listRows);
  neuRenderBottomUnreadBadge();
  neuRenderFloatUnreadBadge();
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

function neuChatSetHint(text, bad = false, options = {}) {
  const hint = document.getElementById('neuChatHint');
  if (!(hint instanceof HTMLElement)) return;
  const message = String(text || '').trim();
  const retryUpload = options && typeof options === 'object' ? options.retryUpload === true : false;
  if (!message) {
    hint.textContent = '';
    hint.removeAttribute('data-neu-chat-retry-upload');
    hint.style.color = bad ? '#ffb2bf' : 'rgba(230,236,255,0.85)';
    return;
  }
  if (retryUpload) {
    hint.innerHTML = `${esc(message)} <button class="btn-white-outline neuChatHintRetry" type="button" data-neu-chat-retry-upload="1">Reintentar</button>`;
    hint.setAttribute('data-neu-chat-retry-upload', '1');
  } else {
    hint.textContent = message;
    hint.removeAttribute('data-neu-chat-retry-upload');
  }
  hint.style.color = bad ? '#ffb2bf' : 'rgba(230,236,255,0.85)';
}

function neuChatStorageInstance() {
  return storage || getStorage(app);
}

function neuChatErrorCode(error) {
  return String(error?.code || error?.name || '').trim();
}

function neuChatErrorCodeLower(error) {
  return neuChatErrorCode(error).toLowerCase();
}

function neuChatIsUploadPermissionError(error) {
  const code = neuChatErrorCodeLower(error);
  return code.includes('unauthorized') || code.includes('permission-denied');
}

function neuChatUploadErrorMessage(error) {
  const code = neuChatErrorCode(error) || 'unknown';
  const lowered = code.toLowerCase();
  if (lowered.includes('unauthorized') || lowered.includes('permission-denied')) {
    return `No tienes permisos para subir imagenes (Storage rules). (${code})`;
  }
  if (lowered.includes('unauthenticated')) {
    return `Sesion expirada. Vuelve a iniciar. (${code})`;
  }
  if (lowered.includes('canceled')) {
    return `Subida cancelada. (${code})`;
  }
  return `Error al subir imagen: ${code}`;
}

function neuChatFileFingerprint(file) {
  if (!(file instanceof File)) return '';
  const name = String(file.name || '').trim();
  const type = String(file.type || '').trim();
  const size = Number(file.size || 0);
  const lastModified = Number(file.lastModified || 0);
  return `${name}|${type}|${size}|${lastModified}`;
}

function neuChatSetUploadRetryContext(context = null) {
  if (!context || typeof context !== 'object') {
    neuChatState.uploadRetryContext = null;
    return;
  }
  const conversationId = String(context.conversationId || '').trim();
  const messageId = String(context.messageId || '').trim();
  const fingerprint = String(context.fileFingerprint || '').trim();
  if (!conversationId || !messageId || !fingerprint) {
    neuChatState.uploadRetryContext = null;
    return;
  }
  neuChatState.uploadRetryContext = { conversationId, messageId, fileFingerprint: fingerprint };
}

function neuChatCanRetryUpload(conversationId, file) {
  const context = neuChatState.uploadRetryContext;
  if (!context || typeof context !== 'object') return false;
  const chatId = String(conversationId || '').trim();
  const fingerprint = neuChatFileFingerprint(file);
  if (!chatId || !fingerprint) return false;
  return context.conversationId === chatId && context.fileFingerprint === fingerprint;
}

function neuChatLogUploadFail(error, conversationId) {
  const code = neuChatErrorCode(error) || 'unknown';
  console.error('[CHAT UPLOAD FAIL]', code, error?.message, error);
  if (neuChatIsUploadPermissionError(error)) {
    const chatId = String(conversationId || '').trim() || '{chatId}';
    console.error(`[HINT] Check Firebase Storage rules / bucket permissions for uploads path neuChatUploads/${chatId}/...`);
  }
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

function neuTimeToMs(t) {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return 0;
}

function neuChatTsValue(value) {
  const direct = neuTimeToMs(value);
  if (direct > 0) return direct;
  const date = neuChatDate(value);
  return date ? date.getTime() : 0;
}

function neuChatBuildGroups(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  const groups = [];

  list.forEach((item) => {
    const senderUid = String(item?.senderUid || '').trim();
    const ts = neuChatTsValue(item?.createdAt);
    const current = {
      id: String(item?.id || '').trim(),
      senderUid,
      text: String(item?.text || '').trim(),
      imageUrl: String(item?.imageUrl || '').trim(),
      imageStoragePath: String(item?.imageStoragePath || '').trim(),
      replyTo: neuChatNormalizeReplyPayload(item?.replyTo),
      createdAt: item?.createdAt || null,
      ts,
    };
    const prev = groups[groups.length - 1];
    const canMerge =
      !!prev &&
      prev.senderUid === senderUid &&
      prev.lastTs > 0 &&
      ts > 0 &&
      ts - prev.lastTs <= NEU_CHAT_GROUP_WINDOW_MS;

    if (canMerge) {
      prev.messages.push(current);
      prev.lastTs = ts;
      prev.lastCreatedAt = current.createdAt;
      prev.lastMessageId = current.id;
      return;
    }

    groups.push({
      senderUid,
      messages: [current],
      firstTs: ts,
      lastTs: ts,
      firstCreatedAt: current.createdAt,
      lastCreatedAt: current.createdAt,
      lastMessageId: current.id,
    });
  });

  return groups;
}

function neuChatDeliveryStatus(messages = [], meUid = '') {
  const list = Array.isArray(messages) ? messages : [];
  const ownUid = String(meUid || '').trim();
  if (!list.length || !ownUid) return null;

  let lastOutgoing = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const row = list[i];
    if (String(row?.senderUid || '').trim() === ownUid) {
      lastOutgoing = row;
      break;
    }
  }
  if (!lastOutgoing) return null;

  const lastOutgoingTs = neuTimeToMs(lastOutgoing.createdAt);
  const peerReadTs = neuTimeToMs(neuChatState.peerLastReadAt);
  const seen = peerReadTs > 0 && lastOutgoingTs > 0 ? peerReadTs >= lastOutgoingTs : false;

  return {
    messageId: String(lastOutgoing.id || '').trim(),
    label: seen ? 'Visto' : 'Enviado',
  };
}

function neuChatNewMessageChipNode() {
  return document.getElementById('neuNewMsgChip');
}

function neuChatTypingRowNode() {
  return document.getElementById('neuTypingRow');
}

function neuSetNewMessagesChipVisible(visible) {
  const next = visible === true;
  neuChatState.newMessageChipVisible = next;
  const chip = neuChatNewMessageChipNode();
  if (!(chip instanceof HTMLElement)) return;
  chip.classList.toggle('hidden', !next);
}

function neuSetTypingRowVisible(visible) {
  const next = visible === true;
  const row = neuChatTypingRowNode();
  if (!(row instanceof HTMLElement)) return;
  row.classList.toggle('hidden', !next);
}

function neuReactionType(rawType) {
  const key = String(rawType || '').trim().toLowerCase();
  return NEU_CHAT_REACTION_TYPES.includes(key) ? key : '';
}

function neuReactionEmoji(type) {
  const key = neuReactionType(type);
  return key ? NEU_CHAT_REACTION_EMOJI[key] : '';
}

function neuReactionBarHtml(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return '';
  const counts = neuChatState.reactionCounts.get(msgId);
  if (!counts || !counts.total) return '';
  const parts = [];
  NEU_CHAT_REACTION_TYPES.forEach((type) => {
    const value = Number(counts[type] || 0);
    if (value <= 0) return;
    parts.push(`<span class="neuReactChip">${esc(neuReactionEmoji(type))}${value}</span>`);
  });
  return parts.join('');
}

function neuReactionMessageSelector(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(msgId);
  return msgId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function neuReactionWrapNode(messageId) {
  const selectorValue = neuReactionMessageSelector(messageId);
  if (!selectorValue) return null;
  const node = document.querySelector(`.neuReactWrap[data-neu-react-wrap="${selectorValue}"]`);
  return node instanceof HTMLElement ? node : null;
}

function neuReactionWrapMessageId(node) {
  if (!(node instanceof Element)) return '';
  const wrap = node.closest('[data-neu-react-wrap]');
  if (!(wrap instanceof HTMLElement)) return '';
  return String(wrap.getAttribute('data-neu-react-wrap') || '').trim();
}

function neuReactionClearHideTimer(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId || !(neuChatState.reactionHideTimers instanceof Map)) return;
  const timer = neuChatState.reactionHideTimers.get(msgId);
  if (timer) {
    window.clearTimeout(timer);
  }
  neuChatState.reactionHideTimers.delete(msgId);
}

function neuReactionSetHover(messageId, next) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const wrap = neuReactionWrapNode(msgId);
  if (!(wrap instanceof HTMLElement)) return;
  wrap.classList.toggle('is-hover', next === true);
}

function neuReactionScheduleHide(messageId, delay = 180) {
  const msgId = String(messageId || '').trim();
  if (!msgId || !(neuChatState.reactionHideTimers instanceof Map)) return;
  neuReactionClearHideTimer(msgId);
  const timeoutMs = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 180;
  const timer = window.setTimeout(() => {
    neuChatState.reactionHideTimers.delete(msgId);
    neuReactionSetHover(msgId, false);
  }, timeoutMs);
  neuChatState.reactionHideTimers.set(msgId, timer);
}

function neuPatchReactionUiForMessage(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const selectorValue = neuReactionMessageSelector(msgId);
  if (!selectorValue) return;
  const wrap = document.querySelector(`.neuMessageItem[data-neu-msg-id="${selectorValue}"]`);
  if (!(wrap instanceof HTMLElement)) return;

  const mine = neuReactionType(neuChatState.reactionMine.get(msgId));
  const reactBtn = wrap.querySelector('.neuReactBtn');
  if (reactBtn instanceof HTMLButtonElement) {
    reactBtn.textContent = mine ? neuReactionEmoji(mine) : '🙂';
    reactBtn.classList.toggle('is-active', !!mine);
  }

  const bar = wrap.querySelector('.neuReactBar');
  if (bar instanceof HTMLElement) {
    const html = neuReactionBarHtml(msgId);
    bar.innerHTML = html;
    bar.classList.toggle('hidden', !html);
  }

  wrap.querySelectorAll('.neuReactOption').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) return;
    const type = neuReactionType(node.getAttribute('data-neu-react-type'));
    node.classList.toggle('is-active', !!type && type === mine);
  });
}

function neuPatchAllReactionUi() {
  const ids = Array.isArray(neuChatState.messages)
    ? neuChatState.messages.map((row) => String(row?.id || '').trim()).filter(Boolean)
    : [];
  ids.forEach((id) => neuPatchReactionUiForMessage(id));
}

function neuHideReactionPickers() {
  neuChatState.reactionPickerMsgId = '';
  document.querySelectorAll('.neuReactPicker.is-open').forEach((node) => {
    if (node instanceof HTMLElement) node.classList.remove('is-open');
  });
  document.querySelectorAll('.neuReactWrap.is-hover').forEach((node) => {
    if (node instanceof HTMLElement) node.classList.remove('is-hover');
  });
  if (neuChatState.reactionHideTimers instanceof Map) {
    neuChatState.reactionHideTimers.forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
    neuChatState.reactionHideTimers.clear();
  }
}

function neuToggleReactionPicker(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const selectorValue = neuReactionMessageSelector(msgId);
  if (!selectorValue) return;
  const picker = document.querySelector(`.neuReactPicker[data-neu-react-picker="${selectorValue}"]`);
  if (!(picker instanceof HTMLElement)) return;
  neuReactionClearHideTimer(msgId);
  const alreadyOpen = picker.classList.contains('is-open');
  neuHideReactionPickers();
  if (alreadyOpen) return;
  neuReactionSetHover(msgId, true);
  picker.classList.add('is-open');
  neuChatState.reactionPickerMsgId = msgId;
}

function neuClearReactionLongPressTimer() {
  if (neuChatState.reactionLongPressTimer) {
    window.clearTimeout(neuChatState.reactionLongPressTimer);
    neuChatState.reactionLongPressTimer = 0;
  }
  neuChatState.reactionLongPressMsgId = '';
}

function neuScheduleReactionLongPress(messageId) {
  const msgId = String(messageId || '').trim();
  neuClearReactionLongPressTimer();
  if (!msgId) return;
  neuChatState.reactionLongPressMsgId = msgId;
  neuChatState.reactionLongPressTimer = window.setTimeout(() => {
    neuChatState.reactionLongPressTimer = 0;
    neuToggleReactionPicker(msgId);
  }, 450);
}

function neuStopReactionListeners() {
  if (neuChatState.reactionUnsubs instanceof Map) {
    neuChatState.reactionUnsubs.forEach((unsub) => {
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch {
          // noop
        }
      }
    });
  }
  neuChatState.reactionUnsubs = new Map();
  neuChatState.reactionCounts = new Map();
  neuChatState.reactionMine = new Map();
  neuChatState.reactionChatId = '';
  if (neuChatState.reactionHideTimers instanceof Map) {
    neuChatState.reactionHideTimers.forEach((timer) => {
      if (timer) window.clearTimeout(timer);
    });
  }
  neuChatState.reactionHideTimers = new Map();
  neuHideReactionPickers();
  neuClearReactionLongPressTimer();
}

function neuSyncReactionListeners() {
  const chatId = String(neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!chatId || !meUid) {
    neuStopReactionListeners();
    return;
  }

  if (neuChatState.reactionChatId && neuChatState.reactionChatId !== chatId) {
    neuStopReactionListeners();
  }
  neuChatState.reactionChatId = chatId;

  const messageIds = Array.isArray(neuChatState.messages)
    ? neuChatState.messages.map((row) => String(row?.id || '').trim()).filter(Boolean).slice(-NEU_CHAT_MAX_MESSAGES)
    : [];
  const wanted = new Set(messageIds);

  neuChatState.reactionUnsubs.forEach((unsub, messageId) => {
    if (wanted.has(messageId)) return;
    if (typeof unsub === 'function') {
      try {
        unsub();
      } catch {
        // noop
      }
    }
    neuChatState.reactionUnsubs.delete(messageId);
    neuChatState.reactionCounts.delete(messageId);
    neuChatState.reactionMine.delete(messageId);
  });

  messageIds.forEach((messageId) => {
    if (neuChatState.reactionUnsubs.has(messageId)) return;
    const reactionsRef = collection(db, 'neuChatReactions', chatId, 'messages', messageId, 'reactions');
    const unsub = onSnapshot(
      reactionsRef,
      (snap) => {
        const next = { like: 0, heart: 0, laugh: 0, total: 0 };
        let mine = '';
        snap.forEach((row) => {
          const data = row.data() || {};
          const type = neuReactionType(data.type);
          if (!type) return;
          next[type] += 1;
          next.total += 1;
          if (String(row.id || '').trim() === meUid) {
            mine = type;
          }
        });
        neuChatState.reactionCounts.set(messageId, next);
        if (mine) neuChatState.reactionMine.set(messageId, mine);
        else neuChatState.reactionMine.delete(messageId);
        neuPatchReactionUiForMessage(messageId);
      },
      (error) => {
        if (NEU_QA) console.warn('[neu-chat] reaction subscription failed', messageId, error);
      },
    );
    neuChatState.reactionUnsubs.set(messageId, unsub);
  });
}

async function neuToggleMessageReaction(messageId, rawType) {
  const chatId = String(neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  const type = neuReactionType(rawType);
  const msgId = String(messageId || '').trim();
  if (!chatId || !meUid || !type || !msgId) return;
  const members = Array.isArray(neuChatState.currentMembers) ? neuChatState.currentMembers : [];
  if (!members.includes(meUid)) return;

  const current = neuReactionType(neuChatState.reactionMine.get(msgId));
  const ref = doc(db, 'neuChatReactions', chatId, 'messages', msgId, 'reactions', meUid);
  if (current && current === type) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(
    ref,
    {
      type,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function neuStopTypingTimers() {
  if (neuChatState.typingDebounceTimer) {
    window.clearTimeout(neuChatState.typingDebounceTimer);
    neuChatState.typingDebounceTimer = 0;
  }
  if (neuChatState.typingIdleTimer) {
    window.clearTimeout(neuChatState.typingIdleTimer);
    neuChatState.typingIdleTimer = 0;
  }
}

async function neuSetOwnTypingState(nextTyping, { bestEffort = false } = {}) {
  const chatId = String(neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  const next = nextTyping === true;
  if (!chatId || !meUid) return;
  const members = Array.isArray(neuChatState.currentMembers) ? neuChatState.currentMembers : [];
  if (!members.includes(meUid)) return;
  if (!bestEffort && neuChatState.typingConversationId === chatId && neuChatState.typingActive === next) return;

  const profile = neuProfileState.profile || neuDefaultProfile(meUid);
  const payload = {
    typing: next,
    updatedAt: serverTimestamp(),
  };
  if (next) {
    payload.displayName = String(profile.displayName || auth.currentUser?.displayName || 'Usuario').trim() || 'Usuario';
    payload.avatarUrl = String(profile.avatarUrl || auth.currentUser?.photoURL || '').trim();
  }
  try {
    await setDoc(doc(db, 'neuChatTyping', chatId, 'users', meUid), payload, { merge: true });
  } catch (error) {
    if (!bestEffort && NEU_QA) console.warn('[neu-chat] typing write failed', error);
    return;
  }
  neuChatState.typingConversationId = chatId;
  neuChatState.typingActive = next;
}

function neuStopTypingListener() {
  if (typeof neuChatState.typingUnsub === 'function') {
    try {
      neuChatState.typingUnsub();
    } catch {
      // noop
    }
  }
  neuChatState.typingUnsub = null;
  neuChatState.peerTyping = false;
  neuSetTypingRowVisible(false);
}

function neuChatHandleTypingInput(rawValue = '') {
  const chatId = String(neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!chatId || !meUid) return;
  const hasText = String(rawValue || '').trim().length > 0;
  neuStopTypingTimers();

  if (!hasText) {
    neuSetOwnTypingState(false).catch(() => null);
    return;
  }

  neuChatState.typingDebounceTimer = window.setTimeout(() => {
    neuChatState.typingDebounceTimer = 0;
    neuSetOwnTypingState(true).catch(() => null);
  }, NEU_CHAT_TYPING_DEBOUNCE_MS);

  neuChatState.typingIdleTimer = window.setTimeout(() => {
    neuChatState.typingIdleTimer = 0;
    neuSetOwnTypingState(false).catch(() => null);
  }, NEU_CHAT_TYPING_IDLE_MS);
}

function neuChatStopTypingAndTimers(options = {}) {
  neuStopTypingTimers();
  neuSetOwnTypingState(false, options).catch(() => null);
}

function neuStartTypingListener(conversationId, members = []) {
  const chatId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!chatId || !meUid) return;
  const memberList = Array.isArray(members) ? members.map((uid) => String(uid || '').trim()).filter(Boolean) : [];
  if (!memberList.includes(meUid)) return;

  neuStopTypingListener();
  neuChatState.peerTyping = false;
  neuSetTypingRowVisible(false);

  const typingRef = collection(db, 'neuChatTyping', chatId, 'users');
  neuChatState.typingUnsub = onSnapshot(
    typingRef,
    (snap) => {
      const now = Date.now();
      const hasTyping = snap.docs.some((row) => {
        const uid = String(row.id || '').trim();
        if (!uid || uid === meUid) return false;
        const data = row.data() || {};
        if (!data.typing) return false;
        const updatedMs = neuTimeToMs(data.updatedAt);
        if (updatedMs > 0 && now - updatedMs > NEU_CHAT_TYPING_STALE_MS) return false;
        return true;
      });
      neuChatState.peerTyping = hasTyping;
      neuSetTypingRowVisible(hasTyping);
    },
    () => {
      neuChatState.peerTyping = false;
      neuSetTypingRowVisible(false);
    },
  );
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
  return document.getElementById('neuChatBody');
}

function neuChatMessagesNode() {
  return document.getElementById('neuChatMessages');
}

function neuChatSearchInputNode() {
  const node = document.getElementById('pulseChatSearchInput');
  return node instanceof HTMLInputElement ? node : null;
}

function neuChatInputNode() {
  const node = document.getElementById('neuChatInput');
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node : null;
}

function neuChatSendButtonNode() {
  return document.getElementById('neuChatSendBtn');
}

function neuChatComposerNode() {
  const node = document.getElementById('neuChatForm');
  return node instanceof HTMLElement ? node : null;
}

function neuChatAttachButtonNode() {
  const node = document.getElementById('neuChatAttachBtn');
  return node instanceof HTMLButtonElement ? node : null;
}

function neuChatFileInputNode() {
  const node = document.getElementById('neuChatFileInput');
  return node instanceof HTMLInputElement ? node : null;
}

function neuChatAttachmentPreviewNode() {
  const node = document.getElementById('neuChatAttachmentPreview');
  return node instanceof HTMLElement ? node : null;
}

function neuChatAttachmentPreviewImgNode() {
  const node = document.getElementById('neuChatAttachmentPreviewImg');
  return node instanceof HTMLImageElement ? node : null;
}

function neuChatAttachmentPreviewNameNode() {
  const node = document.getElementById('neuChatAttachmentPreviewName');
  return node instanceof HTMLElement ? node : null;
}

function neuChatReplyPreviewNode() {
  const node = document.getElementById('neuChatReplyPreview');
  return node instanceof HTMLElement ? node : null;
}

function neuChatReplyPreviewTextNode() {
  const node = document.getElementById('neuChatReplyPreviewText');
  return node instanceof HTMLElement ? node : null;
}

function neuChatLongPressMenuNode() {
  const node = document.getElementById('neuChatLongPressMenu');
  return node instanceof HTMLElement ? node : null;
}

function neuChatImageLightboxNode() {
  const node = document.getElementById('neuChatImageLightbox');
  return node instanceof HTMLElement ? node : null;
}

function neuChatImageLightboxImgNode() {
  const node = document.getElementById('neuChatLightboxImg');
  return node instanceof HTMLImageElement ? node : null;
}

function neuUpdateChatComposerOffsetVar() {
  const composer = neuChatComposerNode();
  const height = composer instanceof HTMLElement ? composer.offsetHeight : 72;
  const safe = Math.max(0, Math.round(Number(height) || 72));
  document.documentElement.style.setProperty('--neuChatComposerH', `${safe}px`);
}

function neuChatInputValue() {
  const input = neuChatInputNode();
  return String(input?.value || '');
}

function neuChatHasTypedText() {
  return neuChatInputValue().trim().length > 0;
}

function neuChatHasAttachment() {
  return neuChatState.pendingImageFile instanceof File;
}

function neuChatFindMessageById(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId || !Array.isArray(neuChatState.messages)) return null;
  return (
    neuChatState.messages.find((row) => String(row?.id || '').trim() === msgId) || null
  );
}

function neuChatBuildReplySnippet(message) {
  const imageUrl = String(message?.imageUrl || '').trim();
  if (imageUrl) return '📷 Photo';
  const raw = String(message?.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  return raw.slice(0, NEU_CHAT_REPLY_SNIPPET_MAX);
}

function neuChatNormalizeReplyPayload(rawReply) {
  if (!rawReply || typeof rawReply !== 'object') return null;
  const messageId = String(rawReply.messageId || '').trim();
  if (!messageId) return null;
  const senderUid = String(rawReply.senderUid || '').trim();
  const snippet = String(rawReply.snippet || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NEU_CHAT_REPLY_SNIPPET_MAX);
  return {
    messageId,
    senderUid,
    snippet,
    createdAt: rawReply.createdAt || null,
  };
}

function neuSetChatReplyDraft(rawReply) {
  neuChatState.replyDraft = neuChatNormalizeReplyPayload(rawReply);
  neuRenderChatReplyPreview();
}

function neuClearChatReplyDraft() {
  neuSetChatReplyDraft(null);
}

function neuRenderChatReplyPreview() {
  const wrap = neuChatReplyPreviewNode();
  const text = neuChatReplyPreviewTextNode();
  const reply = neuChatNormalizeReplyPayload(neuChatState.replyDraft);
  const hasReply = !!reply;
  if (wrap instanceof HTMLElement) wrap.classList.toggle('hidden', !hasReply);
  if (text instanceof HTMLElement) {
    const snippet = hasReply ? String(reply.snippet || '').trim() || '...' : '';
    text.textContent = hasReply ? `Odpowiadasz: ${snippet}` : '';
  }
  neuUpdateChatComposerOffsetVar();
}

function neuStartChatReplyDraft(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const message = neuChatFindMessageById(msgId);
  if (!message) return;
  const snippet = neuChatBuildReplySnippet(message) || '...';
  neuSetChatReplyDraft({
    messageId: msgId,
    senderUid: String(message.senderUid || '').trim(),
    snippet,
    createdAt: message.createdAt || null,
  });
  const input = neuChatInputNode();
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    input.focus({ preventScroll: true });
  }
}

function neuSetChatLongPressMenuOpen(messageId = '', clientX = 0, clientY = 0) {
  const menu = neuChatLongPressMenuNode();
  if (!(menu instanceof HTMLElement)) return;
  const msgId = String(messageId || '').trim();
  if (!msgId) {
    menu.classList.add('hidden');
    menu.dataset.neuChatReplyMessage = '';
    menu.style.left = '';
    menu.style.top = '';
    neuChatState.longPressMenuMessageId = '';
    return;
  }

  menu.classList.remove('hidden');
  const width = Math.max(130, Math.round(menu.offsetWidth || 130));
  const height = Math.max(44, Math.round(menu.offsetHeight || 44));
  const safe = 8;
  const nextX = Math.max(safe, Math.min(window.innerWidth - width - safe, Number(clientX) || safe));
  const nextY = Math.max(safe, Math.min(window.innerHeight - height - safe, Number(clientY) || safe));
  menu.style.left = `${Math.round(nextX)}px`;
  menu.style.top = `${Math.round(nextY)}px`;
  menu.dataset.neuChatReplyMessage = msgId;
  neuChatState.longPressMenuMessageId = msgId;
}

function neuClearChatReplyLongPressTimer() {
  if (neuChatState.longPressReplyTimer) {
    window.clearTimeout(neuChatState.longPressReplyTimer);
    neuChatState.longPressReplyTimer = 0;
  }
  neuChatState.longPressReplyMsgId = '';
}

function neuScheduleChatReplyLongPress(messageId, clientX = 0, clientY = 0) {
  const msgId = String(messageId || '').trim();
  neuClearChatReplyLongPressTimer();
  if (!msgId) return;
  neuChatState.longPressReplyMsgId = msgId;
  neuChatState.longPressReplyX = Number(clientX) || 0;
  neuChatState.longPressReplyY = Number(clientY) || 0;
  neuChatState.longPressReplyTimer = window.setTimeout(() => {
    neuChatState.longPressReplyTimer = 0;
    neuSetChatLongPressMenuOpen(msgId, neuChatState.longPressReplyX, neuChatState.longPressReplyY);
  }, NEU_CHAT_REPLY_LONG_PRESS_MS);
}

function neuJumpToChatMessage(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return false;
  const root = neuChatMessagesNode();
  if (!(root instanceof HTMLElement)) return false;
  root.querySelectorAll('.neuMessageItem.is-reply-target').forEach((node) => {
    if (node instanceof HTMLElement) node.classList.remove('is-reply-target');
  });
  const selector = neuReactionMessageSelector(msgId);
  if (!selector) return false;
  const target = root.querySelector(`.neuMessageItem[data-neu-msg-id="${selector}"]`);
  if (!(target instanceof HTMLElement)) return false;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('is-reply-target');
  if (neuChatState.replyHighlightTimer) {
    window.clearTimeout(neuChatState.replyHighlightTimer);
  }
  neuChatState.replyHighlightTimer = window.setTimeout(() => {
    target.classList.remove('is-reply-target');
    neuChatState.replyHighlightTimer = 0;
  }, NEU_CHAT_REPLY_HIGHLIGHT_MS);
  return true;
}

function neuSafeChatUploadName(file) {
  const raw = String(file?.name || '').trim();
  const fallback = String(file?.type || '').toLowerCase().includes('png') ? 'image.png' : 'image.jpg';
  const base = raw || fallback;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) || fallback;
}

function neuRenderChatAttachmentPreview() {
  const wrap = neuChatAttachmentPreviewNode();
  const image = neuChatAttachmentPreviewImgNode();
  const name = neuChatAttachmentPreviewNameNode();
  const hasAttachment = neuChatHasAttachment() && !!neuChatState.pendingImagePreviewUrl;
  if (wrap instanceof HTMLElement) wrap.classList.toggle('hidden', !hasAttachment);
  if (image instanceof HTMLImageElement) {
    if (hasAttachment) image.src = neuChatState.pendingImagePreviewUrl;
    else image.removeAttribute('src');
  }
  if (name instanceof HTMLElement) {
    name.textContent = hasAttachment ? String(neuChatState.pendingImageFile?.name || 'imagen') : '';
  }
  neuUpdateChatComposerOffsetVar();
}

function neuClearChatAttachment() {
  const fileInput = neuChatFileInputNode();
  if (fileInput instanceof HTMLInputElement) fileInput.value = '';
  if (neuChatState.pendingImagePreviewUrl && neuChatState.pendingImagePreviewUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(neuChatState.pendingImagePreviewUrl);
    } catch {
      // noop
    }
  }
  neuChatState.pendingImageFile = null;
  neuChatState.pendingImagePreviewUrl = '';
  neuChatSetUploadRetryContext(null);
  neuRenderChatAttachmentPreview();
  neuSyncChatComposerState();
}

function neuChatSetAttachmentFromFile(file) {
  const row = file instanceof File ? file : null;
  if (!row) {
    neuClearChatAttachment();
    return;
  }
  const size = Number(row.size || 0);
  if (!String(row.type || '').toLowerCase().startsWith('image/')) {
    neuChatSetHint('Solo imagenes.', true);
    neuClearChatAttachment();
    return;
  }
  if (size > NEU_CHAT_UPLOAD_MAX_BYTES) {
    neuChatSetHint('Max 5MB.', true);
    neuClearChatAttachment();
    return;
  }

  if (neuChatState.pendingImagePreviewUrl && neuChatState.pendingImagePreviewUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(neuChatState.pendingImagePreviewUrl);
    } catch {
      // noop
    }
  }
  neuChatState.pendingImageFile = row;
  neuChatState.pendingImagePreviewUrl = URL.createObjectURL(row);
  neuChatSetUploadRetryContext(null);
  neuChatSetHint('');
  neuRenderChatAttachmentPreview();
  neuSyncChatComposerState();
}

function neuSetChatImageLightboxOpen(imageUrl) {
  const modal = neuChatImageLightboxNode();
  const image = neuChatImageLightboxImgNode();
  if (!(modal instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;
  const url = String(imageUrl || '').trim();
  if (!url) {
    modal.hidden = true;
    image.removeAttribute('src');
    neuChatRecomputeModalLock();
    return;
  }
  image.src = url;
  modal.hidden = false;
  neuChatRecomputeModalLock();
}

function neuChatAutoGrow(el) {
  if (!(el instanceof HTMLTextAreaElement)) return;
  el.style.height = 'auto';
  const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const max = line * 4 + 20;
  const next = Math.min(el.scrollHeight, max);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  neuUpdateChatComposerOffsetVar();
}

function neuChatAutoResizeInput() {
  const input = neuChatInputNode();
  neuChatAutoGrow(input);
}

function neuSyncChatComposerState() {
  const sendBtn = neuChatSendButtonNode();
  const attachBtn = neuChatAttachButtonNode();
  const fileInput = neuChatFileInputNode();
  const busy = neuChatState.sending || neuChatState.uploading;
  const disabled = busy || (!neuChatHasTypedText() && !neuChatHasAttachment());
  if (sendBtn instanceof HTMLButtonElement) {
    sendBtn.disabled = disabled;
    sendBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
  if (attachBtn instanceof HTMLButtonElement) attachBtn.disabled = busy;
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = busy;
}

function neuSetChatSending(on) {
  const active = on === true;
  neuChatState.sending = active;
  const input = neuChatInputNode();
  const sendBtn = neuChatSendButtonNode();
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.disabled = active;
  if (sendBtn instanceof HTMLButtonElement) {
    sendBtn.textContent = active || neuChatState.uploading ? '...' : '>';
    sendBtn.setAttribute('aria-label', 'Enviar');
    sendBtn.title = 'Enviar';
  }
  neuSyncChatComposerState();
}

function neuSetChatUploading(on) {
  const active = on === true;
  neuChatState.uploading = active;
  const sendBtn = neuChatSendButtonNode();
  if (sendBtn instanceof HTMLButtonElement) {
    sendBtn.textContent = neuChatState.sending || active ? '...' : '>';
    sendBtn.setAttribute('aria-label', 'Enviar');
    sendBtn.title = 'Enviar';
  }
  neuSyncChatComposerState();
}

function neuChatIsNearBottom(threshold = NEU_CHAT_SCROLL_NEAR_BOTTOM) {
  const el = neuChatBodyNode();
  if (!(el instanceof HTMLElement)) return true;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  neuChatState.nearBottom = nearBottom;
  return nearBottom;
}

function neuChatScrollBottom(behavior = 'auto') {
  const body = neuChatBodyNode();
  if (!(body instanceof HTMLElement)) return;
  if (behavior === 'smooth' && typeof body.scrollTo === 'function') {
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    return;
  }
  body.scrollTop = body.scrollHeight;
  neuChatState.nearBottom = true;
}

function neuChatHandleBodyScrollThrottled() {
  if (neuChatState.bodyScrollRaf) return;
  neuChatState.bodyScrollRaf = window.requestAnimationFrame(() => {
    neuChatState.bodyScrollRaf = 0;
    if (neuChatIsNearBottom(NEU_CHAT_SCROLL_NEAR_BOTTOM)) {
      neuSetNewMessagesChipVisible(false);
    }
  });
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
    lastMessagePreview: String(data.lastMessageText || '').trim(),
    lastMessageAt: data.lastMessageAt || data.updatedAt || null,
    updatedAt: data.updatedAt || data.lastMessageAt || null,
    unreadCount: neuUnreadValue(data.unreadCount),
    lastReadAt: data.lastReadAt || null,
    lastSenderUid: String(data.lastSenderUid || '').trim(),
    peerLastReadAt: data.peerLastReadAt || data.lastReadAtPeer || null,
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

function neuEscapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function neuChatSearchNeedle(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function neuChatRowMatchesSearch(row, queryNeedle) {
  const needle = neuChatSearchNeedle(queryNeedle);
  if (!needle) return true;
  const profile = neuChatProfileCached(row?.otherUid);
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, row?.otherUid);
  const lastMessagePreview = String(row?.lastMessagePreview || row?.lastMessageText || '').trim();
  const haystack = `${displayName} ${handle} ${lastMessagePreview}`.toLowerCase();
  return haystack.includes(needle);
}

function neuChatHighlightName(displayName, rawQuery) {
  const source = String(displayName || '');
  const queryValue = String(rawQuery || '').trim();
  if (!source) return '';
  if (!queryValue) return esc(source);

  let html = '';
  let cursor = 0;
  const regex = new RegExp(neuEscapeRegex(queryValue), 'ig');
  let match = regex.exec(source);
  while (match) {
    const hit = String(match[0] || '');
    const start = Number(match.index || 0);
    const end = start + hit.length;
    html += esc(source.slice(cursor, start));
    html += `<span class="neuSearchHit">${esc(hit)}</span>`;
    cursor = end;
    if (!hit.length) break;
    match = regex.exec(source);
  }
  html += esc(source.slice(cursor));
  return html;
}

function neuChatFilteredRows(rows, rawQuery) {
  const list = Array.isArray(rows) ? rows : [];
  const needle = neuChatSearchNeedle(rawQuery);
  if (!needle) return list;
  return list.filter((row) => neuChatRowMatchesSearch(row, needle));
}

function neuApplyChatSearchQuery(rawValue) {
  if (neuChatState.chatSearchDebounceTimer) {
    window.clearTimeout(neuChatState.chatSearchDebounceTimer);
    neuChatState.chatSearchDebounceTimer = 0;
  }
  const next = String(rawValue || '').trim();
  if (next === neuChatState.chatSearchQuery) return;
  neuChatState.chatSearchQuery = next;
  neuRenderChatList();
}

function neuQueueChatSearch(rawValue) {
  if (neuChatState.chatSearchDebounceTimer) {
    window.clearTimeout(neuChatState.chatSearchDebounceTimer);
    neuChatState.chatSearchDebounceTimer = 0;
  }
  const next = String(rawValue || '');
  neuChatState.chatSearchDebounceTimer = window.setTimeout(() => {
    neuChatState.chatSearchDebounceTimer = 0;
    neuApplyChatSearchQuery(next);
  }, NEU_CHAT_SEARCH_DEBOUNCE_MS);
}

function neuWireChatSearchInput() {
  if (neuChatState.chatSearchWired) return;
  const input = neuChatSearchInputNode();
  if (!(input instanceof HTMLInputElement)) return;
  neuChatState.chatSearchWired = true;
  input.addEventListener('input', () => {
    neuQueueChatSearch(input.value);
  });
}

function neuRenderChatList() {
  const root = document.getElementById('pulseConversations');
  if (!(root instanceof HTMLElement)) return;

  const allRows = Array.isArray(neuChatState.listRows) ? neuChatState.listRows : [];
  const searchQuery = String(neuChatState.chatSearchQuery || '').trim();
  const rows = neuChatFilteredRows(allRows, searchQuery);
  if (!rows.length) {
    const isSearching = !!searchQuery;
    const title = isSearching ? 'Sin resultados.' : 'Sin conversaciones.';
    const sub = isSearching
      ? 'Prueba otro texto o borra el filtro.'
      : 'Abre un perfil y pulsa "Mensaje" para iniciar chat.';
    root.dataset.neuChatRendering = '1';
    root.innerHTML = `
      <div class="empty-state neu-chat-empty-state" data-neu-chat-root="1">
        <p class="neu-chat-empty-title">${esc(title)}</p>
        <p class="neu-chat-empty-sub">${esc(sub)}</p>
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
      const titleHtml = neuChatHighlightName(displayName, searchQuery);
      const avatarUrl = String(profile.avatarUrl || '').trim();
      const lastText = row.lastMessagePreview || row.lastMessageText || 'Sin mensajes todavia';
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
            <span class="neu-chat-title">${titleHtml} <small>${esc(handle)}</small></span>
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
  const messagesRoot = neuChatMessagesNode();
  if (!(body instanceof HTMLElement) || !(messagesRoot instanceof HTMLElement)) return;
  const meUid = neuCurrentUid();
  const prevLastRenderedMsgId = String(neuChatState.lastRenderedMsgId || '');
  const list = Array.isArray(neuChatState.messages) ? neuChatState.messages : [];
  if (!list.length) {
    messagesRoot.innerHTML = '<div class="neu-chat-empty">Aun no hay mensajes.</div>';
    neuChatState.lastRenderedMsgId = '';
    neuSetChatLongPressMenuOpen('');
    neuSetTypingRowVisible(neuChatState.peerTyping);
    neuSetNewMessagesChipVisible(false);
    neuSyncReactionListeners();
    return;
  }

  const peerProfile = neuChatProfileCached(neuChatState.peerUid);
  const peerDisplayName = String(peerProfile.displayName || '').trim() || 'Usuario';
  const peerAvatarUrl = String(peerProfile.avatarUrl || '').trim();
  const incomingAvatar = peerAvatarUrl
    ? `<img class="neuMsgAvatar" loading="lazy" src="${esc(peerAvatarUrl)}" alt="avatar" />`
    : `<div class="neuMsgAvatar neuMsgAvatarPlaceholder">${esc(neuAvatarLetter(peerDisplayName))}</div>`;

  const grouped = neuChatBuildGroups(list);
  const delivery = neuChatDeliveryStatus(list, meUid);
  const newestMessageId = String(list[list.length - 1]?.id || '').trim();
  const myLastReadMs = neuTimeToMs(neuChatState.myLastReadAt);
  const firstUnreadIndex =
    myLastReadMs > 0 ? list.findIndex((item) => neuTimeToMs(item?.createdAt) > myLastReadMs) : -1;
  let renderMessageIndex = 0;

  const rowsHtml = grouped
    .map((group) => {
      const mine = String(group.senderUid || '').trim() === meUid;
      const rowClass = mine ? 'neuMessageRow outgoing' : 'neuMessageRow incoming';
      const bubblesHtml = (group.messages || [])
        .map((item, index, arr) => {
          const text = esc(String(item.text || '').trim()).replace(/\n/g, '<br />');
          const imageUrl = String(item.imageUrl || '').trim();
          const replyTo = neuChatNormalizeReplyPayload(item?.replyTo);
          const firstClass = index === 0 ? ' is-group-first' : '';
          const lastClass = index === arr.length - 1 ? ' is-group-last' : '';
          const messageId = String(item?.id || '').trim();
          const mineReaction = neuReactionType(neuChatState.reactionMine.get(messageId));
          const reactionBar = neuReactionBarHtml(messageId);
          const pickerOptions = NEU_CHAT_REACTION_TYPES.map((type) => {
            const emoji = neuReactionEmoji(type);
            const activeClass = mineReaction === type ? ' is-active' : '';
            return `<button class="neuReactOption${activeClass}" type="button" data-neu-react-message="${esc(messageId)}" data-neu-react-type="${esc(type)}" aria-label="${esc(type)}">${esc(emoji)}</button>`;
          }).join('');
          const reactBtnLabel = mineReaction ? neuReactionEmoji(mineReaction) : '🙂';
          const reactWrapClass = mine ? ' is-outgoing' : ' is-incoming';
          const unreadDividerHtml =
            renderMessageIndex === firstUnreadIndex
              ? '<div class="neuUnreadDivider" data-neu-unread-divider="1">Nuevos mensajes</div>'
              : '';
          renderMessageIndex += 1;
          const imageHtml = imageUrl
            ? `
              <button class="neuChatImageBtn" type="button" data-neu-chat-image="${esc(imageUrl)}" aria-label="Abrir imagen">
                <img class="neuChatImagePreview" loading="lazy" src="${esc(imageUrl)}" alt="chat image" />
              </button>
            `
            : '';
          const textHtml = text ? `<div class="neuMessageText">${text}</div>` : '';
          const contentHtml = imageHtml || textHtml ? `${imageHtml}${textHtml}` : '-';
          const replySnippet = replyTo ? String(replyTo.snippet || '').trim() || '...' : '';
          const quoteHtml = replyTo
            ? `
              <button class="neuReplyQuote" type="button" data-neu-reply-jump="${esc(replyTo.messageId)}" aria-label="Ir al mensaje citado">
                <span class="neuReplyQuoteSnippet">${esc(replySnippet)}</span>
              </button>
            `
            : '';
          return `
            <div class="neuMessageItem${mine ? ' is-outgoing' : ' is-incoming'}" data-neu-msg-id="${esc(messageId)}">
              <button class="neuReplyBtn" type="button" data-neu-reply-message="${esc(messageId)}" aria-label="Reply">
                &#x21A9; Reply
              </button>
              <div class="neuReactWrap${reactWrapClass}" data-neu-react-wrap="${esc(messageId)}">
                <button class="neuReactBtn${mineReaction ? ' is-active' : ''}" type="button" data-neu-react-toggle="${esc(messageId)}" aria-label="Reaccionar">
                  ${esc(reactBtnLabel)}
                </button>
                <div class="neuReactPicker${reactWrapClass}" data-neu-react-picker="${esc(messageId)}">
                  ${pickerOptions}
                </div>
              </div>
              ${unreadDividerHtml}
              ${quoteHtml}
              <div class="neuMessageBubble${firstClass}${lastClass}${imageUrl ? ' has-image' : ''}" data-msg-id="${esc(messageId)}">${contentHtml}</div>
              <div class="neuReactBar${reactionBar ? '' : ' hidden'}" data-neu-react-bar="${esc(messageId)}">${reactionBar}</div>
            </div>
          `;
        })
        .join('');
      const meta = neuChatFormatClock(group.lastCreatedAt || group.firstCreatedAt);
      const metaHtml = `<div class="neuMsgMeta">${esc(meta)}</div>`;
      const statusHtml =
        mine && delivery && String(delivery.messageId || '') === String(group.lastMessageId || '')
          ? `<div class="neuMsgStatus">${esc(delivery.label)}</div>`
          : '';
      const avatarHtml = mine ? '' : `<div class="neuAvatarGutter">${incomingAvatar}</div>`;

      return `
        <div class="${rowClass}">
          ${avatarHtml}
          <div class="neuMessagePack">
            ${bubblesHtml}
            ${metaHtml}
            ${statusHtml}
          </div>
        </div>
      `;
    })
    .join('');

  messagesRoot.innerHTML = rowsHtml;
  neuSetChatLongPressMenuOpen('');
  if (newestMessageId && newestMessageId !== prevLastRenderedMsgId) {
    const escapedMessageId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(newestMessageId)
        : newestMessageId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const newestBubble = messagesRoot.querySelector(`.neuMessageBubble[data-msg-id="${escapedMessageId}"]`);
    if (newestBubble instanceof HTMLElement) newestBubble.classList.add('neuMsgEnter');
  }
  neuChatState.lastRenderedMsgId = newestMessageId;
  neuSetTypingRowVisible(neuChatState.peerTyping);
  neuSetNewMessagesChipVisible(neuChatState.newMessageChipVisible);
  neuSyncReactionListeners();
  neuPatchAllReactionUi();
}

function neuCloseChatModal() {
  neuChatStopTypingAndTimers({ bestEffort: true });
  neuStopTypingListener();
  neuStopReactionListeners();
  neuClearChatReplyLongPressTimer();
  neuSetChatLongPressMenuOpen('');
  neuClearChatAttachment();
  neuClearChatReplyDraft();
  neuSetChatImageLightboxOpen('');
  if (neuChatState.currentConversationId) {
    neuChatState.lastConversationId = neuChatState.currentConversationId;
    neuChatState.lastPeerUid = neuChatState.peerUid;
  }
  neuSetChatSending(false);
  neuSetChatModalOpen(false);
  neuChatSetHint('');
  neuStopChatMessageListener();
  neuChatState.currentConversationId = '';
  neuChatState.currentMembers = [];
  neuChatState.currentMemberKey = '';
  neuChatState.peerUid = '';
  neuChatState.messages = [];
  neuChatState.newMessageChipVisible = false;
  neuChatState.peerTyping = false;
  neuChatState.myLastReadAt = null;
  neuChatState.peerLastReadAt = null;
  neuChatState.lastRenderedMsgId = '';
  neuChatState.typingConversationId = '';
  neuChatState.typingActive = false;
  if (neuChatState.replyHighlightTimer) {
    window.clearTimeout(neuChatState.replyHighlightTimer);
    neuChatState.replyHighlightTimer = 0;
  }
  neuSetChatImageLightboxOpen('');
  if (neuChatState.bodyScrollRaf) {
    window.cancelAnimationFrame(neuChatState.bodyScrollRaf);
    neuChatState.bodyScrollRaf = 0;
  }
  neuSetNewMessagesChipVisible(false);
  neuSetTypingRowVisible(false);
  neuSyncChatComposerState();
}

function neuStopChatListListener() {
  if (typeof neuChatState.listUnsub === 'function') {
    neuChatState.listUnsub();
  }
  neuChatState.listUnsub = null;
  neuChatState.listUid = '';
  neuChatState.totalUnread = 0;
  neuRenderBottomUnreadBadge();
  neuRenderFloatUnreadBadge();
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
      const activeConvId = String(neuChatState.currentConversationId || '').trim();
      if (activeConvId) {
        const activeRow = neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === activeConvId) || null;
        neuChatState.myLastReadAt = activeRow?.lastReadAt || null;
        neuChatState.peerLastReadAt = activeRow?.peerLastReadAt || null;
        const modal = neuChatModalNode();
        if (modal instanceof HTMLElement && !modal.hidden) {
          neuRenderChatMessages();
        }
      }
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
      const bodyEl = neuChatBodyNode();
      const messagesEl = neuChatMessagesNode();
      const prevScrollHeight = messagesEl instanceof HTMLElement ? messagesEl.scrollHeight : 0;
      const wasNearBottom = neuChatIsNearBottom(NEU_CHAT_SCROLL_NEAR_BOTTOM);
      const incomingAdded = snap.docChanges().some((change) => {
        if (change.type !== 'added') return false;
        const senderUid = String(change.doc.data()?.senderUid || '').trim();
        return !!senderUid && senderUid !== meUid;
      });
      if (firstSnapshot || wasNearBottom) neuSetNewMessagesChipVisible(false);
      else if (incomingAdded) neuSetNewMessagesChipVisible(true);

      neuChatState.messages = snap.docs
        .map((row) => ({ id: row.id, ...(row.data() || {}) }))
        .reverse();
      neuRenderChatMessages();
      const unreadDivider = messagesEl instanceof HTMLElement ? messagesEl.querySelector('[data-neu-unread-divider="1"]') : null;
      if (unreadDivider instanceof HTMLElement) {
        window.setTimeout(() => {
          unreadDivider.scrollIntoView({ block: 'center' });
        }, 0);
      } else if (wasNearBottom) {
        window.setTimeout(() => neuChatScrollBottom('smooth'), 0);
      } else if (bodyEl instanceof HTMLElement && messagesEl instanceof HTMLElement) {
        const nextScrollHeight = messagesEl.scrollHeight;
        const delta = nextScrollHeight - prevScrollHeight;
        if (delta !== 0) bodyEl.scrollTop += delta;
      }

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

  if (String(neuChatState.currentConversationId || '').trim() && String(neuChatState.currentConversationId || '').trim() !== convId) {
    neuChatStopTypingAndTimers({ bestEffort: true });
  }
  neuStopTypingListener();
  neuStopReactionListeners();
  neuClearChatReplyLongPressTimer();
  neuSetChatLongPressMenuOpen('');
  neuClearChatAttachment();
  neuClearChatReplyDraft();

  const peerUid = String(seed.otherUid || members.find((uid) => uid !== meUid) || '').trim();
  const memberKey = String(data.memberKey || seed.memberKey || neuChatMemberKey(members[0], members[1])).trim();
  const peerReadFromConversation =
    (peerUid && data?.lastReadAtBy && typeof data.lastReadAtBy === 'object' ? data.lastReadAtBy[peerUid] : null) ||
    data?.peerLastReadAt ||
    data?.lastReadAtPeer ||
    null;
  const myReadFromList = Array.isArray(neuChatState.listRows)
    ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.lastReadAt || null
    : null;

  neuChatState.lastConversationId = convId;
  neuChatState.lastPeerUid = peerUid;
  neuChatState.currentConversationId = convId;
  neuChatState.currentMembers = members;
  neuChatState.currentMemberKey = memberKey;
  neuChatState.peerUid = peerUid;
  neuChatState.messages = [];
  neuChatState.newMessageChipVisible = false;
  neuChatState.peerTyping = false;
  neuChatState.myLastReadAt = myReadFromList;
  neuChatState.peerLastReadAt = peerReadFromConversation || null;
  neuChatState.nearBottom = true;
  neuChatState.lastRenderedMsgId = '';
  neuChatState.typingConversationId = convId;
  neuChatState.typingActive = false;
  neuChatSetHint('');
  neuRenderChatHeader();
  neuRenderChatMessages();
  neuSetNewMessagesChipVisible(false);
  neuSetTypingRowVisible(false);
  neuSetChatModalOpen(true);
  if (peerUid) await neuEnsureChatProfile(peerUid);
  neuRenderChatHeader();
  neuStartChatMessagesListener(convId, members);
  neuStartTypingListener(convId, members);
  window.setTimeout(() => {
    const messagesRoot = neuChatMessagesNode();
    const unreadDivider = messagesRoot instanceof HTMLElement ? messagesRoot.querySelector('[data-neu-unread-divider="1"]') : null;
    if (unreadDivider instanceof HTMLElement) {
      unreadDivider.scrollIntoView({ block: 'center' });
    } else {
      neuChatScrollBottom('auto');
    }
    neuSyncChatComposerState();
    neuChatAutoResizeInput();
    const input = neuChatInputNode();
    if (input instanceof HTMLTextAreaElement) {
      neuChatAutoGrow(input);
      input.focus({ preventScroll: true });
    } else if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
    }
    neuUpdateChatComposerOffsetVar();
  }, 40);
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

async function neuOpenChatWithUser(otherUid) {
  const meUid = neuCurrentUid();
  const targetUid = String(otherUid || '').trim();
  if (!meUid) return;
  if (!targetUid || targetUid === meUid) {
    routeBottomNav(NEU_BOTTOM_KEYS.PULSE);
    return;
  }
  await neuOpenOrStartDirectChat(targetUid);
  const modal = neuChatModalNode();
  if (modal instanceof HTMLElement && modal.hidden) {
    neuSetChatModalOpen(true);
  }
}

async function neuSendChatMessage(options = {}) {
  const retryUpload = options && typeof options === 'object' ? options.retryUpload === true : false;
  const meUid = neuCurrentUid();
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const textInput = neuChatInputNode();
  const attachmentFile = neuChatState.pendingImageFile instanceof File ? neuChatState.pendingImageFile : null;
  const attachmentFingerprint = neuChatFileFingerprint(attachmentFile);
  const rawText = String(
    textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement ? textInput.value : '',
  );
  const safeText = rawText.trim().slice(0, 1000);
  const replyTo = neuChatNormalizeReplyPayload(neuChatState.replyDraft);
  if (!meUid || !conversationId || (!safeText && !attachmentFile)) {
    neuSyncChatComposerState();
    return;
  }
  if (neuChatState.sending || neuChatState.uploading) return;

  const members = Array.isArray(neuChatState.currentMembers)
    ? neuChatState.currentMembers.map((uid) => String(uid || '').trim()).filter(Boolean)
    : [];
  if (!members.includes(meUid)) {
    neuChatSetHint('Sin acceso a esta conversacion.', true);
    return;
  }

  const memberKey = String(neuChatState.currentMemberKey || neuChatMemberKey(members[0], members[1])).trim();
  const now = serverTimestamp();
  let messageRef = null;

  neuSetChatSending(true);
  neuSetChatUploading(!!attachmentFile);
  neuChatSetHint('');
  try {
    let imageUrl = '';
    let imageStoragePath = '';
    if (attachmentFile) {
      if (!(attachmentFile instanceof File)) return;
      const isImage = String(attachmentFile.type || '').toLowerCase().startsWith('image/');
      if (!isImage) {
        neuChatSetHint('Solo imagenes.', true);
        return;
      }
      if (Number(attachmentFile.size || 0) > NEU_CHAT_UPLOAD_MAX_BYTES) {
        neuChatSetHint('Max 5MB.', true);
        return;
      }

      const canRetryUpload = retryUpload && neuChatCanRetryUpload(conversationId, attachmentFile);
      const retryMessageId = canRetryUpload ? String(neuChatState.uploadRetryContext?.messageId || '').trim() : '';
      const nextMessageId = retryMessageId || doc(collection(db, 'neuConversations', conversationId, 'messages')).id;
      messageRef = doc(db, 'neuConversations', conversationId, 'messages', nextMessageId);

      const safeFileName = neuSafeChatUploadName(attachmentFile);
      imageStoragePath = `${NEU_CHAT_UPLOAD_PREFIX}${conversationId}/${messageRef.id}/${safeFileName}`;
      neuChatSetUploadRetryContext({
        conversationId,
        messageId: messageRef.id,
        fileFingerprint: attachmentFingerprint,
      });
      const uploadRef = storageRef(neuChatStorageInstance(), imageStoragePath);
      try {
        await uploadBytes(uploadRef, attachmentFile, {
          contentType: String(attachmentFile.type || 'image/jpeg').trim() || 'image/jpeg',
        });
        imageUrl = await getDownloadURL(uploadRef);
      } catch (uploadError) {
        neuChatLogUploadFail(uploadError, conversationId);
        neuChatSetHint(neuChatUploadErrorMessage(uploadError), true, { retryUpload: true });
        return;
      }
    } else {
      neuChatSetUploadRetryContext(null);
    }

    if (!messageRef) {
      messageRef = doc(collection(db, 'neuConversations', conversationId, 'messages'));
    }

    const previewText = safeText || (imageUrl ? '📷 Foto' : '');
    const batch = writeBatch(db);
    const conversationRef = doc(db, 'neuConversations', conversationId);
    batch.set(messageRef, {
      senderUid: meUid,
      text: safeText,
      ...(imageUrl ? { imageUrl, imageStoragePath } : {}),
      ...(replyTo ? { replyTo } : {}),
      createdAt: now,
    });
    batch.set(
      conversationRef,
      {
        members,
        memberKey,
        lastMessageText: previewText,
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
          lastMessageText: previewText,
          lastMessageAt: now,
          unreadCount: isSender ? 0 : increment(1),
          ...(isSender ? { lastReadAt: now } : {}),
          updatedAt: now,
        },
        { merge: true },
      );
    });

    await batch.commit();
    neuChatStopTypingAndTimers();
    neuSetConversationUnreadLocal(conversationId, 0);
    if (textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement) {
      textInput.value = '';
      if (textInput instanceof HTMLTextAreaElement) {
        textInput.style.height = 'auto';
        textInput.style.overflowY = 'hidden';
        neuUpdateChatComposerOffsetVar();
      }
      textInput.focus({ preventScroll: true });
    }
    neuClearChatAttachment();
    neuClearChatReplyDraft();
    neuChatSetUploadRetryContext(null);
    neuChatSetHint('');
    neuChatAutoResizeInput();
    neuSyncChatComposerState();
    neuSetNewMessagesChipVisible(false);
    window.setTimeout(() => neuChatScrollBottom('auto'), 20);
  } catch (error) {
    neuChatLogUploadFail(error, conversationId);
    if (attachmentFile) {
      neuChatSetHint(neuChatUploadErrorMessage(error), true, { retryUpload: true });
    } else {
      const code = neuChatErrorCode(error) || 'unknown';
      neuChatSetHint(`No se pudo enviar el mensaje (${code}).`, true);
    }
  } finally {
    neuSetChatUploading(false);
    neuSetChatSending(false);
  }
}

function neuEnsureChatModalLayoutClass() {
  const card = document.querySelector('#neuChatModal .neu-chat-modal-card');
  if (card instanceof HTMLElement) card.classList.add('neuChatModalContent');
}

function neuChatReadFloatPosition() {
  try {
    const raw = localStorage.getItem(NEU_CHAT_FLOAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const side = String(parsed?.side || '').trim().toLowerCase();
    const top = Number(parsed?.top ?? parsed?.y);
    if ((side !== 'left' && side !== 'right') || !Number.isFinite(top)) return null;
    return { side, top };
  } catch {
    return null;
  }
}

function neuChatSaveFloatPosition(side, top) {
  try {
    localStorage.setItem(
      NEU_CHAT_FLOAT_STORAGE_KEY,
      JSON.stringify({
        side: side === 'left' ? 'left' : 'right',
        top: Math.round(Number(top) || 0),
      }),
    );
  } catch {
    // ignore storage errors
  }
}

function neuClampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function neuChatFloatMetrics(flag) {
  const margin = 16;
  const width = Math.max(56, Math.round(flag?.offsetWidth || 76));
  const height = Math.max(44, Math.round(flag?.offsetHeight || 56));
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return { margin, width, height, maxX, maxY };
}

function neuApplyFloatRawPosition(x, y) {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return;
  const metrics = neuChatFloatMetrics(flag);
  const nextX = neuClampNumber(x, metrics.margin, metrics.maxX);
  const nextY = neuClampNumber(y, metrics.margin, metrics.maxY);
  const side = nextX + metrics.width / 2 < window.innerWidth / 2 ? 'left' : 'right';

  flag.style.left = `${Math.round(nextX)}px`;
  flag.style.top = `${Math.round(nextY)}px`;
  flag.style.right = 'auto';
  flag.style.bottom = 'auto';
  flag.classList.toggle('is-left', side === 'left');
}

function neuApplyFloatSnapped(side = 'right', y = 96, persist = false) {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return;
  const metrics = neuChatFloatMetrics(flag);
  const resolvedSide = side === 'left' ? 'left' : 'right';
  const nextY = neuClampNumber(y, metrics.margin, metrics.maxY);
  const nextX = resolvedSide === 'left' ? metrics.margin : metrics.maxX;

  flag.style.left = `${Math.round(nextX)}px`;
  flag.style.top = `${Math.round(nextY)}px`;
  flag.style.right = 'auto';
  flag.style.bottom = 'auto';
  flag.classList.toggle('is-left', resolvedSide === 'left');

  if (persist) neuChatSaveFloatPosition(resolvedSide, nextY);
}

function neuDefaultFloatY() {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return 96;
  const metrics = neuChatFloatMetrics(flag);
  const fromBottom = window.innerHeight - metrics.height - 96;
  return neuClampNumber(fromBottom, metrics.margin, metrics.maxY);
}

function neuFloatStartDrag(clientX, clientY) {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return;
  const rect = flag.getBoundingClientRect();
  neuChatFloatState.dragging = true;
  neuChatFloatState.moved = false;
  neuChatFloatState.startX = clientX;
  neuChatFloatState.startY = clientY;
  neuChatFloatState.originX = rect.left;
  neuChatFloatState.originY = rect.top;
  flag.classList.add('is-dragging');
}

function neuFloatMoveDrag(clientX, clientY) {
  if (!neuChatFloatState.dragging) return;
  const dx = clientX - neuChatFloatState.startX;
  const dy = clientY - neuChatFloatState.startY;
  if (Math.abs(dx) + Math.abs(dy) > 6) {
    neuChatFloatState.moved = true;
  }
  neuApplyFloatRawPosition(neuChatFloatState.originX + dx, neuChatFloatState.originY + dy);
}

function neuFloatEndDrag() {
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return;
  if (!neuChatFloatState.dragging) return;

  neuChatFloatState.dragging = false;
  flag.classList.remove('is-dragging');

  const rect = flag.getBoundingClientRect();
  const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
  neuApplyFloatSnapped(side, rect.top, true);
  if (neuChatFloatState.moved) {
    neuChatFloatState.suppressClickUntil = Date.now() + 260;
  }
}

async function neuOpenChatFromFloatFlag() {
  const modal = neuChatModalNode();
  if (modal instanceof HTMLElement && !modal.hidden) {
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus({ preventScroll: true });
    }
    return;
  }

  const lastConversationId = String(neuChatState.lastConversationId || neuChatState.currentConversationId || '').trim();
  const lastPeerUid = String(neuChatState.lastPeerUid || neuChatState.peerUid || '').trim();
  if (lastConversationId) {
    try {
      await neuOpenConversation(lastConversationId, { otherUid: lastPeerUid });
      return;
    } catch {
      // fallback to list
    }
  }

  const first = Array.isArray(neuChatState.listRows) ? neuChatState.listRows[0] : null;
  const firstConversationId = String(first?.conversationId || '').trim();
  if (firstConversationId) {
    await neuOpenConversation(firstConversationId, { otherUid: String(first?.otherUid || '').trim() });
    return;
  }

  routeBottomNav(NEU_BOTTOM_KEYS.PULSE);
}

async function neuOpenLastChatOrList() {
  await neuOpenChatFromFloatFlag();
}

function neuInitChatFloatFlag() {
  if (neuChatState.floatWired) return;
  const flag = neuChatFloatNode();
  if (!(flag instanceof HTMLButtonElement)) return;
  neuChatState.floatWired = true;
  flag.classList.remove('hidden');

  const saved = neuChatReadFloatPosition();
  if (saved) {
    neuApplyFloatSnapped(saved.side, saved.top, false);
  } else {
    neuApplyFloatSnapped('right', neuDefaultFloatY(), false);
  }

  let moved = false;

  const readPoint = (event) => {
    const touchPoint = event?.touches?.[0] || event?.changedTouches?.[0];
    const point = touchPoint || event;
    const x = Number(point?.clientX);
    const y = Number(point?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  };

  const onStart = (event) => {
    const point = readPoint(event);
    if (!point) return;
    moved = false;
    neuFloatStartDrag(point.x, point.y);
    if (event.cancelable) event.preventDefault();
  };

  const onMove = (event) => {
    if (!neuChatFloatState.dragging) return;
    const point = readPoint(event);
    if (!point) return;

    const dx = point.x - neuChatFloatState.startX;
    const dy = point.y - neuChatFloatState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;

    neuFloatMoveDrag(point.x, point.y);
    if (event.cancelable) event.preventDefault();
  };

  const onEnd = () => {
    if (!neuChatFloatState.dragging) return;
    neuFloatEndDrag();
    if (moved) neuChatFloatState.suppressClickUntil = Date.now() + 220;
    window.setTimeout(() => {
      moved = false;
    }, 50);
  };

  flag.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    onStart(event);
  });
  flag.addEventListener('touchstart', onStart, { passive: false });

  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
  window.addEventListener('touchcancel', onEnd);
  window.addEventListener('blur', onEnd);

  flag.addEventListener('click', (event) => {
    if (moved || Date.now() < neuChatFloatState.suppressClickUntil) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    neuOpenLastChatOrList().catch((error) => {
      console.error('[neu-chat] float open failed', error);
      neuChatSetHint('No se pudo abrir el chat.', true);
    });
  });

  window.addEventListener(
    'resize',
    () => {
      const rect = flag.getBoundingClientRect();
      const side = flag.classList.contains('is-left') ? 'left' : 'right';
      neuApplyFloatSnapped(side, rect.top, true);
    },
    { passive: true },
  );
}

function neuWireChatEvents() {
  if (neuChatState.wired) return;
  neuChatState.wired = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const inLongPressMenu = !!target.closest('#neuChatLongPressMenu');
      if (!inLongPressMenu) neuSetChatLongPressMenuOpen('');

      const retryUploadBtn = target.closest('[data-neu-chat-retry-upload]');
      if (retryUploadBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        neuSendChatMessage({ retryUpload: true }).catch((error) => {
          neuChatLogUploadFail(error, neuChatState.currentConversationId);
          neuChatSetHint(neuChatUploadErrorMessage(error), true, { retryUpload: true });
        });
        return;
      }

      const imageBtn = target.closest('[data-neu-chat-image]');
      if (imageBtn instanceof HTMLElement) {
        const imageUrl = String(imageBtn.getAttribute('data-neu-chat-image') || '').trim();
        if (imageUrl) {
          event.preventDefault();
          event.stopPropagation();
          neuSetChatImageLightboxOpen(imageUrl);
        }
        return;
      }

      const closeImage = target.closest('[data-neu-chat-image-close], #neuChatImageCloseBtn');
      if (closeImage) {
        event.preventDefault();
        neuSetChatImageLightboxOpen('');
        return;
      }

      const jumpBtn = target.closest('[data-neu-reply-jump]');
      if (jumpBtn instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const messageId = String(jumpBtn.getAttribute('data-neu-reply-jump') || '').trim();
        if (!neuJumpToChatMessage(messageId)) {
          neuChatSetHint('No se encontro el mensaje original.', true);
        }
        return;
      }

      const replyBtn = target.closest('[data-neu-reply-message]');
      if (replyBtn instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const messageId = String(replyBtn.getAttribute('data-neu-reply-message') || '').trim();
        neuStartChatReplyDraft(messageId);
        return;
      }

      const mobileReplyBtn = target.closest('[data-neu-chat-longpress-reply]');
      if (mobileReplyBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const menu = neuChatLongPressMenuNode();
        const messageId = String(menu?.dataset?.neuChatReplyMessage || '').trim();
        if (messageId) neuStartChatReplyDraft(messageId);
        neuSetChatLongPressMenuOpen('');
        return;
      }

      const reactOption = target.closest('[data-neu-react-type]');
      if (reactOption instanceof HTMLButtonElement) {
        const messageId = String(reactOption.getAttribute('data-neu-react-message') || '').trim();
        const type = neuReactionType(reactOption.getAttribute('data-neu-react-type'));
        event.preventDefault();
        event.stopPropagation();
        neuToggleMessageReaction(messageId, type).catch((error) => {
          console.error('[neu-chat] react failed', error);
          neuChatSetHint('No se pudo guardar reaccion.', true);
        });
        neuHideReactionPickers();
        return;
      }

      const reactToggle = target.closest('[data-neu-react-toggle]');
      if (reactToggle instanceof HTMLButtonElement) {
        const messageId = String(reactToggle.getAttribute('data-neu-react-toggle') || '').trim();
        event.preventDefault();
        event.stopPropagation();
        neuToggleReactionPicker(messageId);
        return;
      }

      if (!target.closest('.neuReactPicker') && !target.closest('.neuReactBtn')) {
        neuHideReactionPickers();
      }

      const newChipBtn = target.closest('#neuNewMsgChip');
      if (newChipBtn) {
        event.preventDefault();
        neuSetNewMessagesChipVisible(false);
        neuChatScrollBottom('smooth');
        return;
      }

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
      if (messageProfileBtn instanceof HTMLButtonElement) {
        const chatUid = String(messageProfileBtn.getAttribute('data-chat-uid') || '').trim();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        neuOpenChatWithUser(chatUid).catch((error) => {
          console.error('[neu-chat] profile message start failed', error);
          neuChatSetHint('No se pudo iniciar el chat.', true);
        });
        return;
      }
    },
    true,
  );

  document.addEventListener(
    'mouseover',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const messageId = neuReactionWrapMessageId(target);
      if (!messageId) return;
      neuReactionClearHideTimer(messageId);
      neuReactionSetHover(messageId, true);
    },
    true,
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const messageId = neuReactionWrapMessageId(target);
      if (!messageId) return;
      const wrap = neuReactionWrapNode(messageId);
      if (!(wrap instanceof HTMLElement)) return;
      const related = event.relatedTarget;
      if (related instanceof Node && wrap.contains(related)) return;
      neuReactionScheduleHide(messageId, 180);
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

  const attachBtn = neuChatAttachButtonNode();
  const fileInput = neuChatFileInputNode();
  if (attachBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
    attachBtn.addEventListener('click', (event) => {
      event.preventDefault();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0] instanceof File ? fileInput.files[0] : null;
      if (!file) {
        neuClearChatAttachment();
        return;
      }
      neuChatSetAttachmentFromFile(file);
    });
  }

  document.getElementById('neuChatAttachmentClearBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    neuClearChatAttachment();
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus({ preventScroll: true });
    }
  });

  document.getElementById('neuChatReplyCancelBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    neuClearChatReplyDraft();
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus({ preventScroll: true });
    }
  });

  const chatInput = neuChatInputNode();
  if (chatInput instanceof HTMLInputElement || chatInput instanceof HTMLTextAreaElement) {
    chatInput.addEventListener('input', () => {
      neuChatAutoGrow(chatInput);
      neuSyncChatComposerState();
      neuChatHandleTypingInput(chatInput.value);
    });
    chatInput.addEventListener('blur', () => {
      neuChatStopTypingAndTimers({ bestEffort: true });
    });
  }

  if (chatInput instanceof HTMLTextAreaElement) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      neuSendChatMessage().catch((error) => {
        console.error('[neu-chat] send Enter handler failed', error);
        neuChatSetHint('No se pudo enviar.', true);
      });
    });
  }

  const chatBody = neuChatBodyNode();
  if (chatBody instanceof HTMLElement && !neuChatState.bodyScrollWired) {
    neuChatState.bodyScrollWired = true;
    chatBody.addEventListener(
      'scroll',
      () => {
        neuChatHandleBodyScrollThrottled();
      },
      { passive: true },
    );
    chatBody.addEventListener(
      'touchstart',
      (event) => {
        neuSetChatLongPressMenuOpen('');
        const target = event.target;
        if (!(target instanceof Element)) {
          neuClearChatReplyLongPressTimer();
          return;
        }
        const item = target.closest('.neuMessageItem');
        if (!(item instanceof HTMLElement)) {
          neuClearChatReplyLongPressTimer();
          return;
        }
        const messageId = String(item.getAttribute('data-neu-msg-id') || '').trim();
        if (!messageId) {
          neuClearChatReplyLongPressTimer();
          return;
        }
        const touch = event.touches?.[0];
        const clientX = Number(touch?.clientX || 0);
        const clientY = Number(touch?.clientY || 0);
        neuScheduleChatReplyLongPress(messageId, clientX + 4, clientY + 4);
      },
      { passive: true },
    );
    chatBody.addEventListener(
      'touchmove',
      (event) => {
        const touch = event.touches?.[0];
        if (!touch) {
          neuClearChatReplyLongPressTimer();
          return;
        }
        const dx = Math.abs(Number(touch.clientX || 0) - Number(neuChatState.longPressReplyX || 0));
        const dy = Math.abs(Number(touch.clientY || 0) - Number(neuChatState.longPressReplyY || 0));
        if (dx + dy > 12) neuClearChatReplyLongPressTimer();
      },
      { passive: true },
    );
    ['touchend', 'touchcancel'].forEach((eventName) => {
      chatBody.addEventListener(
        eventName,
        () => {
          neuClearChatReplyLongPressTimer();
        },
        { passive: true },
      );
    });
  }

  window.addEventListener(
    'resize',
    () => {
      neuUpdateChatComposerOffsetVar();
    },
    { passive: true },
  );

  window.addEventListener(
    'beforeunload',
    () => {
      neuChatStopTypingAndTimers({ bestEffort: true });
      neuClearChatAttachment();
      neuClearChatReplyLongPressTimer();
      neuSetChatLongPressMenuOpen('');
      if (neuChatState.chatSearchDebounceTimer) {
        window.clearTimeout(neuChatState.chatSearchDebounceTimer);
        neuChatState.chatSearchDebounceTimer = 0;
      }
    },
    { passive: true },
  );

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const longPressMenu = neuChatLongPressMenuNode();
    if (longPressMenu instanceof HTMLElement && !longPressMenu.classList.contains('hidden')) {
      neuSetChatLongPressMenuOpen('');
      return;
    }
    const lightbox = neuChatImageLightboxNode();
    if (lightbox instanceof HTMLElement && !lightbox.hidden) {
      neuSetChatImageLightboxOpen('');
      return;
    }
    const modal = neuChatModalNode();
    if (!(modal instanceof HTMLElement) || modal.hidden) return;
    neuCloseChatModal();
  });
}

async function neuInitChatMvp(user) {
  const meUid = String(user?.uid || auth.currentUser?.uid || '').trim();
  if (!meUid) return;

  neuChatState.meUid = meUid;
  neuEnsureChatModalLayoutClass();
  neuInitChatFloatFlag();
  neuSyncUnreadUi();
  neuWireChatEvents();
  neuWireChatSearchInput();
  const chatSearchInput = neuChatSearchInputNode();
  neuChatState.chatSearchQuery = String(chatSearchInput?.value || '').trim();
  neuStartChatListListener(meUid);
  neuWireChatListGuard();
  neuRenderChatList();
  neuRenderChatAttachmentPreview();
  neuRenderChatReplyPreview();
  neuChatAutoResizeInput();
  neuUpdateChatComposerOffsetVar();
  neuSetChatSending(false);
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
  await neuOpenChatWithUser(targetUid);
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
const NEU_QUICK_POST_MAX = 500;

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
    title.textContent = editOn ? 'Editar publicacion' : neuPostCrudState.composerDefaultTitle || 'Crear post';
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

function neuQuickPostEls() {
  return {
    modal: document.getElementById('neuQuickPostModal'),
    form: document.getElementById('neuQuickPostForm'),
    content: document.getElementById('neuQuickPostContent'),
    imageUrl: document.getElementById('neuQuickPostImageUrl'),
    msg: document.getElementById('neuQuickPostMsg'),
    count: document.getElementById('neuQuickPostCount'),
    submit: document.getElementById('btnNeuQuickPostSubmit'),
    cancel: document.getElementById('btnNeuQuickPostCancel'),
    close: document.getElementById('btnNeuQuickPostClose'),
  };
}

function neuQuickPostSetMsg(text, bad = false) {
  const { msg } = neuQuickPostEls();
  if (!(msg instanceof HTMLElement)) return;
  msg.textContent = String(text || '').trim();
  msg.style.color = bad ? '#ffb7c2' : 'rgba(230,236,255,0.85)';
}

function neuQuickPostCurrentLength() {
  const { content } = neuQuickPostEls();
  return String(content?.value || '').trim().length;
}

function neuQuickPostUpdateUiState() {
  const { count, submit } = neuQuickPostEls();
  const len = neuQuickPostCurrentLength();

  if (count instanceof HTMLElement) count.textContent = String(len);
  if (submit instanceof HTMLButtonElement) {
    submit.disabled = neuQuickPostState.submitting || len < 1 || len > NEU_QUICK_POST_MAX;
  }
}

function neuQuickPostSetSubmitting(submitting) {
  neuQuickPostState.submitting = submitting === true;
  const { submit, cancel, close, imageUrl, content } = neuQuickPostEls();
  if (submit instanceof HTMLButtonElement) {
    submit.textContent = neuQuickPostState.submitting ? 'Publicando...' : 'Publicar';
  }
  if (cancel instanceof HTMLButtonElement) cancel.disabled = neuQuickPostState.submitting;
  if (close instanceof HTMLButtonElement) close.disabled = neuQuickPostState.submitting;
  if (imageUrl instanceof HTMLInputElement) imageUrl.disabled = neuQuickPostState.submitting;
  if (content instanceof HTMLTextAreaElement) content.disabled = neuQuickPostState.submitting;
  neuQuickPostUpdateUiState();
}

function neuQuickPostResetForm() {
  const { form, content, imageUrl } = neuQuickPostEls();
  if (form instanceof HTMLFormElement) form.reset();
  if (content instanceof HTMLTextAreaElement) content.value = '';
  if (imageUrl instanceof HTMLInputElement) imageUrl.value = '';
  neuQuickPostSetMsg('');
  neuQuickPostSetSubmitting(false);
}

function neuQuickPostNormalizeImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return { value: '' };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'URL de imagen invalida.' };
    }
    return { value: parsed.href };
  } catch {
    return { error: 'URL de imagen invalida.' };
  }
}

function neuOpenQuickPostModal() {
  neuWireQuickPostEvents();
  const { modal, content } = neuQuickPostEls();
  if (!(modal instanceof HTMLElement)) return;
  neuQuickPostSetMsg('');
  neuQuickPostSetSubmitting(false);
  modal.hidden = false;
  neuChatRecomputeModalLock();
  window.setTimeout(() => {
    if (content instanceof HTMLTextAreaElement) content.focus({ preventScroll: true });
  }, 30);
}

function neuCloseQuickPostModal({ reset = false } = {}) {
  const { modal } = neuQuickPostEls();
  if (modal instanceof HTMLElement) modal.hidden = true;
  if (reset) neuQuickPostResetForm();
  neuChatRecomputeModalLock();
}

async function neuSubmitQuickPost() {
  if (neuQuickPostState.submitting) return;

  const uid = neuCurrentUid();
  if (!uid) {
    neuQuickPostSetMsg('Necesitas iniciar sesion para publicar.', true);
    return;
  }

  const { content, imageUrl } = neuQuickPostEls();
  const body = String(content?.value || '').trim();
  if (!body) {
    neuQuickPostSetMsg('Escribe algo para publicar.', true);
    neuQuickPostUpdateUiState();
    if (content instanceof HTMLTextAreaElement) content.focus({ preventScroll: true });
    return;
  }
  if (body.length > NEU_QUICK_POST_MAX) {
    neuQuickPostSetMsg(`Maximo ${NEU_QUICK_POST_MAX} caracteres.`, true);
    neuQuickPostUpdateUiState();
    return;
  }

  const normalizedUrl = neuQuickPostNormalizeImageUrl(imageUrl?.value);
  if (normalizedUrl.error) {
    neuQuickPostSetMsg(normalizedUrl.error, true);
    if (imageUrl instanceof HTMLInputElement) imageUrl.focus({ preventScroll: true });
    return;
  }

  const profile = neuProfileState.profile || neuProfileFromUi(uid) || {};
  const displayName = String(profile.displayName || auth.currentUser?.displayName || 'Usuario').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle || '', displayName, uid);
  const payload = {
    ownerUid: uid,
    authorUid: uid,
    authorName: displayName,
    authorHandle: handle,
    content: body,
    text: body,
    visibility: 'public',
    type: 'post',
    story: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const mediaUrl = String(normalizedUrl.value || '').trim();
  if (mediaUrl) {
    payload.imageUrl = mediaUrl;
    payload.imageURL = mediaUrl;
  }

  neuQuickPostSetSubmitting(true);
  neuQuickPostSetMsg('Publicando...');
  try {
    const postRef = doc(collection(db, NEU_POST_PRIMARY_COLLECTION));
    await setDoc(postRef, payload);
    neuCloseQuickPostModal({ reset: true });
    location.href = neuProfileHref(NEU_PROFILE_ME);
  } catch (error) {
    console.error('[neu-quick-post] publish failed', error);
    neuQuickPostSetMsg('No se pudo publicar. Intenta de nuevo.', true);
  } finally {
    neuQuickPostSetSubmitting(false);
  }
}

function neuWireQuickPostEvents() {
  if (neuQuickPostState.wired) return;
  neuQuickPostState.wired = true;

  const { form, content, cancel, close, modal } = neuQuickPostEls();
  if (content instanceof HTMLTextAreaElement) {
    content.addEventListener('input', () => {
      neuQuickPostUpdateUiState();
      if (neuQuickPostCurrentLength() > 0 && !neuQuickPostState.submitting) neuQuickPostSetMsg('');
    });
  }

  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      neuSubmitQuickPost().catch((error) => {
        console.error('[neu-quick-post] submit handler failed', error);
        neuQuickPostSetMsg('No se pudo publicar.', true);
      });
    });
  }

  if (cancel instanceof HTMLButtonElement) {
    cancel.addEventListener('click', () => {
      if (neuQuickPostState.submitting) return;
      neuCloseQuickPostModal({ reset: true });
    });
  }

  if (close instanceof HTMLButtonElement) {
    close.addEventListener('click', () => {
      if (neuQuickPostState.submitting) return;
      neuCloseQuickPostModal({ reset: true });
    });
  }

  if (modal instanceof HTMLElement) {
    modal.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-neu-quick-close]')) return;
      if (neuQuickPostState.submitting) return;
      neuCloseQuickPostModal({ reset: true });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const node = document.getElementById('neuQuickPostModal');
    if (!(node instanceof HTMLElement) || node.hidden || neuQuickPostState.submitting) return;
    event.preventDefault();
    neuCloseQuickPostModal({ reset: true });
  });

  neuQuickPostUpdateUiState();
}

function neuBuildPostFromDocData(data = {}) {
  const tags = Array.isArray(data.tags) ? data.tags.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const pollOptions = Array.isArray(data.pollOptions)
    ? data.pollOptions.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  return {
    type: String(data.type || 'post').trim().toLowerCase(),
    text: String(data.text || data.content || '').trim(),
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
    return { error: 'Poll necesita minimo 2 opciones.' };
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
  neuSetComposerInlineMsg('Modo edicion activado.');
}

async function neuSaveEditedPost() {
  if (!neuPostCrudState.editing || neuPostCrudState.saving) return;
  const edit = neuPostCrudState.editing;
  const meUid = neuCurrentUid();
  if (!meUid || edit.ownerUid !== meUid) {
    neuSetComposerInlineMsg('No tienes permiso para editar esta publicacion.', true);
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
    neuSetComposerInlineMsg('Publicacion actualizada.');
    neuCloseComposer();
    neuClearEditState();
    window.setTimeout(() => location.reload(), 150);
  } catch (err) {
    console.error('[neu-post] update failed', err);
    neuSetComposerInlineMsg('No se pudo actualizar la publicacion.', true);
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
      <h3 id="neuDeleteTitle">Eliminar publicacion</h3>
      <p>Esta accion no se puede deshacer.</p>
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
    neuSetComposerInlineMsg('No tienes permiso para eliminar esta publicacion.', true);
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
    neuSetComposerInlineMsg('Publicacion eliminada.');
    neuCloseDeleteModal();
    window.setTimeout(() => location.reload(), 120);
  } catch (err) {
    console.error('[neu-post] delete failed', err);
    neuSetComposerInlineMsg('No se pudo eliminar la publicacion.', true);
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
    <button class="neu-post-menu-toggle" type="button" aria-label="Opciones" title="Opciones">&#x22ef;</button>
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
          neuSetComposerInlineMsg('No se pudo abrir edicion.', true);
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
      <p>Se eliminara de stories y del perfil.</p>
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

function openQuickPostModalFromIntent() {
  updateNeuRouteParams({ portal: 'feed', profileMode: false });
  activatePortal('feed');
  window.setTimeout(() => {
    neuOpenQuickPostModal();
  }, 220);
}

function neuConsumePostOnboardingIntents() {
  const params = new URLSearchParams(location.search);
  const openProfileEdit = params.get('openProfileEdit') === '1';
  const openComposer = params.get('openComposer') === '1';
  const openQuickPost = params.get('openQuickPost') === '1';
  const openSuggested = params.get('suggested') === '1' || sessionStorage.getItem('neu_open_suggested') === '1';
  if (!openProfileEdit && !openComposer && !openQuickPost && !openSuggested) return;

  sessionStorage.removeItem('neu_open_suggested');
  neuStripQueryParams(['openProfileEdit', 'openComposer', 'openQuickPost', 'suggested', 'postOnboarding']);

  if (openProfileEdit) {
    updateNeuRouteParams({ portal: 'feed', profileMode: true, profileUid: NEU_PROFILE_ME });
    activatePortal('feed');
    activateFeedSource('target');
    window.setTimeout(() => {
      document.getElementById('btnNeuEditProfile')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, 220);
  }

  if (openComposer && !openQuickPost) {
    updateNeuRouteParams({ portal: 'feed', profileMode: false });
    activatePortal('feed');
    window.setTimeout(() => {
      openComposerModalFromBottom();
    }, 220);
  }

  if (openQuickPost) {
    openQuickPostModalFromIntent();
  }

  if (openSuggested) {
    updateNeuRouteParams({ portal: 'pulse', profileMode: false });
    activatePortal('pulse');
    window.setTimeout(() => {
      neuLoadSuggestedUsers({ force: true, focus: true }).catch(() => null);
    }, 240);
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
    neuLoadSuggestedUsers({ force: false, focus: false }).catch(() => null);
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
  const onboardingGate = await neuNeedsOnboarding(user?.uid || '');
  if (onboardingGate.needed) {
    await neuInitOnboarding(user, onboardingGate.profile || {});
    return 'onboarding';
  }
  neuOnboardingSetActive(false);
  const postOnboardingGate = await neuNeedsPostOnboarding(user?.uid || '', onboardingGate.profile || null);
  if (postOnboardingGate.needed) {
    await neuInitPostOnboarding(user, postOnboardingGate.profile || onboardingGate.profile || {});
    return 'post_onboarding';
  }
  neuPostOnboardingSetActive(false);
  neuStripQueryParams(['postOnboarding']);
  wireNeuLegacyProfileLinkBridge();

  // Keep legacy profile fusion logic untouched; run it only after neu auth gate passed.
  await import('./perfil-fusion-page.js');
  await neuInitPublicProfile(user);
  neuWireQuickPostEvents();
  neuRewriteLegacyLinksInRoot(document);
  window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 700);
  window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 1800);
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
  await neuLoadSuggestedUsers({ force: false, focus: false });
  neuConsumePostOnboardingIntents();
  if (isProfileRouteActive()) {
    window.setTimeout(() => {
      neuRefreshProfileFeed(false).catch(() => null);
      neuSyncProfileActionsUi();
      neuSyncProfileCountsUi();
    }, 180);
  }
  return 'app';
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
    const bootMode = await startNeuSocialApp();
    if (!SAFE_MODE && bootMode === 'app') {
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

/*
  NEU Post-Onboarding - Manual test checklist:
  1) New user finishes onboarding -> sees postOnboarding view once.
  2) Click "Pomin" -> sets postOnboardingDone=true and goes to Pulse.
  3) Refresh after skip/action -> postOnboarding does not appear again.
  4) "Sugerowani" in Pulse shows users and follow toggle works.
  5) Actions A/B/C route correctly:
     A -> profile edit flow, B -> Pulse + suggested focus, C -> quick post modal.
*/
