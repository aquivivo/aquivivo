
import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDocs,
  getDoc,
  getCountFromServer,
  addDoc,
  increment,
  limit,
  orderBy,
  startAt,
  endAt,
  onSnapshot,
  query,
  updateDoc,
  setDoc,
  where,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const qs = new URLSearchParams(location.search);
const PROFILE_UID = (qs.get('uid') || '').trim();
const PATH_HANDLE = (() => {
  const m = (location.pathname || '').match(/\/perfil\/([^/]+)\/?$/i);
  return m ? decodeURIComponent(m[1]) : '';
})();
const PROFILE_HANDLE = (qs.get('u') || PATH_HANDLE || '').trim().toLowerCase();
let focusPostId = (qs.get('post') || '').trim();

const profileName = $('profileName');
const profileHandle = $('profileHandle');
const profileStatus = $('profileStatus');
const profileMsg = $('profileMsg');
const btnFollow = $('btnProfileFollow');
const btnAdd = $('btnProfileAdd');
const btnChat = $('btnProfileChat');
const btnShare = $('btnProfileShare');
const btnBlock = $('btnProfileBlock');
const btnReport = $('btnProfileReport');
const avatarWrap = $('profileAvatarWrap');
const avatarImg = $('profileAvatarImg');
const avatarFallback = $('profileAvatarFallback');
const profileCover = $('profileCover');
const profileCoverImg = $('profileCoverImg');
const coverInput = $('coverInput');
const coverUploadBtn = $('coverUploadBtn');
const avatarEdit = $('profileAvatarEdit');
const avatarEditImg = $('profileAvatarEditImg');
const avatarEditFallback = $('profileAvatarEditFallback');
const avatarInput = $('avatarInput');
const avatarUploadBtn = $('avatarUploadBtn');
const avatarUploadHint = $('avatarUploadHint');
const basicName = $('basicName');
const basicHandle = $('basicHandle');
const basicSaveBtn = $('basicSaveBtn');
const basicSaveMsg = $('basicSaveMsg');

const profilePublicCard = $('profilePublicCard');
const publicCardHint = $('publicCardHint');
const publicBioWhy = $('publicBioWhy');
const publicBioHard = $('publicBioHard');
const publicBioGoal = $('publicBioGoal');
const publicWebsiteWrap = $('publicWebsiteWrap');
const publicBioWebsite = $('publicBioWebsite');
const publicLocationWrap = $('publicLocationWrap');
const publicBioLocation = $('publicBioLocation');
const publicLanguagesWrap = $('publicLanguagesWrap');
const publicBioLanguages = $('publicBioLanguages');
const publicInterestsWrap = $('publicInterestsWrap');
const publicBioInterests = $('publicBioInterests');

const activityCard = $('activityCard');
const activityHint = $('activityHint');
const activityGrid = $('activityGrid');
const activitySummary = $('activitySummary');

const profileEditSection = $('profileEditSection');
const profileEditHintCard = $('profileEditHintCard');

const storiesCard = $('storiesCard');
const storiesHint = $('storiesHint');
const storyAddBtn = $('storyAddBtn');
const storyFileInput = $('storyFileInput');
const storiesRow = $('storiesRow');
const highlightsHint = $('highlightsHint');
const highlightsRow = $('highlightsRow');

const storyModal = $('storyModal');
const storyModalTitle = $('storyModalTitle');
const storyModalMeta = $('storyModalMeta');
const storyModalImg = $('storyModalImg');
const storyModalCaption = $('storyModalCaption');
const storyModalMsg = $('storyModalMsg');
const storyPrevBtn = $('storyPrevBtn');
const storyNextBtn = $('storyNextBtn');
const storyCloseBtn = $('storyCloseBtn');
const storyHighlightBtn = $('storyHighlightBtn');
const storyDeleteBtn = $('storyDeleteBtn');
const storyShareBtn = $('storyShareBtn');
const storyDmBtn = $('storyDmBtn');
const storyReportBtn = $('storyReportBtn');

const statusCard = $('statusCard');
const statusInput = $('statusInput');
const statusPostBtn = $('statusPostBtn');
const statusHint = $('statusHint');
const statusMood = $('statusMood');
const statusMotivation = $('statusMotivation');
const statusMinutes = $('statusMinutes');
const statusCourse = $('statusCourse');
const statusHeart = $('statusHeart');
const statusAvatar = $('statusAvatar');
const statusAvatarImg = $('statusAvatarImg');
const statusAvatarFallback = $('statusAvatarFallback');
const feedList = $('feedList');
const feedFiltersCard = $('feedFiltersCard');
const feedFiltersRow = $('feedFiltersRow');
const feedSearchInput = $('feedSearchInput');
const btnFeedClear = $('btnFeedClear');
const btnHiddenClear = $('btnHiddenClear');
const feedFilterHint = $('feedFilterHint');

const infoWhy = $('infoWhy');
const infoHard = $('infoHard');
const infoGoal = $('infoGoal');
const infoLocation = $('infoLocation');
const infoWebsite = $('infoWebsite');
const infoLanguages = $('infoLanguages');
const infoInterests = $('infoInterests');
const infoSaveBtn = $('infoSaveBtn');
const infoSaveMsg = $('infoSaveMsg');

const privacyPosts = $('privacyPosts');
const privacyRewards = $('privacyRewards');
const privacyStatus = $('privacyStatus');
const privacyFriendReq = $('privacyFriendReq');
const privacyMessages = $('privacyMessages');
const privacyPublic = $('privacyPublic');

const rewardsGrid = $('rewardsGrid');
const rewardDetail = $('rewardDetail');
const rewardStreak = $('rewardStreak');
const rewardBadges = $('rewardBadges');
const rewardDays = $('rewardDays');
const rewardConsistency = $('rewardConsistency');

const coursesList = $('coursesList');

const friendsCount = $('friendsCount');
const followersCount = $('followersCount');
const followingCount = $('followingCount');
const recentReactions = $('recentReactions');
const suggestionsList = $('suggestionsList');
const inviteFriendsBtn = $('inviteFriendsBtn');

const profileSearchAvatar = $('profileSearchAvatar');
const profileSearchAvatarImg = $('profileSearchAvatarImg');
const profileSearchAvatarFallback = $('profileSearchAvatarFallback');
const profileSearchInput = $('profileSearchInput');
const btnProfileSearch = $('btnProfileSearch');
const btnProfileSearchClear = $('btnProfileSearchClear');
const profileSearchStatus = $('profileSearchStatus');
const profileSearchResults = $('profileSearchResults');

const invitesHint = $('invitesHint');
const invitesList = $('invitesList');

const mediaHint = $('mediaHint');
const mediaComposer = $('mediaComposer');
const mediaFileInput = $('mediaFileInput');
const mediaPickBtn = $('mediaPickBtn');
const mediaRemoveBtn = $('mediaRemoveBtn');
const mediaPostBtn = $('mediaPostBtn');
const mediaCaption = $('mediaCaption');
const mediaPreview = $('mediaPreview');
const mediaPreviewImg = $('mediaPreviewImg');
const mediaMsg = $('mediaMsg');
const mediaGrid = $('mediaGrid');

const friendsHint = $('friendsHint');
const friendsSearch = $('friendsSearch');
const friendsTotal = $('friendsTotal');
const friendsList = $('friendsList');

const followersHint = $('followersHint');
const followersSearch = $('followersSearch');
const followersTotal = $('followersTotal');
const followersList = $('followersList');

const followingHint = $('followingHint');
const followingSearch = $('followingSearch');
const followingTotal = $('followingTotal');
const followingList = $('followingList');

const tabBtnSaved = $('tabBtnSaved');
const tabSaved = $('tab-saved');
const btnNewCollection = $('btnNewCollection');
const savedStatus = $('savedStatus');
const savedCollectionsRow = $('savedCollectionsRow');
const savedGrid = $('savedGrid');

const tabButtons = $$('.profile-tab-btn');
const tabPanels = $$('.profile-tab');

const statStreak = $('statStreak');
const statExp = $('statExp');
const statLeague = $('statLeague');
const statTop3 = $('statTop3');

let FEED_ITEMS = [];
let FEED_SOURCE = [];
let FEED_FILTER = 'all';
let FEED_SEARCH = '';
let feedUnsub = null;
const COMMENTS_CACHE = new Map();
const COMMENTS_OPEN = new Set();
let HIDDEN_SET = new Set();
let HIDDEN_UID = '';

let MEDIA_FILE = null;
let MEDIA_PREVIEW_URL = '';
let FRIENDS_CACHE = [];
let FOLLOWERS_CACHE = [];
let FOLLOWING_CACHE = [];
let MY_FOLLOWING_SET = new Set();

const STORY_CACHE = new Map();
const STORY_FETCHING = new Set();
let STORY_ITEMS = [];
let HIGHLIGHT_IDS = [];
let HIGHLIGHT_ITEMS = [];

let STORY_MODAL_LIST = [];
let STORY_MODAL_INDEX = 0;
let STORY_MODAL_CTX = null;

let PROFILE_CTX = null;

let SAVES_UNSUB = null;
let COLLECTIONS_UNSUB = null;
let SAVES_UID = '';
let SAVED_ITEMS = [];
let SAVED_SET = new Set();
let SAVE_COLLECTIONS = [];
let ACTIVE_SAVE_COLLECTION = 'all';

let ACTIVITY_UNSUB = null;
let ACTIVITY_DAYS = new Map();

const storage = getStorage();
let CURRENT_USER_DOC = null;
let CURRENT_PROFILE = null;

function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeId(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '_');
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractHashtags(text) {
  const raw = String(text || '');
  const tags = new Set();
  const re = /#([a-z0-9_]{1,30})/gi;
  let m = null;
  while ((m = re.exec(raw))) {
    const tag = normalizeSearchText(m[1]);
    if (tag) tags.add(tag);
    if (tags.size >= 20) break;
  }
  return Array.from(tags);
}

function postHasTag(post, tag) {
  const t = normalizeSearchText(tag);
  if (!t) return false;
  const rawTags = Array.isArray(post?.tags) ? post.tags : [];
  const list = rawTags.map((x) => normalizeSearchText(String(x || '')));
  extractHashtags(post?.text || '').forEach((x) => list.push(normalizeSearchText(x)));
  return list.includes(t);
}

function postMatchesQuery(post, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  if (q.startsWith('#')) return postHasTag(post, q.slice(1));
  const hay = normalizeSearchText(
    [post?.authorName || '', post?.text || '', ...(Array.isArray(post?.tags) ? post.tags : [])].join(' '),
  );
  return hay.includes(q);
}

function hiddenStorageKey(uid) {
  const id = String(uid || '').trim();
  return id ? `av_hidden_posts_${id}` : 'av_hidden_posts';
}

function hiddenPostKey(ownerUid, postId) {
  const a = String(ownerUid || '').trim();
  const b = String(postId || '').trim();
  return a && b ? `${a}__${b}` : '';
}

function hiddenCountForOwner(ownerUid) {
  const uid = String(ownerUid || '').trim();
  if (!uid || !HIDDEN_SET?.size) return 0;
  const prefix = `${uid}__`;
  let n = 0;
  HIDDEN_SET.forEach((k) => {
    if (String(k || '').startsWith(prefix)) n += 1;
  });
  return n;
}

function clearHiddenForOwner(ownerUid) {
  const uid = String(ownerUid || '').trim();
  if (!uid || !HIDDEN_SET?.size) return;
  const prefix = `${uid}__`;
  const next = new Set();
  HIDDEN_SET.forEach((k) => {
    const value = String(k || '').trim();
    if (value && !value.startsWith(prefix)) next.add(value);
  });
  HIDDEN_SET = next;
}

function loadHiddenSet(myUid) {
  const uid = String(myUid || '').trim();
  HIDDEN_UID = uid;
  HIDDEN_SET = new Set();
  if (!uid) return HIDDEN_SET;
  try {
    const raw = localStorage.getItem(hiddenStorageKey(uid));
    if (!raw) return HIDDEN_SET;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return HIDDEN_SET;
    arr.forEach((k) => {
      const value = String(k || '').trim();
      if (value) HIDDEN_SET.add(value);
    });
  } catch {
    // ignore
  }
  return HIDDEN_SET;
}

function persistHiddenSet() {
  if (!HIDDEN_UID) return;
  try {
    localStorage.setItem(
      hiddenStorageKey(HIDDEN_UID),
      JSON.stringify(Array.from(HIDDEN_SET).slice(0, 800)),
    );
  } catch {
    // ignore
  }
}

function updateHiddenClearBtn() {
  if (!btnHiddenClear) return;
  const ownerUid = String(PROFILE_CTX?.targetUid || '').trim();
  const n = hiddenCountForOwner(ownerUid);
  btnHiddenClear.style.display = n ? '' : 'none';
  btnHiddenClear.textContent = n ? `Restablecer ocultos (${n})` : 'Restablecer ocultos';
}

function getBaseFeedList() {
  let list = [];
  if (FEED_FILTER === 'all') list = Array.isArray(FEED_ITEMS) ? FEED_ITEMS : [];
  else if (FEED_FILTER === 'pinned')
    list = (Array.isArray(FEED_ITEMS) ? FEED_ITEMS : []).filter((p) => p && p.pinned);
  else if (FEED_FILTER === 'photos')
    list = (Array.isArray(FEED_SOURCE) ? FEED_SOURCE : []).filter(
      (p) => p && p.imageURL && (p.type || 'user') !== 'system',
    );
  else if (FEED_FILTER === 'status')
    list = (Array.isArray(FEED_SOURCE) ? FEED_SOURCE : []).filter(
      (p) => p && !p.imageURL && (p.type || 'user') === 'user',
    );
  else if (FEED_FILTER === 'corrections')
    list = (Array.isArray(FEED_SOURCE) ? FEED_SOURCE : []).filter(
      (p) => p && (p.type || 'user') === 'correction',
    );
  else list = Array.isArray(FEED_SOURCE) ? FEED_SOURCE : [];

  const ownerUid = String(PROFILE_CTX?.targetUid || '').trim();
  if (!ownerUid || !HIDDEN_SET?.size) return list;

  return list.filter((p) => {
    const id = String(p?.id || '').trim();
    const key = hiddenPostKey(ownerUid, id);
    return !key || !HIDDEN_SET.has(key);
  });
}

function getActiveFeedList() {
  const list = getBaseFeedList();
  const q = String(FEED_SEARCH || '').trim();
  if (!q) return list;
  return list.filter((p) => postMatchesQuery(p, q));
}

function persistFeedState() {
  try {
    localStorage.setItem('av_feed_filter', FEED_FILTER);
    localStorage.setItem('av_feed_search', FEED_SEARCH);
  } catch {}
}

function renderFeedFiltersUI() {
  if (!feedFiltersCard) return;
  if (feedFiltersRow) {
    $$('[data-feed-filter]', feedFiltersRow).forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-feed-filter') === FEED_FILTER);
    });
  }
  if (feedSearchInput && feedSearchInput.value !== FEED_SEARCH) feedSearchInput.value = FEED_SEARCH;
  if (feedFilterHint) {
    const baseCount = getBaseFeedList().length;
    const shown = getActiveFeedList().length;
    const suffix = FEED_SEARCH ? ` · filtro: ${FEED_SEARCH}` : '';
    const ownerUid = String(PROFILE_CTX?.targetUid || '').trim();
    const hidden = hiddenCountForOwner(ownerUid);
    const hiddenSuffix = hidden ? ` · ocultos: ${hidden}` : '';
    feedFilterHint.textContent = `Mostrando ${shown}/${baseCount}${suffix}${hiddenSuffix}`;
  }
  updateHiddenClearBtn();
}

function renderActiveFeed(ctx) {
  if (!ctx) return;
  renderFeed(getActiveFeedList(), ctx);
  renderFeedFiltersUI();
}

function bindFeedFilters() {
  if (!feedFiltersCard) return;
  if (feedFiltersCard.dataset.wired) {
    renderFeedFiltersUI();
    return;
  }
  feedFiltersCard.dataset.wired = '1';

  feedFiltersRow?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feed-filter]');
    if (!btn) return;
    const next = String(btn.getAttribute('data-feed-filter') || 'all').trim();
    if (!next) return;
    FEED_FILTER = next;
    persistFeedState();
    renderActiveFeed(PROFILE_CTX);
  });

  btnFeedClear?.addEventListener('click', () => {
    FEED_FILTER = 'all';
    FEED_SEARCH = '';
    if (feedSearchInput) feedSearchInput.value = '';
    persistFeedState();
    renderActiveFeed(PROFILE_CTX);
  });

  btnHiddenClear?.addEventListener('click', () => {
    const ownerUid = String(PROFILE_CTX?.targetUid || '').trim();
    const n = hiddenCountForOwner(ownerUid);
    if (!n) return;
    const ok = confirm('¿Restablecer publicaciones ocultas en este perfil?');
    if (!ok) return;
    clearHiddenForOwner(ownerUid);
    persistHiddenSet();
    updateHiddenClearBtn();
    renderActiveFeed(PROFILE_CTX);
    setMsg('Listo ?');
    setTimeout(() => setMsg(''), 1200);
  });

  if (feedSearchInput) {
    let t = null;
    feedSearchInput.addEventListener('input', () => {
      if (t) clearTimeout(t);
      const value = String(feedSearchInput.value || '').trim().slice(0, 60);
      t = setTimeout(() => {
        FEED_SEARCH = value;
        persistFeedState();
        renderActiveFeed(PROFILE_CTX);
      }, 220);
    });
  }

  renderFeedFiltersUI();
}

function initFeedDefaults() {
  try {
    const filter = String(localStorage.getItem('av_feed_filter') || '').trim();
    if (['all', 'pinned', 'photos', 'status', 'corrections'].includes(filter)) FEED_FILTER = filter;
    const search = String(localStorage.getItem('av_feed_search') || '').trim();
    if (search) FEED_SEARCH = search.slice(0, 60);
    if (feedSearchInput) feedSearchInput.value = FEED_SEARCH;
  } catch {}
}

