import { signOut } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import * as chatRepository from '../data/chat.repository.js';
import * as onboardingRepository from '../data/onboarding.repository.js';
import * as postRepository from '../data/post.repository.js';
import * as profileRepository from '../data/profile.repository.js';
import * as storyRepository from '../data/story.repository.js';
import {
  neuLegacyLinkRewriteState,
  neuOnboardingState,
  neuPostOnboardingState,
  neuProfileState,
  neuProfileSyncState,
  neuPublicProfileState,
  neuSuggestedState,
} from '../state/profile.state.js';
import { neuPostCrudState, neuQuickPostState } from '../state/post.state.js';
import { neuStoryCrudState } from '../state/story.state.js';
import { neuChatFloatState, neuChatState, neuDockThreadWindowsState, neuQaScrollProbeState } from '../state/chat.state.js';
import { requireNeuAuth } from '../../neu-auth-gate.js?v=20260222c';
import { app, auth, db, storage } from '../../neu-firebase-init.js?v=20260222c';

function neuReadRefPath(refLike) {
  if (!refLike) return '';
  if (typeof refLike === 'string') return refLike;
  if (typeof refLike.path === 'string') return refLike.path;

  const queryPath = refLike?._query?.path;
  if (queryPath) {
    if (typeof queryPath.canonicalString === 'function') return String(queryPath.canonicalString() || '');
    if (Array.isArray(queryPath.segments)) return queryPath.segments.join('/');
  }
  return '';
}

function neuResolveDomainFromPath(rawPath) {
  const path = String(rawPath || '').trim();
  if (!path) return 'profile';
  const head = path.split('/')[0] || '';
  if (head === 'neuConversations' || head === 'neuUserChats' || head === 'neuChatTyping' || head === 'neuChatReactions') {
    return 'chat';
  }
  if (head === 'neuUsers' || head === 'neuFollows') return 'profile';
  if (head === 'neuUserSettings' || head === 'neuUsernames') return 'onboarding';
  if (head === 'neuPosts') return 'posts';
  if (head === 'neuStories' || head === 'user_feed') return 'stories';
  return 'profile';
}

function neuDomainRepository(domain) {
  if (domain === 'chat') return chatRepository;
  if (domain === 'onboarding') return onboardingRepository;
  if (domain === 'posts') return postRepository;
  if (domain === 'stories') return storyRepository;
  return profileRepository;
}

function neuRepoForPath(path) {
  return neuDomainRepository(neuResolveDomainFromPath(path));
}

function neuPathFromArgs(args) {
  if (!Array.isArray(args) || !args.length) return '';
  if (args[0] === db) return neuPathFromArgs(args.slice(1));
  const first = args[0];
  if (typeof first === 'string') return first;
  const fromRef = neuReadRefPath(first);
  if (fromRef) return fromRef;
  if (typeof args[1] === 'string') return args[1];
  return '';
}

function doc(...args) {
  const path = neuPathFromArgs(args);
  const repo = neuRepoForPath(path);
  const nextArgs = args[0] === db ? args.slice(1) : args;
  return repo.doc(...nextArgs);
}

function collection(...args) {
  const path = neuPathFromArgs(args);
  const repo = neuRepoForPath(path);
  const nextArgs = args[0] === db ? args.slice(1) : args;
  return repo.collection(...nextArgs);
}

function query(...args) {
  return chatRepository.query(...args);
}

function where(...args) {
  return chatRepository.where(...args);
}

function orderBy(...args) {
  return chatRepository.orderBy(...args);
}

function limit(...args) {
  return chatRepository.limit(...args);
}

function startAfter(...args) {
  return chatRepository.startAfter(...args);
}

function getDoc(ref) {
  return neuRepoForPath(neuReadRefPath(ref)).getDoc(ref);
}

function getDocs(ref) {
  const path = neuReadRefPath(ref);
  const repo = neuRepoForPath(path);
  if (typeof repo.getDocs === 'function') return repo.getDocs(ref);
  return profileRepository.getDocs(ref);
}

function setDoc(ref, payload, options) {
  return neuRepoForPath(neuReadRefPath(ref)).setDoc(ref, payload, options);
}

function updateDoc(ref, payload) {
  const repo = neuRepoForPath(neuReadRefPath(ref));
  if (typeof repo.updateDoc === 'function') return repo.updateDoc(ref, payload);
  return profileRepository.updateDoc(ref, payload);
}

function deleteDoc(ref) {
  return neuRepoForPath(neuReadRefPath(ref)).deleteDoc(ref);
}

function onSnapshot(ref, next, error) {
  return chatRepository.onSnapshot(ref, next, error);
}

function runTransaction(_db, updateFn) {
  const handler = typeof _db === 'function' ? _db : updateFn;
  return onboardingRepository.runTransaction(handler);
}

function writeBatch() {
  return chatRepository.writeBatch();
}

function serverTimestamp() {
  return profileRepository.serverTimestamp();
}

function increment(value) {
  return profileRepository.increment(value);
}

function deleteField() {
  return profileRepository.deleteField();
}

function storageRef(...args) {
  const path = typeof args[0] === 'string' ? args[0] : typeof args[1] === 'string' ? args[1] : '';
  const repo = neuRepoForPath(path);
  if (args[0] === storage && args.length > 1) return repo.storageRef(args[1]);
  return repo.storageRef(...args);
}

function uploadBytes(ref, file, metadata) {
  const repo = neuRepoForPath(neuReadRefPath(ref));
  return repo.uploadBytes(ref, file, metadata);
}

function getDownloadURL(ref) {
  const repo = neuRepoForPath(neuReadRefPath(ref));
  return repo.getDownloadURL(ref);
}

function deleteObject(ref) {
  const repo = neuRepoForPath(neuReadRefPath(ref));
  return repo.deleteObject(ref);
}

function getStorage(instance) {
  return chatRepository.getStorage(instance);
}

function logLegacyModuleLoadedIfQa() {
  if (new URLSearchParams(location.search).get('qa') === '1') {
    console.log('[NEU PAGE] neu-social-app-page.js loaded');
  }
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
    return 'Brak uprawnien Firestore. Sprawdz reguly neuUsers/neuUsernames i deploy.';
  }
  if (code.includes('unavailable') || code.includes('network-request-failed')) {
    return 'Brak polaczenia z Firebase. Sprawdz internet i spróbuj ponownie.';
  }
  if (code.includes('deadline-exceeded') || code.includes('aborted')) {
    return 'Firebase timeout. Spróbuj ponownie za chwile.';
  }
  if (code.includes('failed-precondition')) {
    return 'Brakuje konfiguracji Firestore (reguly/index).';
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

function neuIsViewingForeignProfile() {
  return (
    isProfileRouteActive() &&
    neuPublicProfileState.profileMode === true &&
    neuPublicProfileState.isOwn === false
  );
}

function neuGetProfileHandleUid(profile = null) {
  if (neuIsViewingForeignProfile()) {
    const routeUid = String(neuPublicProfileState.targetUid || '').trim();
    if (routeUid) return routeUid;
    return String(profile?.uid || '').trim();
  }
  return String(auth.currentUser?.uid || neuCurrentUid() || '').trim();
}

function neuGetProfileForActiveRoute() {
  if (neuIsViewingForeignProfile()) {
    return neuPublicProfileState.viewedProfile || neuProfileFallback(neuPublicProfileState.targetUid);
  }
  return neuProfileState.profile;
}

function neuApplyProfileToUi(profile) {
  if (!profile) return;
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, neuGetProfileHandleUid(profile));
  const city = neuCleanCity(profile.city) || neuCleanCity(readCity()) || 'Online';
  const avatarUrl = String(profile.avatarUrl || '').trim();
  const bio = String(profile.bio || '').trim();
  const foreignProfileActive = neuIsViewingForeignProfile();

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

  if (!foreignProfileActive) {
    neuSetAvatarElements(
      document.getElementById('composerInlineAvatarImg'),
      document.getElementById('composerInlineAvatarFallback'),
      avatarUrl,
      displayName,
    );

    neuSetNavAvatarNode(document.getElementById('navProfileToggle'), avatarUrl, displayName);
    neuSetNavAvatarNode(document.querySelector('#navProfileMenu .nav-avatar'), avatarUrl, displayName);
    const navName = document.querySelector('#navProfileMenu .nav-profile-name');
    if (navName instanceof HTMLElement) navName.textContent = displayName;
    const navHandle = document.querySelector('#navProfileMenu .nav-profile-handle');
    if (navHandle instanceof HTMLElement) navHandle.textContent = handle;
  }

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

function neuNeedsProfileUiSync(profile = neuGetProfileForActiveRoute()) {
  if (!profile || !isProfileRouteActive()) return false;
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, neuGetProfileHandleUid(profile));
  const city = neuCleanCity(profile.city) || neuCleanCity(readCity()) || 'Online';
  const avatarUrl = String(profile.avatarUrl || '').trim();
  const foreignProfileActive = neuIsViewingForeignProfile();

  const leftName = String(document.getElementById('leftName')?.textContent || '').trim();
  const leftHandle = String(document.getElementById('leftHandle')?.textContent || '').trim();
  const leftCity = String(document.getElementById('profileCity')?.textContent || '').trim();
  if (leftName !== displayName || leftHandle !== handle || leftCity !== city) return true;

  const leftAvatarAttr = String(document.getElementById('leftAvatarImg')?.getAttribute('src') || '').trim();
  const composerAvatarAttr = String(document.getElementById('composerInlineAvatarImg')?.getAttribute('src') || '').trim();
  if (avatarUrl) {
    if (leftAvatarAttr !== avatarUrl) return true;
    if (!foreignProfileActive && composerAvatarAttr !== avatarUrl) return true;
  } else if (leftAvatarAttr || (!foreignProfileActive && composerAvatarAttr)) {
    return true;
  }

  return false;
}