function renderRichText(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const re = /(@[a-z0-9._-]{3,20}|#[a-z0-9_]{1,30})/gi;
  const out = [];
  let last = 0;
  let m = null;
  while ((m = re.exec(raw))) {
    if (m.index > last) out.push(esc(raw.slice(last, m.index)));
    const token = String(m[0] || '');
    if (token.startsWith('@')) {
      const handle = token.slice(1);
      const href = buildProfileHref(handle, '');
      out.push(`<a class="textLink" href="${esc(href)}">@${esc(handle)}</a>`);
    } else if (token.startsWith('#')) {
      const tag = token.slice(1);
      out.push(`<button class="textTag" type="button" data-feed-tag="${esc(tag)}">#${esc(tag)}</button>`);
    } else {
      out.push(esc(token));
    }
    last = m.index + token.length;
  }
  if (last < raw.length) out.push(esc(raw.slice(last)));
  return out.join('').replace(/\n/g, '<br />');
}

function toDateValue(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  return null;
}

function tsMs(ts) {
  const date = toDateValue(ts);
  return date ? date.getTime() : 0;
}

function formatTime(ts) {
  const date = toDateValue(ts);
  if (!date) return '';
  try {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(ts) {
  const date = toDateValue(ts);
  if (!date) return '';
  try {
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '';
  }
}

function withinMinutes(ts, minutes) {
  const date = toDateValue(ts);
  if (!date) return false;
  return Date.now() - date.getTime() <= minutes * 60 * 1000;
}

function normalizeHandle(value) {
  return String(value || '').trim().toLowerCase();
}

function isHandleValid(value) {
  return /^[a-z0-9._-]{3,20}$/.test(value || '');
}

function usePrettyProfile() {
  const host = location.hostname || '';
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  if (host.endsWith('github.io')) return false;
  return true;
}

function buildProfileHref(handle, uid) {
  const safeHandle = String(handle || '').trim();
  if (safeHandle) {
    return usePrettyProfile()
      ? `/perfil/${encodeURIComponent(safeHandle)}`
      : `perfil.html?u=${encodeURIComponent(safeHandle)}`;
  }
  return `perfil.html?uid=${encodeURIComponent(uid || '')}`;
}

function toAbsoluteUrl(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, location.origin).toString();
  } catch {
    return raw;
  }
}

async function copyToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = value;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function shareUrl(url, title = 'AquiVivo') {
  const value = String(url || '').trim();
  if (!value) return false;
  if (navigator.share) {
    try {
      await navigator.share({ title, url: value });
      return true;
    } catch {
      // ignore (user cancelled or unsupported)
    }
  }
  return await copyToClipboard(value);
}

function normalizeWebsite(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('@')) {
    const handle = value.slice(1).trim();
    if (!handle) return null;
    return { label: value, href: `https://instagram.com/${encodeURIComponent(handle)}` };
  }
  if (/^https?:\/\//i.test(value)) return { label: value, href: value };
  if (value.includes('.')) return { label: value, href: `https://${value}` };
  return null;
}

function buildPostShareUrl(handle, uid, postId) {
  const base = buildProfileHref(handle, uid);
  const url = new URL(base, location.origin);
  if (postId) url.searchParams.set('post', String(postId));
  return url.toString();
}

function getAllowedLevels(docData) {
  if (!docData) return ['A1'];
  if (docData.admin === true || String(docData.role || '') === 'admin') {
    return ['A1', 'A2', 'B1', 'B2'];
  }
  const until = toDateValue(docData.accessUntil);
  const active = until && until.getTime() > Date.now();
  if (!active) return ['A1'];
  if (docData.access === true || String(docData.plan || '').toLowerCase() === 'premium') {
    return ['A1', 'A2', 'B1', 'B2'];
  }
  if (Array.isArray(docData.levels) && docData.levels.length) {
    return docData.levels.map((lvl) => String(lvl).toUpperCase());
  }
  return ['A1'];
}

function setStatusHint(text) {
  if (!statusHint) return;
  statusHint.textContent = text || '';
}

function setInfoMsg(text) {
  if (!infoSaveMsg) return;
  infoSaveMsg.textContent = text || '';
}

function setBasicMsg(text) {
  if (!basicSaveMsg) return;
  basicSaveMsg.textContent = text || '';
}

function setMsg(text, bad = false) {
  if (!profileMsg) return;
  profileMsg.textContent = text || '';
  profileMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function toggleChip(btn) {
  if (!btn) return;
  btn.classList.toggle('active');
}

function collectTags() {
  const tags = [];
  if (statusMood?.classList.contains('active')) tags.push('Estado');
  if (statusMotivation?.classList.contains('active')) tags.push('Motivación');
  if (statusMinutes?.value) tags.push(`${statusMinutes.value} min`);
  if (statusCourse?.value) tags.push(statusCourse.value);
  return tags;
}

function playHeart() {
  if (!statusCard) return;
  statusCard.classList.add('pulse-heart');
  setTimeout(() => statusCard.classList.remove('pulse-heart'), 700);
}

function applyActiveTab(tab) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${tab}`);
  });
  try {
    localStorage.setItem('av_profile_tab', tab);
  } catch {
    // ignore
  }
}

function initTabs() {
  if (!tabButtons.length) return;
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyActiveTab(btn.dataset.tab));
  });
  const saved = localStorage.getItem('av_profile_tab');
  if (saved) applyActiveTab(saved);
}

function renderAvatar(url, name) {
  if (!avatarWrap || !avatarImg) return;
  const letter = (name || 'U').trim()[0]?.toUpperCase() || 'U';
  if (avatarFallback) avatarFallback.textContent = letter;
  if (statusAvatarFallback) statusAvatarFallback.textContent = letter;
  if (avatarEditFallback) avatarEditFallback.textContent = letter;
  if (url) {
    avatarImg.src = url;
    avatarWrap.classList.add('hasImage');
    if (avatarEdit) avatarEdit.classList.add('hasImage');
    if (avatarEditImg) {
      avatarEditImg.src = url;
      avatarEditImg.style.display = 'block';
    }
    if (statusAvatarImg) {
      statusAvatarImg.src = url;
      statusAvatarImg.style.display = 'block';
    }
    if (statusAvatar) statusAvatar.classList.add('nav-avatar--img');
  } else {
    avatarImg.removeAttribute('src');
    avatarWrap.classList.remove('hasImage');
    if (avatarEdit) avatarEdit.classList.remove('hasImage');
    if (avatarEditImg) {
      avatarEditImg.removeAttribute('src');
      avatarEditImg.style.display = 'none';
    }
    if (statusAvatarImg) {
      statusAvatarImg.removeAttribute('src');
      statusAvatarImg.style.display = 'none';
    }
    if (statusAvatar) statusAvatar.classList.remove('nav-avatar--img');
  }
}

function renderCover(url) {
  if (!profileCover || !profileCoverImg) return;
  const value = String(url || '').trim();
  if (value) {
    profileCoverImg.src = value;
    profileCover.classList.add('hasImage');
  } else {
    profileCoverImg.removeAttribute('src');
    profileCover.classList.remove('hasImage');
  }
}

function renderPublicCard(profile, isOwner) {
  if (!profilePublicCard) return;

  const why = String(profile?.bioWhy || '').trim();
  const hard = String(profile?.bioHard || '').trim();
  const goal = String(profile?.bioGoal || '').trim();
  const locationText = String(profile?.bioLocation || '').trim();
  const languagesText = String(profile?.bioLanguages || '').trim();
  const interestsText = String(profile?.bioInterests || '').trim();

  if (publicBioWhy) publicBioWhy.textContent = why || '—';
  if (publicBioHard) publicBioHard.textContent = hard || '—';
  if (publicBioGoal) publicBioGoal.textContent = goal || '—';

  const website = normalizeWebsite(profile?.bioWebsite);
  if (publicWebsiteWrap && publicBioWebsite) {
    if (website?.href) {
      publicWebsiteWrap.style.display = '';
      publicWebsiteWrap.href = website.href;
      publicBioWebsite.textContent = website.label || website.href;
    } else {
      publicWebsiteWrap.style.display = 'none';
      publicWebsiteWrap.href = '';
      publicBioWebsite.textContent = '';
    }
  }

  if (publicLocationWrap && publicBioLocation) {
    publicLocationWrap.style.display = locationText ? '' : 'none';
    publicBioLocation.textContent = locationText;
  }
  if (publicLanguagesWrap && publicBioLanguages) {
    publicLanguagesWrap.style.display = languagesText ? '' : 'none';
    publicBioLanguages.textContent = languagesText;
  }
  if (publicInterestsWrap && publicBioInterests) {
    publicInterestsWrap.style.display = interestsText ? '' : 'none';
    publicBioInterests.textContent = interestsText;
  }

  if (publicCardHint) {
    publicCardHint.textContent = isOwner ? 'Vista previa: así ven tu perfil otros usuarios.' : '';
  }
}

async function resolveUidFromHandle(handle) {
  if (!handle) return '';
  const snap = await getDocs(
    query(collection(db, 'public_users'), where('handleLower', '==', handle), limit(1)),
  );
  if (snap.empty) return '';
  return snap.docs[0].id || '';
}

function renderFeed(list, ctx) {
  if (!feedList) return;
  const sorted = [...list].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return tsMs(b.createdAt) - tsMs(a.createdAt);
  });

  if (!sorted.length) {
    feedList.innerHTML =
      '<div class="card muted">Aún no hay publicaciones. Escribe tu primer estado ?</div>';
    return;
  }

  feedList.innerHTML = sorted
    .map((post) => {
      const isMine = post.authorUid && ctx.myUid && post.authorUid === ctx.myUid;
      const canEdit = isMine && withinMinutes(post.createdAt, 10);
      const tags = Array.isArray(post.tags) ? post.tags : [];
      const metaLabels = [];
      const postType = String(post.type || 'user');
      if (postType === 'correction') metaLabels.push('Correcci\u00f3n');
      if (postType === 'correction' && post.resolved === true) metaLabels.push('Resuelto');
      if (post.pinned) metaLabels.push('Fijado');
      tags.forEach((t) => metaLabels.push(`• ${t}`));
      const isSystem = (post.type || 'user') === 'system' || post.id === 'sys_pinned_local';
      const canSharePost = !isSystem;
      const canReportPost = !isMine && !isSystem;
      const canSavePost = !isSystem;
      const canHidePost = canSavePost && post.id !== 'sys_pinned_local';
      const saveKey = saveDocId(ctx.targetUid, post.id);
      const isSaved = !!saveKey && SAVED_SET.has(saveKey);
      const isFocused = !!focusPostId && post.id === focusPostId;
      const postKey = safeId(post.id);
      const comments = COMMENTS_CACHE.get(post.id) || [];
      const isOpen = COMMENTS_OPEN.has(post.id);
      const commentsHtml = comments.length
        ? comments
            .map((c) => {
              const isOwner = c.authorUid === ctx.myUid;
              const canEditComment = isOwner && withinMinutes(c.createdAt, 10);
              return `
                <div class="comment-item" data-comment-id="${esc(c.id)}">
                  <div class="comment-meta">
                    <span>${esc(c.authorName || 'Usuario')}</span>
                    <span>${formatTime(c.createdAt)}</span>
                  </div>
                  <div class="comment-text">${esc(c.text || '')}</div>
                  ${
                    isOwner
                      ? `<div class="comment-actions">
                          ${
                            canEditComment
                              ? `<button class="btn-white-outline" data-comment-action="edit" data-post-id="${esc(
                                  post.id,
                                )}" data-comment-id="${esc(c.id)}">Editar</button>`
                              : ''
                          }
                          <button class="btn-white-outline" data-comment-action="delete" data-post-id="${esc(
                            post.id,
                          )}" data-comment-id="${esc(c.id)}">Eliminar</button>
                        </div>`
                      : ''
                  }
                </div>
              `;
            })
            .join('')
        : '<div class="muted">Sin comentarios todavía.</div>';

      const commentForm = ctx.canComment
        ? `
            <div class="comment-form">
              <input class="input" id="commentInput_${postKey}" placeholder="Escribe un comentario..." />
              <button class="btn-white-outline" data-comment="send" data-id="${esc(post.id)}">Enviar</button>
            </div>
          `
        : '<div class="muted" style="margin-top:8px">Solo amigos pueden comentar.</div>';

      return `
        <div class="post-card post-card--${esc(post.type || 'user')}${isFocused ? ' is-focused' : ''}" id="post_${postKey}" data-post-id="${esc(post.id)}">
          <div class="post-head">
            <div class="post-title">${esc(post.authorName || 'AquiVivo')}</div>
            <div class="post-time">${formatTime(post.createdAt)}</div>
          </div>
           <div class="post-body">${renderRichText(post.text || '')}</div>
            ${
              post.imageURL
                ? `<div class="post-media"><a href="${esc(
                    post.imageURL,
                  )}" target="_blank" rel="noopener"><img src="${esc(
                   post.imageURL,
                 )}" alt="Foto" loading="lazy" /></a></div>`
               : ''
           }
           ${
             metaLabels.length
               ? `<div class="post-meta">${metaLabels
                   .map((t) => `<span>${esc(t)}</span>`)
                   .join('')}</div>`
               : ''
           }
           <div class="post-reactions">
             <button type="button" data-reaction="heart" data-id="${esc(post.id)}"></button>
             <button type="button" data-reaction="fire" data-id="${esc(post.id)}"></button>
             <button type="button" data-reaction="spark" data-id="${esc(post.id)}">?</button>
           </div>
           <div class="post-actions">
               ${
                 canSharePost
                   ? `<button class="btn-white-outline" data-action="share" data-id="${esc(
                       post.id,
                     )}">Compartir</button>`
                   : ''
               }
               ${
                 canSharePost
                   ? `<button class="btn-white-outline" data-action="copy" data-id="${esc(
                       post.id,
                     )}">Copiar enlace</button>`
                   : ''
               }
               ${
                 canSharePost
                   ? `<button class="btn-white-outline" data-action="dm" data-id="${esc(
                       post.id,
                     )}">Enviar</button>`
                   : ''
               }
               ${
                 canSavePost
                   ? `<button class="btn-white-outline" data-action="save" data-id="${esc(
                       post.id,
                     )}">${isSaved ? 'Guardado' : 'Guardar'}</button>`
                   : ''
               }
               ${
                 canHidePost
                   ? `<button class="btn-white-outline" data-action="hide" data-id="${esc(
                       post.id,
                     )}">Ocultar</button>`
                   : ''
               }
               ${
               isMine && (post.type || 'user') !== 'system'
                   ? `<button class="btn-white-outline" data-action="pin" data-id="${esc(
                       post.id,
                     )}">${post.pinned ? 'Desfijar' : 'Fijar'}</button>`
                 : ''
             }
             ${
               isMine && (post.type || 'user') === 'correction'
                 ? `<button class="btn-white-outline" data-action="resolve" data-id="${esc(
                     post.id,
                   )}">${post.resolved ? 'Reabrir' : 'Marcar resuelto'}</button>`
                 : ''
             }
             ${
               canEdit
                 ? `<button class="btn-white-outline" data-action="edit" data-id="${esc(
                     post.id,
                   )}">Editar</button>`
                 : ''
             }
             ${
               isMine
                 ? `<button class="btn-white-outline" data-action="delete" data-id="${esc(
                     post.id,
                   )}">Eliminar</button>`
                 : ''
             }
             ${
               canReportPost
                 ? `<button class="btn-white-outline" data-action="report" data-id="${esc(
                     post.id,
                   )}">Reportar</button>`
                 : ''
             }
             <button class="btn-white-outline" data-comment="toggle" data-id="${esc(post.id)}">
               Comentarios (${comments.length})
             </button>
           </div>
          <div class="post-comments" id="comments_${postKey}" style="display:${
        isOpen ? 'block' : 'none'
      };"><div class="comment-list" id="commentsList_${postKey}">${commentsHtml}</div>${commentForm}</div>
        </div>
      `;
    })
    .join('');
}

function renderMediaGrid(list) {
  if (!mediaGrid) return;
  const items = (Array.isArray(list) ? list : [])
    .filter((post) => post && post.imageURL && (post.type || 'user') !== 'system')
    .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  if (!items.length) {
    mediaGrid.innerHTML = '<div class="muted">Aún no hay fotos.</div>';
    return;
  }

  mediaGrid.innerHTML = items
    .map((post) => {
      const caption = String(post.text || '').trim();
      return `
        <a class="mediaTile" href="${esc(post.imageURL)}" target="_blank" rel="noopener">
          <img src="${esc(post.imageURL)}" alt="Foto" loading="lazy" />
          ${caption ? `<div class="mediaTileCaption">${esc(caption)}</div>` : ''}
        </a>
      `;
    })
    .join('');
}

function storyExpiresAt(story) {
  const exp = toDateValue(story?.expiresAt);
  if (exp) return exp;
  const created = toDateValue(story?.createdAt);
  if (!created) return null;
  return new Date(created.getTime() + 24 * 60 * 60 * 1000);
}

function isStoryActive(story) {
  const exp = storyExpiresAt(story);
  if (!exp) return true;
  return exp.getTime() > Date.now();
}

function storyTitle(story, fallback = 'Historia') {
  const title =
    String(story?.highlightTitle || '').trim() ||
    String(story?.text || '').trim() ||
    fallback;
  return title.length > 22 ? `${title.slice(0, 22)}…` : title;
}

function setStoryModalMsg(text, bad = false) {
  if (!storyModalMsg) return;
  storyModalMsg.textContent = text || '';
  storyModalMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function openStoryModal(list, index, ctx) {
  if (!storyModal) return;
  STORY_MODAL_LIST = Array.isArray(list) ? list : [];
  STORY_MODAL_INDEX = Math.max(0, Math.min(index || 0, STORY_MODAL_LIST.length - 1));
  STORY_MODAL_CTX = ctx || STORY_MODAL_CTX;

  storyModal.style.display = 'flex';
  storyModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setStoryModalMsg('');
  renderStoryModal();
}

function closeStoryModal() {
  if (!storyModal) return;
  storyModal.style.display = 'none';
  storyModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  setStoryModalMsg('');
}

function renderStoryModal() {
  const story = STORY_MODAL_LIST?.[STORY_MODAL_INDEX];
  if (!story) return;

  const ctx = STORY_MODAL_CTX;
  const isOwner = !!ctx?.isOwner;
  const handle = String(CURRENT_PROFILE?.handle || '').trim();
  const head = handle ? `@${handle}` : String(story.authorName || 'Usuario');
  const createdLabel = `${formatTime(story.createdAt)} · ${formatDate(story.createdAt)}`.trim();

  let expLabel = '';
  const exp = storyExpiresAt(story);
  const active = isStoryActive(story);
  if (exp && active) {
    const diff = exp.getTime() - Date.now();
    const hours = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
    expLabel = ` · expira en ${hours}h`;
  } else if (exp && !active) {
    expLabel = ' · expirada';
  }

  if (storyModalTitle) storyModalTitle.textContent = storyTitle(story, 'Historia');
  if (storyModalMeta) storyModalMeta.textContent = `${head}${createdLabel ? ` · ${createdLabel}` : ''}${expLabel}`;
  if (storyModalCaption) storyModalCaption.textContent = String(story.text || '').trim();

  const imgUrl = String(story.imageURL || '').trim();
  if (storyModalImg) {
    if (imgUrl) {
      storyModalImg.src = imgUrl;
      storyModalImg.style.display = 'block';
    } else {
      storyModalImg.removeAttribute('src');
      storyModalImg.style.display = 'none';
    }
  }

  const isHighlighted = HIGHLIGHT_IDS.includes(story.id);
  if (storyHighlightBtn) {
    storyHighlightBtn.style.display = isOwner ? '' : 'none';
    storyHighlightBtn.textContent = isHighlighted ? 'Quitar de destacados' : 'Destacar';
    storyHighlightBtn.dataset.storyId = story.id;
    storyHighlightBtn.dataset.highlighted = isHighlighted ? '1' : '0';
  }

  if (storyDeleteBtn) {
    storyDeleteBtn.style.display = isOwner ? '' : 'none';
    storyDeleteBtn.dataset.storyId = story.id;
  }

  if (storyReportBtn) {
    storyReportBtn.style.display = isOwner ? 'none' : '';
    storyReportBtn.dataset.storyId = story.id;
  }

  if (storyShareBtn) {
    storyShareBtn.dataset.storyId = story.id;
  }

  if (storyDmBtn) {
    storyDmBtn.dataset.storyId = story.id;
  }

  const hasMany = STORY_MODAL_LIST.length > 1;
  if (storyPrevBtn) storyPrevBtn.disabled = !hasMany;
  if (storyNextBtn) storyNextBtn.disabled = !hasMany;
}

function renderStoryRow(rootEl, list, kind) {
  if (!rootEl) return;
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    rootEl.innerHTML = '<div class="muted">—</div>';
    return;
  }
  rootEl.innerHTML = items
    .map((story) => {
      const title = storyTitle(story, kind === 'highlights' ? 'Destacado' : 'Historia');
      const ringClass = kind === 'highlights' ? 'storyRing storyRing--highlight' : 'storyRing';
      const img = String(story.imageURL || '').trim();
      const badge = kind === 'highlights' ? '<span class="storyBadge">?</span>' : '';
      return `
        <button class="storyBubble" type="button" data-story-kind="${esc(kind)}" data-story-id="${esc(
          story.id,
        )}">
          <div class="${ringClass}">
            <div class="storyInner">
              ${img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : '<span></span>'}
              ${badge}
            </div>
          </div>
          <div class="storyBubbleTitle">${esc(title)}</div>
        </button>
      `;
    })
    .join('');
}

function renderStoriesSection(ctx) {
  if (!storiesCard) return;
  const isOwner = !!ctx?.isOwner;

  if (storyAddBtn) storyAddBtn.style.display = isOwner ? '' : 'none';

  if (storiesHint) {
    storiesHint.textContent = STORY_ITEMS.length
      ? `${STORY_ITEMS.length} activas · duran 24h`
      : isOwner
        ? 'Comparte algo (dura 24h).'
        : 'Sin historias por ahora.';
  }
  if (highlightsHint) {
    highlightsHint.textContent = HIGHLIGHT_ITEMS.length
      ? `${HIGHLIGHT_ITEMS.length} destacados`
      : isOwner
        ? 'Destaca tus mejores historias.'
        : 'Sin destacados.';
  }

  renderStoryRow(storiesRow, STORY_ITEMS, 'stories');
  renderStoryRow(highlightsRow, HIGHLIGHT_ITEMS, 'highlights');
}

async function uploadStoryFile(uid, file) {
  if (!uid || !file) return null;
  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/story_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  return { url, path: filePath };
}

async function fetchStoryById(ownerUid, storyId) {
  const id = String(storyId || '').trim();
  if (!ownerUid || !id) return null;
  if (STORY_CACHE.has(id)) return STORY_CACHE.get(id);
  if (STORY_FETCHING.has(id)) return null;
  STORY_FETCHING.add(id);
  try {
    const snap = await getDoc(doc(db, 'user_feed', ownerUid, 'posts', id));
    if (!snap.exists()) return null;
    const story = { id: snap.id, ...(snap.data() || {}) };
    STORY_CACHE.set(id, story);
    return story;
  } catch (e) {
    console.warn('fetch story failed', e);
    return null;
  } finally {
    STORY_FETCHING.delete(id);
  }
}

async function refreshHighlights(ownerUid, ctx) {
  const ids = Array.isArray(HIGHLIGHT_IDS) ? HIGHLIGHT_IDS : [];
  const items = [];
  const missing = [];
  ids.forEach((id) => {
    const cached = STORY_CACHE.get(id);
    if (cached) items.push(cached);
    else missing.push(id);
  });
  HIGHLIGHT_ITEMS = items;
  renderStoriesSection(ctx);

  if (!missing.length) return;
  const fetched = await Promise.all(missing.slice(0, 20).map((id) => fetchStoryById(ownerUid, id)));
  fetched.forEach((x) => {
    if (x) STORY_CACHE.set(x.id, x);
  });
  HIGHLIGHT_ITEMS = ids.map((id) => STORY_CACHE.get(id)).filter(Boolean);
  renderStoriesSection(ctx);
}

function bindStoriesUI(ctx) {
  if (!storiesCard) return;
  STORY_MODAL_CTX = ctx || STORY_MODAL_CTX;

  if (storiesCard.dataset.wired) {
    renderStoriesSection(ctx);
    return;
  }
  storiesCard.dataset.wired = '1';

  storyAddBtn?.addEventListener('click', () => storyFileInput?.click());

  storyFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ctx?.isOwner) return;

    if (!String(file.type || '').startsWith('image/')) {
      setMsg('Selecciona una imagen.', true);
      storyFileInput.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMsg('La imagen es demasiado grande (máx. 10MB).', true);
      storyFileInput.value = '';
      return;
    }

    const caption = prompt('Texto (opcional):') ?? '';

    try {
      if (storyAddBtn) storyAddBtn.disabled = true;
      setMsg('Subiendo historia...');

      const upload = await uploadStoryFile(ctx.myUid, file);
      if (!upload?.url) throw new Error('upload_failed');

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await addDoc(collection(db, 'user_feed', ctx.myUid, 'posts'), {
        type: 'story',
        text: String(caption || '').trim(),
        imageURL: upload.url,
        imagePath: upload.path || null,
        createdAt: serverTimestamp(),
        expiresAt,
        authorUid: ctx.myUid,
        authorName: ctx.displayName || 'Usuario',
        highlighted: false,
        highlightTitle: null,
      });
      bumpActivity(ctx.myUid, { stories: 1 }).catch(() => {});

      setMsg('Historia publicada ?');
      setTimeout(() => setMsg(''), 1500);
    } catch (err) {
      console.warn('story upload failed', err);
      setMsg('No se pudo publicar la historia.', true);
    } finally {
      if (storyAddBtn) storyAddBtn.disabled = false;
      storyFileInput.value = '';
    }
  });

  const onStoryClick = (event) => {
    const btn = event.target.closest('[data-story-id]');
    if (!btn) return;
    const kind = btn.getAttribute('data-story-kind') || 'stories';
    const id = btn.getAttribute('data-story-id') || '';
    const list = kind === 'highlights' ? HIGHLIGHT_ITEMS : STORY_ITEMS;
    const index = list.findIndex((s) => s.id === id);
    if (index >= 0) openStoryModal(list, index, ctx);
  };

  storiesRow?.addEventListener('click', onStoryClick);
  highlightsRow?.addEventListener('click', onStoryClick);

  if (storyModal && !storyModal.dataset.wired) {
    storyModal.dataset.wired = '1';

    storyCloseBtn?.addEventListener('click', closeStoryModal);
    storyModal.addEventListener('click', (e) => {
      if (e.target === storyModal) closeStoryModal();
    });

    storyPrevBtn?.addEventListener('click', () => {
      if (!STORY_MODAL_LIST.length) return;
      STORY_MODAL_INDEX = (STORY_MODAL_INDEX - 1 + STORY_MODAL_LIST.length) % STORY_MODAL_LIST.length;
      renderStoryModal();
    });

    storyNextBtn?.addEventListener('click', () => {
      if (!STORY_MODAL_LIST.length) return;
      STORY_MODAL_INDEX = (STORY_MODAL_INDEX + 1) % STORY_MODAL_LIST.length;
      renderStoryModal();
    });

    storyShareBtn?.addEventListener('click', async () => {
      const storyId = storyShareBtn.dataset.storyId || '';
      const url = buildPostShareUrl(CURRENT_PROFILE?.handle, STORY_MODAL_CTX?.targetUid, storyId);
      const ok = await shareUrl(url, 'AquiVivo');
      setStoryModalMsg(ok ? 'Enlace listo ?' : 'No se pudo compartir.', !ok);
      if (ok) setTimeout(() => setStoryModalMsg(''), 1500);
    });

    storyDmBtn?.addEventListener('click', () => {
      const storyId = storyDmBtn.dataset.storyId || '';
      const url = buildPostShareUrl(CURRENT_PROFILE?.handle, STORY_MODAL_CTX?.targetUid, storyId);
      const text = `Te comparto esto: ${url}`;
      window.location.href = `mensajes.html?share=${encodeURIComponent(text)}`;
    });

    storyReportBtn?.addEventListener('click', async () => {
      const ctx = STORY_MODAL_CTX;
      const storyId = storyReportBtn.dataset.storyId || '';
      const story = STORY_MODAL_LIST?.[STORY_MODAL_INDEX] || {};
      if (!ctx?.myUid || !ctx.targetUid || !storyId) return;
      const reason = prompt('Reportar historia: ¿qué pasó?');
      const text = String(reason || '').trim();
      if (!text) return;
      try {
        await addDoc(collection(db, 'user_reports'), {
          userId: ctx.myUid,
          kind: 'story',
          targetUid: story.authorUid || ctx.targetUid,
          targetHandle: String(CURRENT_PROFILE?.handle || '').trim() || null,
          postId: storyId,
          postOwnerUid: ctx.targetUid,
          postText: String(story.text || '').slice(0, 500),
          reason: text.slice(0, 800),
          page: 'perfil',
          createdAt: serverTimestamp(),
        });
        setStoryModalMsg('Reporte enviado. Gracias ?');
        setTimeout(() => setStoryModalMsg(''), 2000);
      } catch (e) {
        console.warn('report story failed', e);
        setStoryModalMsg('No se pudo enviar el reporte.', true);
      }
    });

    storyDeleteBtn?.addEventListener('click', async () => {
      const ctx = STORY_MODAL_CTX;
      const story = STORY_MODAL_LIST?.[STORY_MODAL_INDEX] || {};
      if (!ctx?.isOwner) return;
      const ok = confirm('¿Eliminar esta historia?');
      if (!ok) return;

      const storyId = story.id || storyDeleteBtn.dataset.storyId || '';
      const imagePath = String(story.imagePath || '').trim();
      try {
        storyDeleteBtn.disabled = true;
        setStoryModalMsg('Eliminando...');

        if (HIGHLIGHT_IDS.includes(storyId)) {
          await updateDoc(doc(db, 'public_users', ctx.targetUid), { highlights: arrayRemove(storyId) });
          HIGHLIGHT_IDS = HIGHLIGHT_IDS.filter((x) => x !== storyId);
          if (CURRENT_PROFILE) {
            CURRENT_PROFILE.highlights = HIGHLIGHT_IDS.slice();
          }
          await refreshHighlights(ctx.targetUid, ctx);
        }

        if (imagePath) {
          try {
            await deleteObject(storageRef(storage, imagePath));
          } catch (e) {
            console.warn('delete story image failed', e);
          }
        }

        await deleteDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', storyId));
        closeStoryModal();
      } catch (e) {
        console.warn('delete story failed', e);
        setStoryModalMsg('No se pudo eliminar.', true);
      } finally {
        storyDeleteBtn.disabled = false;
      }
    });

    storyHighlightBtn?.addEventListener('click', async () => {
      const ctx = STORY_MODAL_CTX;
      const story = STORY_MODAL_LIST?.[STORY_MODAL_INDEX] || {};
      if (!ctx?.isOwner) return;
      const storyId = story.id || storyHighlightBtn.dataset.storyId || '';
      if (!storyId) return;

      const isHighlighted = HIGHLIGHT_IDS.includes(storyId);
      try {
        storyHighlightBtn.disabled = true;
        setStoryModalMsg(isHighlighted ? 'Quitando...' : 'Destacando...');

        if (isHighlighted) {
          await updateDoc(doc(db, 'public_users', ctx.targetUid), { highlights: arrayRemove(storyId) });
          await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', storyId), {
            highlighted: false,
            highlightTitle: null,
            updatedAt: serverTimestamp(),
          });
          HIGHLIGHT_IDS = HIGHLIGHT_IDS.filter((x) => x !== storyId);
        } else {
          const title =
            prompt(
              'Nombre del destacado (opcional):',
              storyTitle(story, 'Destacado'),
            ) ?? '';
          await updateDoc(doc(db, 'public_users', ctx.targetUid), { highlights: arrayUnion(storyId) });
          await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', storyId), {
            highlighted: true,
            highlightTitle: String(title || '').trim() || null,
            updatedAt: serverTimestamp(),
          });
          HIGHLIGHT_IDS = [...HIGHLIGHT_IDS, storyId];
        }

        if (CURRENT_PROFILE) {
          CURRENT_PROFILE.highlights = HIGHLIGHT_IDS.slice();
        }
        setStoryModalMsg('Listo ✅');
        setTimeout(() => setStoryModalMsg(''), 1200);
        renderStoryModal();
        await refreshHighlights(ctx.targetUid, ctx);
      } catch (e) {
        console.warn('toggle highlight failed', e);
        setStoryModalMsg('No se pudo actualizar.', true);
      } finally {
        storyHighlightBtn.disabled = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!storyModal || storyModal.style.display !== 'flex') return;
      if (e.key === 'Escape') closeStoryModal();
      if (e.key === 'ArrowLeft') storyPrevBtn?.click();
      if (e.key === 'ArrowRight') storyNextBtn?.click();
    });
  }

  renderStoriesSection(ctx);
}

function saveDocId(ownerUid, postId) {
  const a = String(ownerUid || '').trim();
  const b = String(postId || '').trim();
  return a && b ? `${a}__${b}` : '';
}

function setSavedStatus(text, bad = false) {
  if (!savedStatus) return;
  savedStatus.textContent = text || '';
  savedStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function renderSavedCollections() {
  if (!savedCollectionsRow) return;
  const cols = Array.isArray(SAVE_COLLECTIONS) ? SAVE_COLLECTIONS : [];

  const chips = [];
  const mk = (id, label) => `
    <button class="savedChip${ACTIVE_SAVE_COLLECTION === id ? ' is-active' : ''}" type="button" data-save-collection="${esc(
      id,
    )}">${esc(label)}</button>
  `;
  chips.push(mk('all', 'Todas'));
  chips.push(mk('_none', 'Sin colección'));
  cols.forEach((c) => {
    const id = String(c.id || '').trim();
    if (!id) return;
    chips.push(mk(id, String(c.name || 'Colección').trim() || 'Colección'));
  });

  savedCollectionsRow.innerHTML = chips.join('');
}

function getFilteredSavedItems() {
  const list = Array.isArray(SAVED_ITEMS) ? SAVED_ITEMS : [];
  if (ACTIVE_SAVE_COLLECTION === 'all') return list;
  if (ACTIVE_SAVE_COLLECTION === '_none') return list.filter((x) => !String(x.collectionId || '').trim());
  return list.filter((x) => String(x.collectionId || '').trim() === ACTIVE_SAVE_COLLECTION);
}

function renderSavedGrid() {
  if (!savedGrid) return;
  const items = getFilteredSavedItems();
  if (!items.length) {
    savedGrid.innerHTML = '<div class="muted">Aún no tienes guardados.</div>';
    return;
  }

  savedGrid.innerHTML = items
    .map((item) => {
      const ownerUid = String(item.ownerUid || '').trim();
      const ownerHandle = String(item.ownerHandle || '').trim();
      const postId = String(item.postId || '').trim();
      const href = ownerUid && postId ? buildPostShareUrl(ownerHandle, ownerUid, postId) : '#';
      const title = ownerHandle ? `@${ownerHandle}` : 'Publicación guardada';
      const text = String(item.postText || '').trim();
      const img = String(item.postImageURL || '').trim();

      return `
        <div class="savedItem" data-save-id="${esc(item.id)}">
          ${
            img
              ? `<div class="savedItemMedia"><img src="${esc(img)}" alt="guardado" loading="lazy" /></div>`
              : ''
          }
          <div class="savedItemTitle">
            <span>${esc(title)}</span>
            <span class="hintSmall">${formatDate(item.savedAt || item.createdAt || '')}</span>
          </div>
          ${text ? `<div class="savedItemText">${esc(text)}</div>` : ''}
          <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
            <a class="btn-white-outline" href="${esc(href)}">Abrir</a>
            <button class="btn-white-outline" type="button" data-save-move="${esc(item.id)}">
              Mover
            </button>
            <button class="btn-white-outline" type="button" data-save-remove="${esc(item.id)}">
              Quitar
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderSavedTab(ctx) {
  if (!tabSaved && !tabBtnSaved) return;
  const isOwner = !!ctx?.isOwner;
  if (tabBtnSaved) tabBtnSaved.style.display = isOwner ? '' : 'none';
  if (tabSaved) tabSaved.style.display = isOwner ? '' : 'none';
  if (!isOwner) return;

  renderSavedCollections();
  renderSavedGrid();
}

async function findOrCreateCollection(myUid, name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const existing = (Array.isArray(SAVE_COLLECTIONS) ? SAVE_COLLECTIONS : []).find(
    (c) => String(c.name || '').trim().toLowerCase() === key,
  );
  if (existing?.id) return existing.id;

  const ref = await addDoc(collection(db, 'user_saves', myUid, 'collections'), {
    name: raw.slice(0, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

function bindSavedUI(ctx) {
  if (!ctx?.isOwner) return;

  if (btnNewCollection && !btnNewCollection.dataset.wired) {
    btnNewCollection.dataset.wired = '1';
    btnNewCollection.addEventListener('click', async () => {
      const name = prompt('Nombre de la colección:', '') ?? '';
      const value = String(name || '').trim();
      if (!value) return;
      try {
        setSavedStatus('Creando...');
        await addDoc(collection(db, 'user_saves', ctx.myUid, 'collections'), {
          name: value.slice(0, 40),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSavedStatus('Listo ✅');
        setTimeout(() => setSavedStatus(''), 1200);
      } catch (e) {
        console.warn('create collection failed', e);
        setSavedStatus('No se pudo crear.', true);
      }
    });
  }

  if (savedCollectionsRow && !savedCollectionsRow.dataset.wired) {
    savedCollectionsRow.dataset.wired = '1';
    savedCollectionsRow.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-save-collection]');
      if (!btn) return;
      const id = String(btn.getAttribute('data-save-collection') || '').trim();
      if (!id) return;
      ACTIVE_SAVE_COLLECTION = id;
      try {
        localStorage.setItem('av_saved_collection', ACTIVE_SAVE_COLLECTION);
      } catch {}
      renderSavedTab(ctx);
    });
  }

  if (savedGrid && !savedGrid.dataset.wired) {
    savedGrid.dataset.wired = '1';
    savedGrid.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('[data-save-remove]');
      if (removeBtn) {
        const id = String(removeBtn.getAttribute('data-save-remove') || '').trim();
        if (!id) return;
        try {
          await deleteDoc(doc(db, 'user_saves', ctx.myUid, 'items', id));
          setSavedStatus('Quitado.');
          setTimeout(() => setSavedStatus(''), 1200);
        } catch (err) {
          console.warn('remove saved failed', err);
          setSavedStatus('No se pudo quitar.', true);
        }
        return;
      }

      const moveBtn = e.target.closest('[data-save-move]');
      if (moveBtn) {
        const id = String(moveBtn.getAttribute('data-save-move') || '').trim();
        if (!id) return;
        const suggested =
          ACTIVE_SAVE_COLLECTION !== 'all' && ACTIVE_SAVE_COLLECTION !== '_none'
            ? SAVE_COLLECTIONS.find((c) => c.id === ACTIVE_SAVE_COLLECTION)?.name || ''
            : '';
        const name =
          prompt(
            'Mover a colección (vacío = sin colección):',
            suggested,
          ) ?? '';
        const value = String(name || '').trim();
        try {
          setSavedStatus('Actualizando...');
          const colId = value ? await findOrCreateCollection(ctx.myUid, value) : null;
          await updateDoc(doc(db, 'user_saves', ctx.myUid, 'items', id), {
            collectionId: colId || null,
            updatedAt: serverTimestamp(),
          });
          setSavedStatus('Listo ✅');
          setTimeout(() => setSavedStatus(''), 1200);
        } catch (err) {
          console.warn('move saved failed', err);
          setSavedStatus('No se pudo mover.', true);
        }
      }
    });
  }
}

function subscribeSaveCollections(myUid) {
  if (!myUid) return;
  if (SAVES_UID && SAVES_UID !== myUid) {
    SAVES_UNSUB?.();
    COLLECTIONS_UNSUB?.();
    SAVES_UNSUB = null;
    COLLECTIONS_UNSUB = null;
    SAVED_ITEMS = [];
    SAVED_SET = new Set();
    SAVE_COLLECTIONS = [];
  }
  SAVES_UID = myUid;

  if (COLLECTIONS_UNSUB) return;
  const q = query(collection(db, 'user_saves', myUid, 'collections'), orderBy('createdAt', 'desc'), limit(40));
  COLLECTIONS_UNSUB = onSnapshot(
    q,
    (snap) => {
      SAVE_COLLECTIONS = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      renderSavedTab(PROFILE_CTX);
    },
    (err) => {
      console.warn('collections snapshot failed', err);
    },
  );
}

function subscribeSavedItems(myUid) {
  if (!myUid) return;
  if (SAVES_UID && SAVES_UID !== myUid) {
    SAVES_UNSUB?.();
    COLLECTIONS_UNSUB?.();
    SAVES_UNSUB = null;
    COLLECTIONS_UNSUB = null;
    SAVED_ITEMS = [];
    SAVED_SET = new Set();
    SAVE_COLLECTIONS = [];
  }
  SAVES_UID = myUid;

  if (SAVES_UNSUB) return;
  const q = query(collection(db, 'user_saves', myUid, 'items'), orderBy('savedAt', 'desc'), limit(120));
  SAVES_UNSUB = onSnapshot(
    q,
    (snap) => {
      SAVED_ITEMS = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      SAVED_SET = new Set(snap.docs.map((d) => d.id));
      if (PROFILE_CTX && FEED_ITEMS?.length) renderActiveFeed(PROFILE_CTX);
      renderSavedTab(PROFILE_CTX);
    },
    (err) => {
      console.warn('saved snapshot failed', err);
      SAVED_ITEMS = [];
      SAVED_SET = new Set();
      renderSavedTab(PROFILE_CTX);
    },
  );
}

function initSavedDefaults() {
  try {
    const stored = localStorage.getItem('av_saved_collection');
    if (stored) ACTIVE_SAVE_COLLECTION = stored;
  } catch {}
}

function todayDayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function bumpActivity(uid, patch = {}) {
  const myUid = String(uid || '').trim();
  if (!myUid) return;
  const dayKey = todayDayKey();
  const data = { uid: myUid, dayKey, updatedAt: serverTimestamp() };
  Object.entries(patch || {}).forEach(([k, v]) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || !n) return;
    data[k] = increment(n);
  });
  try {
    await setDoc(doc(db, 'user_activity', myUid, 'days', dayKey), data, { merge: true });
  } catch (e) {
    console.warn('bump activity failed', e);
  }
}