function neuRunProfileUiSync() {
  if (neuProfileSyncState.applying) return;
  const profile = neuGetProfileForActiveRoute();
  if (!neuNeedsProfileUiSync(profile)) return;
  neuProfileSyncState.applying = true;
  neuApplyProfileToUi(profile);
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

  const meUid = neuCurrentUid();
  const routeProfileUid = getProfileUidFromQuery(meUid);
  const routeTargetUid = routeProfileUid && routeProfileUid !== meUid ? routeProfileUid : '';
  const messageTargetUid = isProfileMode && !isOwn
    ? String(neuPublicProfileState.targetUid || routeTargetUid || '').trim()
    : '';
  if (messageBtn instanceof HTMLElement) {
    messageBtn.setAttribute('data-chat-uid', messageTargetUid);
    messageBtn.removeAttribute('data-open-chat');
    messageBtn.removeAttribute('data-open-chat-name');
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
    const actionsHtml = `
      <div class="neu-post-quick-actions">
        <button class="btn-white-outline neu-post-share-chat" type="button" data-neu-post-share-chat="1">Enviar por chat</button>
      </div>
    `;

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
        ${actionsHtml}
      </article>
    `;
  });

  feed.innerHTML = items.join('');
}

async function neuRefreshProfileFeed(forceReload = false) {
  if (!isProfileRouteActive()) {
    if (neuPublicProfileState.profileMode) {
      neuPublicProfileState.profileMode = false;
      neuPublicProfileState.viewedProfile = null;
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
      neuPublicProfileState.posts = await neuLoadProfilePosts(
        neuPublicProfileState.targetUid,
        neuGetProfileForActiveRoute(),
      );
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
            <span>${esc(handle)}${city ? ` · ${esc(city)}` : ''}</span>
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

      const messageBtn = target.closest('#btnFusionMessage');
      if (messageBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const meUid = neuCurrentUid();
        const routeProfileUid = getProfileUidFromQuery(meUid);
        const chatUid =
          String(messageBtn.getAttribute('data-chat-uid') || '').trim() ||
          String(neuPublicProfileState.targetUid || '').trim() ||
          String(routeProfileUid || '').trim();
        if (!chatUid || chatUid === meUid) return;
        neuOpenProfileMessage(chatUid).catch((error) => {
          console.error('[neu-chat] profile button failed', error);
          neuChatSetHint('No se pudo iniciar el chat.', true);
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
      neuPublicProfileState.viewedProfile = null;
      if (neuProfileState.profile) neuApplyProfileToUi(neuProfileState.profile);
      neuSyncProfileActionsUi();
      neuWirePublicProfileEvents();
      return;
    }

    const targetUid = getProfileUidFromQuery(meUid);
    if (!targetUid) {
      // Invalid/empty profile id should not force redirect to own profile.
      neuPublicProfileState.profileMode = false;
      neuPublicProfileState.targetUid = '';
      neuPublicProfileState.viewedProfile = null;
      neuPublicProfileState.isOwn = true;
      if (neuProfileState.profile) neuApplyProfileToUi(neuProfileState.profile);
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
      neuPublicProfileState.viewedProfile = null;
      neuPublicProfileState.posts = [];
      neuPublicProfileState.postsLoadedFor = '';
      neuPublicProfileState.postsLoading = false;
    }

    if (!isOwn && getProfileParamRaw() !== targetUid) {
      updateNeuRouteParams({ profileMode: true, profileUid: targetUid });
    }

    if (isOwn) {
      neuPublicProfileState.viewedProfile = null;
      await neuInitProfileEditor(user);
    } else {
      const loaded = await neuLoadViewedProfile(targetUid, false);
      neuPublicProfileState.viewedProfile = loaded.profile;
      neuSetProfileReadOnly(true, '');
      neuSetProfileEditorVisible(false);
      neuSetProfileModalOpen(false);
      neuApplyProfileToUi(neuPublicProfileState.viewedProfile);
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
const NEU_CHAT_SCROLL_NEAR_BOTTOM = 80;
const NEU_CHAT_LOAD_MORE_TOP_THRESHOLD = 120;
const NEU_CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEU_CHAT_LAUNCHER_STORAGE_KEY = 'neu_chat_launcher_pos';
const NEU_CHAT_FLOAT_STORAGE_KEY = 'neu_chat_float_pos';
const NEU_CHAT_DOCK_OPEN_STORAGE_KEY = 'neu_chat_dock_open';
const NEU_CHAT_HIDDEN_STORAGE_PREFIX = 'neuChatHidden:';
const NEU_CHAT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const NEU_CHAT_UPLOAD_PREFIX = 'neuChatUploads/';
const NEU_CHAT_TYPING_DEBOUNCE_MS = 400;
const NEU_CHAT_TYPING_IDLE_MS = 2000;
const NEU_CHAT_TYPING_STALE_MS = 12000;
const NEU_CHAT_ACTIVE_THREAD_STALE_MS = 90 * 1000;
const NEU_CHAT_MARK_READ_DEBOUNCE_MS = 1200;
const NEU_CHAT_REPLY_SNIPPET_MAX = 80;
const NEU_CHAT_REPLY_LONG_PRESS_MS = 450;
const NEU_CHAT_REPLY_HIGHLIGHT_MS = 1000;
const NEU_CHAT_SEARCH_DEBOUNCE_MS = 150;
const NEU_CHAT_TOAST_HIDE_MS = 3000;
const NEU_CHAT_TOAST_DEDUPE_MS = 1200;
const NEU_CHAT_GROUP_AVATAR_POSITION = 'first';
const NEU_CHAT_REACTION_TYPES = ['like', 'heart', 'laugh'];
const NEU_CHAT_OPEN_SKELETON_ROWS = 8;
const NEU_CHAT_ALLOW_DELETE_FOR_ALL = false;
const NEU_CHAT_REACTION_EMOJI = {
  like: '??',
  heart: '??',
  laugh: '??',
};
const NEU_DOCK_THREAD_MAX_WINDOWS = 3;
const NEU_DOCK_THREAD_GAP = 12;
const NEU_DOCK_THREAD_MARGIN = 16;
const NEU_DOCK_THREAD_BOTTOM = 96;
const NEU_DOCK_BUBBLE_BOTTOM = 24;
const neuChatFeatures = {
  typingEnabled: true,
  presenceEnabled: true,
  readSyncEnabled: true,
};

let neuChatScrollEl = null;

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

function neuChatToastNode() {
  const existing = document.getElementById('neuChatToast');
  if (existing instanceof HTMLElement) return existing;
  const toast = document.createElement('div');
  toast.id = 'neuChatToast';
  toast.className = 'neuChatToast hidden';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.append(toast);
  return toast;
}

function neuHideChatToast() {
  const toast = neuChatToastNode();
  if (!(toast instanceof HTMLElement)) return;
  toast.classList.add('hidden');
  toast.innerHTML = '';
  toast.classList.remove('is-bad');
  if (neuChatState.toastTimer) {
    window.clearTimeout(neuChatState.toastTimer);
    neuChatState.toastTimer = 0;
  }
}

function neuShowChatToast(text, bad = false, options = {}) {
  const message = String(text || '').trim();
  if (!message) {
    neuHideChatToast();
    return;
  }
  const now = Date.now();
  if (neuChatState.toastLastText === message && now - Number(neuChatState.toastLastAt || 0) < NEU_CHAT_TOAST_DEDUPE_MS) {
    return;
  }
  neuChatState.toastLastText = message;
  neuChatState.toastLastAt = now;
  const retryUpload = options && typeof options === 'object' ? options.retryUpload === true : false;
  const toast = neuChatToastNode();
  if (!(toast instanceof HTMLElement)) return;
  if (retryUpload) {
    toast.innerHTML = `${esc(message)} <button class="btn-white-outline neuChatToastRetry" type="button" data-neu-chat-toast-retry="1">Reintentar</button>`;
  } else {
    toast.textContent = message;
  }
  toast.classList.toggle('is-bad', bad === true);
  toast.classList.remove('hidden');
  if (neuChatState.toastTimer) {
    window.clearTimeout(neuChatState.toastTimer);
    neuChatState.toastTimer = 0;
  }
  neuChatState.toastTimer = window.setTimeout(() => {
    neuHideChatToast();
  }, NEU_CHAT_TOAST_HIDE_MS);
}

function neuChatSetHint(text, bad = false, options = {}) {
  const hint = document.getElementById('neuChatHint');
  if (hint instanceof HTMLElement) {
    hint.textContent = '';
    hint.removeAttribute('data-neu-chat-retry-upload');
  }
  const message = String(text || '').trim();
  if (!message) {
    neuHideChatToast();
    return;
  }
  neuShowChatToast(message, bad, options);
}

function neuChatActionKey(action = '', conversationId = '') {
  const a = String(action || '').trim().toLowerCase();
  const c = String(conversationId || '').trim();
  return `${a}:${c || '*'}`;
}

function neuChatIsActionBlocked(action = '', conversationId = '') {
  const key = neuChatActionKey(action, conversationId);
  return neuChatState.permissionBlockedActions instanceof Set ? neuChatState.permissionBlockedActions.has(key) : false;
}

function neuChatBlockAction(action = '', conversationId = '', toastText = 'Sin permisos para esta accion.') {
  const key = neuChatActionKey(action, conversationId);
  if (!(neuChatState.permissionBlockedActions instanceof Set)) return;
  neuChatState.permissionBlockedActions.add(key);
  if (String(action || '').trim().toLowerCase() === 'attach') {
    neuChatSetAttachmentsDisabled(true, 'permission-denied');
  }
  if (!(neuChatState.permissionBlockedToasted instanceof Set)) return;
  if (neuChatState.permissionBlockedToasted.has(key)) return;
  neuChatState.permissionBlockedToasted.add(key);
  neuChatSetHint(toastText, true);
}

function neuChatHandlePermissionDenied(error, action = '', conversationId = '', toastText = 'Sin permisos para esta accion.') {
  if (!neuIsPermissionDenied(error)) return false;
  neuChatBlockAction(action, conversationId, toastText);
  if (NEU_QA) {
    const code = neuChatErrorCode(error) || 'unknown';
    console.debug('[neu-chat] permission denied blocked', { action, conversationId, code });
  }
  return true;
}

function neuChatSetAttachmentsDisabled(disabled, reason = '') {
  const next = disabled === true;
  neuChatState.attachmentsDisabled = next;
  neuChatState.attachmentsDisableReason = String(reason || '').trim();
  if (!next) neuChatState.attachmentsDisabledToasted = false;
  neuSyncChatComposerState();
}

function neuChatNotifyAttachmentsUnavailable() {
  if (neuChatState.attachmentsDisabledToasted) return;
  neuChatState.attachmentsDisabledToasted = true;
  neuChatSetHint('Adjuntos no disponibles', true);
}

function neuChatIsFeatureEnabled(featureKey = '') {
  const key = String(featureKey || '').trim();
  if (!key) return true;
  if (!Object.prototype.hasOwnProperty.call(neuChatFeatures, key)) return true;
  return neuChatFeatures[key] !== false;
}

function neuChatDisableFeature(featureKey = '', toastText = '', options = {}) {
  const key = String(featureKey || '').trim();
  if (!key || !Object.prototype.hasOwnProperty.call(neuChatFeatures, key)) return;
  const alreadyDisabled = neuChatFeatures[key] === false;
  neuChatFeatures[key] = false;

  const actionKey = String(options?.action || '').trim();
  const conversationId = String(options?.conversationId || '').trim();
  if (actionKey) {
    neuChatState.permissionBlockedActions?.add(neuChatActionKey(actionKey, conversationId));
  }

  if (key === 'typingEnabled') {
    neuChatStopTypingAndTimers({ bestEffort: true });
    neuStopTypingListener();
    neuSetTypingRowVisible(false);
    if (neuDockThreadWindowsState?.windows instanceof Map) {
      neuDockThreadWindowsState.windows.forEach((state) => {
        if (!state) return;
        state.peerTyping = false;
        neuDockThreadStopTypingTimers(state);
        neuDockThreadUpdateTypingUi(state, false);
      });
    }
  }
  if (key === 'presenceEnabled') {
    neuChatState.activePresenceConversationId = '';
    const presenceNode = document.getElementById('neuChatPeerPresence');
    if (presenceNode instanceof HTMLElement) presenceNode.textContent = 'Estado no disponible';
  }

  if (!alreadyDisabled && toastText) {
    const toastSet = neuChatState.featureToastShown instanceof Set ? neuChatState.featureToastShown : null;
    if (!toastSet || !toastSet.has(key)) {
      toastSet?.add(key);
      neuChatSetHint(String(toastText || '').trim(), true);
    }
  }

  if (NEU_QA) {
    const debugSet = neuChatState.featureDebugLogged instanceof Set ? neuChatState.featureDebugLogged : null;
    if (!debugSet || !debugSet.has(key)) {
      debugSet?.add(key);
      console.debug('[neu-chat] feature disabled', key, { action: actionKey, conversationId });
    }
    neuQaPush(`feature disabled: ${key}`);
  }
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
  return code.includes('storage/unauthorized') || code.endsWith('unauthorized') || code.includes('permission-denied');
}

function neuChatIsNetworkError(error) {
  const code = neuChatErrorCodeLower(error);
  const message = String(error?.message || '').toLowerCase();
  return (
    code.includes('network-request-failed') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('offline')
  );
}

function neuChatUploadErrorMessage(error, context = {}) {
  const stage = String(context?.stage || '').trim().toLowerCase();
  if ((stage === 'uploadbytes' || stage === 'getdownloadurl') && neuChatIsUploadPermissionError(error)) {
    return 'Brak uprawnien do uploadu';
  }
  if (neuChatIsNetworkError(error)) {
    return 'Problem z siecia';
  }
  return 'Upload nieudany';
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

function neuChatLogUploadFail(error, context = {}) {
  const ctx = context && typeof context === 'object' ? context : { chatId: String(context || '').trim() };
  const code = neuChatErrorCode(error) || 'unknown';
  const message = String(error?.message || '').trim();
  const stage = String(ctx?.stage || 'unknown').trim() || 'unknown';
  const chatId = String(ctx?.chatId || '').trim();
  const messageId = String(ctx?.messageId || '').trim();
  const storagePath = String(ctx?.storagePath || '').trim();
  const fileType = String(ctx?.fileType || '').trim();
  const fileSize = Number(ctx?.fileSize || 0);
  console.error('[CHAT UPLOAD FAIL]', {
    stage,
    code,
    message,
    chatId,
    messageId,
    storagePath,
    fileType,
    fileSize,
    error,
  });
  if ((stage === 'uploadBytes' || stage === 'getDownloadURL') && neuChatIsUploadPermissionError(error)) {
    const hintedChatId = chatId || '{chatId}';
    console.error(`[HINT] Check Firebase Storage rules / bucket permissions for uploads path neuChatUploads/${hintedChatId}/...`);
  }
}

function neuShowChatEndHint() {
  const el = document.getElementById('neuChatTopEnd');
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove('hidden');
  el.classList.add('is-show');
  if (neuChatState._endHintT) window.clearTimeout(neuChatState._endHintT);
  neuChatState._endHintT = window.setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('is-show');
    neuChatState._endHintT = 0;
  }, 2500);
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

function neuChatLastMessageText(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function neuFormatChatDayDivider(value) {
  const date = value instanceof Date ? value : neuChatDate(value);
  if (!date) return '';
  try {
    return date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
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

function neuMapChatMessagesFromDocs(docs = []) {
  const rows = Array.isArray(docs) ? docs : [];
  return rows
    .map((row) => {
      const docId = String(row?.id || '').trim();
      const data = row?.data?.() || {};
      const createdAt = data.createdAt || data.sentAt || data.timestamp || data.updatedAt || null;
      return { ...data, createdAt, id: docId };
    })
    .filter((row) => !!String(row?.id || '').trim())
    .reverse();
}

function neuRebuildChatMessagesFromBuckets() {
  const older = Array.isArray(neuChatState.olderMessages) ? neuChatState.olderMessages : [];
  const live = Array.isArray(neuChatState.liveMessages) ? neuChatState.liveMessages : [];
  const combined = [...older, ...live];
  const map = new Map();
  combined.forEach((row) => {
    const id = String(row?.id || '').trim();
    if (!id) return;
    map.set(id, row);
  });
  const final = Array.from(map.values()).sort((a, b) => {
    const tsA = neuTimeToMs(a?.createdAt);
    const tsB = neuTimeToMs(b?.createdAt);
    if (tsA !== tsB) return tsA - tsB;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });

  neuChatState.messages = final;
  neuChatState.loadedCount = final.length;
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
      text: neuChatMessageText(item),
      content: String(item?.content || '').trim(),
      imageUrl: String(item?.imageUrl || '').trim(),
      imageStoragePath: String(item?.imageStoragePath || '').trim(),
      postRef: item?.postRef && typeof item.postRef === 'object' ? item.postRef : null,
      postUrl: String(item?.postUrl || '').trim(),
      shareType: String(item?.shareType || '').trim().toLowerCase(),
      shareId: String(item?.shareId || '').trim(),
      shareUrl: String(item?.shareUrl || '').trim(),
      previewTitle: String(item?.previewTitle || '').trim(),
      previewSubtitle: String(item?.previewSubtitle || '').trim(),
      previewImageUrl: String(item?.previewImageUrl || '').trim(),
      replyTo: neuChatNormalizeReplyPayload(item?.replyTo),
      editedAt: item?.editedAt || null,
      deletedAt: item?.deletedAt || null,
      createdAt: item?.createdAt || null,
      ts,
    };
    const prev = groups[groups.length - 1];
    const prevDate = prev ? neuChatDate(prev.lastCreatedAt) : null;
    const currDate = neuChatDate(current.createdAt);
    const sameDay =
      prevDate instanceof Date &&
      currDate instanceof Date &&
      prevDate.getFullYear() === currDate.getFullYear() &&
      prevDate.getMonth() === currDate.getMonth() &&
      prevDate.getDate() === currDate.getDate();
    const canMerge =
      !!prev &&
      prev.senderUid === senderUid &&
      prev.lastTs > 0 &&
      ts > 0 &&
      ts - prev.lastTs <= NEU_CHAT_GROUP_WINDOW_MS &&
      sameDay;

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

function neuChatCanCompareReadMessageIds(messages = [], peerLastReadMessageId = '') {
  const peerId = String(peerLastReadMessageId || '').trim();
  if (!peerId) return false;
  const rows = Array.isArray(messages) ? messages : [];
  const ids = rows
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return false;

  const numericRe = /^\d+$/;
  const isNumeric = numericRe.test(peerId) && ids.every((id) => numericRe.test(id));
  const ulidRe = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const isUlid = ulidRe.test(peerId) && ids.every((id) => ulidRe.test(id));
  if (!isNumeric && !isUlid) return false;

  const ordered = [...rows]
    .map((row) => ({ id: String(row?.id || '').trim(), ts: neuTimeToMs(row?.createdAt) }))
    .filter((row) => !!row.id)
    .sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.id.localeCompare(b.id);
    });
  if (ordered.length < 2) return true;

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (isNumeric) {
      const prevNum = Number(prev.id);
      const currNum = Number(curr.id);
      if (!Number.isFinite(prevNum) || !Number.isFinite(currNum) || currNum < prevNum) return false;
    } else if (curr.id.localeCompare(prev.id) < 0) {
      return false;
    }
  }
  return true;
}

function neuChatOutgoingStatusMap(messages = [], meUid = '') {
  const list = Array.isArray(messages) ? messages : [];
  const ownUid = String(meUid || '').trim();
  const statuses = new Map();
  if (!list.length || !ownUid) return statuses;

  let lastOutgoing = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (String(item?.senderUid || '').trim() !== ownUid) continue;
    lastOutgoing = item;
    break;
  }
  if (!lastOutgoing) return statuses;

  const peerReadId = String(neuChatState.peerLastReadMessageId || '').trim();
  const peerReadTs = neuTimeToMs(neuChatState.peerLastReadAt);
  const messageId = String(lastOutgoing?.id || '').trim();
  if (!messageId) return statuses;

  let seen = false;
  if (peerReadId && peerReadId === messageId) {
    seen = true;
  } else {
    const messageTs = neuTimeToMs(lastOutgoing?.createdAt);
    seen = peerReadTs > 0 && messageTs > 0 && messageTs <= peerReadTs;
  }
  statuses.set(messageId, seen ? 'Visto' : 'Enviado');

  return statuses;
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

function neuAfterNextPaint(callback) {
  if (typeof callback !== 'function') return;
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => callback());
    });
    return;
  }
  callback();
}

function neuChatScrollBottomAfterPaint(behavior = 'auto', options = {}) {
  const expectedConversationId = String(options?.conversationId || '').trim();
  const expectedToken = Number(options?.listenerToken || 0);
  const expectedOpenSeq = Number(options?.openSeq || 0);
  const force = options?.force === true;
  neuAfterNextPaint(() => {
    const activeConversationId = String(neuChatState.currentConversationId || '').trim();
    if (expectedConversationId && expectedConversationId !== activeConversationId) return;
    if (expectedToken > 0 && expectedToken !== Number(neuChatState.messageListenerToken || 0)) return;
    if (expectedOpenSeq > 0 && expectedOpenSeq !== Number(neuChatState.openSeq || 0)) return;
    neuChatScrollToBottom({ force, behavior });
  });
}

function neuChatSkeletonRowsHtml(total = NEU_CHAT_OPEN_SKELETON_ROWS) {
  const count = Math.max(6, Math.min(10, Math.floor(Number(total) || NEU_CHAT_OPEN_SKELETON_ROWS)));
  const widths = ['42%', '64%', '36%', '58%', '46%', '62%', '40%', '54%', '38%', '60%'];
  const rows = Array.from({ length: count })
    .map((_, index) => {
      const direction = index % 3 === 0 ? ' outgoing' : ' incoming';
      const width = widths[index % widths.length];
      return `
        <div class="neuChatSkeletonRow${direction}">
          <div class="neuChatSkeletonBubble" style="width:${width};"></div>
        </div>
      `;
    })
    .join('');
  return `<div class="neuChatSkeleton" aria-hidden="true">${rows}</div>`;
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
    reactBtn.textContent = mine ? neuReactionEmoji(mine) : '??';
    reactBtn.classList.toggle('is-active', !!mine);
  }

  const bar = wrap.querySelector('.neuReactBar');
  if (bar instanceof HTMLElement) {
    const html = neuReactionBarHtml(msgId);
    bar.innerHTML = html;
    bar.classList.toggle('is-empty', !html);
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
    ? neuChatState.messages
        .filter((row) => !row?.deletedAt)
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
        .slice(-NEU_CHAT_MAX_MESSAGES)
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
  if (neuChatIsActionBlocked('reaction', chatId)) return;

  const current = neuReactionType(neuChatState.reactionMine.get(msgId));
  const ref = doc(db, 'neuChatReactions', chatId, 'messages', msgId, 'reactions', meUid);
  try {
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
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'reaction', chatId, 'Sin permisos para reacciones.')) return;
    throw error;
  }
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
  if (!neuChatIsFeatureEnabled('typingEnabled')) return;
  if (neuChatIsActionBlocked('typing', chatId)) return;
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
    if (neuIsPermissionDenied(error)) {
      neuChatDisableFeature('typingEnabled', 'Sin permisos para estado "escribiendo".', {
        action: 'typing',
        conversationId: chatId,
      });
      return;
    }
    if (!bestEffort && NEU_QA) console.warn('[neu-chat] typing write failed', error);
    return;
  }
  neuChatState.typingConversationId = chatId;
  neuChatState.typingActive = next;
}

function neuChatTypingStateRef(conversationId, uid) {
  const convId = String(conversationId || '').trim();
  const userId = String(uid || '').trim();
  if (!convId || !userId) return null;
  return doc(db, 'neuChatTyping', convId, 'users', userId);
}

async function neuSetOwnActiveThreadState(conversationId, active, { bestEffort = false } = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;
  if (!neuChatIsFeatureEnabled('presenceEnabled')) return;
  const blocked = neuChatState.activePresenceBlockedConversations instanceof Set ? neuChatState.activePresenceBlockedConversations : null;
  if (bestEffort && blocked?.has(convId)) return;

  const ref = neuChatTypingStateRef(convId, meUid);
  if (!ref) return;
  const payload = {
    activeThread: active === true,
    activeUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (active !== true) payload.typing = false;

  try {
    await setDoc(ref, payload, { merge: true });
    blocked?.delete(convId);
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      if (blocked && !blocked.has(convId)) {
        blocked.add(convId);
      }
      neuChatDisableFeature('presenceEnabled', 'Sin permisos para sincronizar estado del chat.', {
        action: 'active_state',
        conversationId: convId,
      });
      return;
    }
    if (!bestEffort && NEU_QA) console.warn('[neu-chat] active thread state write failed', convId, error);
  }
}

function neuSyncOwnActiveThreadState(nextConversationId = '') {
  const nextId = String(nextConversationId || '').trim();
  if (!neuChatIsFeatureEnabled('presenceEnabled')) {
    neuChatState.activePresenceConversationId = nextId;
    return;
  }
  const prevId = String(neuChatState.activePresenceConversationId || '').trim();
  if (prevId && prevId !== nextId) {
    neuSetOwnActiveThreadState(prevId, false, { bestEffort: true }).catch(() => null);
  }
  if (nextId) {
    neuSetOwnActiveThreadState(nextId, true, { bestEffort: true }).catch(() => null);
  }
  neuChatState.activePresenceConversationId = nextId;
}

async function neuResolveRecipientsForUnreadIncrement(conversationId, members = [], senderUid = '') {
  const convId = String(conversationId || '').trim();
  const sender = String(senderUid || '').trim();
  const recipients = Array.isArray(members)
    ? members.map((uid) => String(uid || '').trim()).filter((uid) => !!uid && uid !== sender)
    : [];
  if (!convId || !recipients.length) return new Set();

  const result = new Set(recipients);
  await Promise.all(
    recipients.map(async (recipientUid) => {
      const stateRef = neuChatTypingStateRef(convId, recipientUid);
      if (!stateRef) return;
      try {
        const snap = await getDoc(stateRef);
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (data.activeThread !== true) return;
        const activeMs = neuTimeToMs(data.activeUpdatedAt || data.updatedAt);
        if (activeMs <= 0) return;
        if (Date.now() - activeMs > NEU_CHAT_ACTIVE_THREAD_STALE_MS) return;
        result.delete(recipientUid);
      } catch (error) {
        if (NEU_QA) {
          console.debug('[neu-chat] unread active check fallback', {
            conversationId: convId,
            recipientUid,
            code: neuChatErrorCode(error) || 'unknown',
          });
        }
      }
    }),
  );
  return result;
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
  if (!neuChatIsFeatureEnabled('typingEnabled')) {
    neuStopTypingTimers();
    return;
  }
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
  if (!neuChatIsFeatureEnabled('typingEnabled')) {
    neuSetTypingRowVisible(false);
    return;
  }
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

function neuChatModalCardNode() {
  const nodes = Array.from(document.querySelectorAll('.neu-chat-modal-card')).filter((node) => node instanceof HTMLElement);
  if (!nodes.length) return null;

  const root = document.getElementById('neu-chat-root');
  const preferred =
    root instanceof HTMLElement
      ? nodes.find((node) => node.parentElement === root) || nodes[0]
      : nodes[0];
  const keep = preferred instanceof HTMLElement ? preferred : null;
  if (!(keep instanceof HTMLElement)) return null;

  nodes.forEach((node) => {
    if (node === keep) return;
    node.remove();
  });
  return keep;
}

function neuChatRootNode() {
  const existing = document.getElementById('neu-chat-root');
  if (existing instanceof HTMLElement) return existing;
  const node = document.createElement('div');
  node.id = 'neu-chat-root';
  node.className = 'neu-chat-root hidden';
  document.body.append(node);
  return node;
}

function neuSetChatRootMode(mode = '') {
  const root = neuChatRootNode();
  if (!(root instanceof HTMLElement)) return;
  const resolvedMode = String(mode || '').trim().toLowerCase();
  root.classList.remove('mode-modal', 'mode-dock', 'mode-inbox');
  if (resolvedMode === 'inbox') root.classList.add('mode-inbox');
  else if (resolvedMode === 'modal') root.classList.add('mode-modal');
  else root.classList.add('mode-dock');
  if (resolvedMode !== 'dock') {
    root.style.left = '';
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
  }
}

function neuSetChatRootOpen(open, mode = '') {
  const root = neuChatRootNode();
  if (!(root instanceof HTMLElement)) return;
  if (mode) neuSetChatRootMode(mode);
  const active = open === true;
  neuChatState.chatRootOpen = active;
  root.classList.toggle('hidden', !active);
  root.classList.toggle('is-open', active);
}

function neuIsChatRootOpen() {
  const root = neuChatRootNode();
  return root instanceof HTMLElement && !root.classList.contains('hidden') && root.classList.contains('is-open');
}

function neuChatDockNode() {
  const node = document.getElementById('neuChatDock');
  return node instanceof HTMLElement ? node : null;
}

function neuChatDockHostNode() {
  const node = document.getElementById('neuChatDockHost');
  return node instanceof HTMLElement ? node : null;
}

function neuChatDockThreadMountNode() {
  const node = document.getElementById('neuDockChatMount');
  return node instanceof HTMLElement ? node : null;
}

function neuDockInboxListNode() {
  const node = document.getElementById('neuDockInboxList');
  return node instanceof HTMLElement ? node : null;
}

function neuDockInboxSearchNode() {
  const node = document.getElementById('neuDockInboxSearch');
  return node instanceof HTMLInputElement ? node : null;
}

function neuInboxListNode() {
  const mode = String(neuChatState.hostMode || '').trim();
  if (mode === 'dock') {
    const dockList = neuDockInboxListNode();
    if (dockList instanceof HTMLElement) return dockList;
  }
  const inbox = document.getElementById('neuInboxList');
  if (inbox instanceof HTMLElement) return inbox;
  const legacy = document.getElementById('pulseConversations');
  return legacy instanceof HTMLElement ? legacy : null;
}

function neuInboxSearchNode() {
  const mode = String(neuChatState.hostMode || '').trim();
  if (mode === 'dock') {
    const dockSearch = neuDockInboxSearchNode();
    if (dockSearch instanceof HTMLInputElement) return dockSearch;
  }
  const inbox = document.getElementById('neuInboxSearch');
  if (inbox instanceof HTMLInputElement) return inbox;
  const legacy = document.getElementById('pulseChatSearchInput');
  return legacy instanceof HTMLInputElement ? legacy : null;
}

function neuChatSenderDisplayName(senderUid = '') {
  const uid = String(senderUid || '').trim();
  if (!uid) return 'Usuario';
  if (uid === neuCurrentUid()) return 'Tu';
  const profile = neuChatProfileCached(uid);
  return String(profile?.displayName || '').trim() || 'Usuario';
}

function neuMessageMetaFromMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const messageId = String(message.id || message.messageId || '').trim();
  if (!messageId) return null;
  const senderUid = String(message.senderUid || '').trim();
  const text = neuChatMessageText(message);
  const createdAtMs = neuTimeToMs(message.createdAt || message.sentAt || message.timestamp || message.updatedAt || null);
  return {
    messageId,
    senderUid,
    senderName: neuChatSenderDisplayName(senderUid),
    text,
    createdAtMs,
    message,
  };
}

function neuMessageMetaFromElement(node) {
  const item = node instanceof Element ? node.closest('.neuMessageItem') : null;
  if (!(item instanceof HTMLElement)) return null;
  const messageId = String(item.getAttribute('data-mid') || item.getAttribute('data-neu-msg-id') || '').trim();
  if (!messageId) return null;
  const senderUid = String(item.getAttribute('data-sender') || '').trim();
  const textFromDom = String(item.getAttribute('data-text') || '').trim();
  const tsFromDom = Number(item.getAttribute('data-ts'));
  const message = neuChatFindMessageById(messageId);
  const fallback = neuMessageMetaFromMessage(message);
  const senderName = senderUid ? neuChatSenderDisplayName(senderUid) : String(fallback?.senderName || 'Usuario');
  return {
    messageId,
    senderUid: senderUid || String(fallback?.senderUid || ''),
    senderName,
    text: textFromDom || String(fallback?.text || ''),
    createdAtMs: Number.isFinite(tsFromDom) && tsFromDom > 0 ? tsFromDom : Number(fallback?.createdAtMs || 0),
    message: message || fallback?.message || null,
  };
}

function neuNormalizeMessageMeta(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object') return null;
  const messageId = String(rawMeta.messageId || rawMeta.id || rawMeta.mid || '').trim();
  if (!messageId) return null;
  const senderUid = String(rawMeta.senderUid || rawMeta.sender || '').trim();
  const senderName = String(rawMeta.senderName || rawMeta.authorName || '').trim() || neuChatSenderDisplayName(senderUid);
  const text = String(rawMeta.text || rawMeta.content || '').trim();
  const createdAtMs = Number(rawMeta.createdAtMs || rawMeta.ts || 0);
  const message = rawMeta.message && typeof rawMeta.message === 'object' ? rawMeta.message : neuChatFindMessageById(messageId);
  return {
    messageId,
    senderUid: senderUid || String(message?.senderUid || '').trim(),
    senderName: senderName || neuChatSenderDisplayName(senderUid || String(message?.senderUid || '').trim()),
    text: text || neuChatMessageText(message),
    createdAtMs: Number.isFinite(createdAtMs) && createdAtMs > 0 ? createdAtMs : neuTimeToMs(message?.createdAt),
    message: message || null,
  };
}

function neuChatHiddenMessagesMap() {
  if (neuChatState.hiddenMessagesByConversation instanceof Map) return neuChatState.hiddenMessagesByConversation;
  const map = new Map();
  neuChatState.hiddenMessagesByConversation = map;
  return map;
}

function neuChatHiddenStorageKey(conversationId = '') {
  const convId = String(conversationId || '').trim();
  if (!convId) return '';
  return `${NEU_CHAT_HIDDEN_STORAGE_PREFIX}${convId}`;
}

function neuChatReadHiddenMessageIds(conversationId = '') {
  const key = neuChatHiddenStorageKey(conversationId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function neuChatPersistHiddenConversation(conversationId = '') {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const set = neuChatHiddenSetForConversation(convId);
  const key = neuChatHiddenStorageKey(convId);
  if (!key) return;
  try {
    const payload = Array.from(set.values());
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage write errors
  }
}

function neuChatHiddenSetForConversation(conversationId = '') {
  const convId = String(conversationId || '').trim();
  if (!convId) return new Set();
  const map = neuChatHiddenMessagesMap();
  if (!map.has(convId)) {
    const fromStorage = neuChatReadHiddenMessageIds(convId);
    map.set(convId, new Set(fromStorage));
  }
  const set = map.get(convId);
  return set instanceof Set ? set : new Set();
}

function neuSetReplyTo(messageMeta) {
  const meta = neuNormalizeMessageMeta(messageMeta);
  if (!meta?.messageId) return;
  const snippet = String(meta.text || '').replace(/\s+/g, ' ').trim().slice(0, NEU_CHAT_REPLY_SNIPPET_MAX) || '...';
  neuClearChatEditDraft();
  neuSetChatReplyDraft({
    messageId: meta.messageId,
    senderUid: String(meta.senderUid || '').trim(),
    senderName: String(meta.senderName || '').trim() || neuChatSenderDisplayName(meta.senderUid),
    snippet,
    createdAt: meta.createdAtMs || null,
  });
  const input = neuChatInputNode();
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.focus({ preventScroll: true });
}

function neuClearReplyTo() {
  neuClearChatReplyDraft();
}

async function neuCopyMessageText(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalized);
      neuChatSetHint('Copiado');
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const area = document.createElement('textarea');
    area.value = normalized;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    neuChatSetHint('Copiado');
    return true;
  } catch {
    neuChatSetHint('No se pudo copiar.', true);
    return false;
  }
}

function neuHideMessageLocal(conversationId = '', messageId = '') {
  const convId = String(conversationId || '').trim();
  const msgId = String(messageId || '').trim();
  if (!convId || !msgId) return false;
  const set = neuChatHiddenSetForConversation(convId);
  if (set.has(msgId)) return true;
  set.add(msgId);
  neuChatPersistHiddenConversation(convId);

  const replyDraft = neuChatNormalizeReplyPayload(neuChatState.replyDraft);
  if (replyDraft && String(replyDraft.messageId || '').trim() === msgId) neuClearReplyTo();
  const editDraft = neuChatNormalizeEditDraft(neuChatState.editDraft);
  if (editDraft && String(editDraft.messageId || '').trim() === msgId) neuClearChatEditDraft();

  if (convId === String(neuChatState.currentConversationId || '').trim()) {
    const selector = neuReactionMessageSelector(msgId);
    const messageNode = selector ? document.querySelector(`.neuMessageItem[data-neu-msg-id="${selector}"]`) : null;
    if (messageNode instanceof HTMLElement) messageNode.remove();
    neuRenderChatMessages();
  }
  const dockState = neuDockThreadWindowsState?.windows?.get(convId);
  if (dockState) neuDockThreadRenderMessages(dockState, { forceBottom: false });
  neuChatSetHint('Mensaje ocultado para ti.');
  return true;
}

function neuMsgMenuNode() {
  const node = document.getElementById('neuMsgMenu');
  if (node instanceof HTMLElement) return node;

  // Fallback if HTML wasn't updated.
  const menu = document.createElement('div');
  menu.id = 'neuMsgMenu';
  menu.className = 'neuMsgMenu hidden';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Opciones mensaje');
  menu.innerHTML = `
    <button data-action="msg-reply" type="button" role="menuitem">Responder</button>
    <button data-action="msg-copy" type="button" role="menuitem">Copiar</button>
    <button data-action="msg-hide-local" type="button" role="menuitem">Eliminar para mi</button>
    <button data-action="msg-delete-all" type="button" role="menuitem">Eliminar para todos</button>
  `;
  document.body.append(menu);
  return menu;
}

function neuCloseMsgMenu() {
  const menu = neuMsgMenuNode();
  if (!(menu instanceof HTMLElement)) return;
  menu.classList.add('hidden');
  menu.style.left = '';
  menu.style.top = '';
  neuChatState.menuMessageId = '';
  neuChatState.menuMessageMeta = null;
}

function neuCanDeleteMessageForAll(meta) {
  if (NEU_CHAT_ALLOW_DELETE_FOR_ALL !== true) return false;
  const messageMeta = neuNormalizeMessageMeta(meta);
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  if (!messageMeta?.messageId || !conversationId) return false;
  if (neuChatIsActionBlocked('delete_for_all', conversationId)) return false;
  if (neuChatIsActionBlocked('unsend_message', conversationId)) return false;
  if (neuChatIsActionBlocked('delete_message', conversationId)) return false;
  const message = messageMeta.message || neuChatFindMessageById(messageMeta.messageId);
  if (!message || message?.deletedAt) return false;
  return neuChatCanManageMessage(message, neuCurrentUid());
}

function neuMenuMessageMetaFromAnchor(anchor, explicitMeta = null) {
  const fromExplicit = neuNormalizeMessageMeta(explicitMeta);
  if (fromExplicit?.messageId) return fromExplicit;

  const anchorElement =
    anchor instanceof HTMLElement
      ? anchor
      : anchor && typeof anchor === 'object' && anchor.anchorEl instanceof HTMLElement
        ? anchor.anchorEl
        : null;
  const fromElement = neuMessageMetaFromElement(anchorElement);
  if (fromElement?.messageId) return fromElement;
  return null;
}

function neuOpenMsgMenu(anchor, explicitMeta = null) {
  const anchorElement =
    anchor instanceof HTMLElement
      ? anchor
      : anchor && typeof anchor === 'object' && anchor.anchorEl instanceof HTMLElement
        ? anchor.anchorEl
        : null;
  const menu = neuMsgMenuNode();
  if (!(menu instanceof HTMLElement)) return;

  const meta = neuMenuMessageMetaFromAnchor(anchor, explicitMeta);
  if (!meta?.messageId) return;

  const canReply = !meta?.message?.deletedAt;
  const canCopy = String(meta.text || '').trim().length > 0;
  const canDeleteAll = neuCanDeleteMessageForAll(meta);

  const replyBtn = menu.querySelector('[data-action="msg-reply"]');
  const copyBtn = menu.querySelector('[data-action="msg-copy"]');
  const hideLocalBtn = menu.querySelector('[data-action="msg-hide-local"]');
  const deleteAllBtn = menu.querySelector('[data-action="msg-delete-all"]');

  if (replyBtn instanceof HTMLButtonElement) {
    replyBtn.classList.toggle('hidden', !canReply);
    replyBtn.disabled = !canReply;
  }
  if (copyBtn instanceof HTMLButtonElement) {
    copyBtn.classList.toggle('hidden', !canCopy);
    copyBtn.disabled = !canCopy;
  }
  if (hideLocalBtn instanceof HTMLButtonElement) hideLocalBtn.disabled = false;
  if (deleteAllBtn instanceof HTMLButtonElement) {
    deleteAllBtn.classList.toggle('hidden', !canDeleteAll);
    deleteAllBtn.disabled = !canDeleteAll;
    deleteAllBtn.title = canDeleteAll ? '' : 'No disponible';
  }

  neuChatState.menuMessageId = meta.messageId;
  neuChatState.menuMessageMeta = meta;

  // Show off-screen first to measure.
  menu.classList.remove('hidden');
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';

  const margin = 12;
  const width = Math.max(180, Math.round(menu.offsetWidth || 180));
  const height = Math.max(44, Math.round(menu.offsetHeight || 44));
  const pointX = Number(anchor && typeof anchor === 'object' ? anchor.clientX : NaN);
  const pointY = Number(anchor && typeof anchor === 'object' ? anchor.clientY : NaN);
  let baseX = Number.isFinite(pointX) ? pointX : 0;
  let baseY = Number.isFinite(pointY) ? pointY : 0;
  if ((!baseX && !baseY) && anchorElement instanceof HTMLElement) {
    const r = anchorElement.getBoundingClientRect();
    baseX = r.left;
    baseY = r.bottom + 6;
  }
  if (!baseX && !baseY) {
    baseX = Math.round(window.innerWidth / 2);
    baseY = Math.round(window.innerHeight / 2);
  }
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, baseX));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, baseY));

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function neuChatHeaderMenuNode() {
  const existing = document.getElementById('neuChatHeaderMenu');
  if (existing instanceof HTMLElement) return existing;
  const menu = document.createElement('div');
  menu.id = 'neuChatHeaderMenu';
  menu.className = 'neuChatHeaderMenu hidden';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Opciones del chat');
  menu.innerHTML = `
    <button type="button" role="menuitem" data-neu-chat-head-menu="mute">Silenciar</button>
    <button type="button" role="menuitem" data-neu-chat-head-menu="copy">Copiar enlace / ID conversación</button>
    <button type="button" role="menuitem" data-neu-chat-head-menu="report">Reportar</button>
    <button type="button" role="menuitem" data-neu-chat-head-menu="delete" class="is-danger">Eliminar conversación</button>
  `;
  document.body.append(menu);
  return menu;
}

function neuCanDeleteConversationOption(conversationId = '') {
  const convId = String(conversationId || neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return false;
  if (neuChatIsActionBlocked('delete_conversation', convId)) return false;
  const meta = neuChatState.currentConversationMeta && typeof neuChatState.currentConversationMeta === 'object' ? neuChatState.currentConversationMeta : {};
  const owners = [meta.ownerUid, meta.createdBy, meta.adminUid, meta.moderatorUid]
    .map((row) => String(row || '').trim())
    .filter(Boolean);
  return owners.includes(meUid);
}

function neuRenderChatHeaderMenu() {
  const menu = neuChatHeaderMenuNode();
  if (!(menu instanceof HTMLElement)) return;
  const convId = String(neuChatState.currentConversationId || '').trim();
  const muted = neuChatState.localMutedConversations instanceof Set ? neuChatState.localMutedConversations.has(convId) : false;
  const muteBtn = menu.querySelector('[data-neu-chat-head-menu="mute"]');
  const deleteBtn = menu.querySelector('[data-neu-chat-head-menu="delete"]');
  if (muteBtn instanceof HTMLButtonElement) {
    muteBtn.textContent = muted ? 'Activar sonido' : 'Silenciar';
  }
  if (deleteBtn instanceof HTMLButtonElement) {
    deleteBtn.classList.toggle('hidden', !neuCanDeleteConversationOption(convId));
  }
}

function neuCloseChatHeaderMenu() {
  const menu = neuChatHeaderMenuNode();
  if (!(menu instanceof HTMLElement)) return;
  menu.classList.add('hidden');
  menu.style.left = '';
  menu.style.top = '';
}

function neuOpenChatHeaderMenu(anchorButton) {
  const trigger = anchorButton instanceof HTMLElement ? anchorButton : null;
  const menu = neuChatHeaderMenuNode();
  const convId = String(neuChatState.currentConversationId || '').trim();
  if (!trigger || !(menu instanceof HTMLElement) || !convId) return;
  neuRenderChatHeaderMenu();
  menu.classList.remove('hidden');
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';

  const rect = trigger.getBoundingClientRect();
  const width = Math.max(220, Math.round(menu.offsetWidth || 220));
  const height = Math.max(44, Math.round(menu.offsetHeight || 44));
  const margin = 12;
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.right - width));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, rect.bottom + 6));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

async function neuCopyConversationInfo() {
  const convId = String(neuChatState.currentConversationId || '').trim();
  if (!convId) return;
  const chatUrl = `${location.origin}${location.pathname}?chat=${encodeURIComponent(convId)}`;
  const payload = `ID: ${convId}\n${chatUrl}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      neuChatSetHint('Copiado al portapapeles.');
      return;
    }
  } catch {
    // fallback below
  }
  try {
    const area = document.createElement('textarea');
    area.value = payload;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    neuChatSetHint('Copiado al portapapeles.');
  } catch {
    neuChatSetHint('No se pudo copiar.', true);
  }
}