function activityScore(day) {
  const visits = Number(day?.visits || 0) || 0;
  const posts = Number(day?.posts || 0) || 0;
  const stories = Number(day?.stories || 0) || 0;
  const photos = Number(day?.photos || 0) || 0;
  const minutes = Number(day?.minutes || 0) || 0;
  const minuteScore = Math.min(6, Math.round(minutes / 10));
  return visits + posts * 2 + stories * 2 + photos + minuteScore;
}

function activityLevel(score) {
  const s = Number(score || 0) || 0;
  if (s <= 0) return 0;
  if (s <= 1) return 1;
  if (s <= 3) return 2;
  if (s <= 6) return 3;
  return 4;
}

function renderActivityCalendar() {
  if (!activityCard || !activityGrid) return;
  const keys = [];
  for (let i = 34; i >= 0; i -= 1) {
    keys.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const cells = keys.map((k) => {
    const day = ACTIVITY_DAYS.get(k) || {};
    const visits = Number(day.visits || 0) || 0;
    const posts = Number(day.posts || 0) || 0;
    const stories = Number(day.stories || 0) || 0;
    const photos = Number(day.photos || 0) || 0;
    const minutes = Number(day.minutes || 0) || 0;
    const score = activityScore(day);
    const lv = activityLevel(score);
    const cls = lv ? ` lv${lv}` : '';
    const title = `${k} · visitas ${visits}, posts ${posts}, historias ${stories}, fotos ${photos}, min ${minutes}`;
    return `<div class="activityCell${cls}" title="${esc(title)}"></div>`;
  });
  activityGrid.innerHTML = cells.join('');

  if (activityHint) {
    activityHint.textContent = 'Últimos 35 días (se actualiza automáticamente).';
  }

  if (activitySummary) {
    const last7 = keys.slice(-7);
    let v = 0;
    let p = 0;
    let s = 0;
    let m = 0;
    last7.forEach((k) => {
      const day = ACTIVITY_DAYS.get(k) || {};
      v += Number(day.visits || 0) || 0;
      p += Number(day.posts || 0) || 0;
      s += Number(day.stories || 0) || 0;
      m += Number(day.minutes || 0) || 0;
    });
    activitySummary.textContent = `7 días: ${v} visitas · ${p} posts · ${s} historias · ${m} min`;
  }
}

function subscribeActivity(uid, enabled) {
  if (!activityCard) return;
  const myUid = String(uid || '').trim();
  const on = !!enabled && !!myUid;

  activityCard.style.display = on ? '' : 'none';
  if (!on) {
    ACTIVITY_UNSUB?.();
    ACTIVITY_UNSUB = null;
    ACTIVITY_DAYS = new Map();
    return;
  }

  if (ACTIVITY_UNSUB) return;
  const q = query(collection(db, 'user_activity', myUid, 'days'), orderBy('dayKey', 'desc'), limit(90));
  ACTIVITY_UNSUB = onSnapshot(
    q,
    (snap) => {
      ACTIVITY_DAYS = new Map();
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const key = String(data.dayKey || d.id || '').trim();
        if (key) ACTIVITY_DAYS.set(key, data);
      });
      renderActivityCalendar();
    },
    (err) => {
      console.warn('activity snapshot failed', err);
      ACTIVITY_DAYS = new Map();
      renderActivityCalendar();
    },
  );
}

async function loadComments(targetUid, postId) {
  const snap = await getDocs(
    query(
      collection(db, 'user_feed', targetUid, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(40),
    ),
  );
  const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
  COMMENTS_CACHE.set(postId, items);
}

async function toggleComments(targetUid, postId) {
  if (!postId) return;
  const isOpen = COMMENTS_OPEN.has(postId);
  if (isOpen) {
    COMMENTS_OPEN.delete(postId);
    return;
  }
  if (!COMMENTS_CACHE.has(postId)) {
    await loadComments(targetUid, postId);
  }
  COMMENTS_OPEN.add(postId);
}

async function sendComment(targetUid, postId, myUid, myName, text) {
  if (!text) return;
  await addDoc(collection(db, 'user_feed', targetUid, 'posts', postId, 'comments'), {
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    authorUid: myUid,
    authorName: myName || 'Usuario',
    postOwnerUid: targetUid,
  });
  await loadComments(targetUid, postId);
}

async function editComment(targetUid, postId, commentId, text) {
  if (!text) return;
  await updateDoc(doc(db, 'user_feed', targetUid, 'posts', postId, 'comments', commentId), {
    text,
    editedAt: serverTimestamp(),
  });
  await loadComments(targetUid, postId);
}

async function deleteComment(targetUid, postId, commentId) {
  await deleteDoc(doc(db, 'user_feed', targetUid, 'posts', postId, 'comments', commentId));
  await loadComments(targetUid, postId);
}

async function sendReaction(targetUid, postId, myUid, myName, type) {
  if (!postId || !type) return;
  const ref = doc(db, 'user_feed', targetUid, 'posts', postId, 'reactions', `${myUid}__${type}`);
  await setDoc(ref, {
    type,
    userId: myUid,
    userName: myName || 'Usuario',
    createdAt: serverTimestamp(),
    postOwnerUid: targetUid,
  });
}

function subscribeFeed(targetUid, ctx) {
  if (!targetUid) return;
  if (feedUnsub) feedUnsub();

  bindStoriesUI(ctx);
  bindFeedFilters();
  const q = query(
    collection(db, 'user_feed', targetUid, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(120),
  );
  feedUnsub = onSnapshot(
    q,
    async (snap) => {
      const all = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
      all.forEach((item) => STORY_CACHE.set(item.id, item));

      const storyDocs = all.filter((p) => (p.type || 'user') === 'story');
      STORY_ITEMS = storyDocs.filter(isStoryActive).slice(0, 12);

      HIGHLIGHT_ITEMS = HIGHLIGHT_IDS.map((id) => STORY_CACHE.get(id)).filter((x) => x && (x.type || 'user') === 'story');

      bindStoriesUI(ctx);
      renderStoriesSection(ctx);
      refreshHighlights(targetUid, ctx).catch(() => {});

      const feedDocs = all.filter((p) => ['user', 'system'].includes(p.type || 'user'));
      FEED_SOURCE = feedDocs;
      const pinned = feedDocs.filter((p) => p.pinned).slice(0, 6);
      const rest = feedDocs.filter((p) => !p.pinned).slice(0, Math.max(0, 40 - pinned.length));
      const items = [...pinned, ...rest];

      const hasPinned = items.some((p) => p.pinned);
      if (!hasPinned) {
        items.unshift({
          id: 'sys_pinned_local',
          type: 'system',
          text: 'Tu progreso aparece aquí. Sigue aprendiendo ',
          createdAt: new Date(),
          pinned: true,
        });
      }

      FEED_ITEMS = items;
      renderActiveFeed(ctx);
      renderMediaGrid(feedDocs);

      if (focusPostId) {
        let targetEl = document.getElementById(`post_${safeId(focusPostId)}`);
        if (!targetEl && (FEED_FILTER !== 'all' || FEED_SEARCH)) {
          FEED_FILTER = 'all';
          FEED_SEARCH = '';
          persistFeedState();
          renderFeedFiltersUI();
          renderActiveFeed(ctx);
          targetEl = document.getElementById(`post_${safeId(focusPostId)}`);
        }
        if (targetEl) {
          focusPostId = '';
          setTimeout(() => targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
          setTimeout(() => targetEl.classList.remove('is-focused'), 4000);
        } else {
          const story = STORY_CACHE.get(focusPostId);
          if (story && (story.type || 'user') === 'story') {
            const id = focusPostId;
            focusPostId = '';
            const inHighlights = HIGHLIGHT_IDS.includes(id);
            const list = inHighlights ? HIGHLIGHT_ITEMS : STORY_ITEMS;
            const idx = list.findIndex((s) => s.id === id);
            openStoryModal(idx >= 0 ? list : [story], idx >= 0 ? idx : 0, ctx);
          }
        }
      }
    },
    (err) => {
      console.warn('feed snapshot failed', err);
      FEED_ITEMS = [];
      FEED_SOURCE = [];
      renderActiveFeed(ctx);
      renderMediaGrid([]);
      STORY_ITEMS = [];
      HIGHLIGHT_ITEMS = [];
      renderStoriesSection(ctx);
    },
  );
}

function bindStatusComposer(ctx) {
  if (!statusCard) return;
  if (!ctx.isOwner) {
    statusCard.style.display = 'none';
    return;
  }
  if (!statusInput || !statusPostBtn) return;

  const updateBtn = () => {
    statusPostBtn.disabled = !statusInput.value.trim();
  };
  statusInput.addEventListener('input', updateBtn);
  updateBtn();

  statusMood?.addEventListener('click', () => toggleChip(statusMood));
  statusMotivation?.addEventListener('click', () => toggleChip(statusMotivation));

  statusPostBtn.addEventListener('click', async () => {
    const text = statusInput.value.trim();
    if (!text) return;
    const minutes = Number(statusMinutes?.value || 0) || 0;
    const tags = collectTags();
    const post = {
      type: 'user',
      text,
      createdAt: serverTimestamp(),
      editedAt: null,
      authorUid: ctx.myUid,
      authorName: ctx.displayName || 'Usuario',
      tags,
    };
    try {
      await addDoc(collection(db, 'user_feed', ctx.myUid, 'posts'), post);
      bumpActivity(ctx.myUid, { posts: 1, minutes }).catch(() => {});
      statusInput.value = '';
      if (statusMinutes) statusMinutes.value = '';
      if (statusCourse) statusCourse.value = '';
      statusMood?.classList.remove('active');
      statusMotivation?.classList.remove('active');
      updateBtn();
      setStatusHint('Publicado ?');
      playHeart();
      setTimeout(() => setStatusHint(''), 2000);
    } catch (e) {
      console.warn('add post failed', e);
      setStatusHint('No se pudo publicar.');
    }
  });
}

function setMediaMsg(text, bad = false) {
  if (!mediaMsg) return;
  mediaMsg.textContent = text || '';
  mediaMsg.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.85)';
}

function clearMediaSelection(clearCaption = false) {
  MEDIA_FILE = null;
  if (MEDIA_PREVIEW_URL) {
    try {
      URL.revokeObjectURL(MEDIA_PREVIEW_URL);
    } catch {
      // ignore
    }
    MEDIA_PREVIEW_URL = '';
  }
  if (mediaPreviewImg) mediaPreviewImg.removeAttribute('src');
  if (mediaPreview) mediaPreview.style.display = 'none';
  if (mediaRemoveBtn) mediaRemoveBtn.style.display = 'none';
  if (mediaFileInput) mediaFileInput.value = '';
  if (mediaPostBtn) mediaPostBtn.disabled = true;
  if (clearCaption && mediaCaption) mediaCaption.value = '';
}

async function uploadMediaFile(uid, file) {
  if (!uid || !file) return null;
  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/media_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  return { url, path: filePath };
}

function bindMediaComposer(ctx) {
  if (!mediaComposer) return;

  if (!ctx.isOwner) {
    mediaComposer.style.display = 'none';
    clearMediaSelection(true);
    if (mediaHint) mediaHint.textContent = 'Las fotos las publica el dueño del perfil.';
    return;
  }

  if (mediaComposer.dataset.wired) return;
  mediaComposer.dataset.wired = '1';

  const updateBtn = () => {
    if (mediaPostBtn) mediaPostBtn.disabled = !MEDIA_FILE;
  };

  mediaPickBtn?.addEventListener('click', () => mediaFileInput?.click());

  mediaRemoveBtn?.addEventListener('click', () => {
    clearMediaSelection();
    setMediaMsg('');
  });

  mediaFileInput?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setMediaMsg('Selecciona una imagen.', true);
      clearMediaSelection();
      return;
    }
    const tooBig = file.size > 10 * 1024 * 1024;
    if (tooBig) {
      setMediaMsg('La imagen es demasiado grande (máx. 10MB).', true);
      clearMediaSelection();
      return;
    }

    MEDIA_FILE = file;
    if (mediaRemoveBtn) mediaRemoveBtn.style.display = '';
    if (mediaPreview && mediaPreviewImg) {
      if (MEDIA_PREVIEW_URL) {
        try {
          URL.revokeObjectURL(MEDIA_PREVIEW_URL);
        } catch {
          // ignore
        }
      }
      MEDIA_PREVIEW_URL = URL.createObjectURL(file);
      mediaPreviewImg.src = MEDIA_PREVIEW_URL;
      mediaPreview.style.display = '';
    }
    setMediaMsg('');
    updateBtn();
  });

  mediaCaption?.addEventListener('input', updateBtn);
  updateBtn();

  mediaPostBtn?.addEventListener('click', async () => {
    if (!MEDIA_FILE) return;
    try {
      if (mediaPostBtn) mediaPostBtn.disabled = true;
      if (mediaPickBtn) mediaPickBtn.disabled = true;
      if (mediaRemoveBtn) mediaRemoveBtn.disabled = true;
      setMediaMsg('Subiendo...');

      const caption = String(mediaCaption?.value || '').trim();
      const upload = await uploadMediaFile(ctx.myUid, MEDIA_FILE);
      if (!upload?.url) throw new Error('upload_failed');

      const post = {
        type: 'user',
        text: caption || 'Foto',
        imageURL: upload.url,
        imagePath: upload.path || null,
        createdAt: serverTimestamp(),
        editedAt: null,
        authorUid: ctx.myUid,
        authorName: ctx.displayName || 'Usuario',
        tags: ['Foto'],
      };

      await addDoc(collection(db, 'user_feed', ctx.myUid, 'posts'), post);
      bumpActivity(ctx.myUid, { posts: 1, photos: 1 }).catch(() => {});
      clearMediaSelection(true);
      setMediaMsg('Publicado ?');
      playHeart();
      setTimeout(() => setMediaMsg(''), 2000);
    } catch (e) {
      console.warn('media post failed', e);
      setMediaMsg('No se pudo publicar la foto.', true);
    } finally {
      if (mediaPickBtn) mediaPickBtn.disabled = false;
      if (mediaRemoveBtn) mediaRemoveBtn.disabled = false;
      updateBtn();
    }
  });
}