function neuToggleConversationMuteLocal() {
  const convId = String(neuChatState.currentConversationId || '').trim();
  if (!convId || !(neuChatState.localMutedConversations instanceof Set)) return;
  if (neuChatState.localMutedConversations.has(convId)) {
    neuChatState.localMutedConversations.delete(convId);
    neuChatSetHint('Sonido activado.');
  } else {
    neuChatState.localMutedConversations.add(convId);
    neuChatSetHint('Chat silenciado.');
  }
  neuRenderChatHeaderMenu();
}

async function neuDeleteConversationForCurrentUser() {
  const convId = String(neuChatState.currentConversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;
  if (!neuCanDeleteConversationOption(convId)) return;
  if (!window.confirm('Eliminar conversación de tu inbox?')) return;
  try {
    await deleteDoc(doc(db, 'neuUserChats', meUid, 'chats', convId));
    neuCloseChatHeaderMenu();
    neuChatSetHint('Conversación eliminada de tu inbox.');
    if (String(neuChatState.currentConversationId || '').trim() === convId) {
      neuCloseChatModal();
      neuSetChatDockOpen(false);
    }
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'delete_conversation', convId, 'Sin permisos para eliminar conversación.')) {
      neuCloseChatHeaderMenu();
      return;
    }
    const code = neuChatErrorCode(error) || 'unknown';
    neuChatSetHint(`No se pudo eliminar la conversación (${code}).`, true);
  }
}

function neuMenuEdit() {
  const msgId = String(neuChatState.menuMessageId || '').trim();
  neuCloseMsgMenu();
  if (!msgId) return;
  neuStartChatEditDraft(msgId);
}

function neuMenuReply() {
  const meta = neuNormalizeMessageMeta(neuChatState.menuMessageMeta) || neuNormalizeMessageMeta({ messageId: neuChatState.menuMessageId });
  neuCloseMsgMenu();
  if (!meta?.messageId) return;
  neuSetReplyTo(meta);
}

function neuMenuCopy() {
  const meta = neuNormalizeMessageMeta(neuChatState.menuMessageMeta) || neuNormalizeMessageMeta({ messageId: neuChatState.menuMessageId });
  neuCloseMsgMenu();
  if (!meta?.messageId) return;
  const text = String(meta.text || '').trim();
  if (!text) {
    neuChatSetHint('Brak tekstu do skopiowania.', true);
    return;
  }
  neuCopyMessageText(text).catch(() => neuChatSetHint('No se pudo copiar.', true));
}

function neuMenuHideLocal() {
  const meta = neuNormalizeMessageMeta(neuChatState.menuMessageMeta) || neuNormalizeMessageMeta({ messageId: neuChatState.menuMessageId });
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  neuCloseMsgMenu();
  if (!conversationId || !meta?.messageId) return;
  neuHideMessageLocal(conversationId, meta.messageId);
}

function neuMenuDeleteAll() {
  const msgId = String(neuChatState.menuMessageId || '').trim();
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  neuCloseMsgMenu();
  if (!msgId || !conversationId) return;
  if (NEU_CHAT_ALLOW_DELETE_FOR_ALL !== true) return;
  if (
    neuChatIsActionBlocked('delete_for_all', conversationId) ||
    neuChatIsActionBlocked('unsend_message', conversationId) ||
    neuChatIsActionBlocked('delete_message', conversationId)
  ) {
    neuChatBlockAction('delete_for_all', conversationId, 'Sin permisos para eliminar para todos');
    return;
  }
  neuUnsendChatMessage(msgId).catch((error) => {
    const code = neuChatErrorCode(error) || 'unknown';
    if (NEU_QA) console.debug('[neu-chat] delete-for-all failed', code, error?.message);
    if (neuIsPermissionDenied(error)) {
      neuChatBlockAction('delete_for_all', conversationId, 'Sin permisos para eliminar para todos');
      neuChatBlockAction('unsend_message', conversationId, 'Sin permisos para eliminar para todos');
      neuChatBlockAction('delete_message', conversationId, 'Sin permisos para eliminar para todos');
      return;
    }
    neuChatSetHint(`No se pudo eliminar para todos (${code}).`, true);
  });
}

function neuMenuDelete() {
  neuMenuHideLocal();
}

async function neuUnsendChatMessage(messageId) {
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const msgId = String(messageId || '').trim();
  const meUid = neuCurrentUid();
  if (!conversationId || !msgId || !meUid) return;
  if (neuChatIsActionBlocked('unsend_message', conversationId)) return;

  const message = neuChatFindMessageById(msgId);
  if (!message || !neuChatCanManageMessage(message, meUid)) {
    neuChatSetHint('No puedes eliminar este mensaje.', true);
    return;
  }
  if (message?.deletedAt) return;

  try {
    await updateDoc(doc(db, 'neuConversations', conversationId, 'messages', msgId), {
      text: 'Mensaje eliminado',
      content: 'Mensaje eliminado',
      imageUrl: null,
      imageStoragePath: deleteField(),
      postRef: deleteField(),
      postUrl: deleteField(),
      deletedAt: serverTimestamp(),
      unsentAt: serverTimestamp(),
      unsentBy: meUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'unsend_message', conversationId, 'Sin permisos para cofniecie wiadomosci.')) return;
    throw error;
  }

  const editDraft = neuChatNormalizeEditDraft(neuChatState.editDraft);
  if (editDraft && editDraft.messageId === msgId) {
    neuClearChatEditDraft();
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.value = '';
      if (input instanceof HTMLTextAreaElement) neuChatAutoGrow(input);
    }
  }
}

function neuMenuUnsend() {
  if (NEU_CHAT_ALLOW_DELETE_FOR_ALL !== true) {
    neuMenuHideLocal();
    return;
  }
  neuMenuDeleteAll();
}

function neuInboxEmptyNode() {
  const node = document.getElementById('neuInboxEmpty');
  return node instanceof HTMLElement ? node : null;
}

function neuInboxChatHostNode() {
  const node = document.getElementById('neuInboxChatHost');
  return node instanceof HTMLElement ? node : null;
}

function neuIsMobileChatViewport() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function neuIsPulsePortalActive() {
  const bodyPortal = String(document.body?.dataset?.portal || '').trim().toLowerCase();
  if (bodyPortal === 'pulse') return true;
  const routePortal = String(new URLSearchParams(location.search).get('portal') || '').trim().toLowerCase();
  return routePortal === 'pulse';
}

function neuCanUseInboxHost() {
  return !neuIsMobileChatViewport() && neuIsPulsePortalActive() && neuInboxChatHostNode() instanceof HTMLElement;
}

function neuCanUseDockHost() {
  return !neuIsMobileChatViewport() && neuChatRootNode() instanceof HTMLElement;
}

function neuResolveChatHostMode(requestedMode = '') {
  const requested = String(requestedMode || '').trim().toLowerCase();
  if (requested === 'modal') return 'modal';
  if (requested === 'dock') return neuCanUseDockHost() ? 'dock' : 'modal';
  if (requested === 'inbox') return neuCanUseInboxHost() ? 'inbox' : neuCanUseDockHost() ? 'dock' : 'modal';
  if (neuCanUseDockHost()) return 'dock';
  if (neuCanUseInboxHost()) return 'inbox';
  return 'modal';
}

function neuSetInboxPanelOpen(open) {
  const host = neuInboxChatHostNode();
  const empty = neuInboxEmptyNode();
  const active = open === true;
  if (host instanceof HTMLElement) host.classList.add('hidden');
  if (empty instanceof HTMLElement) empty.classList.toggle('hidden', active);
  if (String(neuChatState.hostMode || '').trim() === 'inbox') {
    neuSetChatRootOpen(active, 'inbox');
  }
}

function neuChatDockBackdropNode() {
  let node = document.getElementById('neuChatDockBackdrop');
  if (node instanceof HTMLElement) return node;
  node = document.createElement('div');
  node.id = 'neuChatDockBackdrop';
  node.className = 'neuChatDockBackdrop hidden';
  node.setAttribute('aria-hidden', 'true');
  document.body.append(node);
  return node;
}

function neuSetChatDockBackdropOpen(open) {
  const backdrop = neuChatDockBackdropNode();
  if (!(backdrop instanceof HTMLElement)) return;
  backdrop.classList.add('hidden');
}

function neuMountChatCardForMode(mode = '') {
  const rawMode = String(mode || '').trim().toLowerCase();
  const targetMode = rawMode === 'inbox' ? 'inbox' : rawMode === 'dock' ? 'dock' : 'modal';
  const card = neuChatModalCardNode();
  const modal = neuChatModalNode();
  const root = neuChatRootNode();
  if (!(card instanceof HTMLElement) || !(root instanceof HTMLElement)) return false;
  if (card.parentElement !== root) root.append(card);
  if (modal instanceof HTMLElement) modal.hidden = true;
  neuSetChatRootMode(targetMode);
  neuChatRecomputeModalLock();
  neuBindChatScrollSurface(true);
  return true;
}

function neuSetChatDockOpen(open, options = {}) {
  const persist = options.persist !== false;
  const active = open === true;
  neuChatState.dockOpen = active;
  if (String(neuChatState.hostMode || '').trim() === 'dock') {
    neuSetChatRootOpen(active, 'dock');
  }
  if (persist && neuCanUseDockHost()) neuChatSaveDockOpenPreference(active);
  if (active) neuPositionDockToLauncher();
  neuLayoutDockThreadWindows();
}

function neuPositionDockToLauncher() {
  const mode = String(neuChatState.hostMode || '').trim();
  const root = neuChatRootNode();
  const dockTarget = mode === 'dock' && root instanceof HTMLElement ? root : null;
  const flag = neuChatFloatNode();
  if (!(dockTarget instanceof HTMLElement) || !(flag instanceof HTMLElement)) return;
  if (dockTarget.classList.contains('hidden')) return;
  if (neuIsMobileChatViewport()) return;

  const flagRect = flag.getBoundingClientRect();
  const dockWidth = Math.max(280, Math.round(dockTarget.offsetWidth || 360));
  const dockHeight = Math.max(320, Math.round(dockTarget.offsetHeight || 520));
  const gap = 10;
  const margin = 12;

  let left = flagRect.right - dockWidth;
  left = neuClampNumber(left, margin, Math.max(margin, window.innerWidth - dockWidth - margin));

  let top = flagRect.top - dockHeight - gap;
  if (top < margin) top = flagRect.bottom + gap;
  top = neuClampNumber(top, margin, Math.max(margin, window.innerHeight - dockHeight - margin));

  dockTarget.style.left = `${Math.round(left)}px`;
  dockTarget.style.top = `${Math.round(top)}px`;
  dockTarget.style.right = 'auto';
  dockTarget.style.bottom = 'auto';
  neuLayoutDockThreadWindows();
}

function neuPositionDockNearFlag() {
  neuPositionDockToLauncher();
}

function neuDockThreadWindowWidth() {
  const firstId = neuDockThreadWindowsState.order[neuDockThreadWindowsState.order.length - 1] || '';
  const firstState = firstId ? neuDockThreadWindowsState.windows.get(firstId) : null;
  if (firstState?.windowEl instanceof HTMLElement) {
    const width = Math.round(firstState.windowEl.getBoundingClientRect().width);
    if (width > 0) return width;
  }
  return 360;
}

function neuDockThreadBaseRightOffset() {
  const root = neuChatRootNode();
  if (!(root instanceof HTMLElement) || root.classList.contains('hidden')) return NEU_DOCK_THREAD_MARGIN;
  const width = Math.round(root.getBoundingClientRect().width);
  return NEU_DOCK_THREAD_MARGIN + Math.max(0, width) + NEU_DOCK_THREAD_GAP;
}

function neuDockBubbleTrayNode() {
  let node = document.getElementById('neuDockBubbleTray');
  if (node instanceof HTMLElement) return node;
  node = document.createElement('div');
  node.id = 'neuDockBubbleTray';
  node.className = 'neuDockBubbleTray hidden';
  document.body.append(node);
  return node;
}

function neuDockThreadUnreadForConversation(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId || !Array.isArray(neuChatState.listRows)) return 0;
  const row = neuChatState.listRows.find((item) => String(item?.conversationId || '').trim() === convId) || null;
  return neuUnreadValue(row?.unreadCount);
}

function neuEnsureDockBubble(state) {
  if (!state) return null;
  if (state.bubbleEl instanceof HTMLButtonElement) return state.bubbleEl;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'neuDockBubble';
  button.setAttribute('aria-label', 'Abrir chat');
  button.innerHTML = `
    <span class="avatar-frame neuDockBubbleAvatar">
      <img alt="avatar" />
      <span>U</span>
    </span>
    <span class="neu-unread-badge neuDockBubbleUnread hidden"></span>
  `;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    neuRestoreDockThreadWindow(state.conversationId, { focus: true });
  });
  state.bubbleEl = button;
  return button;
}

function neuRenderDockBubble(state) {
  if (!state) return;
  const button = neuEnsureDockBubble(state);
  if (!(button instanceof HTMLButtonElement)) return;
  const profile = neuChatProfileCached(state.peerUid);
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const avatarUrl = String(profile.avatarUrl || '').trim();
  const avatarImg = button.querySelector('.neuDockBubbleAvatar img');
  const avatarFallback = button.querySelector('.neuDockBubbleAvatar span');
  neuSetAvatarElements(avatarImg, avatarFallback, avatarUrl, displayName);
  button.title = displayName;
  button.setAttribute('aria-label', `Abrir chat: ${displayName}`);
  const unread = neuDockThreadUnreadForConversation(state.conversationId);
  const badge = button.querySelector('.neuDockBubbleUnread');
  if (badge instanceof HTMLElement) {
    const label = neuUnreadBadgeLabel(unread);
    badge.textContent = label;
    badge.classList.toggle('hidden', !label);
    if (label) badge.setAttribute('aria-label', `Sin leer: ${unread}`);
  }
}

function neuRenderDockBubbleTray() {
  const tray = neuDockBubbleTrayNode();
  if (!(tray instanceof HTMLElement)) return;
  if (neuIsMobileChatViewport()) {
    tray.classList.add('hidden');
    tray.innerHTML = '';
    return;
  }

  const minimizedIds = neuDockThreadWindowsState.minimizedOrder.filter((id) => {
    const state = neuDockThreadWindowsState.windows.get(id);
    return !!state && state.minimized === true;
  });

  if (!minimizedIds.length) {
    tray.classList.add('hidden');
    tray.innerHTML = '';
    return;
  }

  const rightOffset = neuDockThreadBaseRightOffset();
  const maxWidth = Math.max(140, window.innerWidth - rightOffset - NEU_DOCK_THREAD_MARGIN);
  tray.style.right = `${Math.max(NEU_DOCK_THREAD_MARGIN, Math.round(rightOffset))}px`;
  tray.style.bottom = `${NEU_DOCK_BUBBLE_BOTTOM}px`;
  tray.style.maxWidth = `${Math.round(maxWidth)}px`;

  const frag = document.createDocumentFragment();
  [...minimizedIds].reverse().forEach((conversationId) => {
    const state = neuDockThreadWindowsState.windows.get(conversationId);
    if (!state) return;
    neuRenderDockBubble(state);
    if (state.bubbleEl instanceof HTMLElement) frag.append(state.bubbleEl);
  });
  tray.innerHTML = '';
  tray.append(frag);
  tray.classList.remove('hidden');
}

function neuDockThreadIsNearBottom(bodyEl, threshold = NEU_CHAT_SCROLL_NEAR_BOTTOM) {
  if (!(bodyEl instanceof HTMLElement)) return true;
  return bodyEl.scrollHeight - (bodyEl.scrollTop + bodyEl.clientHeight) <= threshold;
}

function neuDockThreadScrollBottom(state, behavior = 'auto') {
  if (!state || !(state.bodyEl instanceof HTMLElement)) return;
  state.bodyEl.scrollTo({ top: state.bodyEl.scrollHeight, behavior });
}

function neuDockThreadScrollBottomAfterPaint(state, behavior = 'auto') {
  if (!state || !(state.bodyEl instanceof HTMLElement)) return;
  const run = () => {
    if (!state || !(state.bodyEl instanceof HTMLElement)) return;
    neuDockThreadScrollBottom(state, behavior);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    return;
  }
  run();
}

function neuDockThreadSetJumpVisible(state, visible) {
  if (!state) return;
  state.newMessageChipVisible = visible === true;
  if (!(state.jumpEl instanceof HTMLElement)) return;
  state.jumpEl.classList.toggle('hidden', !state.newMessageChipVisible);
}

function neuDockThreadSkeletonRowsHtml(rows = 8) {
  const count = Math.max(4, Math.min(10, Number(rows) || 8));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 'incoming' : 'outgoing';
    const width = side === 'incoming' ? 56 + (i % 3) * 8 : 48 + (i % 4) * 9;
    out.push(`
      <div class="neuDockThreadSkeletonRow ${side}">
        <span class="neuDockThreadSkeletonBubble" style="width:${width}%"></span>
      </div>
    `);
  }
  return `<div class="neuDockThreadSkeleton">${out.join('')}</div>`;
}

function neuDockThreadUpdateTypingUi(state, visible, label = 'Escribiendo...') {
  if (!state || !(state.typingEl instanceof HTMLElement)) return;
  state.typingEl.textContent = label;
  state.typingEl.classList.toggle('hidden', !visible);
}

function neuDockThreadStopTypingTimers(state) {
  if (!state) return;
  if (state.typingDebounceTimer) {
    window.clearTimeout(state.typingDebounceTimer);
    state.typingDebounceTimer = 0;
  }
  if (state.typingIdleTimer) {
    window.clearTimeout(state.typingIdleTimer);
    state.typingIdleTimer = 0;
  }
}

async function neuDockThreadSetOwnTyping(state, typing, options = {}) {
  if (!state) return;
  const meUid = neuCurrentUid();
  const chatId = String(state.conversationId || '').trim();
  if (!meUid || !chatId) return;
  if (!neuChatIsFeatureEnabled('typingEnabled')) return;
  if (neuChatIsActionBlocked('typing', chatId)) return;
  const nextTyping = typing === true;
  if (state.typingActive === nextTyping && !options.force) return;
  state.typingActive = nextTyping;

  const payload = {
    typing: nextTyping,
    updatedAt: serverTimestamp(),
  };
  const meProfile = neuProfileState.profile || neuDefaultProfile(meUid);
  const displayName = String(meProfile.displayName || meProfile.name || auth.currentUser?.displayName || '').trim();
  const avatarUrl = String(meProfile.avatarUrl || auth.currentUser?.photoURL || '').trim();
  if (displayName) payload.displayName = displayName;
  if (avatarUrl) payload.avatarUrl = avatarUrl;

  try {
    await setDoc(doc(db, 'neuChatTyping', chatId, 'users', meUid), payload, { merge: true });
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      neuChatDisableFeature('typingEnabled', 'Sin permisos para estado "escribiendo".', {
        action: 'typing',
        conversationId: chatId,
      });
      return;
    }
    if (options.bestEffort) return;
    throw error;
  }
}

function neuDockThreadHandleTypingInput(state, rawValue = '') {
  if (!state) return;
  if (!neuChatIsFeatureEnabled('typingEnabled')) {
    neuDockThreadStopTypingTimers(state);
    return;
  }
  const text = String(rawValue || '').trim();
  neuDockThreadStopTypingTimers(state);

  if (!text) {
    neuDockThreadSetOwnTyping(state, false, { bestEffort: true }).catch(() => null);
    return;
  }

  state.typingDebounceTimer = window.setTimeout(() => {
    state.typingDebounceTimer = 0;
    neuDockThreadSetOwnTyping(state, true, { bestEffort: true }).catch(() => null);
  }, NEU_CHAT_TYPING_DEBOUNCE_MS);

  state.typingIdleTimer = window.setTimeout(() => {
    state.typingIdleTimer = 0;
    neuDockThreadSetOwnTyping(state, false, { bestEffort: true }).catch(() => null);
  }, NEU_CHAT_TYPING_IDLE_MS);
}

function neuDockThreadRenderHeader(state) {
  if (!state) return;
  const profile = neuChatProfileCached(state.peerUid);
  const displayName = String(profile.displayName || '').trim() || 'Usuario';
  const handle = neuEnsureHandle(profile.handle, displayName, state.peerUid);
  const avatarUrl = String(profile.avatarUrl || '').trim();
  neuSetAvatarElements(state.avatarImgEl, state.avatarFallbackEl, avatarUrl, displayName);
  if (state.nameEl instanceof HTMLElement) state.nameEl.textContent = displayName;
  if (state.handleEl instanceof HTMLElement) state.handleEl.textContent = handle;
}

function neuDockThreadRenderMessages(state, options = {}) {
  if (!state || !(state.messagesEl instanceof HTMLElement) || !(state.bodyEl instanceof HTMLElement)) return;
  const allMessages = Array.isArray(state.messages) ? state.messages : [];
  const conversationId = String(state.conversationId || '').trim();
  const hiddenSet = neuChatHiddenSetForConversation(conversationId);
  const list = allMessages.filter((item) => {
    const id = String(item?.id || '').trim();
    return !id || !hiddenSet.has(id);
  });
  const meUid = neuCurrentUid();
  const shouldStickBottom = options.forceBottom === true || state.nearBottom === true;

  if (!list.length) {
    if (state.hasSnapshot !== true) {
      state.messagesEl.innerHTML = neuDockThreadSkeletonRowsHtml(NEU_CHAT_OPEN_SKELETON_ROWS);
    } else {
      const emptyText = allMessages.length ? 'No hay mensajes visibles' : 'Empieza la conversacion';
      state.messagesEl.innerHTML = `<div class="neuDockThreadEmpty">${esc(emptyText)}</div>`;
    }
    neuDockThreadSetJumpVisible(state, false);
    neuDockThreadUpdateTypingUi(state, state.peerTyping === true);
    return;
  }

  const html = list
    .map((item) => {
      const senderUid = String(item?.senderUid || '').trim();
      const mine = !!meUid && senderUid === meUid;
      const rowClass = mine ? 'outgoing' : 'incoming';
      const text = esc(neuChatMessageText(item)).replace(/\n/g, '<br />');
      const imageUrl = String(item?.imageUrl || '').trim();
      const deleted = !!item?.deletedAt;
      const safeText = deleted ? 'Mensaje eliminado' : text || '';
      const bodyHtml = imageUrl
        ? `<img class="neuDockThreadImage" loading="lazy" src="${esc(imageUrl)}" alt="chat image" />${safeText ? `<div class="neuDockThreadText">${safeText}</div>` : ''}`
        : `<div class="neuDockThreadText">${safeText || '-'}</div>`;
      const meta = neuChatFormatClock(item?.createdAt);
      return `
        <div class="neuDockThreadMsgRow ${rowClass}">
          <div class="neuDockThreadBubble${deleted ? ' is-deleted' : ''}">
            ${bodyHtml}
          </div>
          <div class="neuDockThreadMeta">${esc(meta)}</div>
        </div>
      `;
    })
    .join('');

  state.messagesEl.innerHTML = html;
  neuDockThreadUpdateTypingUi(state, state.peerTyping === true);
  neuDockThreadSetJumpVisible(state, state.newMessageChipVisible === true && !state.nearBottom);

  if (shouldStickBottom) {
    neuDockThreadScrollBottomAfterPaint(state, options.behavior || 'auto');
  }
}

function neuDockThreadStopListeners(state, options = {}) {
  if (!state) return;
  if (typeof state.messageUnsub === 'function') state.messageUnsub();
  if (typeof state.typingUnsub === 'function') state.typingUnsub();
  state.messageUnsub = null;
  state.typingUnsub = null;
  neuDockThreadStopTypingTimers(state);
  neuDockThreadSetOwnTyping(state, false, { bestEffort: true, force: true }).catch(() => null);
  if (!options.keepDom && state.windowEl instanceof HTMLElement) state.windowEl.remove();
}

function neuMinimizeDockThreadWindow(conversationId, options = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const state = neuDockThreadWindowsState.windows.get(convId);
  if (!state) return;
  if (state.bodyEl instanceof HTMLElement) {
    state.savedScrollTop = state.bodyEl.scrollTop;
  }
  state.minimized = true;
  if (state.windowEl instanceof HTMLElement) state.windowEl.classList.add('hidden');
  if (!neuDockThreadWindowsState.minimizedOrder.includes(convId)) {
    neuDockThreadWindowsState.minimizedOrder.push(convId);
  }
  neuDockThreadSetOwnTyping(state, false, { bestEffort: true }).catch(() => null);
  if (!options.skipLayout) neuLayoutDockThreadWindows();
  neuRenderDockBubbleTray();
}

function neuRestoreDockThreadWindow(conversationId, options = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const state = neuDockThreadWindowsState.windows.get(convId);
  if (!state) return;
  if (!state.minimized) {
    if (options.focus !== false && state.inputEl instanceof HTMLTextAreaElement) {
      state.inputEl.focus({ preventScroll: true });
    }
    return;
  }

  state.minimized = false;
  neuDockThreadWindowsState.minimizedOrder = neuDockThreadWindowsState.minimizedOrder.filter((id) => id !== convId);
  if (state.windowEl instanceof HTMLElement) state.windowEl.classList.remove('hidden');
  neuDockThreadRenderHeader(state);
  neuDockThreadRenderMessages(state, { forceBottom: false, behavior: 'auto' });
  if (state.bodyEl instanceof HTMLElement && Number.isFinite(state.savedScrollTop)) {
    neuAfterNextPaint(() => {
      if (!(state.bodyEl instanceof HTMLElement)) return;
      state.bodyEl.scrollTop = Number(state.savedScrollTop || 0);
    });
  }
  neuLayoutDockThreadWindows();
  neuRenderDockBubbleTray();
  if (options.focus !== false && state.inputEl instanceof HTMLTextAreaElement) {
    state.inputEl.focus({ preventScroll: true });
  }
}