function bindFeedActions(ctx) {
  if (!feedList || feedList.dataset.wired) return;
  feedList.dataset.wired = '1';

  feedList.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-action]');
    if (actionBtn) {
      const id = actionBtn.getAttribute('data-id');
      const action = actionBtn.getAttribute('data-action');
      const idx = FEED_ITEMS.findIndex((p) => p.id === id);
      if (idx < 0) return;

      if (action === 'delete') {
        const post = FEED_ITEMS[idx] || {};
        const imagePath = String(post.imagePath || '').trim();
        if (imagePath) {
          try {
            await deleteObject(storageRef(storage, imagePath));
          } catch (e) {
            console.warn('delete post image failed', e);
          }
        }
        await deleteDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id));
        return;
      }

      if (action === 'pin') {
        const post = FEED_ITEMS[idx] || {};
        const nextPinned = !post.pinned;
        await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id), {
          pinned: nextPinned,
          pinnedAt: nextPinned ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      if (action === 'resolve') {
        const post = FEED_ITEMS[idx] || {};
        const nextResolved = post.resolved !== true;
        await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id), {
          resolved: nextResolved,
          resolvedAt: nextResolved ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      if (action === 'edit') {
        const post = FEED_ITEMS[idx];
        const updated = prompt('Editar tu estado:', post.text || '');
        if (updated && updated.trim()) {
          await updateDoc(doc(db, 'user_feed', ctx.targetUid, 'posts', id), {
            text: updated.trim(),
            editedAt: serverTimestamp(),
          });
        }
        return;
      }

      if (action === 'copy') {
        const url = buildPostShareUrl(CURRENT_PROFILE?.handle, ctx.targetUid, id);
        const ok = await copyToClipboard(url);
        setMsg(ok ? 'Enlace copiado ?' : 'No se pudo copiar.', !ok);
        if (ok) setTimeout(() => setMsg(''), 1500);
        return;
      }

      if (action === 'share') {
        const url = buildPostShareUrl(CURRENT_PROFILE?.handle, ctx.targetUid, id);
        const ok = await shareUrl(url, 'AquiVivo');
        setMsg(ok ? 'Enlace listo ?' : 'No se pudo compartir.', !ok);
        if (ok) setTimeout(() => setMsg(''), 1500);
        return;
      }

      if (action === 'dm') {
        const url = buildPostShareUrl(CURRENT_PROFILE?.handle, ctx.targetUid, id);
        const text = `Te comparto esto: ${url}`;
        window.location.href = `mensajes.html?share=${encodeURIComponent(text)}`;
        return;
      }

      if (action === 'hide') {
        const post = FEED_ITEMS[idx] || {};
        if ((post.type || 'user') === 'system' || post.id === 'sys_pinned_local') return;
        const ok = confirm('¿Ocultar esta publicación para ti?');
        if (!ok) return;
        const key = hiddenPostKey(ctx.targetUid, id);
        if (!key) return;
        HIDDEN_SET.add(key);
        persistHiddenSet();
        updateHiddenClearBtn();
        setMsg('Publicación oculta.');
        setTimeout(() => setMsg(''), 1500);
        renderActiveFeed(ctx);
        return;
      }

      if (action === 'save') {
        const post = FEED_ITEMS[idx] || {};
        if ((post.type || 'user') === 'system' || post.id === 'sys_pinned_local') return;
        const key = saveDocId(ctx.targetUid, id);
        if (!key) return;
        const isSaved = SAVED_SET.has(key);
        try {
          if (isSaved) {
            await deleteDoc(doc(db, 'user_saves', ctx.myUid, 'items', key));
            setMsg('Quitado de guardados.');
          } else {
            const colId =
              ACTIVE_SAVE_COLLECTION !== 'all' && ACTIVE_SAVE_COLLECTION !== '_none'
                ? ACTIVE_SAVE_COLLECTION
                : null;
            await setDoc(
              doc(db, 'user_saves', ctx.myUid, 'items', key),
              {
                ownerUid: ctx.targetUid,
                ownerHandle: String(CURRENT_PROFILE?.handle || '').trim() || null,
                postId: id,
                postText: String(post.text || '').slice(0, 500),
                postImageURL: String(post.imageURL || '').trim() || null,
                collectionId: colId || null,
                savedAt: serverTimestamp(),
              },
              { merge: true },
            );
            setMsg('Guardado ?');
          }
          setTimeout(() => setMsg(''), 1500);
        } catch (e) {
          console.warn('save failed', e);
          setMsg('No se pudo guardar.', true);
        }
        return;
      }

      if (action === 'report') {
        const post = FEED_ITEMS[idx] || {};
        if (post.authorUid && post.authorUid === ctx.myUid) return;
        const reason = prompt('Reportar post: ¿qué pasó?');
        const text = String(reason || '').trim();
        if (!text) return;
        try {
          await addDoc(collection(db, 'user_reports'), {
            userId: ctx.myUid,
            kind: 'post',
            targetUid: post.authorUid || ctx.targetUid,
            targetHandle: String(CURRENT_PROFILE?.handle || '').trim() || null,
            postId: id,
            postOwnerUid: ctx.targetUid,
            postText: String(post.text || '').slice(0, 500),
            reason: text.slice(0, 800),
            page: 'perfil',
            createdAt: serverTimestamp(),
          });
          setMsg('Reporte enviado. Gracias ?');
          setTimeout(() => setMsg(''), 2000);
        } catch (e) {
          console.warn('report post failed', e);
          setMsg('No se pudo enviar el reporte.', true);
        }
        return;
      }
    }

    const tagBtn = event.target.closest('[data-feed-tag]');
    if (tagBtn) {
      const tag = String(tagBtn.getAttribute('data-feed-tag') || '').trim();
      if (!tag) return;
      FEED_FILTER = 'all';
      FEED_SEARCH = `#${tag}`;
      persistFeedState();
      renderFeedFiltersUI();
      renderActiveFeed(ctx);
      return;
    }

    const toggleBtn = event.target.closest('[data-comment="toggle"]');
    if (toggleBtn) {
      const postId = toggleBtn.getAttribute('data-id');
      await toggleComments(ctx.targetUid, postId);
      renderActiveFeed(ctx);
      return;
    }

    const sendBtn = event.target.closest('[data-comment="send"]');
    if (sendBtn) {
      const postId = sendBtn.getAttribute('data-id');
      const input = document.getElementById(`commentInput_${safeId(postId)}`);
      const value = input?.value?.trim() || '';
      if (!value) return;
      await sendComment(ctx.targetUid, postId, ctx.myUid, ctx.displayName, value);
      if (input) input.value = '';
      renderActiveFeed(ctx);
      await loadRecentReactions(ctx.targetUid);
      return;
    }

    const commentAction = event.target.closest('[data-comment-action]');
    if (commentAction) {
      const postId = commentAction.getAttribute('data-post-id');
      const commentId = commentAction.getAttribute('data-comment-id');
      const type = commentAction.getAttribute('data-comment-action');
      if (!postId || !commentId) return;
      if (type === 'delete') {
        await deleteComment(ctx.targetUid, postId, commentId);
        renderActiveFeed(ctx);
        await loadRecentReactions(ctx.targetUid);
        return;
      }
      if (type === 'edit') {
        const current = (COMMENTS_CACHE.get(postId) || []).find((c) => c.id === commentId);
        const updated = prompt('Editar comentario:', current?.text || '');
        if (updated && updated.trim()) {
          await editComment(ctx.targetUid, postId, commentId, updated.trim());
          renderActiveFeed(ctx);
          await loadRecentReactions(ctx.targetUid);
        }
        return;
      }
    }

    const reactionBtn = event.target.closest('[data-reaction]');
    if (reactionBtn) {
      const postId = reactionBtn.getAttribute('data-id');
      const type = reactionBtn.getAttribute('data-reaction');
      await sendReaction(ctx.targetUid, postId, ctx.myUid, ctx.displayName, type);
      await loadRecentReactions(ctx.targetUid);
    }
  });
}

async function fetchPublicUser(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'public_users', uid));
  return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
}

async function getFriendStatus(myUid, targetUid) {
  const directId = `${myUid}__${targetUid}`;
  const reverseId = `${targetUid}__${myUid}`;
  const [directSnap, reverseSnap] = await Promise.all([
    getDoc(doc(db, 'friend_requests', directId)),
    getDoc(doc(db, 'friend_requests', reverseId)),
  ]);
  if (directSnap.exists()) return { id: directId, ...directSnap.data() };
  if (reverseSnap.exists()) return { id: reverseId, ...reverseSnap.data() };
  return null;
}

async function isBlockedPair(myUid, targetUid) {
  const [a, b] = await Promise.all([
    getDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`)),
    getDoc(doc(db, 'user_blocks', `${targetUid}__${myUid}`)),
  ]);
  return { blockedByMe: a.exists(), blockedByOther: b.exists() };
}

function followDocId(fromUid, toUid) {
  const a = String(fromUid || '').trim();
  const b = String(toUid || '').trim();
  return a && b ? `${a}__${b}` : '';
}

async function loadMyFollowingSet(myUid) {
  if (!myUid) return new Set();
  try {
    const snap = await getDocs(
      query(collection(db, 'user_follows'), where('fromUid', '==', myUid), limit(500)),
    );
    const ids = new Set();
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const toUid = String(data.toUid || '').trim();
      if (toUid) ids.add(toUid);
    });
    MY_FOLLOWING_SET = ids;
    return ids;
  } catch (e) {
    console.warn('load following set failed', e);
    MY_FOLLOWING_SET = new Set();
    return MY_FOLLOWING_SET;
  }
}

async function setFollowing(myUid, targetUid, follow) {
  const from = String(myUid || '').trim();
  const to = String(targetUid || '').trim();
  const id = followDocId(from, to);
  if (!id || from === to) return false;

  if (follow) {
    await setDoc(
      doc(db, 'user_follows', id),
      {
        fromUid: from,
        toUid: to,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    MY_FOLLOWING_SET.add(to);
    return true;
  }

  await deleteDoc(doc(db, 'user_follows', id));
  MY_FOLLOWING_SET.delete(to);
  return false;
}

async function loadFollowCounts(uid) {
  const targetUid = String(uid || '').trim();
  const setCounts = (followers, following) => {
    if (followersCount) followersCount.textContent = String(followers || 0);
    if (followingCount) followingCount.textContent = String(following || 0);
  };

  if (!targetUid) {
    setCounts(0, 0);
    return { followers: 0, following: 0 };
  }

  try {
    const [followersAgg, followingAgg] = await Promise.all([
      getCountFromServer(query(collection(db, 'user_follows'), where('toUid', '==', targetUid))),
      getCountFromServer(query(collection(db, 'user_follows'), where('fromUid', '==', targetUid))),
    ]);
    const followers = Number(followersAgg?.data?.().count || 0);
    const following = Number(followingAgg?.data?.().count || 0);
    setCounts(followers, following);
    return { followers, following };
  } catch (e) {
    // Fallback for clients where runAggregationQuery is denied.
    try {
      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(query(collection(db, 'user_follows'), where('toUid', '==', targetUid), limit(500))),
        getDocs(query(collection(db, 'user_follows'), where('fromUid', '==', targetUid), limit(500))),
      ]);
      const followers = Number(followersSnap?.size || 0);
      const following = Number(followingSnap?.size || 0);
      setCounts(followers, following);
      return { followers, following };
    } catch (fallbackErr) {
      console.warn('follow counts failed', e);
      console.warn('follow counts fallback failed', fallbackErr);
      setCounts(0, 0);
      return { followers: 0, following: 0 };
    }
  }
}

async function sendFriendRequest(myUid, targetUid) {
  const status = await getFriendStatus(myUid, targetUid);
  if (status?.status === 'accepted') {
    setMsg('Ya son amigos.');
    return;
  }
  if (status?.status === 'pending') {
    const incomingPending =
      String(status.toUid || '').trim() === myUid &&
      String(status.fromUid || '').trim() === targetUid;
    if (incomingPending && status.id) {
      await updateDoc(doc(db, 'friend_requests', status.id), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      setMsg('Solicitud aceptada.');
      return;
    }
    setMsg('Solicitud pendiente.');
    return;
  }
  const { blockedByMe, blockedByOther } = await isBlockedPair(myUid, targetUid);
  if (blockedByMe) {
    setMsg('Desbloquea primero.', true);
    return;
  }
  if (blockedByOther) {
    setMsg('No puedes enviar solicitud.', true);
    return;
  }
  try {
    await setDoc(doc(db, 'friend_requests', `${myUid}__${targetUid}`), {
      fromUid: myUid,
      toUid: targetUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setMsg('Solicitud enviada.');
  } catch (e) {
    console.warn('send friend request failed', e);
    setMsg('No se pudo enviar la solicitud.', true);
  }
}

async function blockUser(myUid, targetUid) {
  await setDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`), {
    fromUid: myUid,
    toUid: targetUid,
    createdAt: serverTimestamp(),
  });
  setMsg('Usuario bloqueado.');
}

async function unblockUser(myUid, targetUid) {
  await deleteDoc(doc(db, 'user_blocks', `${myUid}__${targetUid}`));
}

async function loadInvites(myUid) {
  if (!invitesList || !invitesHint) return;
  invitesList.innerHTML = '';
  invitesHint.textContent = 'Cargando...';
  try {
    const snap = await getDocs(
      query(
        collection(db, 'friend_requests'),
        where('toUid', '==', myUid),
        where('status', '==', 'pending'),
        limit(10),
      ),
    );
    if (snap.empty) {
      invitesHint.textContent = 'No tienes invitaciones pendientes.';
      return;
    }
    invitesHint.textContent = '';
    const items = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const data = docSnap.data() || {};
        const from = await fetchPublicUser(data.fromUid);
        return { id: docSnap.id, data, from };
      }),
    );
    items.forEach((item) => {
      const name = item.from?.displayName || 'Usuario';
      const handle = item.from?.handle ? `@${item.from.handle}` : '';
      const wrap = document.createElement('div');
      wrap.className = 'friendItem';
      wrap.innerHTML = `
        <div style="flex:1">
          <div style="font-weight: 800">${esc(name)}</div>
          <div class="muted">${esc(handle)}</div>
        </div>
        <div class="metaRow" style="gap:6px">
          <button class="btn-white-outline" data-invite="accept" data-id="${esc(item.id)}">Aceptar</button>
          <button class="btn-white-outline" data-invite="decline" data-id="${esc(item.id)}">Ignorar</button>
        </div>
      `;
      invitesList.appendChild(wrap);
    });
  } catch (e) {
    console.warn('load invites failed', e);
    invitesHint.textContent = 'No se pudieron cargar las invitaciones.';
  }
}

async function handleInviteAction(myUid, inviteId, action) {
  if (!inviteId) return;
  const ref = doc(db, 'friend_requests', inviteId);
  const status = action === 'accept' ? 'accepted' : 'declined';
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  await loadInvites(myUid);
  await loadFriendCount(myUid);
}

async function loadFriendCount(uid, targetEl = friendsCount) {
  if (!uid) return new Set();
  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('fromUid', '==', uid),
          where('status', '==', 'accepted'),
        ),
      ),
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('toUid', '==', uid),
          where('status', '==', 'accepted'),
        ),
      ),
    ]);
    const ids = new Set();
    fromSnap.forEach((docSnap) => ids.add(docSnap.data().toUid));
    toSnap.forEach((docSnap) => ids.add(docSnap.data().fromUid));
    if (targetEl) targetEl.textContent = String(ids.size);
    return ids;
  } catch (e) {
    console.warn('friends count failed', e);
    if (targetEl) targetEl.textContent = '0';
    return new Set();
  }
}

async function fetchFriendsAccepted(uid) {
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'friend_requests'),
        where('fromUid', '==', uid),
        where('status', '==', 'accepted'),
      ),
    ),
    getDocs(
      query(
        collection(db, 'friend_requests'),
        where('toUid', '==', uid),
        where('status', '==', 'accepted'),
      ),
    ),
  ]);

  const entries = [];
  fromSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.toUid) entries.push({ requestId: docSnap.id, otherUid: data.toUid });
  });
  toSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    if (data.fromUid) entries.push({ requestId: docSnap.id, otherUid: data.fromUid });
  });

  const unique = new Map();
  entries.forEach((item) => {
    if (!item.otherUid) return;
    if (!unique.has(item.otherUid)) unique.set(item.otherUid, item);
  });

  const items = await Promise.all(
    Array.from(unique.values()).map(async (item) => {
      const profile = await fetchPublicUser(item.otherUid);
      return { ...item, profile };
    }),
  );
  return items.filter((x) => x.profile);
}