function neuLayoutDockThreadWindows() {
  const states = neuDockThreadWindowsState;
  if (!states || !Array.isArray(states.order)) return;
  if (neuIsMobileChatViewport()) {
    states.order.forEach((id) => {
      const win = states.windows.get(id);
      if (win?.windowEl instanceof HTMLElement) win.windowEl.classList.add('hidden');
    });
    neuRenderDockBubbleTray();
    return;
  }

  const baseRight = neuDockThreadBaseRightOffset();
  const availableWidth = Math.max(0, window.innerWidth - NEU_DOCK_THREAD_MARGIN * 2);
  const windowWidth = neuDockThreadWindowWidth();
  const perWindow = windowWidth + NEU_DOCK_THREAD_GAP;
  let maxByViewport = Math.floor((availableWidth - baseRight + NEU_DOCK_THREAD_GAP) / perWindow);
  if (!Number.isFinite(maxByViewport)) maxByViewport = 0;
  maxByViewport = Math.max(0, maxByViewport);

  const visibleCap = Math.max(0, Math.min(NEU_DOCK_THREAD_MAX_WINDOWS, maxByViewport));
  const openIds = states.order.filter((conversationId) => {
    const state = states.windows.get(conversationId);
    return !!state && state.minimized !== true;
  });

  while (openIds.length > visibleCap) {
    const oldestOpenId = openIds.shift();
    if (!oldestOpenId) break;
    neuMinimizeDockThreadWindow(oldestOpenId, { reason: 'viewport', skipLayout: true });
  }

  const orderedNewestFirst = [...states.order]
    .filter((conversationId) => {
      const state = states.windows.get(conversationId);
      return !!state && state.minimized !== true;
    })
    .reverse();

  orderedNewestFirst.forEach((conversationId, index) => {
    const state = states.windows.get(conversationId);
    if (!state?.windowEl) return;
    const right = baseRight + index * (windowWidth + NEU_DOCK_THREAD_GAP);
    state.windowEl.style.right = `${Math.max(NEU_DOCK_THREAD_MARGIN, Math.round(right))}px`;
    state.windowEl.style.bottom = `${NEU_DOCK_THREAD_BOTTOM}px`;
    state.windowEl.style.zIndex = `${999996 + index}`;
    state.windowEl.classList.remove('hidden');
  });

  states.order.forEach((conversationId) => {
    const state = states.windows.get(conversationId);
    if (!state?.windowEl || state.minimized === true) return;
    if (orderedNewestFirst.includes(conversationId)) return;
    state.windowEl.classList.add('hidden');
  });

  neuRenderDockBubbleTray();
}

function neuBringDockThreadWindowToFront(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const order = neuDockThreadWindowsState.order;
  const index = order.indexOf(convId);
  if (index >= 0) order.splice(index, 1);
  order.push(convId);
  neuLayoutDockThreadWindows();
}

function neuWireDockThreadWindowResize() {
  if (neuDockThreadWindowsState.resizeWired === true) return;
  neuDockThreadWindowsState.resizeWired = true;
  window.addEventListener(
    'resize',
    () => {
      neuLayoutDockThreadWindows();
    },
    { passive: true },
  );
}

function neuCreateDockThreadWindow(conversationId) {
  const convId = String(conversationId || '').trim();
  if (!convId) return null;

  const wrap = document.createElement('section');
  wrap.className = 'neuDockThreadWindow';
  wrap.setAttribute('data-neu-dock-conversation', convId);
  wrap.innerHTML = `
    <div class="neuDockThreadWindowCard">
      <header class="neuDockThreadWindowHead">
        <span class="avatar-frame neuDockThreadAvatar">
          <img alt="avatar" />
          <span>U</span>
        </span>
        <span class="neuDockThreadPeerCopy">
          <strong>Usuario</strong>
          <span>@usuario</span>
        </span>
        <button class="btn-white-outline neuDockThreadCloseBtn" type="button" aria-label="Cerrar chat">Cerrar</button>
      </header>
      <div class="neuDockThreadWindowBody">
        <div class="neuDockThreadMessages"></div>
        <div class="neuDockThreadTyping hidden">Escribiendo...</div>
        <button class="neuDockThreadJump hidden" type="button">Nuevos mensajes</button>
      </div>
      <form class="neuDockThreadComposer" autocomplete="off">
        <textarea class="input neuDockThreadInput" rows="1" maxlength="1000" placeholder="Escribe un mensaje..."></textarea>
        <button class="btn-white-outline neuDockThreadSendBtn" type="submit" aria-label="Enviar">></button>
      </form>
    </div>
  `;
  document.body.append(wrap);

  const avatarWrap = wrap.querySelector('.neuDockThreadAvatar');
  const avatarImgEl = avatarWrap?.querySelector('img') || null;
  const avatarFallbackEl = avatarWrap?.querySelector('span') || null;
  const nameEl = wrap.querySelector('.neuDockThreadPeerCopy strong');
  const handleEl = wrap.querySelector('.neuDockThreadPeerCopy span');
  const bodyEl = wrap.querySelector('.neuDockThreadWindowBody');
  const messagesEl = wrap.querySelector('.neuDockThreadMessages');
  const typingEl = wrap.querySelector('.neuDockThreadTyping');
  const jumpEl = wrap.querySelector('.neuDockThreadJump');
  const formEl = wrap.querySelector('.neuDockThreadComposer');
  const inputEl = wrap.querySelector('.neuDockThreadInput');
  const closeEl = wrap.querySelector('.neuDockThreadCloseBtn');

  const state = {
    conversationId: convId,
    windowEl: wrap,
    avatarImgEl: avatarImgEl instanceof HTMLImageElement ? avatarImgEl : null,
    avatarFallbackEl: avatarFallbackEl instanceof HTMLElement ? avatarFallbackEl : null,
    nameEl: nameEl instanceof HTMLElement ? nameEl : null,
    handleEl: handleEl instanceof HTMLElement ? handleEl : null,
    bodyEl: bodyEl instanceof HTMLElement ? bodyEl : null,
    messagesEl: messagesEl instanceof HTMLElement ? messagesEl : null,
    typingEl: typingEl instanceof HTMLElement ? typingEl : null,
    jumpEl: jumpEl instanceof HTMLButtonElement ? jumpEl : null,
    formEl: formEl instanceof HTMLFormElement ? formEl : null,
    inputEl: inputEl instanceof HTMLTextAreaElement ? inputEl : null,
    closeEl: closeEl instanceof HTMLButtonElement ? closeEl : null,
    messages: [],
    members: [],
    memberKey: '',
    peerUid: '',
    nearBottom: true,
    hasSnapshot: false,
    newMessageChipVisible: false,
    peerTyping: false,
    minimized: false,
    savedScrollTop: 0,
    bubbleEl: null,
    typingActive: false,
    typingDebounceTimer: 0,
    typingIdleTimer: 0,
    messageUnsub: null,
    typingUnsub: null,
  };

  if (state.closeEl) {
    state.closeEl.addEventListener('click', (event) => {
      event.preventDefault();
      neuCloseDockThreadWindow(convId, { reason: 'user' });
    });
  }
  if (state.formEl) {
    state.formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      neuSendDockThreadWindowMessage(convId).catch((error) => {
        const code = neuChatErrorCode(error) || 'unknown';
        console.error('[neu-chat] dock send failed', code, error?.message, error);
      });
    });
  }
  if (state.inputEl) {
    state.inputEl.addEventListener('input', () => {
      neuChatAutoGrow(state.inputEl);
      neuDockThreadHandleTypingInput(state, state.inputEl?.value || '');
    });
    state.inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      neuSendDockThreadWindowMessage(convId).catch((error) => {
        const code = neuChatErrorCode(error) || 'unknown';
        console.error('[neu-chat] dock send Enter failed', code, error?.message, error);
      });
    });
    state.inputEl.addEventListener('blur', () => {
      neuDockThreadSetOwnTyping(state, false, { bestEffort: true }).catch(() => null);
    });
  }
  if (state.bodyEl) {
    state.bodyEl.addEventListener(
      'scroll',
      () => {
        state.nearBottom = neuDockThreadIsNearBottom(state.bodyEl);
        if (state.nearBottom) neuDockThreadSetJumpVisible(state, false);
      },
      { passive: true },
    );
  }
  if (state.jumpEl) {
    state.jumpEl.addEventListener('click', (event) => {
      event.preventDefault();
      state.nearBottom = true;
      neuDockThreadSetJumpVisible(state, false);
      neuDockThreadScrollBottomAfterPaint(state, 'smooth');
    });
  }
  wrap.addEventListener('pointerdown', () => neuBringDockThreadWindowToFront(convId), { passive: true });
  return state;
}

async function neuStartDockThreadWindowListeners(state) {
  if (!state) return;
  const convId = String(state.conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;
  const members = Array.isArray(state.members) ? state.members : [];
  if (!members.includes(meUid)) return;

  if (typeof state.messageUnsub === 'function') state.messageUnsub();
  if (typeof state.typingUnsub === 'function') state.typingUnsub();
  state.hasSnapshot = false;
  state.newMessageChipVisible = false;
  state.messages = [];
  if (!state.minimized) {
    neuDockThreadRenderMessages(state, { forceBottom: false });
  }

  const messageQuery = query(collection(db, 'neuConversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(50));
  state.messageUnsub = onSnapshot(
    messageQuery,
    (snap) => {
      const wasNearBottom = state.bodyEl ? neuDockThreadIsNearBottom(state.bodyEl) : true;
      const prevScrollHeight = state.bodyEl instanceof HTMLElement ? state.bodyEl.scrollHeight : 0;
      const isFirstSnapshot = state.hasSnapshot !== true;
      const incomingAdded = snap.docChanges().some((change) => {
        if (change.type !== 'added') return false;
        const senderUid = String(change.doc.data()?.senderUid || '').trim();
        return !!senderUid && senderUid !== meUid;
      });
      state.messages = neuMapChatMessagesFromDocs(snap.docs);
      state.hasSnapshot = true;
      if (state.minimized) {
        state.newMessageChipVisible = false;
        neuRenderDockBubble(state);
        return;
      }
      state.nearBottom = wasNearBottom;
      if (isFirstSnapshot || wasNearBottom) neuDockThreadSetJumpVisible(state, false);
      else if (incomingAdded) neuDockThreadSetJumpVisible(state, true);

      neuDockThreadRenderMessages(state, { forceBottom: isFirstSnapshot || wasNearBottom, behavior: isFirstSnapshot ? 'auto' : 'smooth' });

      if (!isFirstSnapshot && !wasNearBottom && state.bodyEl instanceof HTMLElement) {
        const nextScrollHeight = state.bodyEl.scrollHeight;
        const delta = nextScrollHeight - prevScrollHeight;
        if (delta > 0) state.bodyEl.scrollTop += delta;
      }
    },
    (error) => {
      if (neuChatHandlePermissionDenied(error, 'messages_sub', convId, 'Sin permisos para leer mensajes.')) {
        if (typeof state.messageUnsub === 'function') {
          try {
            state.messageUnsub();
          } catch {
            // noop
          }
        }
        state.messageUnsub = null;
        return;
      }
      const code = neuChatErrorCode(error) || 'unknown';
      console.error('[neu-chat] dock message subscription failed', convId, code, error?.message, error);
    },
  );

  const typingRef = collection(db, 'neuChatTyping', convId, 'users');
  state.typingUnsub = onSnapshot(
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
      state.peerTyping = hasTyping;
      if (!state.minimized) neuDockThreadUpdateTypingUi(state, hasTyping);
    },
    () => {
      state.peerTyping = false;
      if (!state.minimized) neuDockThreadUpdateTypingUi(state, false);
    },
  );
}

async function neuSendDockThreadWindowMessage(conversationId) {
  const convId = String(conversationId || '').trim();
  const state = neuDockThreadWindowsState.windows.get(convId);
  if (!state || !(state.inputEl instanceof HTMLTextAreaElement)) return;
  if (neuChatIsActionBlocked('send', convId)) return;
  const meUid = neuCurrentUid();
  const members = Array.isArray(state.members) ? state.members.map((uid) => String(uid || '').trim()).filter(Boolean) : [];
  if (!meUid || !convId || !members.includes(meUid)) return;

  const safeText = String(state.inputEl.value || '').trim().slice(0, 1000);
  if (!safeText) return;

  const memberKey = String(state.memberKey || neuChatMemberKey(members[0], members[1])).trim();
  const now = serverTimestamp();
  const messageRef = doc(collection(db, 'neuConversations', convId, 'messages'));
  const previewText = neuChatLastMessageText(safeText);
  const incrementRecipients = await neuResolveRecipientsForUnreadIncrement(convId, members, meUid);
  const batch = writeBatch(db);

  batch.set(messageRef, {
    messageId: messageRef.id,
    senderUid: meUid,
    text: safeText,
    content: safeText,
    createdAt: now,
  });
  batch.set(
    doc(db, 'neuConversations', convId),
    {
      members,
      memberKey,
      lastMessageText: previewText,
      lastMessageAt: now,
      lastMessageSenderId: meUid,
      lastSenderUid: meUid,
      updatedAt: now,
    },
    { merge: true },
  );

  members.forEach((uid) => {
    const otherUid = members.find((candidate) => candidate !== uid) || '';
    const isSender = uid === meUid;
    const payload = {
      otherUid,
      members,
      memberKey,
      lastMessageText: previewText,
      lastMessageAt: now,
      lastMessageSenderId: meUid,
      updatedAt: now,
    };
    if (isSender) {
      payload.unreadCount = 0;
      payload.lastReadAt = now;
      payload.lastReadMessageId = messageRef.id;
    } else if (incrementRecipients.has(uid)) {
      payload.unreadCount = increment(1);
    }
    batch.set(doc(db, 'neuUserChats', uid, 'chats', convId), payload, { merge: true });
  });

  try {
    await batch.commit();
    state.inputEl.value = '';
    neuChatAutoGrow(state.inputEl);
    state.inputEl.focus({ preventScroll: true });
    neuDockThreadSetOwnTyping(state, false, { bestEffort: true }).catch(() => null);
    state.nearBottom = true;
    neuDockThreadSetJumpVisible(state, false);
    neuDockThreadScrollBottom(state, 'smooth');
    neuSetConversationUnreadLocal(convId, 0);
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'send', convId, 'Sin permisos para enviar mensajes.')) return;
    throw error;
  }
}

async function neuOpenOrFocusDockThreadWindow(conversationId, seed = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid || !neuCanUseDockHost()) return;

  let existing = neuDockThreadWindowsState.windows.get(convId);
  if (existing) {
    if (existing.minimized) {
      neuRestoreDockThreadWindow(convId, { focus: true });
      return;
    }
    neuBringDockThreadWindowToFront(convId);
    if (existing.inputEl instanceof HTMLTextAreaElement) {
      existing.inputEl.focus({ preventScroll: true });
    }
    return;
  }

  const snap = await getDoc(doc(db, 'neuConversations', convId));
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const members = Array.isArray(data.members) ? data.members.map((uid) => String(uid || '').trim()).filter(Boolean) : [];
  if (!members.includes(meUid)) return;

  const windowState = neuCreateDockThreadWindow(convId);
  if (!windowState) return;
  windowState.members = members;
  windowState.memberKey = String(data.memberKey || seed.memberKey || neuChatMemberKey(members[0], members[1])).trim();
  windowState.peerUid = String(seed.otherUid || members.find((uid) => uid !== meUid) || '').trim();
  if (windowState.peerUid) {
    await neuEnsureChatProfile(windowState.peerUid);
  }
  neuDockThreadRenderHeader(windowState);
  neuDockThreadWindowsState.windows.set(convId, windowState);
  neuDockThreadWindowsState.order.push(convId);
  neuWireDockThreadWindowResize();
  await neuStartDockThreadWindowListeners(windowState);
  neuBringDockThreadWindowToFront(convId);
  neuLayoutDockThreadWindows();
}

function neuCloseDockThreadWindow(conversationId, options = {}) {
  const convId = String(conversationId || '').trim();
  if (!convId) return;
  const state = neuDockThreadWindowsState.windows.get(convId);
  if (!state) return;
  const destroy = options && typeof options === 'object' ? options.destroy === true : false;
  if (destroy) {
    neuDockThreadStopListeners(state, { keepDom: false });
    if (state.bubbleEl instanceof HTMLElement) state.bubbleEl.remove();
    neuDockThreadWindowsState.windows.delete(convId);
    neuDockThreadWindowsState.order = neuDockThreadWindowsState.order.filter((id) => id !== convId);
    neuDockThreadWindowsState.minimizedOrder = neuDockThreadWindowsState.minimizedOrder.filter((id) => id !== convId);
    if (options.reason !== 'viewport' && options.reason !== 'limit') {
      neuChatSetHint('');
    }
    neuLayoutDockThreadWindows();
    return;
  }
  neuMinimizeDockThreadWindow(convId, { reason: options?.reason || 'user' });
}

function neuSyncChatHostSurface() {
  if (neuCanUseDockHost()) {
    neuChatState.hostMode = 'dock';
    neuMountChatCardForMode('dock');
    neuSetInboxPanelOpen(false);
    neuSetChatDockOpen(neuChatState.dockOpen === true, { persist: false });
    return;
  }

  if (neuCanUseInboxHost()) {
    neuChatState.hostMode = 'inbox';
    neuMountChatCardForMode('inbox');
    neuSetInboxPanelOpen(!!String(neuChatState.currentConversationId || '').trim());
    neuSetChatDockOpen(false, { persist: false });
    return;
  }

  neuChatState.hostMode = 'modal';
  neuMountChatCardForMode('modal');
  neuSetInboxPanelOpen(false);
  neuSetChatDockOpen(false, { persist: false });
}

function neuChatRecomputeModalLock() {
  const hasOpenModal = Array.from(document.querySelectorAll('.composer-modal')).some(
    (node) => node instanceof HTMLElement && !node.hidden,
  );
  document.body.classList.toggle('modal-open', hasOpenModal);
}

function neuSetChatModalOpen(open) {
  const modal = neuChatModalNode();
  if (modal instanceof HTMLElement) modal.hidden = true;
  const mode = String(neuChatState.hostMode || '').trim();
  if (mode === 'inbox' || mode === 'dock') {
    neuChatRecomputeModalLock();
    return;
  }
  neuSetChatRootOpen(open === true, 'modal');
  neuChatRecomputeModalLock();
}

function neuChatBodyNode() {
  const node = document.getElementById('neuChatBody');
  return node;
}

function neuChatMessagesNode() {
  const node = document.getElementById('neuChatMessages');
  if (node instanceof HTMLElement) {
    neuChatScrollEl = node;
    neuChatState.messagesContainerEl = node;
  }
  return node;
}

function neuChatSearchInputNode() {
  return neuInboxSearchNode();
}

function neuChatShareModalNode() {
  const node = document.getElementById('neuShareChatModal');
  return node instanceof HTMLElement ? node : null;
}

function neuChatShareSearchInputNode() {
  const node = document.getElementById('neuShareChatSearchInput');
  return node instanceof HTMLInputElement ? node : null;
}

function neuChatShareListNode() {
  const node = document.getElementById('neuShareChatList');
  return node instanceof HTMLElement ? node : null;
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

function neuChatScrollNode() {
  const stateRef = neuChatState.messagesContainerEl;
  if (stateRef instanceof HTMLElement && stateRef.isConnected) {
    neuChatScrollEl = stateRef;
    return stateRef;
  }
  if (neuChatScrollEl instanceof HTMLElement && neuChatScrollEl.isConnected) return neuChatScrollEl;
  const node = neuChatMessagesNode();
  if (node instanceof HTMLElement) {
    neuChatScrollEl = node;
    return node;
  }
  return null;
}

function neuChatSetLastMessageRef(node) {
  const root = neuChatMessagesNode();
  if (root instanceof HTMLElement) {
    const previous = root.querySelector('[data-neu-last-message="1"]');
    if (previous instanceof HTMLElement) previous.removeAttribute('data-neu-last-message');
  }
  if (node instanceof HTMLElement) {
    node.setAttribute('data-neu-last-message', '1');
    neuChatState.lastMessageEl = node;
    return;
  }
  neuChatState.lastMessageEl = null;
}

function neuChatLastMessageNode() {
  const cached = neuChatState.lastMessageEl;
  if (cached instanceof HTMLElement && cached.isConnected) return cached;
  const root = neuChatMessagesNode();
  if (!(root instanceof HTMLElement)) return null;
  const marked = root.querySelector('[data-neu-last-message="1"]');
  if (marked instanceof HTMLElement) {
    neuChatState.lastMessageEl = marked;
    return marked;
  }
  const items = root.querySelectorAll('.neuMessageItem');
  if (!items.length) {
    neuChatState.lastMessageEl = null;
    return null;
  }
  const last = items[items.length - 1];
  if (last instanceof HTMLElement) {
    neuChatSetLastMessageRef(last);
    return last;
  }
  neuChatState.lastMessageEl = null;
  return null;
}

function neuChatOnTouchStart(event) {
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
}

function neuChatOnTouchMove(event) {
  const touch = event.touches?.[0];
  if (!touch) {
    neuClearChatReplyLongPressTimer();
    return;
  }
  const dx = Math.abs(Number(touch.clientX || 0) - Number(neuChatState.longPressReplyX || 0));
  const dy = Math.abs(Number(touch.clientY || 0) - Number(neuChatState.longPressReplyY || 0));
  if (dx + dy > 10) neuClearChatReplyLongPressTimer();
}

function neuChatOnTouchEnd() {
  neuClearChatReplyLongPressTimer();
}

function neuQaScrollProbeLog(source = 'probe') {
  if (!NEU_QA) return;
  const now = Date.now();
  if (now - Number(neuQaScrollProbeState.lastLogAt || 0) < 220) return;
  neuQaScrollProbeState.lastLogAt = now;

  const scrollEl = neuQaScrollProbeState.scrollEl instanceof HTMLElement ? neuQaScrollProbeState.scrollEl : neuChatScrollNode();
  if (!(scrollEl instanceof HTMLElement)) return;

  const overflowY = getComputedStyle(scrollEl).overflowY;
  const delta = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  const nearBottom = delta - scrollEl.scrollTop <= NEU_CHAT_SCROLL_NEAR_BOTTOM;
  neuQaPush(
    `[scroll-probe] ${source} messages=${Math.round(scrollEl.scrollTop)}/${Math.round(delta)} ovf:${overflowY} nearBottom=${nearBottom ? '1' : '0'}`,
  );
}

function neuWireQaChatScrollProbe() {
  if (!NEU_QA) return;
  const messages = neuChatScrollNode();
  if (!(messages instanceof HTMLElement)) return;

  messages.style.outline = '2px solid red';
  messages.style.outlineOffset = '-1px';

  const state = neuQaScrollProbeState;
  if (state.scrollEl instanceof HTMLElement && state.scrollEl !== messages && typeof state.handler === 'function') {
    state.scrollEl.removeEventListener('scroll', state.handler);
  }

  state.scrollEl = messages;
  if (typeof state.handler !== 'function') {
    state.handler = () => neuQaScrollProbeLog('messages-scroll');
  }

  messages.removeEventListener('scroll', state.handler);
  messages.addEventListener('scroll', state.handler, { passive: true });

  neuQaScrollProbeLog('bind');
}

function neuBindChatScrollSurface(force = false) {
  const chatMessages = neuChatMessagesNode();
  if (!(chatMessages instanceof HTMLElement)) return null;
  neuChatState.messagesContainerEl = chatMessages;

  if (!force && neuChatState.bodyScrollWired === true && neuChatScrollEl === chatMessages) return chatMessages;

  if (neuChatScrollEl instanceof HTMLElement && neuChatState.bodyScrollWired === true && neuChatScrollEl !== chatMessages) {
    neuChatScrollEl.removeEventListener('scroll', neuChatHandleBodyScrollThrottled);
    neuChatScrollEl.removeEventListener('touchstart', neuChatOnTouchStart);
    neuChatScrollEl.removeEventListener('touchmove', neuChatOnTouchMove);
    neuChatScrollEl.removeEventListener('touchend', neuChatOnTouchEnd);
    neuChatScrollEl.removeEventListener('touchcancel', neuChatOnTouchEnd);
  }

  neuChatScrollEl = chatMessages;
  neuChatState.bodyScrollWired = true;
  neuChatScrollEl.addEventListener('scroll', neuChatHandleBodyScrollThrottled, { passive: true });
  neuChatScrollEl.addEventListener('touchstart', neuChatOnTouchStart, { passive: true });
  neuChatScrollEl.addEventListener('touchmove', neuChatOnTouchMove, { passive: true });
  neuChatScrollEl.addEventListener('touchend', neuChatOnTouchEnd, { passive: true });
  neuChatScrollEl.addEventListener('touchcancel', neuChatOnTouchEnd, { passive: true });
  neuWireQaChatScrollProbe();
  return neuChatScrollEl;
}

function neuEnsureChatEditPreviewNode() {
  const form = neuChatComposerNode();
  if (!(form instanceof HTMLElement)) return null;
  let wrap = document.getElementById('neuChatEditPreview');
  if (!(wrap instanceof HTMLElement)) {
    wrap = document.createElement('div');
    wrap.id = 'neuChatEditPreview';
    wrap.className = 'neu-chat-reply-preview neu-chat-edit-preview hidden';
    wrap.innerHTML = `
      <span id="neuChatEditPreviewText"></span>
      <button class="btn-white-outline neu-chat-edit-cancel" type="button" data-neu-chat-edit-cancel="1" aria-label="Cancelar edicion">X</button>
    `;
    form.prepend(wrap);
  }
  return wrap;
}

function neuChatAttachButtonNode() {
  const node = document.getElementById('neuChatAttachBtn');
  return node instanceof HTMLButtonElement ? node : null;
}

function neuChatEmojiButtonNode() {
  const node = document.getElementById('neuChatEmojiBtn');
  return node instanceof HTMLButtonElement ? node : null;
}

function neuChatLikeButtonNode() {
  const node = document.getElementById('neuChatLikeBtn');
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

function neuChatEmojiPickerNode() {
  const existing = document.getElementById('neuChatEmojiPicker');
  if (existing instanceof HTMLElement) return existing;
  const picker = document.createElement('div');
  picker.id = 'neuChatEmojiPicker';
  picker.className = 'neuChatEmojiPicker hidden';
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', 'Emoji');
  const items = ['??', '??', '??', '??', '??', '??', '??', '??'];
  picker.innerHTML = items
    .map((emoji) => `<button type="button" class="neuChatEmojiOption" data-neu-chat-emoji="${esc(emoji)}" aria-label="${esc(emoji)}">${esc(emoji)}</button>`)
    .join('');
  document.body.append(picker);
  return picker;
}

function neuCloseChatEmojiPicker() {
  const picker = neuChatEmojiPickerNode();
  if (!(picker instanceof HTMLElement)) return;
  picker.classList.add('hidden');
  picker.style.left = '';
  picker.style.top = '';
}

function neuOpenChatEmojiPicker(anchorButton) {
  const trigger = anchorButton instanceof HTMLElement ? anchorButton : null;
  const picker = neuChatEmojiPickerNode();
  if (!trigger || !(picker instanceof HTMLElement)) return;
  picker.classList.remove('hidden');
  picker.style.left = '-9999px';
  picker.style.top = '-9999px';
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(160, Math.round(picker.offsetWidth || 160));
  const height = Math.max(40, Math.round(picker.offsetHeight || 40));
  const margin = 12;
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, rect.top - height - 8));
  picker.style.left = `${Math.round(left)}px`;
  picker.style.top = `${Math.round(top)}px`;
}

function neuInsertEmojiIntoChatInput(emoji = '') {
  const icon = String(emoji || '').trim();
  if (!icon) return;
  const input = neuChatInputNode();
  if (!(input instanceof HTMLTextAreaElement)) return;
  const start = Number(input.selectionStart || input.value.length);
  const end = Number(input.selectionEnd || start);
  const prefix = input.value.slice(0, start);
  const suffix = input.value.slice(end);
  input.value = `${prefix}${icon}${suffix}`;
  const caret = start + icon.length;
  input.setSelectionRange(caret, caret);
  input.focus({ preventScroll: true });
  neuChatAutoGrow(input);
  neuSyncChatComposerState();
  neuChatHandleTypingInput(input.value);
}

function neuChatReplyPreviewNode() {
  const node = document.getElementById('neuChatReplyPreview');
  return node instanceof HTMLElement ? node : null;
}

function neuChatReplyPreviewTextNode() {
  const node = document.getElementById('neuChatReplyPreviewText');
  return node instanceof HTMLElement ? node : null;
}

function neuChatEditPreviewNode() {
  const node = document.getElementById('neuChatEditPreview');
  return node instanceof HTMLElement ? node : null;
}

function neuChatEditPreviewTextNode() {
  const node = document.getElementById('neuChatEditPreviewText');
  return node instanceof HTMLElement ? node : null;
}

function neuChatLongPressMenuNode() {
  const node = document.getElementById('neuChatLongPressMenu');
  if (!(node instanceof HTMLElement)) return null;
  if (!node.querySelector('[data-neu-chat-longpress-reply]')) {
    const replyBtn = document.createElement('button');
    replyBtn.className = 'btn-white-outline neu-chat-longpress-action';
    replyBtn.type = 'button';
    replyBtn.setAttribute('role', 'menuitem');
    replyBtn.setAttribute('data-neu-chat-longpress-reply', '1');
    replyBtn.textContent = '? Responder';
    node.append(replyBtn);
  }
  if (!node.querySelector('[data-neu-chat-longpress-edit]')) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-white-outline neu-chat-longpress-action hidden';
    editBtn.type = 'button';
    editBtn.setAttribute('role', 'menuitem');
    editBtn.setAttribute('data-neu-chat-longpress-edit', '1');
    editBtn.textContent = 'Editar';
    node.append(editBtn);
  }
  if (!node.querySelector('[data-neu-chat-longpress-delete]')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-white-outline neu-chat-longpress-action neu-chat-longpress-action-danger hidden';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('role', 'menuitem');
    deleteBtn.setAttribute('data-neu-chat-longpress-delete', '1');
    deleteBtn.textContent = 'Eliminar';
    node.append(deleteBtn);
  }
  return node;
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

function neuChatMessageText(message) {
  const fromText = String(message?.text || '').trim();
  if (fromText) return fromText;
  return String(message?.content || '').trim();
}

function neuChatFindMessageById(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId || !Array.isArray(neuChatState.messages)) return null;
  return (
    neuChatState.messages.find((row) => String(row?.id || '').trim() === msgId) || null
  );
}