function renderFriendsTab(ctx) {
  if (!friendsList) return;
  const q = String(friendsSearch?.value || '').trim().toLowerCase();

  const filtered = (FRIENDS_CACHE || []).filter((item) => {
    if (!q) return true;
    const name = String(item.profile?.displayName || item.profile?.handle || '').toLowerCase();
    const handle = String(item.profile?.handle || '').toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  if (friendsTotal) friendsTotal.textContent = String(filtered.length);

  if (!filtered.length) {
    friendsList.innerHTML = '<div class="muted">Sin amigos por ahora.</div>';
    return;
  }

  friendsList.innerHTML = filtered
    .sort((a, b) => {
      const an = String(a.profile?.displayName || a.profile?.handle || '').toLowerCase();
      const bn = String(b.profile?.displayName || b.profile?.handle || '').toLowerCase();
      return an.localeCompare(bn, 'es');
    })
    .map((item) => {
      const p = item.profile || {};
      const name = p.displayName || p.handle || 'Usuario';
      const handle = p.handle ? `@${p.handle}` : '';
      const href = buildProfileHref(p.handle, item.otherUid);
      const initial = String(name || 'U').trim()[0]?.toUpperCase() || 'U';
      const photo = String(p.photoURL || '').trim();
      const avatar = photo
        ? `<div class="nav-avatar nav-avatar--small nav-avatar--img"><img src="${esc(
            photo,
          )}" alt="" loading="lazy" /><span>${esc(initial)}</span></div>`
        : `<div class="nav-avatar nav-avatar--small"><span>${esc(initial)}</span></div>`;

      const removeBtn = ctx.isOwner
        ? `<button class="btn-white-outline" data-friend-remove="${esc(item.otherUid)}" type="button">Eliminar</button>`
        : '';

      return `
        <div class="friendItem">
          <a class="friendMeta" href="${esc(href)}" style="flex:1; min-width:0">
            ${avatar}
            <div style="min-width:0">
              <div class="friendName">${esc(name)}</div>
              <div class="friendHint">${esc(handle)}</div>
            </div>
          </a>
          <div class="metaRow" style="gap:6px">
            <a class="btn-white-outline" href="mensajes.html?chat=${encodeURIComponent(
              item.otherUid,
            )}">Mensaje</a>
            ${removeBtn}
          </div>
        </div>
      `;
    })
    .join('');
}

async function removeFriendConnection(myUid, otherUid) {
  await Promise.allSettled([
    deleteDoc(doc(db, 'friend_requests', `${myUid}__${otherUid}`)),
    deleteDoc(doc(db, 'friend_requests', `${otherUid}__${myUid}`)),
  ]);
}

async function loadFriendsTab(ctx) {
  if (!friendsHint || !friendsList) return;

  if (!ctx.isOwner) {
    friendsHint.textContent = 'La lista completa de amigos solo es visible para el dueño del perfil.';
    friendsList.innerHTML = '<div class="muted">—</div>';
    if (friendsTotal) friendsTotal.textContent = '0';
    if (friendsSearch) friendsSearch.style.display = 'none';
    return;
  }

  friendsHint.textContent = 'Cargando...';
  friendsList.innerHTML = '';

  try {
    FRIENDS_CACHE = await fetchFriendsAccepted(ctx.targetUid);
    friendsHint.textContent = FRIENDS_CACHE.length
      ? `Tienes ${FRIENDS_CACHE.length} amigos.`
      : 'Aún no tienes amigos. ¡Conecta con la comunidad!';
    renderFriendsTab(ctx);
  } catch (e) {
    console.warn('load friends tab failed', e);
    friendsHint.textContent = 'No se pudieron cargar tus amigos.';
    friendsList.innerHTML = '<div class="muted">—</div>';
  }

  if (friendsSearch && !friendsSearch.dataset.wired) {
    friendsSearch.dataset.wired = '1';
    friendsSearch.addEventListener('input', () => renderFriendsTab(ctx));
  }

  if (friendsList && !friendsList.dataset.wired) {
    friendsList.dataset.wired = '1';
    friendsList.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-friend-remove]');
      if (!btn) return;
      const otherUid = btn.getAttribute('data-friend-remove');
      if (!otherUid) return;
      const ok = confirm('¿Eliminar esta amistad?');
      if (!ok) return;
      try {
        await removeFriendConnection(ctx.myUid, otherUid);
        await loadFriendCount(ctx.myUid);
        await loadFriendsTab(ctx);
        setMsg('Amigo eliminado ?');
        setTimeout(() => setMsg(''), 2000);
      } catch (e) {
        console.warn('remove friend failed', e);
        setMsg('No se pudo eliminar.', true);
      }
    });
  }
}

async function fetchFollowers(uid) {
  const targetUid = String(uid || '').trim();
  if (!targetUid) return [];
  const snap = await getDocs(
    query(collection(db, 'user_follows'), where('toUid', '==', targetUid), limit(200)),
  );

  const unique = new Map();
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const otherUid = String(data.fromUid || '').trim();
    if (!otherUid || unique.has(otherUid)) return;
    unique.set(otherUid, { followId: docSnap.id, otherUid, createdAt: data.createdAt || null });
  });

  const items = await Promise.all(
    Array.from(unique.values()).map(async (item) => {
      const profile = await fetchPublicUser(item.otherUid);
      return { ...item, profile };
    }),
  );
  return items.filter((x) => x.profile);
}

async function fetchFollowing(uid) {
  const targetUid = String(uid || '').trim();
  if (!targetUid) return [];
  const snap = await getDocs(
    query(collection(db, 'user_follows'), where('fromUid', '==', targetUid), limit(200)),
  );

  const unique = new Map();
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const otherUid = String(data.toUid || '').trim();
    if (!otherUid || unique.has(otherUid)) return;
    unique.set(otherUid, { followId: docSnap.id, otherUid, createdAt: data.createdAt || null });
  });

  const items = await Promise.all(
    Array.from(unique.values()).map(async (item) => {
      const profile = await fetchPublicUser(item.otherUid);
      return { ...item, profile };
    }),
  );
  return items.filter((x) => x.profile);
}

function renderFollowersTab(ctx) {
  if (!followersList) return;
  const q = String(followersSearch?.value || '').trim().toLowerCase();

  const filtered = (FOLLOWERS_CACHE || []).filter((item) => {
    if (!q) return true;
    const name = String(item.profile?.displayName || item.profile?.handle || '').toLowerCase();
    const handle = String(item.profile?.handle || '').toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  if (followersTotal) followersTotal.textContent = String(filtered.length);

  if (!filtered.length) {
    followersList.innerHTML = '<div class="muted">Aún no tienes seguidores.</div>';
    return;
  }

  followersList.innerHTML = filtered
    .sort((a, b) => {
      const an = String(a.profile?.displayName || a.profile?.handle || '').toLowerCase();
      const bn = String(b.profile?.displayName || b.profile?.handle || '').toLowerCase();
      return an.localeCompare(bn, 'es');
    })
    .map((item) => {
      const p = item.profile || {};
      const name = p.displayName || p.handle || 'Usuario';
      const handle = p.handle ? `@${p.handle}` : '';
      const href = buildProfileHref(p.handle, item.otherUid);
      const initial = String(name || 'U').trim()[0]?.toUpperCase() || 'U';
      const photo = String(p.photoURL || '').trim();
      const avatar = photo
        ? `<div class="nav-avatar nav-avatar--small nav-avatar--img"><img src="${esc(
            photo,
          )}" alt="" loading="lazy" /><span>${esc(initial)}</span></div>`
        : `<div class="nav-avatar nav-avatar--small"><span>${esc(initial)}</span></div>`;

      const isFollowing = MY_FOLLOWING_SET.has(item.otherUid);
      const followBtn =
        ctx.isOwner && item.otherUid !== ctx.myUid
          ? `<button class="btn-white-outline" data-follow-toggle="${esc(
              item.otherUid,
            )}" data-following="${isFollowing ? '1' : '0'}" type="button">${
              isFollowing ? 'Dejar de seguir' : 'Seguir'
            }</button>`
          : '';

      return `
        <div class="friendItem">
          <a class="friendMeta" href="${esc(href)}" style="flex:1; min-width:0">
            ${avatar}
            <div style="min-width:0">
              <div class="friendName">${esc(name)}</div>
              <div class="friendHint">${esc(handle)}</div>
            </div>
          </a>
          <div class="metaRow" style="gap:6px">
            ${followBtn}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderFollowingTab(ctx) {
  if (!followingList) return;
  const q = String(followingSearch?.value || '').trim().toLowerCase();

  const filtered = (FOLLOWING_CACHE || []).filter((item) => {
    if (!q) return true;
    const name = String(item.profile?.displayName || item.profile?.handle || '').toLowerCase();
    const handle = String(item.profile?.handle || '').toLowerCase();
    return name.includes(q) || handle.includes(q);
  });

  if (followingTotal) followingTotal.textContent = String(filtered.length);

  if (!filtered.length) {
    followingList.innerHTML = '<div class="muted">Aún no sigues a nadie.</div>';
    return;
  }

  followingList.innerHTML = filtered
    .sort((a, b) => {
      const an = String(a.profile?.displayName || a.profile?.handle || '').toLowerCase();
      const bn = String(b.profile?.displayName || b.profile?.handle || '').toLowerCase();
      return an.localeCompare(bn, 'es');
    })
    .map((item) => {
      const p = item.profile || {};
      const name = p.displayName || p.handle || 'Usuario';
      const handle = p.handle ? `@${p.handle}` : '';
      const href = buildProfileHref(p.handle, item.otherUid);
      const initial = String(name || 'U').trim()[0]?.toUpperCase() || 'U';
      const photo = String(p.photoURL || '').trim();
      const avatar = photo
        ? `<div class="nav-avatar nav-avatar--small nav-avatar--img"><img src="${esc(
            photo,
          )}" alt="" loading="lazy" /><span>${esc(initial)}</span></div>`
        : `<div class="nav-avatar nav-avatar--small"><span>${esc(initial)}</span></div>`;

      const unfollowBtn =
        ctx.isOwner && item.otherUid !== ctx.myUid
          ? `<button class="btn-white-outline" data-follow-toggle="${esc(
              item.otherUid,
            )}" data-following="1" type="button">Dejar de seguir</button>`
          : '';

      return `
        <div class="friendItem">
          <a class="friendMeta" href="${esc(href)}" style="flex:1; min-width:0">
            ${avatar}
            <div style="min-width:0">
              <div class="friendName">${esc(name)}</div>
              <div class="friendHint">${esc(handle)}</div>
            </div>
          </a>
          <div class="metaRow" style="gap:6px">
            ${unfollowBtn}
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadFollowersTab(ctx) {
  if (!followersHint || !followersList) return;

  followersHint.textContent = 'Cargando...';
  followersList.innerHTML = '';

  try {
    FOLLOWERS_CACHE = await fetchFollowers(ctx.targetUid);
    followersHint.textContent = FOLLOWERS_CACHE.length
      ? (ctx.isOwner
          ? `Tienes ${FOLLOWERS_CACHE.length} seguidores.`
          : `Seguidores: ${FOLLOWERS_CACHE.length}`)
      : 'Aún no hay seguidores.';
    renderFollowersTab(ctx);
  } catch (e) {
    console.warn('load followers tab failed', e);
    followersHint.textContent = 'No se pudo cargar la lista.';
    followersList.innerHTML = '<div class="muted">—</div>';
  }

  if (followersSearch && !followersSearch.dataset.wired) {
    followersSearch.dataset.wired = '1';
    followersSearch.addEventListener('input', () => renderFollowersTab(ctx));
  }

  if (followersList && !followersList.dataset.wired) {
    followersList.dataset.wired = '1';
    followersList.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-follow-toggle]');
      if (!btn) return;
      const otherUid = btn.getAttribute('data-follow-toggle');
      if (!otherUid || otherUid === ctx.myUid) return;
      const isFollowing = btn.getAttribute('data-following') === '1';
      const next = !isFollowing;
      try {
        btn.disabled = true;
        await setFollowing(ctx.myUid, otherUid, next);
        btn.setAttribute('data-following', next ? '1' : '0');
        btn.textContent = next ? 'Dejar de seguir' : 'Seguir';
        await loadFollowCounts(ctx.targetUid);
        setMsg(next ? 'Siguiendo ?' : 'Listo ?');
        setTimeout(() => setMsg(''), 1500);
      } catch (e) {
        console.warn('toggle follow failed', e);
        setMsg('No se pudo actualizar.', true);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

async function loadFollowingTab(ctx) {
  if (!followingHint || !followingList) return;

  followingHint.textContent = 'Cargando...';
  followingList.innerHTML = '';

  try {
    FOLLOWING_CACHE = await fetchFollowing(ctx.targetUid);
    followingHint.textContent = FOLLOWING_CACHE.length
      ? (ctx.isOwner
          ? `Sigues a ${FOLLOWING_CACHE.length} personas.`
          : `Siguiendo: ${FOLLOWING_CACHE.length}`)
      : 'Aún no sigue a nadie.';
    renderFollowingTab(ctx);
  } catch (e) {
    console.warn('load following tab failed', e);
    followingHint.textContent = 'No se pudo cargar la lista.';
    followingList.innerHTML = '<div class="muted">—</div>';
  }

  if (followingSearch && !followingSearch.dataset.wired) {
    followingSearch.dataset.wired = '1';
    followingSearch.addEventListener('input', () => renderFollowingTab(ctx));
  }

  if (followingList && !followingList.dataset.wired) {
    followingList.dataset.wired = '1';
    followingList.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-follow-toggle]');
      if (!btn) return;
      const otherUid = btn.getAttribute('data-follow-toggle');
      if (!otherUid || otherUid === ctx.myUid) return;
      try {
        btn.disabled = true;
        await setFollowing(ctx.myUid, otherUid, false);
        FOLLOWING_CACHE = (FOLLOWING_CACHE || []).filter((x) => x.otherUid !== otherUid);
        renderFollowingTab(ctx);
        await loadFollowCounts(ctx.targetUid);
        setMsg('Listo ?');
        setTimeout(() => setMsg(''), 1500);
      } catch (e) {
        console.warn('unfollow failed', e);
        setMsg('No se pudo dejar de seguir.', true);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function setProfileSearchMsg(text, bad = false) {
  if (!profileSearchStatus) return;
  profileSearchStatus.textContent = text || '';
  profileSearchStatus.style.color = bad ? '#ffd1d6' : 'rgba(255,255,255,0.92)';
}

function profileSearchLetter(name) {
  return String(name || 'U').trim()[0]?.toUpperCase() || 'U';
}

function renderProfileSearchAvatar(url, name) {
  if (!profileSearchAvatar) return;
  if (profileSearchAvatarFallback)
    profileSearchAvatarFallback.textContent = profileSearchLetter(name || 'Usuario');

  const imgUrl = String(url || '').trim();
  if (!profileSearchAvatarImg) return;
  if (imgUrl) {
    profileSearchAvatarImg.src = imgUrl;
    profileSearchAvatar.classList.add('hasImage');
  } else {
    profileSearchAvatarImg.removeAttribute('src');
    profileSearchAvatar.classList.remove('hasImage');
  }
}

function renderProfileSearchResults(items, myUid) {
  if (!profileSearchResults) return;
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    profileSearchResults.innerHTML = '<div class="muted">Sin resultados.</div>';
    return;
  }
  profileSearchResults.innerHTML = '';
  list.forEach((item) => {
    const uid = String(item?.uid || item?.id || '').trim();
    if (!uid) return;
    const name = item.displayName || item.name || item.handle || 'Usuario';
    const handle = item.handle ? `@${item.handle}` : '';
    const href = buildProfileHref(item.handle, uid);
    const initial = profileSearchLetter(name || 'U');
    const photo = String(item.photoURL || '').trim();
    const avatar = photo
      ? `<div class="nav-avatar nav-avatar--small nav-avatar--img"><img src="${esc(
          photo,
        )}" alt="" loading="lazy" /><span>${esc(initial)}</span></div>`
      : `<div class="nav-avatar nav-avatar--small"><span>${esc(initial)}</span></div>`;

    const isMe = uid === myUid;
    const isFollowing = MY_FOLLOWING_SET.has(uid);
    const followBtn = !isMe
      ? `<button class="btn-white-outline" type="button" data-ps-follow="${esc(
          uid,
        )}" data-following="${isFollowing ? '1' : '0'}">${isFollowing ? 'Siguiendo' : 'Seguir'}</button>`
      : '';
    const addBtn = !isMe
      ? `<button class="btn-white-outline" type="button" data-ps-add="${esc(uid)}">Agregar</button>`
      : '';

    const wrap = document.createElement('div');
    wrap.className = 'friendItem';
    wrap.innerHTML = `
      <div class="friendMeta" style="flex: 1; min-width: 0">
        ${avatar}
        <div style="min-width:0">
          <div class="friendName">${esc(name)}</div>
          ${handle ? `<div class="friendHint">${esc(handle)}</div>` : ''}
        </div>
      </div>
      <div class="metaRow" style="gap: 8px; flex-wrap: wrap">
        <a class="btn-white-outline" href="${esc(href)}">Ver perfil</a>
        ${followBtn}
        ${addBtn}
      </div>
    `;
    profileSearchResults.appendChild(wrap);
  });
}

async function searchPublicUsersForProfile(myUid, term) {
  const raw = normalizeSearchText(term);
  const q = raw.startsWith('@') ? raw.slice(1).trim() : raw;
  if (!q) {
    setProfileSearchMsg('Escribe un nombre.', true);
    return;
  }
  setProfileSearchMsg('Buscando...');
  const merged = new Map();
  let prefixFailed = false;

  const lookupByEmailIndex = async (value) => {
    const email = normalizeSearchText(value);
    if (!email || !email.includes('@')) return null;
    try {
      const snap = await getDoc(doc(db, 'email_index', email));
      if (!snap.exists()) return null;
      const data = snap.data() || {};
      const uid = String(data.uid || '').trim();
      if (!uid) return null;
      const profileSnap = await getDoc(doc(db, 'public_users', uid));
      const profile = profileSnap.exists() ? profileSnap.data() : {};
      return { uid, ...(profile || {}), emailLower: profile?.emailLower || email };
    } catch (e) {
      console.warn('[perfil] email index lookup failed', e);
      return null;
    }
  };

  const lookupByUsersEmailFallback = async (value) => {
    const email = normalizeSearchText(value);
    if (!email || !email.includes('@')) return null;
    try {
      const snap = await getDocs(
        query(collection(db, 'public_users'), where('emailLower', '==', email), limit(1)),
      );
      if (snap.empty) return null;
      const userDoc = snap.docs[0];
      const uid = String(userDoc?.id || '').trim();
      if (!uid) return null;
      const profile = userDoc.data() || {};
      return {
        uid,
        ...(profile || {}),
        displayName: profile?.displayName || profile?.name || '',
        name: profile?.name || profile?.displayName || '',
        handle: profile?.handle || '',
        emailLower: profile?.emailLower || email,
      };
    } catch {
      try {
        const fallbackSnap = await getDocs(query(collection(db, 'public_users'), limit(200)));
        let hit = null;
        fallbackSnap.forEach((docSnap) => {
          if (hit) return;
          const row = { uid: docSnap.id, ...(docSnap.data() || {}) };
          const rowEmail = normalizeSearchText(row.emailLower || row.email || '');
          if (rowEmail && rowEmail === email) hit = row;
        });
        return hit;
      } catch {
        return null;
      }
    }
  };

  const lookupByHandleIndex = async (value) => {
    const handle = normalizeSearchText(value);
    if (!handle || handle.includes('@') || handle.length < 2) return null;
    try {
      const snap = await getDoc(doc(db, 'login_index', handle));
      if (!snap.exists()) return null;
      const data = snap.data() || {};
      const uid = String(data.uid || '').trim();
      if (!uid) return null;
      const profileSnap = await getDoc(doc(db, 'public_users', uid));
      const profile = profileSnap.exists() ? profileSnap.data() : {};
      return { uid, ...(profile || {}), handle: profile?.handle || handle, handleLower: profile?.handleLower || handle };
    } catch (e) {
      console.warn('[perfil] handle index lookup failed', e);
      return null;
    }
  };

  const [emailHit, legacyEmailHit, handleHit] = await Promise.all([
    lookupByEmailIndex(raw),
    lookupByUsersEmailFallback(raw),
    raw.startsWith('@') ? lookupByHandleIndex(q) : Promise.resolve(null),
  ]);
  if (emailHit?.uid) merged.set(emailHit.uid, emailHit);
  if (!emailHit?.uid && legacyEmailHit?.uid) merged.set(legacyEmailHit.uid, legacyEmailHit);
  if (handleHit?.uid) merged.set(handleHit.uid, handleHit);

  const nameQuery = query(
    collection(db, 'public_users'),
    orderBy('displayNameLower'),
    startAt(q),
    endAt(`${q}\uf8ff`),
    limit(10),
  );
  const handleQuery = query(
    collection(db, 'public_users'),
    orderBy('handleLower'),
    startAt(q),
    endAt(`${q}\uf8ff`),
    limit(10),
  );
  const [byName, byHandle] = await Promise.all([
    getDocs(nameQuery).catch((e) => {
      prefixFailed = true;
      console.warn('[perfil] name prefix search failed', e);
      return null;
    }),
    getDocs(handleQuery).catch((e) => {
      prefixFailed = true;
      console.warn('[perfil] handle prefix search failed', e);
      return null;
    }),
  ]);

  [...(byName?.docs || []), ...(byHandle?.docs || [])].forEach((d) => {
    if (!d?.id) return;
    merged.set(d.id, { uid: d.id, ...(d.data() || {}) });
  });

  if (!merged.size || prefixFailed) {
    try {
      const fallbackSnap = await getDocs(query(collection(db, 'public_users'), limit(150)));
      fallbackSnap.forEach((docSnap) => {
        const row = { uid: docSnap.id, ...(docSnap.data() || {}) };
        const hay = normalizeSearchText(
          `${row.displayNameLower || row.displayName || row.name || ''} ${row.handleLower || row.handle || ''} ${row.emailLower || ''}`,
        );
        if (hay.includes(q)) merged.set(row.uid, row);
      });
    } catch (e) {
      console.warn('[perfil] fallback search failed', e);
    }
  }

  const score = (row) => {
    const display = normalizeSearchText(row.displayNameLower || row.displayName || row.name || '');
    const handle = normalizeSearchText(row.handleLower || row.handle || '');
    if (handle.startsWith(q)) return 0;
    if (display.startsWith(q)) return 1;
    if (handle.includes(q)) return 2;
    if (display.includes(q)) return 3;
    return 4;
  };

  const results = Array.from(merged.values())
    .filter((d) => d.publicProfile !== false)
    .sort((a, b) => score(a) - score(b))
    .slice(0, 10);

  renderProfileSearchResults(results, myUid);
  if (prefixFailed && !results.length) {
    setProfileSearchMsg('No se pudo buscar.', true);
    return;
  }
  setProfileSearchMsg(`Resultados: ${results.length}`);
}