function neuChatBuildReplySnippet(message) {
  if (message?.deletedAt) return 'Mensaje eliminado';
  const imageUrl = String(message?.imageUrl || '').trim();
  if (imageUrl) return '?? Foto';
  const raw = neuChatMessageText(message)
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
  const senderName = String(rawReply.senderName || '').trim();
  const snippet = String(rawReply.snippet || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NEU_CHAT_REPLY_SNIPPET_MAX);
  return {
    messageId,
    senderUid,
    senderName,
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

function neuChatNormalizeEditDraft(rawEdit) {
  if (!rawEdit || typeof rawEdit !== 'object') return null;
  const messageId = String(rawEdit.messageId || '').trim();
  if (!messageId) return null;
  const text = String(rawEdit.text || '').slice(0, 1000);
  return { messageId, text };
}

function neuSetChatEditDraft(rawEdit) {
  neuChatState.editDraft = neuChatNormalizeEditDraft(rawEdit);
  neuRenderChatEditPreview();
}

function neuClearChatEditDraft() {
  neuSetChatEditDraft(null);
}

function neuRenderChatEditPreview() {
  neuEnsureChatEditPreviewNode();
  const wrap = neuChatEditPreviewNode();
  const textNode = neuChatEditPreviewTextNode();
  const draft = neuChatNormalizeEditDraft(neuChatState.editDraft);
  const hasDraft = !!draft;
  if (wrap instanceof HTMLElement) wrap.classList.toggle('hidden', !hasDraft);
  if (textNode instanceof HTMLElement) textNode.textContent = hasDraft ? 'Editando...' : '';
  neuUpdateChatComposerOffsetVar();
}

function neuChatCanManageMessage(message, meUid = neuCurrentUid()) {
  const ownUid = String(meUid || '').trim();
  if (!ownUid || !message || typeof message !== 'object') return false;
  return String(message.senderUid || '').trim() === ownUid;
}

function neuChatCanEditMessage(message, meUid = neuCurrentUid()) {
  if (!neuChatCanManageMessage(message, meUid)) return false;
  if (message?.deletedAt) return false;
  const text = neuChatMessageText(message);
  const hasText = text.trim().length > 0;
  const hasImageOnly = !hasText && String(message?.imageUrl || '').trim().length > 0;
  if (hasImageOnly) return false;
  return true;
}

function neuStartChatEditDraft(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const message = neuChatFindMessageById(msgId);
  if (!message || !neuChatCanEditMessage(message)) return;

  neuClearChatReplyDraft();
  neuClearChatAttachment();
  const nextText = neuChatMessageText(message);
  neuSetChatEditDraft({ messageId: msgId, text: nextText });

  const input = neuChatInputNode();
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    input.value = nextText;
    if (input instanceof HTMLTextAreaElement) neuChatAutoGrow(input);
    input.focus({ preventScroll: true });
  }
  neuSyncChatComposerState();
}

function neuRenderChatReplyPreview() {
  const wrap = neuChatReplyPreviewNode();
  const text = neuChatReplyPreviewTextNode();
  const reply = neuChatNormalizeReplyPayload(neuChatState.replyDraft);
  const hasReply = !!reply;
  if (wrap instanceof HTMLElement) wrap.classList.toggle('hidden', !hasReply);
  if (text instanceof HTMLElement) {
    const snippet = hasReply ? String(reply.snippet || '').trim() || '...' : '';
    const senderName = hasReply ? String(reply.senderName || '').trim() || neuChatSenderDisplayName(reply.senderUid) : '';
    text.textContent = hasReply ? `Respondiendo a ${senderName}: ${snippet}` : '';
  }
  neuUpdateChatComposerOffsetVar();
}

function neuStartChatReplyDraft(messageId) {
  const msgId = String(messageId || '').trim();
  if (!msgId) return;
  const message = neuChatFindMessageById(msgId);
  if (!message) return;
  const snippet = neuChatBuildReplySnippet(message) || '...';
  neuClearChatEditDraft();
  neuSetChatReplyDraft({
    messageId: msgId,
    senderUid: String(message.senderUid || '').trim(),
    senderName: neuChatSenderDisplayName(String(message.senderUid || '').trim()),
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
  const replyBtn = menu.querySelector('[data-neu-chat-longpress-reply]');
  const editBtn = menu.querySelector('[data-neu-chat-longpress-edit]');
  const deleteBtn = menu.querySelector('[data-neu-chat-longpress-delete]');
  const msgId = String(messageId || '').trim();
  if (!msgId) {
    menu.classList.add('hidden');
    menu.dataset.neuChatReplyMessage = '';
    menu.dataset.neuChatEditMessage = '';
    menu.dataset.neuChatDeleteMessage = '';
    menu.style.left = '';
    menu.style.top = '';
    neuChatState.longPressMenuMessageId = '';
    return;
  }

  const message = neuChatFindMessageById(msgId);
  const canManage = !!message && neuChatCanManageMessage(message) && !message?.deletedAt;
  const canEdit = !!message && neuChatCanEditMessage(message);
  if (replyBtn instanceof HTMLElement) replyBtn.classList.remove('hidden');
  if (editBtn instanceof HTMLElement) editBtn.classList.toggle('hidden', !canEdit);
  if (deleteBtn instanceof HTMLElement) deleteBtn.classList.toggle('hidden', !canManage);

  menu.classList.remove('hidden');
  const width = Math.max(130, Math.round(menu.offsetWidth || 130));
  const height = Math.max(44, Math.round(menu.offsetHeight || 44));
  const safe = 8;
  const nextX = Math.max(safe, Math.min(window.innerWidth - width - safe, Number(clientX) || safe));
  const nextY = Math.max(safe, Math.min(window.innerHeight - height - safe, Number(clientY) || safe));
  menu.style.left = `${Math.round(nextX)}px`;
  menu.style.top = `${Math.round(nextY)}px`;
  menu.dataset.neuChatReplyMessage = msgId;
  menu.dataset.neuChatEditMessage = canEdit ? msgId : '';
  menu.dataset.neuChatDeleteMessage = canManage ? msgId : '';
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
    const root = neuChatMessagesNode();
    const selector = neuReactionMessageSelector(msgId);
    const item = selector && root instanceof HTMLElement ? root.querySelector(`.neuMessageItem[data-neu-msg-id="${selector}"]`) : null;
    if (!(item instanceof HTMLElement)) return;
    const meta = neuMessageMetaFromElement(item);
    neuOpenMsgMenu(
      {
        clientX: Number(neuChatState.longPressReplyX || 0),
        clientY: Number(neuChatState.longPressReplyY || 0),
        anchorEl: item,
      },
      meta,
    );
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

async function neuEditChatMessage(messageId, text) {
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const msgId = String(messageId || '').trim();
  const nextText = String(text || '').trim().slice(0, 1000);
  const meUid = neuCurrentUid();
  if (!conversationId || !msgId || !meUid || !nextText) return;
  if (neuChatIsActionBlocked('edit_message', conversationId)) return;

  const message = neuChatFindMessageById(msgId);
  if (!message || !neuChatCanEditMessage(message, meUid)) {
    neuChatSetHint('No puedes editar este mensaje.', true);
    return;
  }

  try {
    await updateDoc(doc(db, 'neuConversations', conversationId, 'messages', msgId), {
      text: nextText,
      content: nextText,
      editedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'edit_message', conversationId, 'Sin permisos para editar mensajes.')) return;
    throw error;
  }
}

async function neuDeleteChatMessage(messageId) {
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const msgId = String(messageId || '').trim();
  const meUid = neuCurrentUid();
  if (!conversationId || !msgId || !meUid) return;
  if (neuChatIsActionBlocked('delete_message', conversationId)) return;

  const message = neuChatFindMessageById(msgId);
  if (!message || !neuChatCanManageMessage(message, meUid)) {
    neuChatSetHint('No puedes eliminar este mensaje.', true);
    return;
  }
  if (!window.confirm('Eliminar mensaje?')) return;

  try {
    await updateDoc(doc(db, 'neuConversations', conversationId, 'messages', msgId), {
      text: 'Mensaje eliminado',
      content: 'Mensaje eliminado',
      imageUrl: null,
      imageStoragePath: deleteField(),
      postRef: deleteField(),
      postUrl: deleteField(),
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'delete_message', conversationId, 'Sin permisos para eliminar mensajes.')) return;
    throw error;
  }

  const editDraft = neuChatNormalizeEditDraft(neuChatState.editDraft);
  if (editDraft && editDraft.messageId === msgId) {
    neuClearChatEditDraft();
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.value = '';
      if (input instanceof HTMLTextAreaElement) neuChatAutoGrow(input);
    }
  }
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
  if (neuChatState.attachmentsDisabled === true) {
    neuChatNotifyAttachmentsUnavailable();
    neuClearChatAttachment();
    return;
  }
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
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || 20;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;
  const verticalPad = padTop + padBottom;
  const min = line + verticalPad;
  const cssMax = parseFloat(style.maxHeight);
  const max = Number.isFinite(cssMax) && cssMax > 0 ? cssMax : line * 5 + verticalPad;
  const next = Math.max(min, Math.min(el.scrollHeight, max));
  el.style.height = `${next}px`;
  el.style.maxHeight = `${max}px`;
  el.style.overflowY = el.scrollHeight > max + 1 ? 'auto' : 'hidden';
  neuUpdateChatComposerOffsetVar();
}

function neuChatAutoResizeInput() {
  const input = neuChatInputNode();
  neuChatAutoGrow(input);
}

function neuSyncChatComposerState() {
  const sendBtn = neuChatSendButtonNode();
  const attachBtn = neuChatAttachButtonNode();
  const emojiBtn = neuChatEmojiButtonNode();
  const likeBtn = neuChatLikeButtonNode();
  const fileInput = neuChatFileInputNode();
  const busy = neuChatState.sending || neuChatState.uploading;
  const editing = !!neuChatNormalizeEditDraft(neuChatState.editDraft);
  const hasConversation = !!String(neuChatState.currentConversationId || '').trim();
  const disabled = !hasConversation || busy || (!neuChatHasTypedText() && !neuChatHasAttachment());
  const attachUnavailable = neuChatState.attachmentsDisabled === true || !(fileInput instanceof HTMLInputElement);
  if (sendBtn instanceof HTMLButtonElement) {
    sendBtn.disabled = disabled;
    sendBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    sendBtn.title = disabled ? 'No disponible' : 'Enviar';
  }
  if (attachBtn instanceof HTMLButtonElement) {
    const attachDisabled = attachUnavailable || !hasConversation || busy || editing;
    attachBtn.disabled = attachDisabled;
    attachBtn.setAttribute('aria-disabled', attachDisabled ? 'true' : 'false');
    attachBtn.title = attachUnavailable ? 'Adjuntos no disponibles' : attachDisabled ? 'No disponible' : 'Adjuntar imagen';
  }
  if (emojiBtn instanceof HTMLButtonElement) {
    const buttonDisabled = !hasConversation || busy;
    emojiBtn.disabled = buttonDisabled;
    emojiBtn.setAttribute('aria-disabled', buttonDisabled ? 'true' : 'false');
    emojiBtn.title = buttonDisabled ? 'No disponible' : 'Emoji';
  }
  if (likeBtn instanceof HTMLButtonElement) {
    const buttonDisabled = !hasConversation || busy;
    likeBtn.disabled = buttonDisabled;
    likeBtn.setAttribute('aria-disabled', buttonDisabled ? 'true' : 'false');
    likeBtn.title = buttonDisabled ? 'No disponible' : 'Me gusta rapido';
  }
  if (fileInput instanceof HTMLInputElement) fileInput.disabled = attachUnavailable || !hasConversation || busy || editing;
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
  const el = neuChatScrollNode();
  if (!(el instanceof HTMLElement)) return true;
  const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) <= threshold;
  neuChatState.nearBottom = nearBottom;
  return nearBottom;
}

function neuChatScrollToBottom(options = {}) {
  const behavior = String(options?.behavior || 'auto').trim() || 'auto';
  const force = options?.force === true;
  const body = neuChatScrollNode();
  if (!(body instanceof HTMLElement)) return;
  if (!force && !neuChatIsNearBottom(NEU_CHAT_SCROLL_NEAR_BOTTOM)) return;
  const lastMessage = neuChatLastMessageNode();
  if (lastMessage instanceof HTMLElement && typeof lastMessage.scrollIntoView === 'function') {
    lastMessage.scrollIntoView({
      behavior: behavior === 'smooth' ? 'smooth' : 'auto',
      block: 'end',
      inline: 'nearest',
    });
  } else if (behavior === 'smooth' && typeof body.scrollTo === 'function') {
    body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
  } else {
    body.scrollTop = body.scrollHeight;
  }
  neuChatState.nearBottom = true;
  neuSetNewMessagesChipVisible(false);
}

function neuChatScrollBottom(behavior = 'auto') {
  neuChatScrollToBottom({ force: true, behavior });
}

function neuChatHandleBodyScrollThrottled() {
  if (neuChatState.bodyScrollRaf) return;
  neuChatState.bodyScrollRaf = window.requestAnimationFrame(() => {
    neuChatState.bodyScrollRaf = 0;
    const body = neuChatScrollNode();
    if (neuChatIsNearBottom(NEU_CHAT_SCROLL_NEAR_BOTTOM)) {
      neuSetNewMessagesChipVisible(false);
    }
    if (body instanceof HTMLElement && body.scrollTop < NEU_CHAT_LOAD_MORE_TOP_THRESHOLD) {
      neuChatLoadOlderMessages().catch((error) => {
        if (NEU_QA) console.warn('[neu-chat] load older failed', error);
      });
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
    lastMessageText: neuChatLastMessageText(data.lastMessageText),
    lastMessagePreview: neuChatLastMessageText(data.lastMessageText),
    lastMessageSenderId: String(data.lastMessageSenderId || data.lastSenderUid || '').trim(),
    lastMessageAt: data.lastMessageAt || data.updatedAt || null,
    updatedAt: data.updatedAt || data.lastMessageAt || null,
    unreadCount: neuUnreadValue(data.unreadCount),
    lastReadAt: data.lastReadAt || null,
    lastReadMessageId: String(data.lastReadMessageId || '').trim(),
    lastSenderUid: String(data.lastSenderUid || '').trim(),
    pinned: data.pinned === true,
    peerLastReadAt: data.peerLastReadAt || data.lastReadAtPeer || null,
    peerLastReadMessageId:
      String(data.peerLastReadMessageId || data.lastReadMessageIdPeer || data.peerReadMessageId || '').trim(),
  };
}

function neuSortChatRows(rows = []) {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const aTs = neuTimeToMs(a?.lastMessageAt) || neuTimeToMs(a?.updatedAt) || 0;
    const bTs = neuTimeToMs(b?.lastMessageAt) || neuTimeToMs(b?.updatedAt) || 0;
    if (aTs !== bTs) return bTs - aTs;

    return String(a?.conversationId || '').localeCompare(String(b?.conversationId || ''));
  });
  return list;
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

async function neuToggleChatPinned(conversationId) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;
  if (neuChatIsActionBlocked('pin', convId)) return;

  const prevRows = Array.isArray(neuChatState.listRows) ? [...neuChatState.listRows] : [];
  const currentRow = prevRows.find((row) => String(row?.conversationId || '').trim() === convId) || null;
  const nextPinned = !(currentRow?.pinned === true);

  neuChatState.listRows = prevRows.map((row) => {
    if (String(row?.conversationId || '').trim() !== convId) return row;
    return { ...row, pinned: nextPinned, updatedAt: row?.updatedAt || new Date() };
  });
  neuChatState.listRows = neuSortChatRows(neuChatState.listRows);
  neuRenderChatList();

  try {
    await setDoc(
      doc(db, 'neuUserChats', meUid, 'chats', convId),
      {
        pinned: nextPinned,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    neuChatState.listRows = neuSortChatRows(prevRows);
    neuRenderChatList();
    if (neuChatHandlePermissionDenied(error, 'pin', convId, 'Sin permisos para fijar chats.')) return;
    const code = neuChatErrorCode(error) || 'unknown';
    console.error('[neu-chat] pin toggle failed', code, error?.message, error);
    neuChatSetHint(`No se pudo fijar chat (${code}).`, true);
  }
}

function neuBuildSharePostDraftFromCard(card) {
  const identity = neuReadPostIdentity(card);
  if (!identity) return null;
  const rawText = neuCardText(card).replace(/\s+/g, ' ').trim();
  const snippet = (rawText || 'Post compartido').slice(0, 120);
  const postUrl = `neu-social-app.html?post=${encodeURIComponent(identity.postId)}`;
  const author = neuCardAuthorPreview(card);
  const previewTitle = String(author.name || '').trim() || 'Post compartido';
  const previewSubtitle = String(author.handle || '').trim() || snippet.slice(0, 80);
  const previewImageUrlRaw = neuCardPreviewImage(card);
  const previewImageUrl = previewImageUrlRaw.startsWith('gs://') ? '' : previewImageUrlRaw;
  return {
    ownerUid: identity.ownerUid,
    postId: identity.postId,
    snippet,
    postUrl,
    shareType: 'post',
    shareId: identity.postId,
    shareUrl: postUrl,
    previewTitle,
    previewSubtitle,
    previewImageUrl,
    content: `?? Post: ${snippet.slice(0, 80)}`,
  };
}

function neuSetChatShareModalOpen(open) {
  const modal = neuChatShareModalNode();
  if (!(modal instanceof HTMLElement)) return;
  modal.hidden = !open;
  neuChatRecomputeModalLock();
}

function neuCloseSharePostModal() {
  neuSetChatShareModalOpen(false);
  neuChatState.sharePostDraft = null;
  neuChatState.shareSearchQuery = '';
  neuChatState.shareSending = false;
  if (neuChatState.shareSearchDebounceTimer) {
    window.clearTimeout(neuChatState.shareSearchDebounceTimer);
    neuChatState.shareSearchDebounceTimer = 0;
  }
  const input = neuChatShareSearchInputNode();
  if (input instanceof HTMLInputElement) input.value = '';
  const list = neuChatShareListNode();
  if (list instanceof HTMLElement) list.innerHTML = '';
}

function neuRenderSharePostChatList() {
  const listNode = neuChatShareListNode();
  if (!(listNode instanceof HTMLElement)) return;
  const draft = neuChatState.sharePostDraft;
  if (!draft || typeof draft !== 'object') {
    listNode.innerHTML = '<p class="neu-share-chat-empty">Selecciona un post para compartir.</p>';
    return;
  }

  const allRows = neuSortChatRows(Array.isArray(neuChatState.listRows) ? neuChatState.listRows : []);
  if (!allRows.length) {
    listNode.innerHTML = '<p class="neu-share-chat-empty">No tienes chats aun.</p>';
    return;
  }

  const queryText = String(neuChatState.shareSearchQuery || '').trim();
  const rows = neuChatFilteredRows(allRows, neuChatState.shareSearchQuery);
  if (!rows.length) {
    listNode.innerHTML = `<p class="neu-share-chat-empty">${queryText ? 'Sin resultados.' : 'No tienes chats aun.'}</p>`;
    return;
  }

  const html = rows
    .map((row) => {
      const profile = neuChatProfileCached(row.otherUid);
      const displayName = String(profile.displayName || '').trim() || 'Usuario';
      const handle = neuEnsureHandle(profile.handle, displayName, row.otherUid);
      const avatarUrl = String(profile.avatarUrl || '').trim();
      const avatarHtml = avatarUrl
        ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
        : `<span>${esc(neuAvatarLetter(displayName))}</span>`;
      return `
        <button
          class="neu-share-chat-item"
          type="button"
          data-neu-chat-share-open="${esc(row.conversationId)}"
          data-neu-chat-share-other="${esc(row.otherUid)}"
        >
          <span class="avatar-frame neu-chat-avatar">${avatarHtml}</span>
          <span class="neu-share-chat-copy">
            <strong>${esc(displayName)}</strong>
            <small>${esc(handle)}</small>
          </span>
        </button>
      `;
    })
    .join('');
  listNode.innerHTML = html;

  rows.forEach((row) => {
    if (!row?.otherUid) return;
    if (neuChatState.profileCache instanceof Map && neuChatState.profileCache.has(row.otherUid)) return;
    neuEnsureChatProfile(row.otherUid)
      .then(() => {
        if (!neuChatState.sharePostDraft) return;
        neuRenderSharePostChatList();
      })
      .catch(() => null);
  });
}

function neuQueueShareChatSearch(rawValue) {
  if (neuChatState.shareSearchDebounceTimer) {
    window.clearTimeout(neuChatState.shareSearchDebounceTimer);
    neuChatState.shareSearchDebounceTimer = 0;
  }
  const next = String(rawValue || '');
  neuChatState.shareSearchDebounceTimer = window.setTimeout(() => {
    neuChatState.shareSearchDebounceTimer = 0;
    neuChatState.shareSearchQuery = String(next || '').trim();
    neuRenderSharePostChatList();
  }, NEU_CHAT_SEARCH_DEBOUNCE_MS);
}

function neuOpenSharePostModalFromCard(card) {
  const draft = neuBuildSharePostDraftFromCard(card);
  if (!draft) {
    neuChatSetHint('No se pudo compartir este post.', true);
    return;
  }
  neuChatState.sharePostDraft = draft;
  neuChatState.shareSearchQuery = '';
  neuChatState.shareSending = false;
  const input = neuChatShareSearchInputNode();
  if (input instanceof HTMLInputElement) input.value = '';
  neuRenderSharePostChatList();
  neuSetChatShareModalOpen(true);
  if (input instanceof HTMLInputElement) input.focus({ preventScroll: true });
}

async function neuSharePostToConversation(conversationId) {
  const convId = String(conversationId || '').trim();
  const draft = neuChatState.sharePostDraft;
  const meUid = neuCurrentUid();
  if (!convId || !draft || typeof draft !== 'object' || !meUid || neuChatState.shareSending) return;
  if (neuChatIsActionBlocked('share', convId)) return;

  neuChatState.shareSending = true;
  try {
    let members = [];
    let memberKey = '';
    const listRow = Array.isArray(neuChatState.listRows)
      ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId) || null
      : null;
    if (Array.isArray(listRow?.members) && listRow.members.length === 2) {
      members = listRow.members.map((uid) => String(uid || '').trim()).filter(Boolean);
      memberKey = String(listRow?.memberKey || '').trim();
    }
    if (members.length !== 2) {
      const convSnap = await getDoc(doc(db, 'neuConversations', convId));
      if (!convSnap.exists()) throw new Error('conversation-not-found');
      const data = convSnap.data() || {};
      members = Array.isArray(data.members) ? data.members.map((uid) => String(uid || '').trim()).filter(Boolean) : [];
      memberKey = String(data.memberKey || '').trim();
    }
    if (members.length !== 2 || !members.includes(meUid)) throw new Error('conversation-members-invalid');
    if (!memberKey) memberKey = neuChatMemberKey(members[0], members[1]);

    const now = serverTimestamp();
    const messageRef = doc(collection(db, 'neuConversations', convId, 'messages'));
    const previewText = neuChatLastMessageText(String(draft.content || '').trim() || '?? Post compartido');
    const postRef = {
      postId: String(draft.postId || '').trim(),
      ownerUid: String(draft.ownerUid || '').trim(),
    };
    const postUrl = String(draft.postUrl || '').trim();
    const shareType = String(draft.shareType || 'post').trim().toLowerCase() || 'post';
    const shareId = String(draft.shareId || draft.postId || '').trim();
    const shareUrl = String(draft.shareUrl || postUrl || '').trim();
    const previewTitle = String(draft.previewTitle || '').trim();
    const previewSubtitle = String(draft.previewSubtitle || '').trim();
    const previewImageUrlRaw = String(draft.previewImageUrl || '').trim();
    const previewImageUrl = previewImageUrlRaw.startsWith('gs://') ? '' : previewImageUrlRaw;

    const batch = writeBatch(db);
    const incrementRecipients = await neuResolveRecipientsForUnreadIncrement(convId, members, meUid);
    batch.set(messageRef, {
      messageId: messageRef.id,
      senderUid: meUid,
      text: previewText,
      content: previewText,
      postRef,
      ...(postUrl ? { postUrl } : {}),
      shareType,
      ...(shareId ? { shareId } : {}),
      ...(shareUrl ? { shareUrl } : {}),
      ...(previewTitle ? { previewTitle } : {}),
      ...(previewSubtitle ? { previewSubtitle } : {}),
      ...(previewImageUrl ? { previewImageUrl } : {}),
      createdAt: now,
    });
    batch.set(
      doc(db, 'neuConversations', convId),
      {
        members,
        memberKey,
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: meUid,
        lastSenderUid: meUid,
        updatedAt: now,
      },
      { merge: true },
    );
    members.forEach((uid) => {
      const otherUid = members.find((candidate) => candidate !== uid) || '';
      const isSender = uid === meUid;
      const payload = {
        otherUid,
        members,
        memberKey,
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: meUid,
        updatedAt: now,
      };
      if (isSender) {
        payload.unreadCount = 0;
        payload.lastReadAt = now;
        payload.lastReadMessageId = messageRef.id;
      } else if (incrementRecipients.has(uid)) {
        payload.unreadCount = increment(1);
      }
      batch.set(doc(db, 'neuUserChats', uid, 'chats', convId), payload, { merge: true });
    });

    await batch.commit();
    neuCloseSharePostModal();
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'share', convId, 'Sin permisos para compartir en este chat.')) return;
    const code = neuChatErrorCode(error) || 'unknown';
    console.error('[neu-chat] share post failed', code, error?.message, error);
    neuChatSetHint(`No se pudo compartir post (${code}).`, true);
  } finally {
    neuChatState.shareSending = false;
  }
}

function neuApplyChatSearchQuery(rawValue) {
  if (neuChatState.chatSearchDebounceTimer) {
    window.clearTimeout(neuChatState.chatSearchDebounceTimer);
    neuChatState.chatSearchDebounceTimer = 0;
  }
  const next = String(rawValue || '').trim();
  if (next === neuChatState.chatSearchQuery) return;
  neuChatState.chatSearchQuery = next;
  neuSyncChatSearchInputs();
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

function neuChatSearchInputNodes() {
  const nodes = [neuDockInboxSearchNode(), document.getElementById('neuInboxSearch'), document.getElementById('pulseChatSearchInput')];
  const uniq = [];
  nodes.forEach((node) => {
    if (!(node instanceof HTMLInputElement)) return;
    if (uniq.includes(node)) return;
    uniq.push(node);
  });
  return uniq;
}

function neuSyncChatSearchInputs() {
  const value = String(neuChatState.chatSearchQuery || '');
  neuChatSearchInputNodes().forEach((input) => {
    if (input.value !== value) input.value = value;
  });
}

function neuWireChatSearchInput() {
  const inputs = neuChatSearchInputNodes();
  if (!inputs.length) return;
  inputs.forEach((input) => {
    if (input.dataset.neuChatSearchWired === '1') return;
    input.dataset.neuChatSearchWired = '1';
    input.addEventListener('input', () => {
      neuQueueChatSearch(input.value);
    });
  });
  neuChatState.chatSearchWired = true;
  neuSyncChatSearchInputs();
}

function neuWireShareChatSearchInput() {
  if (neuChatState.shareSearchWired) return;
  const input = neuChatShareSearchInputNode();
  if (!(input instanceof HTMLInputElement)) return;
  neuChatState.shareSearchWired = true;
  input.addEventListener('input', () => {
    neuQueueShareChatSearch(input.value);
  });
}

function neuRenderChatList() {
  neuSyncChatHostSurface();
  const root = neuInboxListNode();
  if (!(root instanceof HTMLElement)) return;

  const allRows = neuSortChatRows(Array.isArray(neuChatState.listRows) ? neuChatState.listRows : []);
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
      const lastSenderId = String(row.lastMessageSenderId || row.lastSenderUid || '').trim();
      let lastSenderLabel = '';
      if (lastSenderId) {
        if (lastSenderId === neuCurrentUid()) lastSenderLabel = 'Tu';
        else if (lastSenderId === String(row.otherUid || '').trim()) lastSenderLabel = displayName;
        else lastSenderLabel = lastSenderId.slice(0, 8);
      }
      const previewLine = lastSenderLabel ? `${lastSenderLabel}: ${lastText}` : lastText;
      const timeLabel = row.lastMessageAt ? neuFormatAgoShort(row.lastMessageAt) : '';
      const online = profile?.isOnline === true || profile?.online === true;
      const unread = neuUnreadValue(row.unreadCount);
      const unreadLabel = neuUnreadBadgeLabel(unread);
      const unreadBadge = unreadLabel
        ? `<span class="neu-unread-badge neu-chat-unread-badge" aria-label="${esc(`Sin leer: ${unread}`)}">${esc(unreadLabel)}</span>`
        : '';
      const avatarHtml = avatarUrl
        ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
        : `<span>${esc(neuAvatarLetter(displayName))}</span>`;
      const pinned = row.pinned === true;
      const activeConversationId = String(neuChatState.currentConversationId || neuChatState.activeChatId || '').trim();
      const isActive = activeConversationId && activeConversationId === String(row.conversationId || '').trim();

      return `
        <div class="neuInboxItemWrap neu-chat-item-wrap${pinned ? ' is-pinned' : ''}">
          <button
            class="neuInboxItem neu-chat-item${unread > 0 ? ' is-unread' : ''}${isActive ? ' is-active' : ''}"
            type="button"
            data-neu-chat-open="${esc(row.conversationId)}"
            data-neu-chat-other="${esc(row.otherUid)}"
          >
            <span class="avatar-frame neu-chat-avatar">${avatarHtml}<span class="neuInboxOnlineDot${online ? ' is-online' : ''}"></span></span>
            <span class="neuInboxCopy neu-chat-copy">
              <span class="neuInboxTop">
                <span class="neuInboxName neu-chat-title">${titleHtml} <small>${esc(handle)}</small></span>
                <span class="neuInboxTime neu-chat-time">${esc(timeLabel)}</span>
              </span>
              <span class="neuInboxPreview neu-chat-last">${esc(previewLine)}</span>
            </span>
          </button>
          ${
            pinned
              ? `<button
                  class="btn-white-outline neu-chat-pin-btn is-pinned"
                  type="button"
                  data-neu-chat-pin="${esc(row.conversationId)}"
                  aria-label="Quitar pin"
                  title="Quitar pin"
                >??</button>`
              : ''
          }
          ${unreadBadge ? `<span class="neuInboxUnread">${unreadBadge}</span>` : ''}
        </div>
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
  const root = neuInboxListNode();
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

function neuChatPeerPresenceLabel(profile = {}) {
  if (!neuChatIsFeatureEnabled('presenceEnabled')) {
    return 'Estado no disponible';
  }
  const rawStatus = String(profile?.status || profile?.state || '').trim().toLowerCase();
  const onlineFlag = profile?.isOnline === true || profile?.online === true || rawStatus === 'online' || rawStatus === 'activo';
  if (onlineFlag) return 'En linea · activo ahora';
  const lastSeenRaw = profile?.lastSeenAt || profile?.updatedAt || null;
  const lastSeenMs = neuTimeToMs(lastSeenRaw);
  if (!lastSeenMs) return 'Desconectado · activo recientemente';
  return `Desconectado · ${neuFormatAgoShort(lastSeenRaw)}`;
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
  const presenceNode = document.getElementById('neuChatPeerPresence');
  if (nameNode instanceof HTMLElement) nameNode.textContent = displayName;
  if (handleNode instanceof HTMLElement) handleNode.textContent = handle;
  if (presenceNode instanceof HTMLElement) presenceNode.textContent = neuChatPeerPresenceLabel(profile);
  const hasConversation = !!String(neuChatState.currentConversationId || '').trim();
  ['neuChatCallBtn', 'neuChatVideoBtn', 'neuChatMoreBtn'].forEach((id) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLButtonElement) {
      const disabled = !hasConversation;
      node.disabled = false;
      node.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      node.setAttribute('data-neu-chat-action-disabled', disabled ? '1' : '0');
      if (id === 'neuChatCallBtn') node.title = disabled ? 'No disponible' : 'Llamar';
      if (id === 'neuChatVideoBtn') node.title = disabled ? 'No disponible' : 'Videollamada';
      if (id === 'neuChatMoreBtn') node.title = disabled ? 'No disponible' : 'Mas opciones';
    }
  });
  if (!hasConversation) neuCloseChatHeaderMenu();
  neuRenderChatHeaderMenu();
}

function neuRenderChatMessages() {
  const scrollSurface = neuChatScrollNode();
  const messagesRoot = neuChatMessagesNode();
  if (!(scrollSurface instanceof HTMLElement) || !(messagesRoot instanceof HTMLElement)) return;
  const topStatusHtml = `
    <div id="neuChatTopLoader" class="neuChatTopLoader${neuChatState.isLoadingMore ? '' : ' hidden'}">Cargando...</div>
    <div id="neuChatTopEnd" class="neuChatTopEnd hidden">No hay mensajes anteriores</div>
  `;
  const meUid = neuCurrentUid();
  const prevLastRenderedMsgId = String(neuChatState.lastRenderedMsgId || '');
  const currentConversationId = String(neuChatState.currentConversationId || '').trim();
  const rawList = Array.isArray(neuChatState.messages) ? neuChatState.messages : [];
  const hiddenSet = neuChatHiddenSetForConversation(currentConversationId);
  const list = rawList.filter((item) => {
    const id = String(item?.id || '').trim();
    return !id || !hiddenSet.has(id);
  });
  if (!list.length) {
    const isOpeningConversation = currentConversationId && currentConversationId === String(neuChatState.openingConversationId || '').trim();
    if (isOpeningConversation) {
      messagesRoot.innerHTML = `${topStatusHtml}${neuChatSkeletonRowsHtml()}`;
    } else {
      const emptyTitle = rawList.length ? 'No hay mensajes visibles' : 'Empieza la conversación';
      const emptySub = rawList.length ? 'Ocultaste todos los mensajes de este chat en este dispositivo.' : 'Envia un mensaje rapido para comenzar.';
      messagesRoot.innerHTML = `
        ${topStatusHtml}
        <div class="neu-chat-empty-state neu-chat-empty">
          <p class="neu-chat-empty-title">${esc(emptyTitle)}</p>
          <p class="neu-chat-empty-sub">${esc(emptySub)}</p>
          <div class="neu-chat-empty-actions">
            <button class="btn-white-outline neu-chat-empty-quick" type="button" data-neu-chat-empty-quick="??">??</button>
            <button class="btn-white-outline neu-chat-empty-quick" type="button" data-neu-chat-empty-quick="??">??</button>
          </div>
        </div>
      `;
    }
    neuChatState.lastRenderedMsgId = '';
    neuChatSetLastMessageRef(null);
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
  const outgoingStatusMap = neuChatOutgoingStatusMap(list, meUid);
  const newestMessageId = String(list[list.length - 1]?.id || '').trim();
  const myLastReadMessageId = String(neuChatState.myLastReadMessageId || '').trim();
  const myLastReadMs = neuTimeToMs(neuChatState.myLastReadAt);
  let firstUnreadIndex = -1;
  if (myLastReadMessageId) {
    const readIndex = list.findIndex((item) => String(item?.id || '').trim() === myLastReadMessageId);
    if (readIndex >= 0 && readIndex < list.length - 1) {
      firstUnreadIndex = readIndex + 1;
    }
  }
  if (firstUnreadIndex < 0 && myLastReadMs > 0) {
    firstUnreadIndex = list.findIndex((item) => neuTimeToMs(item?.createdAt) > myLastReadMs);
  }
  let renderMessageIndex = 0;
  let previousDayKey = '';

  const rowsHtml = grouped
    .map((group) => {
      const groupDayDate = neuChatDate(group.firstCreatedAt || group.lastCreatedAt);
      const groupDayKey = groupDayDate
        ? `${groupDayDate.getFullYear()}-${groupDayDate.getMonth() + 1}-${groupDayDate.getDate()}`
        : '';
      const dayDividerHtml =
        groupDayKey && groupDayKey !== previousDayKey
          ? `<div class="neuDateDivider"><span>${esc(neuFormatChatDayDivider(groupDayDate))}</span></div>`
          : '';
      if (groupDayKey) previousDayKey = groupDayKey;
      const mine = String(group.senderUid || '').trim() === meUid;
      const messagesHtml = (group.messages || [])
        .map((item, index, arr) => {
          const prevItem = index > 0 ? arr[index - 1] : null;
          const nextItem = index < arr.length - 1 ? arr[index + 1] : null;
          const sameSenderAsPrev = !!prevItem && String(prevItem.senderUid || '').trim() === String(item.senderUid || '').trim();
          const sameSenderAsNext = !!nextItem && String(nextItem.senderUid || '').trim() === String(item.senderUid || '').trim();
          const prevGapMs = prevItem ? Math.max(0, Number(item.ts || 0) - Number(prevItem.ts || 0)) : Number.POSITIVE_INFINITY;
          const nextGapMs = nextItem ? Math.max(0, Number(nextItem.ts || 0) - Number(item.ts || 0)) : Number.POSITIVE_INFINITY;
          const prevDate = prevItem ? neuChatDate(prevItem.createdAt) : null;
          const currDate = neuChatDate(item.createdAt);
          const nextDate = nextItem ? neuChatDate(nextItem.createdAt) : null;
          const sameDayAsPrev =
            prevDate instanceof Date &&
            currDate instanceof Date &&
            prevDate.getFullYear() === currDate.getFullYear() &&
            prevDate.getMonth() === currDate.getMonth() &&
            prevDate.getDate() === currDate.getDate();
          const sameDayAsNext =
            nextDate instanceof Date &&
            currDate instanceof Date &&
            nextDate.getFullYear() === currDate.getFullYear() &&
            nextDate.getMonth() === currDate.getMonth() &&
            nextDate.getDate() === currDate.getDate();
          const groupedWithPrev = sameSenderAsPrev && sameDayAsPrev && prevGapMs <= NEU_CHAT_GROUP_WINDOW_MS;
          const groupedWithNext = sameSenderAsNext && sameDayAsNext && nextGapMs <= NEU_CHAT_GROUP_WINDOW_MS;
          let groupVariantClass = ' neuMsg--solo';
          if (groupedWithPrev && groupedWithNext) groupVariantClass = ' neuMsg--middle';
          else if (!groupedWithPrev && groupedWithNext) groupVariantClass = ' neuMsg--first';
          else if (groupedWithPrev && !groupedWithNext) groupVariantClass = ' neuMsg--last';
          const rawText = neuChatMessageText(item);
          const text = esc(rawText).replace(/\n/g, '<br />');
          const dataTextAttr = rawText.replace(/\s+/g, ' ').trim().slice(0, 240);
          const messageTsAttr = String(neuTimeToMs(item?.createdAt) || Number(item?.ts || 0) || 0);
          const imageUrl = String(item.imageUrl || '').trim();
          const isDeleted = !!item?.deletedAt;
          const isEdited = !!item?.editedAt;
          const replyTo = neuChatNormalizeReplyPayload(item?.replyTo);
          const firstClass = index === 0 ? ' is-group-first' : '';
          const lastClass = index === arr.length - 1 ? ' is-group-last' : '';
          const messageId = String(item?.id || '').trim();
          const mineReaction = isDeleted ? '' : neuReactionType(neuChatState.reactionMine.get(messageId));
          const reactionBar = isDeleted ? '' : neuReactionBarHtml(messageId);
          const pickerOptions = NEU_CHAT_REACTION_TYPES.map((type) => {
            const emoji = neuReactionEmoji(type);
            const activeClass = mineReaction === type ? ' is-active' : '';
            return `<button class="neuReactOption${activeClass}" type="button" data-neu-react-message="${esc(messageId)}" data-neu-react-type="${esc(type)}" aria-label="${esc(type)}">${esc(emoji)}</button>`;
          }).join('');
          const reactBtnLabel = mineReaction ? neuReactionEmoji(mineReaction) : '??';
          const reactWrapClass = mine ? ' is-outgoing' : ' is-incoming';
          const unreadDividerHtml =
            renderMessageIndex === firstUnreadIndex
              ? '<div class="neuUnreadDivider" data-neu-unread-divider="1">Nuevos mensajes</div>'
              : '';
          renderMessageIndex += 1;
          const imageHtml = imageUrl
            ? `
              <div class="neuMsg neuMsg--image">
                <button class="neuChatImageBtn" type="button" data-neu-chat-image="${esc(imageUrl)}" aria-label="Abrir imagen">
                  <img class="neuMsgImage neuChatImagePreview" loading="lazy" src="${esc(imageUrl)}" alt="chat image" />
                </button>
                <div class="neuMsgTime">${esc(neuChatFormatClock(item.createdAt))}</div>
              </div>
            `
            : '';
          const postRefRaw = item?.postRef && typeof item.postRef === 'object' ? item.postRef : null;
          const postId = String(postRefRaw?.postId || '').trim();
          const postOwnerUid = String(postRefRaw?.ownerUid || '').trim();
          const hasPostRef = !!postId && !!postOwnerUid;
          const shareType = String(item?.shareType || '').trim().toLowerCase();
          const shareId = String(item?.shareId || '').trim();
          const shareUrl =
            String(item?.shareUrl || '').trim() ||
            String(item?.postUrl || '').trim() ||
            (hasPostRef ? `neu-social-app.html?post=${encodeURIComponent(postId)}` : '');
          const previewTitle = String(item?.previewTitle || '').trim();
          const previewSubtitle = String(item?.previewSubtitle || '').trim();
          const previewImageUrl = String(item?.previewImageUrl || '').trim();
          const postSnippet = rawText.replace(/^(?:\?+\s*)?Post:\s*/i, '').trim() || 'Post compartido';
          const hasSharePreview = (!!shareType || hasPostRef) && (!!previewTitle || !!postSnippet || !!shareUrl || !!shareId);
          const previewLoading = hasSharePreview && !previewTitle;
          const previewFallbackLabel = shareType === 'profile' ? '??' : '??';
          const previewImageHtml = previewImageUrl
            ? `
              <div class="neuChatPostCardPreview is-loading">
                <img
                  class="neuChatPostCardPreviewImg"
                  loading="lazy"
                  src="${esc(previewImageUrl)}"
                  alt="preview"
                  data-neu-share-preview-img="1"
                  data-share-type="${esc(shareType || 'post')}"
                  data-preview-url="${esc(previewImageUrl)}"
                />
                <span class="neuChatPostCardPreviewFallback" aria-hidden="true">${esc(previewFallbackLabel)}</span>
              </div>
            `
            : `
              <div class="neuChatPostCardPreview neuChatPostCardPreviewNoImage">
                <span class="neuChatPostCardPreviewFallback" aria-hidden="true">${esc(previewFallbackLabel)}</span>
              </div>
            `;
          const postCardHtml = hasSharePreview
            ? `
              <div class="neuChatPostCard${previewLoading ? ' is-loading' : ''}" data-neu-share-type="${esc(shareType || 'post')}">
                ${previewImageHtml}
                <div class="neuChatPostCardTitle">${esc(previewTitle || (shareType === 'profile' ? 'Perfil compartido' : 'Post compartido'))}</div>
                <div class="neuChatPostCardSnippet">${esc(previewSubtitle || postSnippet.slice(0, 120) || 'Cargando vista previa...')}</div>
                ${
                  shareUrl
                    ? `<button class="btn-white-outline neuChatPostOpenBtn" type="button" data-neu-chat-open-post="${esc(shareUrl)}">Abrir</button>`
                    : ''
                }
              </div>
            `
            : '';
          const textHtml = !hasSharePreview && text ? `<div class="neuMessageText">${text}</div>` : '';
          const deletedTextHtml = isDeleted && !textHtml ? '<div class="neuMessageText">Mensaje eliminado</div>' : '';
          const contentHtml = imageHtml || postCardHtml || textHtml || deletedTextHtml ? `${imageHtml}${postCardHtml}${textHtml}${deletedTextHtml}` : '-';
          const replySnippet = replyTo ? String(replyTo.snippet || '').trim() || '...' : '';
          const quoteHtml = replyTo
            ? `
              <button class="neuReplyQuote" type="button" data-neu-reply-jump="${esc(replyTo.messageId)}" aria-label="Ir al mensaje citado">
                <span class="neuReplyQuoteSnippet">${esc(replySnippet)}</span>
              </button>
            `
            : '';
          const outgoingStatus = mine ? String(outgoingStatusMap.get(messageId) || '').trim() : '';
          const outgoingStatusHtml = outgoingStatus ? `<div class="neuMsgSeen">${esc(outgoingStatus)}</div>` : '';
          const editedHtml = isEdited && !isDeleted ? '<div class="neuMsgEdited">(editado)</div>' : '';
          const metaHtml = !groupedWithNext ? `<div class="neuMsgMeta">${esc(neuChatFormatClock(item.createdAt))}</div>` : '';
          const showAvatar = !mine && !groupedWithNext;
          const avatarSlotHtml = mine
            ? ''
            : `
              <div class="neuAvatarGutter${showAvatar ? ' is-visible' : ''}">
                ${showAvatar ? incomingAvatar : '<span class="neuMsgAvatar neuMsgAvatarGhost" aria-hidden="true"></span>'}
              </div>
            `;
          const rowClass = mine
            ? 'neuMsgRow neuMessageRow outgoing neuMsgRow--outgoing'
            : 'neuMsgRow neuMessageRow incoming neuMsgRow--incoming';
          const canEditMessage = neuChatCanEditMessage(item, meUid);
          const canDeleteMessage = neuChatCanManageMessage(item, meUid) && !isDeleted;
          const menuBtnHtml = canEditMessage || canDeleteMessage
            ? `<button class="neuMsgMenuBtn" type="button" data-action="msg-menu" data-mid="${esc(messageId)}" aria-label="Opciones">&#x22ef;</button>`
            : '';
          const reactWrapHtml = isDeleted
            ? ''
            : `
              <div class="neuReactWrap${reactWrapClass}" data-neu-react-wrap="${esc(messageId)}">
                <button class="neuReactBtn${mineReaction ? ' is-active' : ''}" type="button" data-neu-react-toggle="${esc(messageId)}" aria-label="Reaccionar">
                  ${esc(reactBtnLabel)}
                </button>
                <div class="neuReactPicker${reactWrapClass}" data-neu-react-picker="${esc(messageId)}">
                  ${pickerOptions}
                </div>
              </div>
            `;
          return `
            ${index === 0 ? dayDividerHtml : ''}
            ${unreadDividerHtml}
            <div class="${rowClass}">
              ${avatarSlotHtml}
              <div
                class="neuMsgWrap neuMessageItem${mine ? ' is-outgoing' : ' is-incoming'}${groupVariantClass}"
                data-neu-msg-id="${esc(messageId)}"
                data-mid="${esc(messageId)}"
                data-text="${esc(dataTextAttr)}"
                data-sender="${esc(String(item?.senderUid || ''))}"
                data-ts="${esc(messageTsAttr)}"
                data-neu-group-prev="${groupedWithPrev ? '1' : '0'}"
                data-neu-group-next="${groupedWithNext ? '1' : '0'}"
              >
                <button class="neuReplyBtn" type="button" data-neu-reply-message="${esc(messageId)}" aria-label="Responder">
                  &#x21A9; Responder
                </button>
                ${menuBtnHtml}
                ${reactWrapHtml}
                ${quoteHtml}
                <div class="neuMessageBubble neuMsg neuMsgBubble${firstClass}${lastClass}${imageUrl ? ' has-image neuMsg--image' : ''}${isDeleted ? ' is-deleted' : ''}" data-msg-id="${esc(messageId)}">${contentHtml}</div>
                <div class="neuReactBar${reactionBar ? '' : ' is-empty'}" data-neu-react-bar="${esc(messageId)}">${reactionBar}</div>
                ${metaHtml}
                ${editedHtml}
                ${outgoingStatusHtml}
              </div>
            </div>
          `;
        })
        .join('');

      return `
        ${messagesHtml}
      `;
    })
    .join('');

  messagesRoot.innerHTML = `${topStatusHtml}${rowsHtml}`;
  const renderedMessageNodes = messagesRoot.querySelectorAll('.neuMessageItem');
  if (renderedMessageNodes.length) {
    const lastNode = renderedMessageNodes[renderedMessageNodes.length - 1];
    neuChatSetLastMessageRef(lastNode instanceof HTMLElement ? lastNode : null);
  } else {
    neuChatSetLastMessageRef(null);
  }
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
  neuSyncOwnActiveThreadState('');
  neuChatStopTypingAndTimers({ bestEffort: true });
  neuStopTypingListener();
  neuStopReactionListeners();
  neuCloseMsgMenu();
  neuCloseChatHeaderMenu();
  neuCloseChatEmojiPicker();
  neuClearChatReplyLongPressTimer();
  neuSetChatLongPressMenuOpen('');
  neuClearChatAttachment();
  neuClearChatReplyDraft();
  neuClearChatEditDraft();
  neuClearChatEditDraft();
  neuSetChatImageLightboxOpen('');
  if (neuChatState.currentConversationId) {
    neuChatState.lastConversationId = neuChatState.currentConversationId;
    neuChatState.lastPeerUid = neuChatState.peerUid;
  }
  neuSetChatSending(false);
  neuSetChatDockOpen(false);
  neuSetInboxPanelOpen(false);
  neuSetChatModalOpen(false);
  neuChatSetHint('');
  neuStopChatMessageListener();
  neuChatState.activeChatId = '';
  neuChatState.currentConversationId = '';
  neuChatState.currentMembers = [];
  neuChatState.currentMemberKey = '';
  neuChatState.currentConversationMeta = null;
  neuChatState.peerUid = '';
  neuChatState.messages = [];
  neuChatState.pageSize = 50;
  neuChatState.isLoadingMore = false;
  neuChatState.hasMore = true;
  neuChatState.oldestDoc = null;
  neuChatState.lastQueryCursor = null;
  neuChatState.loadedCount = 0;
  neuChatState.liveMessages = [];
  neuChatState.olderMessages = [];
  neuChatState.newMessageChipVisible = false;
  neuChatState.peerTyping = false;
  neuChatState.myLastReadAt = null;
  neuChatState.myLastReadMessageId = '';
  neuChatState.peerLastReadAt = null;
  neuChatState.peerLastReadMessageId = '';
  neuChatState.lastRenderedMsgId = '';
  neuChatSetLastMessageRef(null);
  neuChatState.typingConversationId = '';
  neuChatState.typingActive = false;
  if (neuChatState.replyHighlightTimer) {
    window.clearTimeout(neuChatState.replyHighlightTimer);
    neuChatState.replyHighlightTimer = 0;
  }
  if (neuChatState._endHintT) {
    window.clearTimeout(neuChatState._endHintT);
    neuChatState._endHintT = 0;
  }
  neuSetChatImageLightboxOpen('');
  if (neuChatState.bodyScrollRaf) {
    window.cancelAnimationFrame(neuChatState.bodyScrollRaf);
    neuChatState.bodyScrollRaf = 0;
  }
  neuSyncChatHostSurface();
  neuSetNewMessagesChipVisible(false);
  neuSetTypingRowVisible(false);
  neuSyncChatComposerState();
  neuRenderChatList();
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
  neuChatState.messageListenerToken = Number(neuChatState.messageListenerToken || 0) + 1;
  neuChatState.messageListenerConversationId = '';
  if (typeof neuChatState.messageUnsub === 'function') {
    try {
      neuChatState.messageUnsub();
    } catch {
      // ignore unsubscribe errors
    }
  }
  neuChatState.messageUnsub = null;
}