function initProfilePeopleSearch(opts) {
  const myUid = String(opts?.myUid || '').trim();
  if (!myUid) return;
  if (!profileSearchInput || !profileSearchResults) return;

  const viewerName = String(opts?.viewerName || '').trim();
  const viewerPhotoURL = String(opts?.viewerPhotoURL || '').trim();
  const first = viewerName ? viewerName.split(/\s+/)[0] : '';

  if (profileSearchInput) {
    profileSearchInput.placeholder = first
      ? `¿A quién buscas, ${first}?`
      : 'Busca por nombre o @usuario...';
  }
  renderProfileSearchAvatar(viewerPhotoURL, viewerName || 'Usuario');

  if (btnProfileSearch && !btnProfileSearch.dataset.wired) {
    btnProfileSearch.dataset.wired = '1';
    btnProfileSearch.addEventListener('click', async () => {
      await searchPublicUsersForProfile(myUid, profileSearchInput?.value || '');
    });
  }
  if (btnProfileSearchClear && !btnProfileSearchClear.dataset.wired) {
    btnProfileSearchClear.dataset.wired = '1';
    btnProfileSearchClear.addEventListener('click', () => {
      if (profileSearchInput) profileSearchInput.value = '';
      if (profileSearchResults) profileSearchResults.innerHTML = '';
      setProfileSearchMsg('');
      profileSearchInput?.focus();
    });
  }

  if (profileSearchInput && !profileSearchInput.dataset.wired) {
    profileSearchInput.dataset.wired = '1';
    let searchTimer = null;
    profileSearchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await searchPublicUsersForProfile(myUid, profileSearchInput.value);
      }
    });
    profileSearchInput.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      const value = String(profileSearchInput.value || '').trim();
      if (!value) {
        if (profileSearchResults) profileSearchResults.innerHTML = '';
        setProfileSearchMsg('');
        return;
      }
      if (value.length < 2) {
        setProfileSearchMsg('Escribe 2+ letras...');
        return;
      }
      setProfileSearchMsg('Buscando...');
      searchTimer = setTimeout(() => {
        searchPublicUsersForProfile(myUid, value).catch(() => {});
      }, 360);
    });
  }

  if (profileSearchResults && !profileSearchResults.dataset.wired) {
    profileSearchResults.dataset.wired = '1';
    profileSearchResults.addEventListener('click', async (e) => {
      const followBtn = e.target?.closest?.('button[data-ps-follow]');
      if (followBtn) {
        const targetUid = String(followBtn.getAttribute('data-ps-follow') || '').trim();
        if (!targetUid || targetUid === myUid) return;
        const isFollowing = followBtn.getAttribute('data-following') === '1';
        const next = !isFollowing;
        try {
          followBtn.disabled = true;
          await setFollowing(myUid, targetUid, next);
          followBtn.setAttribute('data-following', next ? '1' : '0');
          followBtn.textContent = next ? 'Siguiendo' : 'Seguir';
          if (opts?.isOwner) await loadFollowCounts(opts.targetUid || myUid);
          setProfileSearchMsg(next ? 'Siguiendo ?' : 'Listo ?');
          setTimeout(() => setProfileSearchMsg(''), 1500);
        } catch (err) {
          console.warn('follow from profile search failed', err);
          setProfileSearchMsg('No se pudo actualizar.', true);
        } finally {
          followBtn.disabled = false;
        }
        return;
      }

      const addBtn = e.target?.closest?.('button[data-ps-add]');
      if (addBtn) {
        const targetUid = String(addBtn.getAttribute('data-ps-add') || '').trim();
        if (!targetUid || targetUid === myUid) return;
        try {
          addBtn.disabled = true;
          await sendFriendRequest(myUid, targetUid);
        } finally {
          addBtn.disabled = false;
        }
      }
    });
  }
}

async function loadSuggestions(myUid, excludeSet) {
  if (!suggestionsList) return;
  suggestionsList.innerHTML = '<div class="muted">Cargando...</div>';
  try {
    const snap = await getDocs(
      query(collection(db, 'public_users'), orderBy('exp', 'desc'), limit(8)),
    );
    const items = snap.docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((item) => item.id !== myUid && !excludeSet.has(item.id));
    if (!items.length) {
      suggestionsList.innerHTML = '<div class="muted">Sin sugerencias por ahora.</div>';
      return;
    }
    suggestionsList.innerHTML = '';
    items.slice(0, 5).forEach((item) => {
      const name = item.displayName || item.handle || 'Usuario';
      const handle = item.handle ? `@${item.handle}` : '';
      const row = document.createElement('div');
      row.className = 'friendItem';
      row.innerHTML = `
        <div style="flex:1">
          <div style="font-weight:800">${esc(name)}</div>
          <div class="muted">${esc(handle)}</div>
        </div>
        <button class="btn-white-outline" data-follow-suggest="${esc(item.id)}" type="button">Seguir</button>
      `;
      suggestionsList.appendChild(row);
    });
  } catch (e) {
    console.warn('suggestions failed', e);
    suggestionsList.innerHTML = '<div class="muted">No se pudieron cargar sugerencias.</div>';
  }
}

async function loadRecentReactions(targetUid) {
  if (!recentReactions) return;
  recentReactions.textContent = 'Cargando...';
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, 'reactions'),
        where('postOwnerUid', '==', targetUid),
        orderBy('createdAt', 'desc'),
        limit(5),
      ),
    );
    if (snap.empty) {
      recentReactions.textContent = 'Sin reacciones aún.';
      return;
    }
    const names = snap.docs.map((docSnap) => docSnap.data()?.userName || 'Usuario');
    recentReactions.innerHTML = names.map((n) => `<div>${esc(n)}</div>`).join('');
  } catch (e) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (code === 'permission-denied' || /permission/i.test(msg)) {
      recentReactions.textContent = 'Reacciones ocultas.';
    } else {
      recentReactions.textContent = 'Sin reacciones aún.';
    }
  }
}

function renderRewards(profile) {
  if (rewardStreak) rewardStreak.textContent = `${Number(profile.streakDays || profile.streak || 0)} días`;
  if (rewardBadges) rewardBadges.textContent = String((profile.badges || []).length || 0);
  if (rewardDays) rewardDays.textContent = `${Number(profile.studyDays || profile.daysLearned || 0)} días`;
  if (rewardConsistency) rewardConsistency.textContent = `${Number(profile.consistencyPct || 0)}%`;
}

function bindRewards() {
  if (!rewardsGrid || !rewardDetail) return;
  rewardsGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.achievement-card');
    if (!card) return;
    const key = card.dataset.achievement || '';
    const dateLabel = rewardDetail.dataset.date || '';
    const map = {
      racha: 'Racha: ¡cada día suma! Aquí verás tu nivel y la última fecha activa.',
      insignias: 'Insignias: premios por completar temas y retos.',
      dias: 'Días de aprendizaje: cuenta total de días con actividad.',
      constancia: 'Constancia: promedio de estudio en la última semana.',
    };
    rewardDetail.textContent = `${map[key] || 'Detalle de tu logro.'}${dateLabel ? ` · ${dateLabel}` : ''}`;
  });
}

async function uploadAvatar(uid, emailLower, file) {
  if (!uid || !file) return null;
  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/avatar_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  const updates = {
    photoURL: url,
    photoPath: filePath,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(doc(db, 'users', uid), updates);
  await setDoc(doc(db, 'public_users', uid), {
    photoURL: url,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { url, path: filePath };
}

async function uploadCover(uid, file) {
  if (!uid || !file) return null;
  const ext = (file.name || 'jpg').split('.').pop() || 'jpg';
  const filePath = `avatars/${uid}/cover_${Date.now()}.${ext}`;
  const ref = storageRef(storage, filePath);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  await setDoc(
    doc(db, 'public_users', uid),
    {
      coverURL: url,
      coverPath: filePath,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return { url, path: filePath };
}

function bindCoverUpload(uid, isOwner) {
  if (!coverUploadBtn || !coverInput) return;
  if (!isOwner) {
    coverUploadBtn.style.display = 'none';
    return;
  }
  if (coverUploadBtn.dataset.wired) return;
  coverUploadBtn.dataset.wired = '1';

  coverUploadBtn.addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setMsg('Selecciona una imagen.', true);
      coverInput.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMsg('La imagen es demasiado grande (máx. 10MB).', true);
      coverInput.value = '';
      return;
    }
    try {
      coverUploadBtn.disabled = true;
      setMsg('Subiendo portada...');
      const result = await uploadCover(uid, file);
      if (result?.url) {
        renderCover(result.url);
        setMsg('Portada actualizada ?');
      }
    } catch (err) {
      console.warn('cover upload failed', err);
      setMsg('No se pudo subir la portada.', true);
    } finally {
      coverUploadBtn.disabled = false;
      coverInput.value = '';
      setTimeout(() => setMsg(''), 2000);
    }
  });
}

function setAvatarHint(text) {
  if (!avatarUploadHint) return;
  avatarUploadHint.textContent = text || '';
}

function bindAvatarUpload(uid, emailLower, isOwner) {
  if (!avatarUploadBtn || !avatarInput) return;
  avatarUploadBtn.style.display = isOwner ? '' : 'none';
  if (!isOwner) return;
  if (avatarUploadBtn.dataset.wired) return;
  avatarUploadBtn.dataset.wired = '1';

  avatarUploadBtn.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setAvatarHint('Selecciona una imagen.');
      avatarInput.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarHint('La imagen es demasiado grande (máx. 10MB).');
      avatarInput.value = '';
      return;
    }
    try {
      avatarUploadBtn.disabled = true;
      setAvatarHint('Subiendo...');
      const result = await uploadAvatar(uid, emailLower, file);
      if (result?.url) {
        renderAvatar(result.url, basicName?.value || profileName?.textContent || '');
        setAvatarHint('Foto actualizada ?');
      }
    } catch (err) {
      console.warn('avatar upload failed', err);
      setAvatarHint('No se pudo subir la foto.');
    } finally {
      avatarUploadBtn.disabled = false;
      avatarInput.value = '';
      setTimeout(() => setAvatarHint(''), 2000);
    }
  });
}