async function neuChatLoadOlderMessages() {
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const pageSize = Math.max(1, Math.floor(Number(neuChatState.pageSize) || 50));
  const cursor = neuChatState.lastQueryCursor || neuChatState.oldestDoc;
  if (!conversationId || !cursor || neuChatState.isLoadingMore) return;
  if (!neuChatState.hasMore) {
    neuShowChatEndHint();
    return;
  }

  const bodyEl = neuChatScrollNode();
  if (!(bodyEl instanceof HTMLElement)) return;

  neuChatState.isLoadingMore = true;
  neuRenderChatMessages();

  const prevHeight = bodyEl.scrollHeight;
  const prevTop = bodyEl.scrollTop;
  let prepended = false;
  let shouldShowEndHint = false;

  try {
    const olderQuery = query(
      collection(db, 'neuConversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(cursor),
      limit(pageSize),
    );
    const snap = await getDocs(olderQuery);
    if (snap.empty) {
      neuChatState.hasMore = false;
      shouldShowEndHint = true;
      return;
    }

    const nextBatchAsc = neuMapChatMessagesFromDocs(snap.docs);
    const existingIds = new Set(
      [...(Array.isArray(neuChatState.olderMessages) ? neuChatState.olderMessages : []), ...(Array.isArray(neuChatState.liveMessages) ? neuChatState.liveMessages : [])]
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean),
    );
    const filtered = nextBatchAsc.filter((row) => !existingIds.has(String(row?.id || '').trim()));
    if (filtered.length) {
      neuChatState.olderMessages = [...filtered, ...(Array.isArray(neuChatState.olderMessages) ? neuChatState.olderMessages : [])];
      prepended = true;
    }

    const oldest = snap.docs[snap.docs.length - 1] || null;
    neuChatState.oldestDoc = oldest;
    neuChatState.lastQueryCursor = oldest;
    if (snap.docs.length < pageSize) neuChatState.hasMore = false;
  } catch (error) {
    if (NEU_QA) console.warn('[neu-chat] older page load failed', error);
  } finally {
    neuChatState.isLoadingMore = false;
    neuRebuildChatMessagesFromBuckets();
    neuRenderChatMessages();
    if (shouldShowEndHint) neuShowChatEndHint();
    if (prepended) {
      const nextHeight = bodyEl.scrollHeight;
      bodyEl.scrollTop = prevTop + (nextHeight - prevHeight);
    }
  }
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
      neuChatState.listRows = neuSortChatRows(snap.docs.map((row) => neuMapUserChatRow(row, uid)));
      const activeConvId = String(neuChatState.currentConversationId || '').trim();
      if (activeConvId) {
        const activeRow = neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === activeConvId) || null;
        neuChatState.myLastReadAt = activeRow?.lastReadAt || null;
        neuChatState.myLastReadMessageId = String(activeRow?.lastReadMessageId || '').trim();
        neuChatState.peerLastReadAt = activeRow?.peerLastReadAt || null;
        neuChatState.peerLastReadMessageId = String(activeRow?.peerLastReadMessageId || '').trim();
        const inboxActive = String(neuChatState.hostMode || '').trim() === 'inbox';
        const dockActive = String(neuChatState.hostMode || '').trim() === 'dock';
        if (neuIsChatRootOpen() || inboxActive || dockActive) {
          neuRenderChatMessages();
        }
      }
      neuSyncUnreadUi();
      neuRenderChatList();
      const shareModal = neuChatShareModalNode();
      if (shareModal instanceof HTMLElement && !shareModal.hidden) {
        neuRenderSharePostChatList();
      }
    },
    (error) => {
      if (neuChatHandlePermissionDenied(error, 'inbox_list', uid, 'Sin permisos para cargar el inbox.')) {
        neuStopChatListListener();
        neuChatState.listRows = [];
        neuSyncUnreadUi();
        neuRenderChatList();
        return;
      }
      console.error('[neu-chat] list subscription failed', error);
      neuChatState.listRows = [];
      neuSyncUnreadUi();
      neuRenderChatList();
    },
  );
  neuChatState.listUid = uid;
}

/*
Manual test plan (unread + sorting metadata):
1) User A sends a message to User B in thread T.
2) Verify neuConversations/T has lastMessageAt, lastMessageText (<=200), lastMessageSenderId.
3) Verify neuUserChats/A/chats/T unreadCount=0 and neuUserChats/B/chats/T increments by 1 (unless B is actively viewing T).
4) Open T as User B: unreadCount resets to 0 and lastReadAt updates once per open (no write spam).
5) Inbox list is sorted by lastMessageAt desc and each row shows latest text/sender/time.
*/

function neuChatLastRenderedMessageId(conversationId = '') {
  const convId = String(conversationId || '').trim();
  const activeId = String(neuChatState.currentConversationId || '').trim();
  if (!convId || convId !== activeId) return '';
  const list = Array.isArray(neuChatState.messages) ? neuChatState.messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const messageId = String(list[i]?.id || '').trim();
    if (messageId) return messageId;
  }
  return '';
}

async function neuMarkConversationRead(conversationId, { members = [], peerUid = '', force = false } = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  if (!convId || !meUid) return;
  if (!neuChatIsFeatureEnabled('readSyncEnabled')) return;
  const blockedSet = neuChatState.markReadBlockedConversations instanceof Set ? neuChatState.markReadBlockedConversations : null;
  const inFlightSet = neuChatState.markReadInFlight instanceof Set ? neuChatState.markReadInFlight : null;
  const marksMap = neuChatState.markReadAtByConversation instanceof Map ? neuChatState.markReadAtByConversation : null;
  if (!force && blockedSet?.has(convId)) return;
  if (inFlightSet?.has(convId)) return;
  if (!force && marksMap instanceof Map) {
    const lastMarkedAt = Number(marksMap.get(convId) || 0);
    if (lastMarkedAt > 0 && Date.now() - lastMarkedAt < NEU_CHAT_MARK_READ_DEBOUNCE_MS) return;
  }

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
  const lastReadMessageId = neuChatLastRenderedMessageId(convId) || String(row?.lastReadMessageId || '').trim();
  if (lastReadMessageId) payload.lastReadMessageId = lastReadMessageId;
  if (normalizedMembers.length === 2) {
    payload.members = normalizedMembers;
    payload.memberKey = neuChatMemberKey(normalizedMembers[0], normalizedMembers[1]);
    payload.otherUid = resolvedPeerUid || normalizedMembers.find((uid) => uid !== meUid) || '';
  }

  inFlightSet?.add(convId);
  try {
    await setDoc(doc(db, 'neuUserChats', meUid, 'chats', convId), payload, { merge: true });
    blockedSet?.delete(convId);
    marksMap?.set(convId, Date.now());
    neuSetConversationUnreadLocal(convId, 0);
  } catch (error) {
    if (neuIsPermissionDenied(error)) {
      if (blockedSet && !blockedSet.has(convId)) {
        blockedSet.add(convId);
      }
      neuChatDisableFeature('readSyncEnabled', 'Sin permisos para actualizar mensajes leidos.', {
        action: 'mark_read',
        conversationId: convId,
      });
      return;
    }
    if (NEU_QA) console.warn('[neu-chat] mark read failed', error);
  } finally {
    inFlightSet?.delete(convId);
  }
}

function neuStartChatMessagesListener(conversationId, members, options = {}) {
  const convId = String(conversationId || '').trim();
  const meUid = neuCurrentUid();
  const memberList = Array.isArray(members) ? members : [];
  const expectedOpenSeq = Number(options?.openSeq || 0);
  if (!memberList.includes(meUid)) {
    neuChatSetHint('Sin acceso a este chat.', true);
    return;
  }

  neuChatState.pageSize = NEU_CHAT_MAX_MESSAGES;
  neuChatState.isLoadingMore = false;
  neuChatState.hasMore = true;
  neuChatState.oldestDoc = null;
  neuChatState.lastQueryCursor = null;
  neuChatState.loadedCount = 0;
  neuChatState.liveMessages = [];
  neuChatState.olderMessages = [];
  neuRebuildChatMessagesFromBuckets();

  neuStopChatMessageListener();
  const listenerToken = Number(neuChatState.messageListenerToken || 0) + 1;
  neuChatState.messageListenerToken = listenerToken;
  neuChatState.messageListenerConversationId = convId;
  const q = query(
    collection(db, 'neuConversations', convId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(neuChatState.pageSize),
  );
  let firstSnapshot = true;

  neuChatState.messageUnsub = onSnapshot(
    q,
    (snap) => {
      if (listenerToken !== Number(neuChatState.messageListenerToken || 0)) return;
      if (expectedOpenSeq > 0 && expectedOpenSeq !== Number(neuChatState.openSeq || 0)) return;
      if (convId !== String(neuChatState.currentConversationId || '').trim()) return;
      const bodyEl = neuChatScrollNode();
      const prevScrollHeight = bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0;
      const prevLastRenderedMsgId = String(neuChatState.lastRenderedMsgId || '').trim();
      const wasNearBottom = neuChatIsNearBottom(NEU_CHAT_SCROLL_NEAR_BOTTOM);
      const isFirstSnapshot = firstSnapshot === true;
      const incomingAdded = snap.docChanges().some((change) => {
        if (change.type !== 'added') return false;
        const senderUid = String(change.doc.data()?.senderUid || '').trim();
        return !!senderUid && senderUid !== meUid;
      });
      if (isFirstSnapshot || wasNearBottom) neuSetNewMessagesChipVisible(false);
      else if (incomingAdded) neuSetNewMessagesChipVisible(true);

      neuChatState.liveMessages = neuMapChatMessagesFromDocs(snap.docs);
      if (isFirstSnapshot) {
        const oldest = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        neuChatState.oldestDoc = oldest;
        neuChatState.lastQueryCursor = oldest;
        neuChatState.hasMore = snap.docs.length >= neuChatState.pageSize;
        if (!oldest) neuChatState.hasMore = false;
        if (String(neuChatState.openingConversationId || '').trim() === convId) {
          neuChatState.openingConversationId = '';
        }
      }
      neuRebuildChatMessagesFromBuckets();
      neuRenderChatMessages();
      const nextLastRenderedMsgId = String(neuChatState.lastRenderedMsgId || '').trim();
      const hasNewTailMessage = !!nextLastRenderedMsgId && nextLastRenderedMsgId !== prevLastRenderedMsgId;

      const shouldForceBottomOnFirst =
        isFirstSnapshot && String(neuChatState.forceScrollOnFirstSnapshotConversationId || '').trim() === convId;
      if (shouldForceBottomOnFirst) {
        neuChatState.forceScrollOnFirstSnapshotConversationId = '';
        neuSetNewMessagesChipVisible(false);
        neuChatScrollBottomAfterPaint('auto', { conversationId: convId, listenerToken, openSeq: expectedOpenSeq, force: true });
      } else if (wasNearBottom && hasNewTailMessage) {
        neuChatScrollBottomAfterPaint('smooth', { conversationId: convId, listenerToken, openSeq: expectedOpenSeq });
      } else if (!isFirstSnapshot && bodyEl instanceof HTMLElement) {
        const nextScrollHeight = bodyEl.scrollHeight;
        const delta = nextScrollHeight - prevScrollHeight;
        if (delta > 0 && !hasNewTailMessage) bodyEl.scrollTop += delta;
      }

      const shouldMarkRead = incomingAdded;
      if (shouldMarkRead) {
        neuMarkConversationRead(convId, {
          members: memberList,
          peerUid: memberList.find((uid) => uid !== meUid) || neuChatState.peerUid,
          force: false,
        }).catch(() => null);
      }
      firstSnapshot = false;
    },
    (error) => {
      if (listenerToken !== Number(neuChatState.messageListenerToken || 0)) return;
      if (expectedOpenSeq > 0 && expectedOpenSeq !== Number(neuChatState.openSeq || 0)) return;
      if (neuChatHandlePermissionDenied(error, 'messages_sub', convId, 'Sin permisos para leer mensajes.')) {
        neuStopChatMessageListener();
        return;
      }
      console.error('[neu-chat] message subscription failed', error);
      if (String(neuChatState.openingConversationId || '').trim() === convId) {
        neuChatState.openingConversationId = '';
        neuRenderChatMessages();
      }
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

  const requestedMode = neuResolveChatHostMode(seed?.mode);
  let resolvedMode = requestedMode;
  if (!neuMountChatCardForMode(requestedMode)) {
    neuMountChatCardForMode('modal');
    resolvedMode = 'modal';
  }
  neuBindChatScrollSurface(true);
  const openSeq = Number(neuChatState.openSeq || 0) + 1;
  neuChatState.openSeq = openSeq;

  if (String(neuChatState.currentConversationId || '').trim() && String(neuChatState.currentConversationId || '').trim() !== convId) {
    neuChatStopTypingAndTimers({ bestEffort: true });
  }
  neuStopChatMessageListener();
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
  const peerReadMessageFromConversation =
    (peerUid && data?.lastReadMessageIdBy && typeof data.lastReadMessageIdBy === 'object'
      ? data.lastReadMessageIdBy[peerUid]
      : null) ||
    data?.peerLastReadMessageId ||
    data?.lastReadMessageIdPeer ||
    null;
  const myReadFromList = Array.isArray(neuChatState.listRows)
    ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.lastReadAt || null
    : null;
  const peerReadMessageFromList = Array.isArray(neuChatState.listRows)
    ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.peerLastReadMessageId || ''
    : '';

  neuChatState.lastConversationId = convId;
  neuChatState.lastPeerUid = peerUid;
  neuChatState.activeChatId = convId;
  neuChatState.hostMode = resolvedMode;
  neuChatState.currentConversationId = convId;
  neuChatState.currentMembers = members;
  neuChatState.currentMemberKey = memberKey;
  neuChatState.currentConversationMeta = data;
  neuChatState.peerUid = peerUid;
  neuChatState.messages = [];
  neuChatState.openingConversationId = convId;
  neuChatState.forceScrollOnFirstSnapshotConversationId = convId;
  neuChatState.newMessageChipVisible = false;
  neuChatState.peerTyping = false;
  neuChatState.myLastReadAt = myReadFromList;
  neuChatState.myLastReadMessageId = String(
    Array.isArray(neuChatState.listRows)
      ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === convId)?.lastReadMessageId || ''
      : '',
  ).trim();
  neuChatState.peerLastReadAt = peerReadFromConversation || null;
  neuChatState.peerLastReadMessageId = String(peerReadMessageFromList || peerReadMessageFromConversation || '').trim();
  neuChatState.nearBottom = true;
  neuChatState.lastRenderedMsgId = '';
  neuChatState.typingConversationId = convId;
  neuChatState.typingActive = false;
  neuSyncOwnActiveThreadState(convId);
  neuChatSetHint('');
  neuRenderChatHeader();
  neuRenderChatMessages();
  neuSetNewMessagesChipVisible(false);
  neuSetTypingRowVisible(false);
  neuSetInboxPanelOpen(resolvedMode === 'inbox');
  neuSetChatDockOpen(resolvedMode === 'dock');
  neuSetChatModalOpen(resolvedMode === 'modal');
  if (resolvedMode === 'dock') neuPositionDockNearFlag();
  neuRenderChatList();
  if (peerUid) await neuEnsureChatProfile(peerUid);
  neuRenderChatHeader();
  const nowMs = Date.now();
  const isFreshSameOpen =
    neuChatState.openReadConversationId === convId &&
    nowMs - Number(neuChatState.openReadAt || 0) < NEU_CHAT_MARK_READ_DEBOUNCE_MS;
  if (!isFreshSameOpen) {
    neuChatState.openReadConversationId = convId;
    neuChatState.openReadAt = nowMs;
  }
  neuMarkConversationRead(convId, {
    members,
    peerUid,
    force: !isFreshSameOpen,
  }).catch(() => null);
  neuStartChatMessagesListener(convId, members, { openSeq });
  neuStartTypingListener(convId, members);
  neuAfterNextPaint(() => {
    if (String(neuChatState.currentConversationId || '').trim() !== convId) return;
    if (Number(neuChatState.openSeq || 0) !== openSeq) return;
    neuChatScrollBottomAfterPaint('auto', { conversationId: convId, openSeq, force: true });
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
  });
}

/*
Manual test plan (open-thread scroll + skeleton):
1) Open conversation A: skeleton appears briefly, then latest message is visible immediately.
2) Open conversation B right after A: old listener never overwrites B (no race/flicker).
3) Scroll up in B and receive a new message: no forced jump, "Nuevos mensajes" chip appears.
4) Click "Nuevos mensajes": scrolls to bottom and chip hides.
5) Open empty thread: "Empieza la conversación" + quick actions ?? ?? are visible.
*/

async function neuEnsureDirectConversation(uidA, uidB) {
  const members = neuChatMembers(uidA, uidB);
  if (members.length !== 2) return null;
  const memberKey = `${members[0]}_${members[1]}`;
  if (neuChatIsActionBlocked('conversation_create', memberKey)) return null;

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
      lastMessageSenderId: '',
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
      lastMessageSenderId: '',
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
      lastMessageSenderId: '',
      unreadCount: 0,
      lastReadAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  try {
    await batch.commit();
    return { conversationId, members, memberKey };
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'conversation_create', memberKey, 'Sin permisos para crear conversacion.')) {
      return null;
    }
    throw error;
  }
}

async function neuOpenOrStartDirectChat(otherUid, options = {}) {
  const meUid = neuCurrentUid();
  const targetUid = String(otherUid || '').trim();
  if (!meUid || !targetUid || targetUid === meUid) return;
  const ensured = await neuEnsureDirectConversation(meUid, targetUid);
  if (!ensured?.conversationId) return;
  const mode = neuResolveChatHostMode(options?.mode);
  await neuOpenConversation(ensured.conversationId, {
    otherUid: targetUid,
    memberKey: ensured.memberKey,
    mode,
  });
}

async function neuOpenChatWithUser(otherUid, options = {}) {
  const meUid = neuCurrentUid();
  const targetUid = String(otherUid || '').trim();
  if (!meUid) return;
  if (!targetUid || targetUid === meUid) {
    neuChatSetHint('Nie mozna otworzyc czatu z tym profilem.', true);
    return;
  }
  const mode = neuResolveChatHostMode(options?.mode);
  await neuOpenOrStartDirectChat(targetUid, { mode });
  const modal = neuChatModalNode();
  if (mode === 'modal' && modal instanceof HTMLElement && modal.hidden) {
    neuSetChatModalOpen(true);
  }
}

let neuChatOnDemandInitPromise = null;
async function neuEnsureChatReadyOnDemand() {
  const user = auth.currentUser;
  const meUid = String(user?.uid || neuCurrentUid() || '').trim();
  if (!meUid) return false;

  const alreadyReady =
    String(neuChatState.meUid || '').trim() === meUid &&
    (neuChatState.wired === true || typeof neuChatState.listUnsub === 'function');
  if (alreadyReady) return true;

  if (!neuChatOnDemandInitPromise) {
    neuChatOnDemandInitPromise = neuInitChatMvp(user).finally(() => {
      neuChatOnDemandInitPromise = null;
    });
  }

  await neuChatOnDemandInitPromise;
  return true;
}

async function neuOpenProfileMessage(chatUid) {
  const targetUid = String(chatUid || '').trim();
  const meUid = neuCurrentUid();
  if (!targetUid || !meUid || targetUid === meUid) return;

  try {
    await neuEnsureChatReadyOnDemand();
    // Keep current profile route intact; open chat overlay without portal switch.
    await neuOpenChatWithUser(targetUid, { mode: 'dock' });
  } catch (error) {
    console.error('[neu-chat] open from profile failed', error);
    neuChatSetHint('No se pudo iniciar el chat.', true);
  }
}