async function loadCourseProgress(uid, levelsToShow) {
  if (!coursesList) return;
  coursesList.innerHTML = '<div class="muted">Cargando cursos...</div>';
  try {
    const levelSet = levelsToShow?.length ? levelsToShow : ['A1', 'A2', 'B1', 'B2'];
    const courseSnap = await getDocs(
      query(collection(db, 'courses'), where('level', 'in', levelSet)),
    );
    const totals = {};
    courseSnap.forEach((docSnap) => {
      const level = docSnap.data()?.level || '';
      totals[level] = (totals[level] || 0) + 1;
    });

    const progressSnap = await getDocs(collection(db, 'user_progress', uid, 'topics'));
    const completed = {};
    progressSnap.forEach((docSnap) => {
      const key = docSnap.id || '';
      const level = key.split('__')[0] || '';
      if (!levelSet.includes(level)) return;
      if (docSnap.data()?.completed === true) {
        completed[level] = (completed[level] || 0) + 1;
      }
    });

    const rows = levelSet.map((level) => {
      const total = totals[level] || 0;
      const done = completed[level] || 0;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return { level, total, done, pct };
    });

    coursesList.innerHTML = rows
      .map((row) => {
        const label = row.total ? `${row.done}/${row.total}` : '0/0';
        const cta = row.pct > 0 ? 'Continuar' : 'Explorar';
        return `
          <div class="course-row">
            <div class="course-info">
              <div class="course-title">${esc(row.level)}</div>
              <div class="muted">${esc(label)} completados</div>
            </div>
            <div class="course-progress">
              <div class="progress-bar"><div class="progress-fill" style="width:${row.pct}%"></div></div>
              <div class="progress-percent">${row.pct}%</div>
              <a class="btn-white-outline" href="course.html?level=${encodeURIComponent(row.level)}">${cta}</a>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (e) {
    console.warn('course progress failed', e);
    coursesList.innerHTML = '<div class="muted">No se pudieron cargar los cursos.</div>';
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

async function saveProfileInfo(uid) {
  if (!uid) return;
  const displayName = basicName?.value?.trim() || '';
  const handle = basicHandle?.value?.trim() || '';
  const handleLower = normalizeHandle(handle);
  if (handle && !isHandleValid(handleLower)) {
    setBasicMsg('Usuario inválido. Usa 3-20 letras/números y ._-');
    return;
  }
  const updates = {
    bioWhy: infoWhy?.value?.trim() || '',
    bioHard: infoHard?.value?.trim() || '',
    bioGoal: infoGoal?.value?.trim() || '',
    bioLocation: infoLocation?.value?.trim() || '',
    bioWebsite: infoWebsite?.value?.trim() || '',
    bioLanguages: infoLanguages?.value?.trim() || '',
    bioInterests: infoInterests?.value?.trim() || '',
    displayName: displayName || null,
    handle: handle || null,
    handleLower: handleLower || null,
    postsVisibility: privacyPosts?.value || 'public',
    rewardsVisibility: privacyRewards?.value || 'public',
    statusVisibility: privacyStatus?.value || 'public',
    publicProfile: privacyPublic?.value !== 'false',
    allowFriendRequests: privacyFriendReq?.value !== 'false',
    allowMessages: privacyMessages?.value !== 'false',
    updatedAt: serverTimestamp(),
  };
  try {
    if (handleLower && handleLower !== CURRENT_PROFILE?.handleLower) {
      await claimHandle(uid, handleLower, CURRENT_USER_DOC?.emailLower);
      if (CURRENT_PROFILE?.handleLower) {
        await releaseHandle(uid, CURRENT_PROFILE.handleLower);
      }
    }
    await setDoc(doc(db, 'public_users', uid), updates, { merge: true });
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName || null,
      handle: handle || null,
      handleLower: handleLower || null,
      publicProfile: updates.publicProfile,
      allowFriendRequests: updates.allowFriendRequests,
      allowMessages: updates.allowMessages,
      updatedAt: serverTimestamp(),
    });

    CURRENT_PROFILE = {
      ...(CURRENT_PROFILE || {}),
      bioWhy: updates.bioWhy,
      bioHard: updates.bioHard,
      bioGoal: updates.bioGoal,
      bioLocation: updates.bioLocation,
      bioWebsite: updates.bioWebsite,
      bioLanguages: updates.bioLanguages,
      bioInterests: updates.bioInterests,
      displayName: updates.displayName,
      handle: updates.handle,
      handleLower: updates.handleLower,
      postsVisibility: updates.postsVisibility,
      rewardsVisibility: updates.rewardsVisibility,
      statusVisibility: updates.statusVisibility,
      publicProfile: updates.publicProfile,
      allowFriendRequests: updates.allowFriendRequests,
      allowMessages: updates.allowMessages,
    };
    if (profileName) profileName.textContent = displayName || profileName.textContent || 'Usuario';
    if (profileHandle) profileHandle.textContent = handle ? `@${handle}` : '';
    renderPublicCard(CURRENT_PROFILE, true);
    if (btnShare) btnShare.dataset.share = toAbsoluteUrl(buildProfileHref(handle, uid));

    setInfoMsg('Guardado ?');
    setBasicMsg('Guardado ?');
    setTimeout(() => {
      setInfoMsg('');
      setBasicMsg('');
    }, 2000);
  } catch (e) {
    console.warn('save profile info failed', e);
    if (String(e?.message || '').includes('handle_taken')) {
      setBasicMsg('Este usuario ya existe.');
    } else {
      setInfoMsg('No se pudo guardar.');
      setBasicMsg('No se pudo guardar.');
    }
  }
}

function bindInfoSave(uid, isOwner) {
  if (!isOwner) {
    if (infoSaveBtn) infoSaveBtn.style.display = 'none';
    if (basicSaveBtn) basicSaveBtn.style.display = 'none';
    return;
  }
  infoSaveBtn?.addEventListener('click', () => saveProfileInfo(uid));
  basicSaveBtn?.addEventListener('click', () => saveProfileInfo(uid));
}

function applyInfo(profile, isOwner) {
  if (infoWhy) infoWhy.value = profile.bioWhy || '';
  if (infoHard) infoHard.value = profile.bioHard || '';
  if (infoGoal) infoGoal.value = profile.bioGoal || '';
  if (infoLocation) infoLocation.value = profile.bioLocation || '';
  if (infoWebsite) infoWebsite.value = profile.bioWebsite || '';
  if (infoLanguages) infoLanguages.value = profile.bioLanguages || '';
  if (infoInterests) infoInterests.value = profile.bioInterests || '';
  if (basicName) basicName.value = profile.displayName || profile.name || '';
  if (basicHandle) basicHandle.value = profile.handle || '';

  if (!isOwner) {
    [
      infoWhy,
      infoHard,
      infoGoal,
      infoLocation,
      infoWebsite,
      infoLanguages,
      infoInterests,
      basicName,
      basicHandle,
    ].forEach((el) => {
      if (el) el.setAttribute('readonly', 'readonly');
    });
  }

  if (privacyPosts) privacyPosts.value = profile.postsVisibility || 'public';
  if (privacyRewards) privacyRewards.value = profile.rewardsVisibility || 'public';
  if (privacyStatus) privacyStatus.value = profile.statusVisibility || 'public';
  if (privacyFriendReq)
    privacyFriendReq.value = profile.allowFriendRequests === false ? 'false' : 'true';
  if (privacyMessages) privacyMessages.value = profile.allowMessages === false ? 'false' : 'true';
  if (privacyPublic) privacyPublic.value = profile.publicProfile === false ? 'false' : 'true';

  if (!isOwner) {
    [privacyPosts, privacyRewards, privacyStatus, privacyFriendReq, privacyMessages, privacyPublic].forEach(
      (el) => {
        if (el) el.setAttribute('disabled', 'disabled');
      },
    );
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html?next=perfil.html';
    return;
  }

  try {
    loadHiddenSet(user.uid);
  } catch {
    // ignore
  }

  const requestedUid = PROFILE_UID;
  const requestedHandle = PROFILE_HANDLE;

  let targetUid = requestedUid;
  if (!targetUid && requestedHandle) {
    try {
      targetUid = await resolveUidFromHandle(requestedHandle);
    } catch (e) {
      console.warn('resolve uid from handle failed', e);
    }
  }
  if (!targetUid) {
    if (requestedUid || requestedHandle) {
      if (profileStatus) profileStatus.textContent = 'Perfil no encontrado.';
      setMsg('Perfil no encontrado.', true);
      return;
    }
    targetUid = user.uid;
  }

  if (profileStatus) profileStatus.textContent = 'Cargando...';

  try {
    const [profileSnap, blockedInfo, currentSnap] = await Promise.all([
      getDoc(doc(db, 'public_users', targetUid)),
      isBlockedPair(user.uid, targetUid),
      getDoc(doc(db, 'users', user.uid)),
    ]);

    if (!profileSnap.exists()) {
      if (profileStatus) profileStatus.textContent = 'Perfil no encontrado.';
      return;
    }

    const profile = profileSnap.data() || {};
    CURRENT_PROFILE = profile;
    CURRENT_USER_DOC = currentSnap.exists() ? currentSnap.data() : null;
    const isAdminUser =
      CURRENT_USER_DOC?.role === 'admin' || CURRENT_USER_DOC?.admin === true;
    const name = profile.displayName || profile.name || 'Usuario';
    const isOwner = user.uid === targetUid;
    HIGHLIGHT_IDS = Array.isArray(profile.highlights)
      ? profile.highlights.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 30)
      : [];
    if (tabBtnSaved) tabBtnSaved.style.display = isOwner ? '' : 'none';
    if (tabSaved) tabSaved.style.display = isOwner ? '' : 'none';
    if (activityCard) activityCard.style.display = isOwner ? '' : 'none';

    if (profileName) profileName.textContent = name;
    if (profileHandle) profileHandle.textContent = profile.handle ? `@${profile.handle}` : '';
    renderAvatar(profile.photoURL || '', name);
    renderCover(profile.coverURL || '');
    renderPublicCard(profile, isOwner);
    if (profileEditHintCard) profileEditHintCard.style.display = isOwner ? '' : 'none';

    if (btnShare) {
      btnShare.dataset.share = toAbsoluteUrl(buildProfileHref(profile.handle, targetUid));
      if (!btnShare.dataset.wired) {
        btnShare.dataset.wired = '1';
        btnShare.addEventListener('click', async () => {
          const href = btnShare.dataset.share || '';
          const ok = await copyToClipboard(href);
          setMsg(ok ? 'Enlace copiado ?' : 'No se pudo copiar.', !ok);
          if (ok) setTimeout(() => setMsg(''), 1500);
        });
      }
    }

    if (btnReport) {
      btnReport.style.display = isOwner ? 'none' : '';
      btnReport.dataset.targetUid = targetUid;
      btnReport.dataset.targetHandle = String(profile.handle || '').trim();
      if (!btnReport.dataset.wired) {
        btnReport.dataset.wired = '1';
        btnReport.addEventListener('click', async () => {
          const target = btnReport.dataset.targetUid || '';
          if (!target || target === user.uid) return;
          const reason = prompt('¿Qué pasó? Describe el problema en 1–2 frases:');
          const text = String(reason || '').trim();
          if (!text) return;
          try {
            await addDoc(collection(db, 'user_reports'), {
              userId: user.uid,
              targetUid: target,
              targetHandle: btnReport.dataset.targetHandle || null,
              reason: text.slice(0, 800),
              page: 'perfil',
              createdAt: serverTimestamp(),
            });
            setMsg('Reporte enviado. Gracias ?');
            setTimeout(() => setMsg(''), 2000);
          } catch (e) {
            console.warn('report failed', e);
            setMsg('No se pudo enviar el reporte.', true);
          }
        });
      }
    }

    if (statStreak) statStreak.textContent = Number(profile.streakDays || profile.streak || 0);
    if (statExp) statExp.textContent = Number(profile.exp || 0);
    if (statLeague) statLeague.textContent = profile.league || '—';
    if (statTop3) statTop3.textContent = Number(profile.top3 || 0);

    renderRewards(profile);
    if (rewardDetail) {
      rewardDetail.dataset.date = formatDate(profile.updatedAt || profile.createdAt || new Date());
    }
    bindRewards();

    applyInfo(profile, isOwner);
    bindInfoSave(targetUid, isOwner);
    bindAvatarUpload(targetUid, CURRENT_USER_DOC?.emailLower, isOwner);
    bindCoverUpload(targetUid, isOwner);

    const friendStatus = await getFriendStatus(user.uid, targetUid);
    const isFriend = friendStatus?.status === 'accepted';
    const isBlockedAny = blockedInfo.blockedByMe || blockedInfo.blockedByOther;
    const canMessage = profile.allowMessages !== false && !isBlockedAny;

    const publicProfile = profile.publicProfile !== false;

    const [myFollowingSet] = await Promise.all([
      loadMyFollowingSet(user.uid),
      loadFollowCounts(targetUid),
    ]);
    const isFollowing = myFollowingSet.has(targetUid);

    const viewerName =
      String(
        CURRENT_USER_DOC?.displayName ||
          CURRENT_USER_DOC?.name ||
          user.displayName ||
          user.email ||
          '',
      ).trim() || 'Usuario';
    const viewerPhotoURL =
      String(CURRENT_USER_DOC?.photoURL || '').trim() ||
      (isOwner ? String(profile.photoURL || '').trim() : '');
    initProfilePeopleSearch({ myUid: user.uid, targetUid, isOwner, viewerName, viewerPhotoURL });

    const postsVisibility = profile.postsVisibility || (publicProfile ? 'public' : 'private');
    const rewardsVisibility = profile.rewardsVisibility || 'public';
    const canViewFeed =
      isAdminUser ||
      (!isBlockedAny &&
        (isOwner ||
          postsVisibility === 'public' ||
          (postsVisibility === 'friends' && isFriend)));

    if (storiesCard) storiesCard.style.display = canViewFeed ? '' : 'none';
    if (feedFiltersCard) feedFiltersCard.style.display = canViewFeed ? '' : 'none';
    if (!canViewFeed) closeStoryModal();

    if (btnFollow) {
      const canFollow =
        targetUid !== user.uid &&
        !isBlockedAny &&
        (publicProfile || isFriend || isAdminUser);
      btnFollow.style.display = isOwner ? 'none' : '';
      btnFollow.disabled = !canFollow;
      btnFollow.textContent = isFollowing ? 'Siguiendo' : 'Seguir';
      if (!btnFollow.dataset.wired) {
        btnFollow.dataset.wired = '1';
        btnFollow.addEventListener('click', async () => {
          if (targetUid === user.uid) return;
          if (!canFollow) return;
          try {
            btnFollow.disabled = true;
            const next = !MY_FOLLOWING_SET.has(targetUid);
            await setFollowing(user.uid, targetUid, next);
            btnFollow.textContent = next ? 'Siguiendo' : 'Seguir';
            await loadFollowCounts(targetUid);
            if (profileStatus && !isOwner && !isFriend && friendStatus?.status !== 'pending') {
              profileStatus.textContent = next ? 'Siguiendo' : 'No conectado';
            }
            setMsg(next ? 'Siguiendo ?' : 'Listo ?');
            setTimeout(() => setMsg(''), 1500);
          } catch (e) {
            console.warn('toggle follow failed', e);
            setMsg('No se pudo actualizar.', true);
          } finally {
            btnFollow.disabled = !canFollow;
          }
        });
      }
    }

    if (!isOwner && !publicProfile && !isFriend && !isAdminUser) {
      if (profileStatus) profileStatus.textContent = 'Perfil privado.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.classList.add('disabled');
      if (btnBlock) btnBlock.disabled = true;
      if (profilePublicCard) profilePublicCard.style.display = 'none';
      if (mediaComposer) mediaComposer.style.display = 'none';
      if (mediaGrid) mediaGrid.innerHTML = '<div class="muted">Contenido oculto.</div>';
      if (friendsHint) friendsHint.textContent = 'Contenido oculto.';
      if (friendsList) friendsList.innerHTML = '<div class="muted">—</div>';
      if (friendsSearch) friendsSearch.style.display = 'none';
      if (friendsTotal) friendsTotal.textContent = '0';
      if (followersHint) followersHint.textContent = 'Contenido oculto.';
      if (followersList) followersList.innerHTML = '<div class="muted">—</div>';
      if (followersSearch) followersSearch.style.display = 'none';
      if (followersTotal) followersTotal.textContent = '0';
      if (followingHint) followingHint.textContent = 'Contenido oculto.';
      if (followingList) followingList.innerHTML = '<div class="muted">—</div>';
      if (followingSearch) followingSearch.style.display = 'none';
      if (followingTotal) followingTotal.textContent = '0';
      return;
    }

    if (blockedInfo.blockedByOther) {
      if (profileStatus) profileStatus.textContent = 'No puedes interactuar.';
      if (btnAdd) btnAdd.disabled = true;
      if (btnChat) btnChat.style.pointerEvents = 'none';
    }

    const ctx = {
      myUid: user.uid,
      targetUid,
      displayName: name,
      isOwner,
      canComment: isOwner || isFriend,
    };
    PROFILE_CTX = ctx;
    subscribeSaveCollections(ctx.myUid);
    subscribeSavedItems(ctx.myUid);
    renderSavedTab(ctx);
    bindSavedUI(ctx);
    subscribeActivity(ctx.myUid, isOwner);
    if (!isOwner) {
      try {
        if (localStorage.getItem('av_profile_tab') === 'saved') applyActiveTab('info');
      } catch {}
    }
    bindMediaComposer(ctx);

    if (!canViewFeed && isBlockedAny && !isOwner) {
      if (feedList)
        feedList.innerHTML = '<div class="card muted">No puedes ver el contenido de este perfil.</div>';
      if (statusCard) statusCard.style.display = 'none';
      if (mediaGrid) mediaGrid.innerHTML = '<div class="muted">Contenido oculto.</div>';
    } else if (!canViewFeed && postsVisibility === 'private' && !isOwner) {
      if (feedList) feedList.innerHTML = '<div class="card muted">Las publicaciones están ocultas.</div>';
      if (statusCard) statusCard.style.display = 'none';
      if (mediaGrid) mediaGrid.innerHTML = '<div class="muted">Las fotos están ocultas.</div>';
    } else if (!canViewFeed && postsVisibility === 'friends' && !isOwner && !isFriend) {
      if (feedList)
        feedList.innerHTML = '<div class="card muted">Solo amigos pueden ver este feed.</div>';
      if (statusCard) statusCard.style.display = 'none';
      if (mediaGrid) mediaGrid.innerHTML = '<div class="muted">Solo amigos pueden ver las fotos.</div>';
    } else {
      subscribeFeed(targetUid, ctx);
      bindFeedActions(ctx);
      bindStatusComposer(ctx);
    }

    if (rewardsVisibility === 'private' && !isOwner) {
      const rewardsTab = $('tab-rewards');
      if (rewardsTab) rewardsTab.innerHTML = '<div class="card muted">Las recompensas están ocultas.</div>';
    }

    if (user.uid === targetUid) {
      loadInvites(user.uid);
    } else if (invitesList) {
      invitesList.innerHTML = '';
      if (invitesHint) invitesHint.textContent = 'Solo visible en tu perfil.';
    }

    let myFriendSet = new Set();
    if (isOwner) {
      myFriendSet = (await loadFriendCount(user.uid, friendsCount)) || new Set();
      try {
        await setDoc(
          doc(db, 'public_users', user.uid),
          { friendCount: myFriendSet.size },
          { merge: true },
        );
      } catch (e) {
        console.warn('friendCount upsert failed', e);
      }
    } else {
      if (friendsCount) friendsCount.textContent = String(profile.friendCount || 0);
      myFriendSet = (await loadFriendCount(user.uid, null)) || new Set();
    }
    if (canViewFeed) {
      await loadRecentReactions(targetUid);
    } else if (recentReactions) {
      recentReactions.textContent = 'Reacciones ocultas.';
    }
    const excludeSet = new Set([...myFriendSet, ...myFollowingSet]);
    excludeSet.add(targetUid);
    await loadSuggestions(user.uid, excludeSet);
    await loadFriendsTab(ctx);

    const followersTabBtn = tabButtons.find((b) => b?.dataset?.tab === 'followers');
    if (followersTabBtn && !followersTabBtn.dataset.loadWired) {
      followersTabBtn.dataset.loadWired = '1';
      followersTabBtn.addEventListener('click', () => loadFollowersTab(ctx).catch(() => {}));
    }
    const followingTabBtn = tabButtons.find((b) => b?.dataset?.tab === 'following');
    if (followingTabBtn && !followingTabBtn.dataset.loadWired) {
      followingTabBtn.dataset.loadWired = '1';
      followingTabBtn.addEventListener('click', () => loadFollowingTab(ctx).catch(() => {}));
    }

    let savedTab = '';
    try {
      savedTab = localStorage.getItem('av_profile_tab') || '';
    } catch {}

    if (isOwner || savedTab === 'followers') await loadFollowersTab(ctx);
    if (isOwner || savedTab === 'following') await loadFollowingTab(ctx);

    if (isOwner || isAdminUser) {
      const levelsToShow = getAllowedLevels(CURRENT_USER_DOC);
      await loadCourseProgress(targetUid, levelsToShow);
    } else if (coursesList) {
      coursesList.innerHTML =
        '<div class="muted">El progreso detallado solo es visible en tu propio perfil.</div>';
    }

    if (suggestionsList && !suggestionsList.dataset.wired) {
      suggestionsList.dataset.wired = '1';
      suggestionsList.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-follow-suggest]');
        if (!btn) return;
        const target = btn.getAttribute('data-follow-suggest');
        if (!target || target === user.uid) return;
        if (MY_FOLLOWING_SET.has(target)) return;
        try {
          btn.disabled = true;
          await setFollowing(user.uid, target, true);
          btn.textContent = 'Siguiendo';
          btn.closest('.friendItem')?.remove?.();
          if (user.uid === targetUid) {
            await loadFollowCounts(user.uid);
          }
          setMsg('Siguiendo ?');
          setTimeout(() => setMsg(''), 1500);
        } catch (e) {
          console.warn('follow from suggestion failed', e);
          setMsg('No se pudo seguir.', true);
        } finally {
          btn.disabled = false;
        }
      });
    }

    if (invitesList && !invitesList.dataset.wired) {
      invitesList.dataset.wired = '1';
      invitesList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-invite]');
        if (!btn) return;
        const action = btn.getAttribute('data-invite');
        const id = btn.getAttribute('data-id');
        handleInviteAction(user.uid, id, action).catch((e) => console.warn('invite action failed', e));
      });
    }

    if (profileStatus) {
      profileStatus.textContent = isOwner
        ? 'Tu perfil'
        : isFriend
          ? 'Amigos'
          : MY_FOLLOWING_SET.has(targetUid)
            ? 'Siguiendo'
            : friendStatus?.status === 'pending'
              ? 'Solicitud pendiente'
              : 'No conectado';
    }

    if (btnChat) {
      btnChat.href = `mensajes.html?chat=${encodeURIComponent(targetUid)}`;
      const enabled = (isFriend || isOwner) && canMessage;
      btnChat.style.pointerEvents = enabled ? '' : 'none';
      btnChat.style.opacity = enabled ? '' : '0.5';
      if (isOwner) btnChat.style.display = 'none';
    }

    if (btnAdd) {
      if (isOwner) {
        btnAdd.style.display = '';
        btnAdd.disabled = false;
        btnAdd.textContent = '+ Buscar';
        if (!btnAdd.dataset.wired) {
          btnAdd.dataset.wired = '1';
          btnAdd.addEventListener('click', () => {
            try {
              profileSearchInput?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            } catch {}
            setTimeout(() => profileSearchInput?.focus?.(), 150);
          });
        }
      } else {
        const canAdd =
          targetUid !== user.uid &&
          profile.allowFriendRequests !== false &&
          !isFriend &&
          friendStatus?.status !== 'pending';
        btnAdd.style.display = '';
        btnAdd.textContent = 'Agregar';
        btnAdd.disabled = !canAdd;
        if (!btnAdd.dataset.wired) {
          btnAdd.dataset.wired = '1';
          btnAdd.addEventListener('click', async () => {
            await sendFriendRequest(user.uid, targetUid);
          });
        }
      }
    }

    if (btnBlock) {
      let isBlocked = blockedInfo.blockedByMe;
      btnBlock.disabled = targetUid === user.uid;
      if (isOwner) btnBlock.style.display = 'none';
      btnBlock.textContent = isBlocked ? 'Desbloquear' : 'Bloquear';
      if (!btnBlock.dataset.wired) {
        btnBlock.dataset.wired = '1';
        btnBlock.addEventListener('click', async () => {
          if (targetUid === user.uid) return;
          if (isBlocked) {
            await unblockUser(user.uid, targetUid);
            isBlocked = false;
            btnBlock.textContent = 'Bloquear';
            setMsg('Usuario desbloqueado.');
          } else {
            await blockUser(user.uid, targetUid);
            isBlocked = true;
            btnBlock.textContent = 'Desbloquear';
          }
        });
      }
    }
  } catch (e) {
    console.error('[perfil]', e);
    if (profileStatus) profileStatus.textContent = 'Error al cargar.';
  }
});

initTabs();
initSavedDefaults();
initFeedDefaults();