async function neuSendChatMessage(options = {}) {
  const retryUpload = options && typeof options === 'object' ? options.retryUpload === true : false;
  const meUid = neuCurrentUid();
  const conversationId = String(neuChatState.currentConversationId || '').trim();
  const textInput = neuChatInputNode();
  const editDraft = neuChatNormalizeEditDraft(neuChatState.editDraft);
  const attachmentFile = neuChatState.pendingImageFile instanceof File ? neuChatState.pendingImageFile : null;
  const attachmentFingerprint = neuChatFileFingerprint(attachmentFile);
  const rawText = String(
    textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement ? textInput.value : '',
  );
  const safeText = rawText.trim().slice(0, 1000);
  const replyTo = neuChatNormalizeReplyPayload(neuChatState.replyDraft);
  if (!meUid || !conversationId || (!safeText && !attachmentFile && !editDraft)) {
    neuSyncChatComposerState();
    return;
  }
  if (attachmentFile && neuChatState.attachmentsDisabled === true) {
    neuChatNotifyAttachmentsUnavailable();
    return;
  }
  if (neuChatIsActionBlocked('send', conversationId)) return;
  if (neuChatState.sending || neuChatState.uploading) return;

  if (editDraft) {
    if (attachmentFile) {
      neuChatSetHint('No se puede adjuntar imagen al editar.', true);
      neuSyncChatComposerState();
      return;
    }
    if (!safeText) {
      neuChatSetHint('Escribe un mensaje para editar.', true);
      neuSyncChatComposerState();
      return;
    }

    neuSetChatSending(true);
    neuChatSetHint('');
    try {
      await neuEditChatMessage(editDraft.messageId, safeText);
      if (textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement) {
        textInput.value = '';
        if (textInput instanceof HTMLTextAreaElement) neuChatAutoGrow(textInput);
        textInput.focus({ preventScroll: true });
      }
      neuClearChatEditDraft();
      neuChatAutoResizeInput();
      neuChatSetHint('');
      neuSyncChatComposerState();
    } catch (error) {
      const code = neuChatErrorCode(error) || 'unknown';
      console.error('[neu-chat] edit failed', code, error?.message, error);
      neuChatSetHint(`No se pudo editar (${code}).`, true);
    } finally {
      neuSetChatSending(false);
    }
    return;
  }

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
  let lastFailStage = 'writeDoc';
  let uploadDebug = {
    chatId: conversationId,
    messageId: '',
    storagePath: '',
    fileType: attachmentFile instanceof File ? String(attachmentFile.type || '').trim() : '',
    fileSize: attachmentFile instanceof File ? Number(attachmentFile.size || 0) : 0,
  };

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
      uploadDebug.messageId = messageRef.id;

      const safeFileName = neuSafeChatUploadName(attachmentFile);
      imageStoragePath = `${NEU_CHAT_UPLOAD_PREFIX}${conversationId}/${messageRef.id}/${safeFileName}`;
      uploadDebug.storagePath = imageStoragePath;
      neuChatSetUploadRetryContext({
        conversationId,
        messageId: messageRef.id,
        fileFingerprint: attachmentFingerprint,
      });
      const uploadRef = storageRef(neuChatStorageInstance(), imageStoragePath);
      try {
        lastFailStage = 'uploadBytes';
        await uploadBytes(uploadRef, attachmentFile, {
          contentType: String(attachmentFile.type || 'image/jpeg').trim() || 'image/jpeg',
        });
        lastFailStage = 'getDownloadURL';
        imageUrl = await getDownloadURL(uploadRef);
      } catch (uploadError) {
        const uploadPermissionDenied = neuChatIsUploadPermissionError(uploadError);
        if (uploadPermissionDenied) {
          neuChatSetAttachmentsDisabled(true, 'permission-denied');
          neuChatBlockAction('attach', conversationId, 'Adjuntos no disponibles');
        }
        neuChatLogUploadFail(uploadError, { stage: lastFailStage, ...uploadDebug });
        if (uploadPermissionDenied) return;
        neuChatSetHint(neuChatUploadErrorMessage(uploadError, { stage: lastFailStage }), true, { retryUpload: true });
        return;
      }

      if (!String(imageUrl || '').trim()) {
        neuChatLogUploadFail(new Error('Empty download URL after upload'), {
          stage: 'getDownloadURL',
          ...uploadDebug,
        });
        neuChatSetHint('Upload nieudany', true, { retryUpload: true });
        return;
      }
    } else {
      neuChatSetUploadRetryContext(null);
    }

    if (!messageRef) {
      messageRef = doc(collection(db, 'neuConversations', conversationId, 'messages'));
      uploadDebug.messageId = messageRef.id;
    }

    lastFailStage = 'writeDoc';
    const previewText = neuChatLastMessageText(safeText || (imageUrl ? '?? Foto' : ''));
    const batch = writeBatch(db);
    const incrementRecipients = await neuResolveRecipientsForUnreadIncrement(conversationId, members, meUid);
    const conversationRef = doc(db, 'neuConversations', conversationId);
    batch.set(messageRef, {
      messageId: messageRef.id,
      senderUid: meUid,
      text: safeText,
      content: safeText,
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
        lastMessageSenderId: meUid,
        lastSenderUid: meUid,
        updatedAt: now,
      },
      { merge: true },
    );

    members.forEach((uid) => {
      const otherUid = members.find((candidate) => candidate !== uid) || '';
      const isSender = uid === meUid;
      const payload = {
        otherUid,
        members,
        memberKey,
        lastMessageText: previewText,
        lastMessageAt: now,
        lastMessageSenderId: meUid,
        updatedAt: now,
      };
      if (isSender) {
        payload.unreadCount = 0;
        payload.lastReadAt = now;
        payload.lastReadMessageId = messageRef.id;
      } else if (incrementRecipients.has(uid)) {
        payload.unreadCount = increment(1);
      }
      batch.set(doc(db, 'neuUserChats', uid, 'chats', conversationId), payload, { merge: true });
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
    neuClearChatEditDraft();
    neuChatSetUploadRetryContext(null);
    neuChatSetHint('');
    neuChatAutoResizeInput();
    neuSyncChatComposerState();
    neuSetNewMessagesChipVisible(false);
    neuChatScrollBottomAfterPaint('auto', {
      conversationId,
      listenerToken: Number(neuChatState.messageListenerToken || 0),
      openSeq: Number(neuChatState.openSeq || 0),
      force: true,
    });
  } catch (error) {
    if (neuChatHandlePermissionDenied(error, 'send', conversationId, 'Sin permisos para enviar mensajes.')) return;
    neuChatLogUploadFail(error, { stage: lastFailStage, ...uploadDebug });
    if (attachmentFile) {
      neuChatSetHint(neuChatUploadErrorMessage(error, { stage: lastFailStage }), true, { retryUpload: true });
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
  const card = neuChatModalCardNode();
  if (card instanceof HTMLElement) card.classList.add('neuChatModalContent');
}

function neuChatReadFloatPosition() {
  try {
    let raw = localStorage.getItem(NEU_CHAT_LAUNCHER_STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(NEU_CHAT_FLOAT_STORAGE_KEY);
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
      NEU_CHAT_LAUNCHER_STORAGE_KEY,
      JSON.stringify({
        side: side === 'left' ? 'left' : 'right',
        top: Math.round(Number(top) || 0),
      }),
    );
  } catch {
    // ignore storage errors
  }
}

function neuChatReadDockOpenPreference() {
  try {
    const raw = localStorage.getItem(NEU_CHAT_DOCK_OPEN_STORAGE_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function neuChatSaveDockOpenPreference(open) {
  try {
    localStorage.setItem(NEU_CHAT_DOCK_OPEN_STORAGE_KEY, open === true ? '1' : '0');
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
  neuPositionDockNearFlag();
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
  neuPositionDockNearFlag();
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
  const root = neuChatRootNode();
  if (root instanceof HTMLElement && !root.classList.contains('hidden') && root.classList.contains('is-open')) {
    if (String(neuChatState.hostMode || '').trim() === 'dock') neuPositionDockNearFlag();
    const input = neuChatInputNode();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus({ preventScroll: true });
    }
    return;
  }

  const mode = String(neuChatState.hostMode || '').trim();
  if (mode === 'inbox') {
    const host = neuInboxChatHostNode();
    if (host instanceof HTMLElement && !host.classList.contains('hidden')) {
      const input = neuChatInputNode();
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.focus({ preventScroll: true });
      }
      return;
    }
  }

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

function neuFocusChatDockLauncherTarget() {
  const hasThread = !!String(neuChatState.currentConversationId || '').trim();
  if (hasThread) {
    const input = neuChatInputNode();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      return;
    }
  }
  const search = neuDockInboxSearchNode() || neuInboxSearchNode();
  if (search instanceof HTMLInputElement) {
    search.focus({ preventScroll: true });
    return;
  }
  const fallbackInput = neuChatInputNode();
  if (fallbackInput instanceof HTMLTextAreaElement || fallbackInput instanceof HTMLInputElement) {
    fallbackInput.focus({ preventScroll: true });
  }
}

async function neuToggleChatDockFromLauncher() {
  if (!neuCanUseDockHost()) {
    await neuOpenLastChatOrList();
    return;
  }

  neuChatState.hostMode = 'dock';
  neuMountChatCardForMode('dock');
  neuSetInboxPanelOpen(false);

  const root = neuChatRootNode();
  const dockOpen = neuChatState.dockOpen === true && root instanceof HTMLElement && !root.classList.contains('hidden');
  if (dockOpen) {
    neuSetChatDockOpen(false);
    neuSetTypingRowVisible(false);
    return;
  }

  neuSetChatDockOpen(true);
  neuRenderChatList();
  window.setTimeout(() => {
    neuFocusChatDockLauncherTarget();
    neuUpdateChatComposerOffsetVar();
  }, 0);
}

function neuInitChatDockLauncher() {
  if (neuChatState.dockLauncherWired) return;
  neuChatState.dockLauncherWired = true;

  const savedOpen = neuChatReadDockOpenPreference();
  if (savedOpen === true || savedOpen === false) {
    neuChatState.dockOpen = savedOpen;
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!neuCanUseDockHost() || !neuChatState.dockOpen) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const dock = neuChatRootNode();
      const flag = neuChatFloatNode();
      if (dock instanceof HTMLElement && dock.contains(target)) return;
      if (flag instanceof HTMLElement && (target === flag || flag.contains(target))) return;
      if (target.closest('.neuDockThreadWindow, .neuDockBubbleTray, .neuDockBubble')) return;
      neuSetChatDockOpen(false);
      neuSetTypingRowVisible(false);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Tab') return;
      if (!neuCanUseDockHost() || !neuChatState.dockOpen) return;
      const dock = neuChatRootNode();
      if (!(dock instanceof HTMLElement) || dock.classList.contains('hidden')) return;
      const focusables = Array.from(
        dock.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (node) =>
          node instanceof HTMLElement &&
          node.getAttribute('aria-hidden') !== 'true' &&
          !node.classList.contains('hidden') &&
          node.offsetParent !== null,
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      const inside = activeEl instanceof Node ? dock.contains(activeEl) : false;
      if (!inside) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey) {
        if (activeEl === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
        return;
      }
      if (activeEl === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },
    true,
  );

  if (!neuCanUseDockHost()) return;
  neuChatState.hostMode = 'dock';
  neuMountChatCardForMode('dock');
  neuSetInboxPanelOpen(false);
  neuSetChatDockOpen(neuChatState.dockOpen === true, { persist: false });
  if (neuChatState.dockOpen === true) {
    window.setTimeout(() => neuFocusChatDockLauncherTarget(), 0);
  }
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
    neuToggleChatDockFromLauncher().catch((error) => {
      console.error('[neu-chat] float dock toggle failed', error);
      neuChatSetHint('No se pudo abrir el dock del chat.', true);
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
      if (!target.closest('#neuChatHeaderMenu') && !target.closest('#neuChatMoreBtn')) {
        neuCloseChatHeaderMenu();
      }
      if (!target.closest('#neuChatEmojiPicker') && !target.closest('#neuChatEmojiBtn')) {
        neuCloseChatEmojiPicker();
      }

      const retryUploadBtn = target.closest('[data-neu-chat-toast-retry], [data-neu-chat-retry-upload]');
      if (retryUploadBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        neuSendChatMessage({ retryUpload: true }).catch((error) => {
          neuChatLogUploadFail(error, { stage: 'retry', chatId: neuChatState.currentConversationId });
          neuChatSetHint(neuChatUploadErrorMessage(error, { stage: 'retry' }), true, { retryUpload: true });
        });
        return;
      }

      const chatCallBtn = target.closest('#neuChatCallBtn, #neuChatVideoBtn');
      if (chatCallBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        if (chatCallBtn.getAttribute('data-neu-chat-action-disabled') === '1') {
          neuChatSetHint('Selecciona una conversacion primero.');
          return;
        }
        neuChatSetHint('Funcion proximamente');
        return;
      }

      const chatMoreBtn = target.closest('#neuChatMoreBtn');
      if (chatMoreBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        if (chatMoreBtn.getAttribute('data-neu-chat-action-disabled') === '1') {
          neuChatSetHint('Selecciona una conversacion primero.');
          return;
        }
        const menu = neuChatHeaderMenuNode();
        if (menu instanceof HTMLElement && !menu.classList.contains('hidden')) neuCloseChatHeaderMenu();
        else neuOpenChatHeaderMenu(chatMoreBtn);
        return;
      }

      const headMenuAction = target.closest('[data-neu-chat-head-menu]');
      if (headMenuAction instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const action = String(headMenuAction.getAttribute('data-neu-chat-head-menu') || '').trim();
        if (action === 'mute') {
          neuToggleConversationMuteLocal();
          return;
        }
        if (action === 'copy') {
          neuCopyConversationInfo().catch(() => neuChatSetHint('No se pudo copiar.', true));
          return;
        }
        if (action === 'report') {
          neuCloseChatHeaderMenu();
          neuChatSetHint('Reporte enviado. Revisaremos este chat.');
          return;
        }
        if (action === 'delete') {
          neuDeleteConversationForCurrentUser().catch((error) => {
            if (neuChatHandlePermissionDenied(error, 'delete_conversation', neuChatState.currentConversationId, 'Sin permisos para eliminar conversación.')) return;
            const code = neuChatErrorCode(error) || 'unknown';
            neuChatSetHint(`No se pudo eliminar la conversación (${code}).`, true);
          });
          return;
        }
      }

      const emojiBtn = target.closest('#neuChatEmojiBtn');
      if (emojiBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        if (emojiBtn.disabled) return;
        const picker = neuChatEmojiPickerNode();
        if (picker instanceof HTMLElement && !picker.classList.contains('hidden')) neuCloseChatEmojiPicker();
        else neuOpenChatEmojiPicker(emojiBtn);
        return;
      }

      const emojiOptionBtn = target.closest('[data-neu-chat-emoji]');
      if (emojiOptionBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const emoji = String(emojiOptionBtn.getAttribute('data-neu-chat-emoji') || '').trim();
        neuInsertEmojiIntoChatInput(emoji);
        neuCloseChatEmojiPicker();
        return;
      }

      const likeBtn = target.closest('#neuChatLikeBtn');
      if (likeBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        if (likeBtn.disabled) return;
        const input = neuChatInputNode();
        if (input instanceof HTMLTextAreaElement && !String(input.value || '').trim()) {
          input.value = '??';
          neuChatAutoGrow(input);
        }
        neuSendChatMessage().catch((error) => {
          const code = neuChatErrorCode(error) || 'unknown';
          console.error('[neu-chat] quick-like failed', code, error?.message, error);
          neuChatSetHint(`No se pudo enviar el mensaje (${code}).`, true);
        });
        return;
      }

      const emptyQuickBtn = target.closest('[data-neu-chat-empty-quick]');
      if (emptyQuickBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const quickValue = String(emptyQuickBtn.getAttribute('data-neu-chat-empty-quick') || '').trim();
        if (!quickValue) return;
        const input = neuChatInputNode();
        if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
          input.value = quickValue;
          if (input instanceof HTMLTextAreaElement) neuChatAutoGrow(input);
          input.focus({ preventScroll: true });
        }
        neuSendChatMessage().catch((error) => {
          const code = neuChatErrorCode(error) || 'unknown';
          console.error('[neu-chat] empty quick send failed', code, error?.message, error);
          neuChatSetHint(`No se pudo enviar el mensaje (${code}).`, true);
        });
        return;
      }

      const sharePostBtn = target.closest('[data-neu-post-share-chat]');
      if (sharePostBtn instanceof HTMLButtonElement) {
        const card = sharePostBtn.closest('.post-card');
        if (card instanceof HTMLElement) {
          event.preventDefault();
          event.stopPropagation();
          neuOpenSharePostModalFromCard(card);
        }
        return;
      }

      const shareCloseBtn = target.closest('[data-neu-chat-share-close]');
      if (shareCloseBtn) {
        event.preventDefault();
        event.stopPropagation();
        neuCloseSharePostModal();
        return;
      }

      const shareConversationBtn = target.closest('[data-neu-chat-share-open]');
      if (shareConversationBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const conversationId = String(shareConversationBtn.getAttribute('data-neu-chat-share-open') || '').trim();
        if (conversationId) {
          neuSharePostToConversation(conversationId).catch((error) => {
            const code = neuChatErrorCode(error) || 'unknown';
            console.error('[neu-chat] share send failed', code, error?.message, error);
            neuChatSetHint(`No se pudo compartir post (${code}).`, true);
          });
        }
        return;
      }

      const openSharedPostBtn = target.closest('[data-neu-chat-open-post]');
      if (openSharedPostBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const rawUrl = String(openSharedPostBtn.getAttribute('data-neu-chat-open-post') || '').trim();
        if (!rawUrl) {
          neuChatSetHint('No se pudo abrir el post.', true);
          return;
        }
        try {
          const opened = window.open(rawUrl, '_blank', 'noopener');
          if (!opened) location.href = rawUrl;
        } catch {
          location.href = rawUrl;
        }
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

      const actionBtn = target.closest('[data-action]');
      if (actionBtn instanceof HTMLElement) {
        const act = String(actionBtn.getAttribute('data-action') || '').trim();
        if (act === 'msg-menu' && actionBtn instanceof HTMLButtonElement) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuSetChatLongPressMenuOpen('');
          const messageItem = actionBtn.closest('.neuMessageItem');
          neuOpenMsgMenu(actionBtn, neuMessageMetaFromElement(messageItem));
          return;
        }
        if (act === 'msg-reply') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuReply();
          return;
        }
        if (act === 'msg-copy') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuCopy();
          return;
        }
        if (act === 'msg-hide-local') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuHideLocal();
          return;
        }
        if (act === 'msg-delete-all') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuDeleteAll();
          return;
        }
        if (act === 'msg-edit') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuEdit();
          return;
        }
        if (act === 'msg-delete') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuDelete();
          return;
        }
        if (act === 'msg-unsend') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuMenuUnsend();
          return;
        }
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

      const editBtn = target.closest('[data-neu-chat-longpress-edit]');
      if (editBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const menu = neuChatLongPressMenuNode();
        const messageId = String(menu?.dataset?.neuChatEditMessage || '').trim();
        if (messageId) neuStartChatEditDraft(messageId);
        neuSetChatLongPressMenuOpen('');
        return;
      }

      const deleteBtn = target.closest('[data-neu-chat-longpress-delete]');
      if (deleteBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const menu = neuChatLongPressMenuNode();
        const messageId = String(menu?.dataset?.neuChatDeleteMessage || '').trim();
        const conversationId = String(neuChatState.currentConversationId || '').trim();
        if (conversationId && messageId) neuHideMessageLocal(conversationId, messageId);
        neuSetChatLongPressMenuOpen('');
        return;
      }

      const cancelEditBtn = target.closest('[data-neu-chat-edit-cancel]');
      if (cancelEditBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        neuClearChatEditDraft();
        neuSyncChatComposerState();
        return;
      }

      const reactOption = target.closest('[data-neu-react-type]');
      if (reactOption instanceof HTMLButtonElement) {
        const messageId = String(reactOption.getAttribute('data-neu-react-message') || '').trim();
        const type = neuReactionType(reactOption.getAttribute('data-neu-react-type'));
        event.preventDefault();
        event.stopPropagation();
        neuToggleMessageReaction(messageId, type).catch((error) => {
          const code = neuChatErrorCode(error) || 'unknown';
          console.error('[neu-chat] react failed', code, error?.message, error);
          neuChatSetHint(`No se pudo guardar reaccion (${code}).`, true);
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

      // Close the message menu when clicking outside of it.
      const msgMenu = neuMsgMenuNode();
      if (
        msgMenu instanceof HTMLElement &&
        !msgMenu.classList.contains('hidden') &&
        !target.closest('#neuMsgMenu') &&
        !target.closest('[data-action="msg-menu"]')
      ) {
        neuCloseMsgMenu();
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

      const pinBtn = target.closest('[data-neu-chat-pin]');
      if (pinBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const conversationId = String(pinBtn.getAttribute('data-neu-chat-pin') || '').trim();
        neuToggleChatPinned(conversationId).catch((error) => {
          const code = neuChatErrorCode(error) || 'unknown';
          console.error('[neu-chat] pin action failed', code, error?.message, error);
          neuChatSetHint(`No se pudo fijar chat (${code}).`, true);
        });
        return;
      }

      const openRow = target.closest('[data-neu-chat-open]');
      if (openRow) {
        event.preventDefault();
        const conversationId = String(openRow.getAttribute('data-neu-chat-open') || '').trim();
        const otherUid = String(openRow.getAttribute('data-neu-chat-other') || '').trim();
        const mode = neuResolveChatHostMode('dock');
        neuOpenConversation(conversationId, { otherUid, mode }).catch((error) => {
          console.error('[neu-chat] open conversation failed', error);
          neuChatSetHint('No se pudo abrir la conversacion.', true);
        });
        return;
      }

      const closeChat = target.closest('[data-neu-chat-close], #neuChatCloseBtn');
      if (closeChat) {
        event.preventDefault();
        console.log('CLICK');
        const activeHostMode = String(neuChatState.hostMode || '').trim();
        if (activeHostMode === 'dock') {
          neuSyncOwnActiveThreadState('');
          neuChatStopTypingAndTimers({ bestEffort: true });
          neuSetChatDockOpen(false);
          neuSetTypingRowVisible(false);
          return;
        }
        neuCloseChatModal();
        return;
      }

      const messageProfileBtn = target.closest('#btnFusionMessage');
      if (messageProfileBtn instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        // Profile "Mensaje" is handled by neuWirePublicProfileEvents.
        return;
      }
    },
    true,
  );

  document.addEventListener(
    'contextmenu',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const item = target.closest('.neuMessageItem');
      if (!(item instanceof HTMLElement)) return;
      const messagesRoot = neuChatMessagesNode();
      if (!(messagesRoot instanceof HTMLElement) || !messagesRoot.contains(item)) return;
      const meta = neuMessageMetaFromElement(item);
      if (!meta?.messageId) return;
      event.preventDefault();
      event.stopPropagation();
      neuSetChatLongPressMenuOpen('');
      neuOpenMsgMenu(
        {
          clientX: Number(event.clientX || 0) + 2,
          clientY: Number(event.clientY || 0) + 2,
          anchorEl: item,
        },
        meta,
      );
    },
    true,
  );

  document.addEventListener(
    'load',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.classList.contains('neuChatPostCardPreviewImg')) return;
      const previewWrap = target.closest('.neuChatPostCardPreview');
      if (previewWrap instanceof HTMLElement) previewWrap.classList.remove('is-loading', 'is-fallback');
      if (NEU_QA) {
        console.debug('[neu-share-preview]', {
          shareType: String(target.getAttribute('data-share-type') || '').trim() || 'post',
          previewImageUrl: String(target.getAttribute('data-preview-url') || '').trim(),
          status: 'onload',
        });
      }
    },
    true,
  );

  document.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (!target.classList.contains('neuChatPostCardPreviewImg')) return;
      const previewWrap = target.closest('.neuChatPostCardPreview');
      if (previewWrap instanceof HTMLElement) previewWrap.classList.add('is-fallback');
      target.remove();
      if (NEU_QA) {
        console.debug('[neu-share-preview]', {
          shareType: String(target.getAttribute('data-share-type') || '').trim() || 'post',
          previewImageUrl: String(target.getAttribute('data-preview-url') || '').trim(),
          status: 'onerror',
        });
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
      const code = neuChatErrorCode(error) || 'unknown';
      console.error('[neu-chat] send handler failed', code, error?.message, error);
      neuChatSetHint(`No se pudo enviar el mensaje (${code}).`, true);
    });
  });

  const attachBtn = neuChatAttachButtonNode();
  const fileInput = neuChatFileInputNode();
  if (attachBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
    attachBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (neuChatState.attachmentsDisabled === true || attachBtn.disabled) {
        neuChatNotifyAttachmentsUnavailable();
        return;
      }
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
        const code = neuChatErrorCode(error) || 'unknown';
        console.error('[neu-chat] send Enter handler failed', code, error?.message, error);
        neuChatSetHint(`No se pudo enviar el mensaje (${code}).`, true);
      });
    });
  }

  neuBindChatScrollSurface(true);

  window.addEventListener(
    'resize',
    () => {
      neuUpdateChatComposerOffsetVar();
      neuSyncChatHostSurface();
      neuPositionDockNearFlag();
      neuRenderChatList();
    },
    { passive: true },
  );

  window.addEventListener(
    'beforeunload',
    () => {
      neuSyncOwnActiveThreadState('');
      neuChatStopTypingAndTimers({ bestEffort: true });
      neuClearChatAttachment();
      neuClearChatReplyLongPressTimer();
      neuSetChatLongPressMenuOpen('');
      if (neuChatState.chatSearchDebounceTimer) {
        window.clearTimeout(neuChatState.chatSearchDebounceTimer);
        neuChatState.chatSearchDebounceTimer = 0;
      }
      if (neuChatState.shareSearchDebounceTimer) {
        window.clearTimeout(neuChatState.shareSearchDebounceTimer);
        neuChatState.shareSearchDebounceTimer = 0;
      }
    },
    { passive: true },
  );

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const headerMenu = neuChatHeaderMenuNode();
    if (headerMenu instanceof HTMLElement && !headerMenu.classList.contains('hidden')) {
      neuCloseChatHeaderMenu();
      return;
    }
    const emojiPicker = neuChatEmojiPickerNode();
    if (emojiPicker instanceof HTMLElement && !emojiPicker.classList.contains('hidden')) {
      neuCloseChatEmojiPicker();
      return;
    }
    const msgMenu = neuMsgMenuNode();
    if (msgMenu instanceof HTMLElement && !msgMenu.classList.contains('hidden')) {
      neuCloseMsgMenu();
      return;
    }
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
    const shareModal = neuChatShareModalNode();
    if (shareModal instanceof HTMLElement && !shareModal.hidden) {
      neuCloseSharePostModal();
      return;
    }
    const activeHostMode = String(neuChatState.hostMode || '').trim();
    if (activeHostMode === 'dock') {
      neuSyncOwnActiveThreadState('');
      neuChatStopTypingAndTimers({ bestEffort: true });
      neuSetChatDockOpen(false);
      neuSetTypingRowVisible(false);
      return;
    }
    if (activeHostMode === 'inbox' && String(neuChatState.currentConversationId || '').trim()) {
      neuCloseChatModal();
      return;
    }
    const root = neuChatRootNode();
    if (root instanceof HTMLElement && !root.classList.contains('hidden') && root.classList.contains('is-open')) {
      neuCloseChatModal();
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
  neuSyncChatHostSurface();
  neuEnsureChatModalLayoutClass();
  neuInitChatFloatFlag();
  neuInitChatDockLauncher();
  neuSyncUnreadUi();
  neuWireChatEvents();
  neuWireChatSearchInput();
  neuWireShareChatSearchInput();
  const chatSearchInput = neuChatSearchInputNode();
  neuChatState.chatSearchQuery = String(chatSearchInput?.value || '').trim();
  neuStartChatListListener(meUid);
  neuWireChatListGuard();
  neuRenderChatList();
  neuEnsureChatEditPreviewNode();
  neuRenderChatAttachmentPreview();
  neuRenderChatReplyPreview();
  neuRenderChatEditPreview();
  if (typeof uploadBytes !== 'function' || typeof getDownloadURL !== 'function') {
    neuChatSetAttachmentsDisabled(true, 'unavailable');
  }
  neuChatAutoResizeInput();
  neuUpdateChatComposerOffsetVar();
  neuSetChatSending(false);
  neuLayoutDockThreadWindows();
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
  const routeChat = getRouteChatUid();
  if (!routeChat) return;
  clearRouteChatUid();
  const desiredMode = neuResolveChatHostMode('dock');

  const fromList = Array.isArray(neuChatState.listRows)
    ? neuChatState.listRows.find((row) => String(row?.conversationId || '').trim() === routeChat) || null
    : null;
  if (fromList) {
    await neuOpenConversation(routeChat, { otherUid: String(fromList.otherUid || '').trim(), mode: desiredMode });
    return;
  }

  try {
    const convSnap = await getDoc(doc(db, 'neuConversations', routeChat));
    if (convSnap.exists()) {
      const convData = convSnap.data() || {};
      const members = Array.isArray(convData.members) ? convData.members.map((uid) => String(uid || '').trim()) : [];
      const meUid = neuCurrentUid();
      if (meUid && members.includes(meUid)) {
        const otherUid = members.find((uid) => uid && uid !== meUid) || '';
        await neuOpenConversation(routeChat, { otherUid, mode: desiredMode });
        return;
      }
    }
  } catch {
    // fallback to uid-style route chat
  }

  await neuOpenChatWithUser(routeChat, { mode: desiredMode });
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

function neuQaFeatureFlagsOffLine() {
  const off = Object.entries(neuChatFeatures || {})
    .filter(([, enabled]) => enabled === false)
    .map(([name]) => name);
  return `featureFlagsOff=${off.length ? off.join(',') : 'none'}`;
}

function neuQaHeaderLines(title = '[NEU QA] boot: OK') {
  return [
    title,
    `SAFE=${SAFE_MODE}`,
    `mod=${SAFE_MODE_MOD || 'none'}`,
    `disable=${DISABLE.size ? [...DISABLE].join(',') : 'none'}`,
    neuQaFeatureFlagsOffLine(),
  ];
}

const __neuQaLines = [];
function neuQaPush(line) {
  if (!NEU_QA) return;
  __neuQaLines.push(String(line || ''));
  if (__neuQaLines.length > 14) __neuQaLines.shift();
  neuQaPanel([
    ...neuQaHeaderLines('[NEU QA] boot: OK'),
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

function initLegacySafeModeBadge() {
  if (!SAFE_MODE) return;
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

function neuCardPreviewImage(card) {
  if (!(card instanceof HTMLElement)) return '';
  const img = card.querySelector('.media-block img');
  if (img instanceof HTMLImageElement) return String(img.getAttribute('src') || '').trim();
  return '';
}

function neuCardAuthorPreview(card) {
  if (!(card instanceof HTMLElement)) return { name: '', handle: '' };
  const name = String(card.querySelector('.post-author-meta strong')?.textContent || '').trim();
  const handle = String(card.querySelector('.post-author-meta span')?.textContent || '').trim();
  return { name, handle };
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

  const profile = neuProfileState.profile || neuDefaultProfile(uid);
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

function neuEnsurePostShareButton(card) {
  if (!(card instanceof HTMLElement)) return;
  const identity = neuReadPostIdentity(card);
  if (!identity) return;
  let actions = card.querySelector('.neu-post-quick-actions');
  if (!(actions instanceof HTMLElement)) {
    actions = document.createElement('div');
    actions.className = 'neu-post-quick-actions';
    card.append(actions);
  }
  if (actions.querySelector('[data-neu-post-share-chat]')) return;
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn-white-outline neu-post-share-chat';
  shareBtn.type = 'button';
  shareBtn.setAttribute('data-neu-post-share-chat', '1');
  shareBtn.textContent = 'Enviar por chat';
  actions.append(shareBtn);
}

function neuDecorateFeedShareButtons() {
  if (isDisabled('decorators')) return;
  const feed = neuGetFeedList();
  if (!(feed instanceof HTMLElement)) return;
  feed.querySelectorAll('.post-card').forEach((card) => {
    neuEnsurePostShareButton(card);
  });
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
  neuDecorateFeedShareButtons();
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

  if (isProfileRouteActive()) {
    const meUid = neuCurrentUid();
    const profileUid = getProfileUidFromQuery(meUid) || NEU_PROFILE_ME;
    updateNeuRouteParams({ portal, profileMode: true, profileUid });
    return;
  }

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
  window.setTimeout(() => {
    neuSyncChatHostSurface();
    neuRenderChatList();
  }, 0);
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
  await import('../../pages/perfil-fusion-page.js');
  await neuInitPublicProfile(user);
  neuWireQuickPostEvents();
  neuRewriteLegacyLinksInRoot(document);
  window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 700);
  window.setTimeout(() => neuRewriteLegacyLinksInRoot(document), 1800);
  // NEU chat init disabled: legacy mini-chat-v4 is the active chat system.
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

      const lines = [...neuQaHeaderLines('[NEU QA] boot: OK')];
      if (NEU_QA_MODE) {
        lines.push('[NEU QA] modules:');
        results.forEach((result) => {
          lines.push(`${result.name}: ${result.status} ${result.ms}ms`);
          neuQaPush(`module ${result.name}: ${result.status} ${result.ms}ms`);
        });
      }
      neuQaPanel(lines);
    } else {
      neuQaPanel(neuQaHeaderLines('[NEU QA] boot: OK'));
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

let legacyRuntimeInitialized = false;

export function initLegacyRuntimeEnvironment() {
  if (legacyRuntimeInitialized) return;
  legacyRuntimeInitialized = true;
  logLegacyModuleLoadedIfQa();
  installFatalHooks();
  initLegacySafeModeBadge();
}

export async function initLegacyBoot() {
  initLegacyRuntimeEnvironment();
  return neuBoot();
}

export const neuLegacyRuntime = {
  qa: {
    isQa: () => NEU_QA,
    isSafeMode: () => SAFE_MODE,
    logHeader: neuQaHeaderLines,
    panel: neuQaPanel,
    push: neuQaPush,
    debug: qaDebug,
    wireRuntimeTrace: wireQaRuntimeTrace,
    wireLongTaskProbe: wireQaLongTaskProbe,
  },
  safe: {
    isDisabled,
    enableCrudPosts: () => SAFE_ENABLE_CRUD_POSTS,
    enableCrudStories: () => SAFE_ENABLE_CRUD_STORIES,
    enableFlowBridge: () => SAFE_ENABLE_FLOW_BRIDGE,
    enablePortalObserver: () => SAFE_ENABLE_PORTAL_OBS,
    mode: () => SAFE_MODE_MOD,
  },
  auth: {
    require: requireNeuAuth,
    wireLogout: wireNeuDropdownLogout,
  },
  onboarding: {
    needs: neuNeedsOnboarding,
    init: neuInitOnboarding,
    setActive: neuOnboardingSetActive,
    needsPost: neuNeedsPostOnboarding,
    initPost: neuInitPostOnboarding,
    setPostActive: neuPostOnboardingSetActive,
    stripPostQuery: neuStripQueryParams,
  },
  profile: {
    initPublicProfile: neuInitPublicProfile,
    refreshFeed: neuRefreshProfileFeed,
    syncActions: neuSyncProfileActionsUi,
    syncCounts: neuSyncProfileCountsUi,
    isProfileRouteActive,
  },
  posts: {
    initQuickPost: neuWireQuickPostEvents,
    initCrud: neuWirePostCrudEvents,
  },
  stories: {
    initCrud: neuWireStoryCrudEvents,
  },
  chat: {
    initMvp: neuInitChatMvp,
  },
  routing: {
    wireBottomNavRouter: wireNeuBottomNavRouter,
    consumePostOnboardingIntents: neuConsumePostOnboardingIntents,
    rewriteLegacyLinksInRoot: neuRewriteLegacyLinksInRoot,
    wireLegacyProfileLinkBridge: wireNeuLegacyProfileLinkBridge,
  },
  social: {
    loadSuggestedUsers: neuLoadSuggestedUsers,
  },
  flow: {
    initBridge: initNeuFlowBridge,
  },
  internal: {
    bootModule: neuBootModule,
    start: startNeuSocialApp,
    showFatalOverlay,
  },
};

export { app, auth, db, storage };



