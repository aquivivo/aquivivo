
import { auth, db } from '../firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const qs = new URLSearchParams(location.search);
const DEFAULT_PORTAL = 'feed';
const DEFAULT_FEED_SOURCE = 'discover';

const state = {
  me: null,
  mePublic: null,
  meUserDoc: null,
  targetUid: '',
  targetPublic: null,
  activePortal: 'feed',
  feedSource: 'discover',
  feedSearch: '',
  followingSet: new Set(),
  friendStatus: 'none',
  outgoingFriendId: '',
  incomingFriendId: '',
  counts: {
    followers: 0,
    following: 0,
    friends: 0,
  },
  targetPosts: [],
  followingPosts: [],
  discoverPosts: [],
  storyItems: [],
  reelItems: [],
  liveItems: [],
  pendingRequests: [],
  network: {
    followers: [],
    following: [],
    friends: [],
    suggestions: [],
  },
  notifications: [],
  conversations: [],
  savedItems: [],
  reelIndex: 0,
  storyIndex: 0,
};

const cache = {
  publicUsers: new Map(),
  reactionSummary: new Map(),
};

const ui = {
  topAvatarLink: $('topAvatarLink'),
  topAvatarImg: $('topAvatarImg'),
  topAvatarFallback: $('topAvatarFallback'),
  topNotifCount: $('topNotifCount'),

  leftAvatarImg: $('leftAvatarImg'),
  leftAvatarFallback: $('leftAvatarFallback'),
  leftName: $('leftName'),
  leftHandle: $('leftHandle'),
  profileCity: $('profileCity'),
  leftStatus: $('leftStatus'),
  countFollowers: $('countFollowers'),
  countFollowing: $('countFollowing'),
  countFriends: $('countFriends'),

  btnFollow: $('btnFusionFollow'),
  btnFriend: $('btnFusionFriend'),
  btnMessage: $('btnFusionMessage'),
  btnShare: $('btnFusionShare'),

  heroCover: $('heroCover'),
  heroAvatarImg: $('heroAvatarImg'),
  heroAvatarFallback: $('heroAvatarFallback'),
  heroName: $('heroName'),
  heroHandle: $('heroHandle'),
  heroBio: $('heroBio'),
  heroPlanBadge: $('heroPlanBadge'),
  heroRoleBadge: $('heroRoleBadge'),

  meterImpact: $('meterImpact'),
  meterCreative: $('meterCreative'),
  meterCommunity: $('meterCommunity'),

  composerMode: $('composerMode'),
  fusionComposer: $('fusionComposer'),
  btnOpenComposer: $('btnOpenComposer'),
  composerModal: $('composerModal'),
  composerInlineAvatarImg: $('composerInlineAvatarImg'),
  composerInlineAvatarFallback: $('composerInlineAvatarFallback'),
  composerMedia: $('composerMedia'),
  composerTags: $('composerTags'),
  composerPoll: $('composerPoll'),
  composerEventDate: $('composerEventDate'),
  composerEventPlace: $('composerEventPlace'),
  composerText: $('composerText'),
  composerExtraPoll: $('composerExtraPoll'),
  composerExtraEventDate: $('composerExtraEventDate'),
  composerExtraEventPlace: $('composerExtraEventPlace'),
  btnComposerPublish: $('btnComposerPublish'),
  btnComposerClear: $('btnComposerClear'),
  btnComposerToggle: $('btnComposerToggle'),
  composerMsg: $('composerMsg'),

  storiesStrip: $('storiesStrip'),
  hubSpotlight: $('hubSpotlight'),
  hubMiniFeed: $('hubMiniFeed'),

  feedSourceSwitch: $('feedSourceSwitch'),
  feedSearchInput: $('feedSearchInput'),
  btnFeedReset: $('btnFeedReset'),
  feedList: $('feedList'),

  reelStage: $('reelStage'),
  btnReelPrev: $('btnReelPrev'),
  btnReelNext: $('btnReelNext'),

  storiesGrid: $('storiesGrid'),
  storiesHint: $('storiesHint'),

  networkRequests: $('networkRequests'),
  networkSuggestions: $('networkSuggestions'),
  networkFollowers: $('networkFollowers'),
  networkFollowing: $('networkFollowing'),
  networkFriends: $('networkFriends'),

  pulseNotifications: $('pulseNotifications'),
  pulseConversations: $('pulseConversations'),
  pulseSaves: $('pulseSaves'),
  pulseEvents: $('pulseEvents'),

  nearPeople: $('nearPeople'),
  nearEvents: $('nearEvents'),
  popularQuestions: $('popularQuestions'),

  shortcutComposer: $('shortcutComposer'),
  btnBottomCreate: $('btnBottomCreate'),
  btnBottomProfile: $('btnBottomProfile'),

  storyModal: $('storyModal'),
  storyModalTitle: $('storyModalTitle'),
  storyModalMediaWrap: $('storyModalMediaWrap'),
  storyModalText: $('storyModalText'),
  storyPrevBtn: $('storyPrevBtn'),
  storyNextBtn: $('storyNextBtn'),
  storyCloseBtn: $('storyCloseBtn'),
};

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ts(value) {
  const d = asDate(value);
  return d ? d.getTime() : 0;
}

function formatAgo(value) {
  const d = asDate(value);
  if (!d) return '-';
  const delta = Date.now() - d.getTime();
  const min = Math.floor(delta / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}d`;
  return d.toLocaleDateString('es-ES');
}

function formatDate(value) {
  const d = asDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatDateTime(value) {
  const d = asDate(value);
  if (!d) return '-';
  return d.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setAvatar(imgEl, fallbackEl, photoURL, label) {
  if (!imgEl || !fallbackEl) return;
  const url = String(photoURL || '').trim();
  const text = String(label || '').trim();
  const letter = text ? text.charAt(0).toUpperCase() : 'U';
  fallbackEl.textContent = letter;
  if (!url) {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    fallbackEl.style.display = '';
    return;
  }
  imgEl.src = url;
  imgEl.style.display = '';
  fallbackEl.style.display = 'none';
}

function pickDisplayName(profile, fallback = 'Usuario') {
  if (!profile) return fallback;
  return String(profile.displayName || profile.name || fallback).trim() || fallback;
}

function pickHandle(profile, uid = '') {
  const handle = String(profile?.handle || '').trim();
  if (handle) return `@${handle}`;
  if (uid) return `uid:${uid.slice(0, 8)}`;
  return '@usuario';
}

function pickBio(profile) {
  return String(
    profile?.bio ||
      profile?.note ||
      profile?.publicBio ||
      profile?.goalText ||
      'Social profile',
  ).trim();
}

function pickCity(profile) {
  return String(
    profile?.city || profile?.location || profile?.country || profile?.region || profile?.countryName || 'Online',
  ).trim();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shortUid(uid) {
  const text = String(uid || '').trim();
  return text ? text.slice(0, 8) : '';
}

function isVideoUrl(url) {
  const value = String(url || '').toLowerCase().trim();
  if (!value) return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(value) || value.includes('youtube.com') || value.includes('youtu.be');
}

function mediaFromPost(post) {
  return String(
    post?.media || post?.videoURL || post?.mediaURL || post?.imageURL || post?.imageUrl || '',
  ).trim();
}

function extractTags(...inputs) {
  const all = inputs
    .map((v) => String(v || ''))
    .join(' ')
    .toLowerCase();
  const tags = new Set();
  const byHash = all.match(/#[a-z0-9_]{1,30}/g) || [];
  byHash.forEach((tag) => tags.add(tag.replace('#', '')));
  all
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (token.startsWith('#') && token.length > 1) tags.add(token.slice(1));
    });
  return Array.from(tags).slice(0, 20);
}

function hydrateTagText(text) {
  const source = String(text || '');
  return esc(source).replace(/(^|\s)(#[a-zA-Z0-9_]+)/g, '$1<span class="post-tag">$2</span>');
}

function safePostKey(ownerUid, postId) {
  return `${String(ownerUid || '').replace(/[^a-z0-9_-]/gi, '_')}__${String(postId || '').replace(/[^a-z0-9_-]/gi, '_')}`;
}

function setComposerMsg(text, bad = false) {
  if (!ui.composerMsg) return;
  ui.composerMsg.textContent = String(text || '');
  ui.composerMsg.style.color = bad ? '#ce1126' : '#003893';
}

function setLeftStatus(text, bad = false) {
  if (!ui.leftStatus) return;
  ui.leftStatus.textContent = String(text || '');
  ui.leftStatus.style.color = bad ? '#ffd1d6' : '#eef4ff';
}

function setComposerCollapsed(collapsed = true) {
  const isCollapsed = collapsed === true;
  if (ui.composerModal) ui.composerModal.hidden = isCollapsed;
  document.body.classList.toggle('modal-open', !isCollapsed);
}

function setActivePortal(name) {
  const allowed = new Set(['feed', 'reels', 'stories', 'network', 'pulse']);
  const candidate = String(name || DEFAULT_PORTAL).toLowerCase();
  const portal = allowed.has(candidate) ? candidate : DEFAULT_PORTAL;
  state.activePortal = portal;
  document.body.dataset.portal = portal;

  $$('[data-portal-target]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.portalTarget === portal);
  });

  $$('[data-profile-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.profileTab === portal);
  });

  $$('[data-bottom-target]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.bottomTarget === portal);
  });

  $$('[data-portal-screen]').forEach((node) => {
    const match = node.getAttribute('data-portal-screen') === portal;
    node.classList.toggle('is-active', match);
  });

  if (portal === 'reels') setComposerCollapsed(true);
}

function setFeedSource(source) {
  const next = ['target', 'following', 'discover'].includes(source) ? source : DEFAULT_FEED_SOURCE;
  state.feedSource = next;
  $$('.feed-source-btn', ui.feedSourceSwitch || document).forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.feedSource === next);
  });
  renderFeed();
}

async function resolveTargetUid(me) {
  const directUid = String(qs.get('uid') || '').trim();
  if (directUid) return directUid;

  const queryHandle = normalize(qs.get('u'));
  if (!queryHandle) return me.uid;

  try {
    const indexSnap = await getDoc(doc(db, 'login_index', queryHandle));
    if (indexSnap.exists()) {
      const uid = String(indexSnap.data()?.uid || '').trim();
      if (uid) return uid;
    }
  } catch {
    // ignore
  }

  try {
    const snap = await getDocs(
      query(collection(db, 'public_users'), where('handleLower', '==', queryHandle), limit(1)),
    );
    if (!snap.empty) return snap.docs[0].id;
  } catch {
    // ignore
  }

  return me.uid;
}

async function getPublicUser(uid) {
  const key = String(uid || '').trim();
  if (!key) return null;
  if (cache.publicUsers.has(key)) return cache.publicUsers.get(key);
  try {
    const snap = await getDoc(doc(db, 'public_users', key));
    const profile = snap.exists() ? { uid: key, ...(snap.data() || {}) } : null;
    cache.publicUsers.set(key, profile);
    return profile;
  } catch {
    cache.publicUsers.set(key, null);
    return null;
  }
}

async function loadMyUserDoc(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() || {} : null;
  } catch {
    return null;
  }
}

function normalizePost(ownerUid, snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    ownerUid,
    type: String(data.type || 'post').trim().toLowerCase(),
    authorUid: String(data.authorUid || ownerUid || '').trim(),
    authorName: String(data.authorName || data.displayName || data.name || 'Usuario').trim(),
    authorHandle: String(data.authorHandle || '').trim(),
    text: String(data.text || '').trim(),
    tags: Array.isArray(data.tags) ? data.tags.map((x) => String(x || '').trim()).filter(Boolean) : [],
    media: String(data.videoURL || data.mediaURL || data.imageURL || data.imageUrl || '').trim(),
    createdAt: data.createdAt || data.updatedAt || null,
    updatedAt: data.updatedAt || data.createdAt || null,
    pinned: data.pinned === true,
    minutes: Number(data.minutes || 0) || 0,
    course: String(data.course || '').trim(),
    pollOptions: Array.isArray(data.pollOptions)
      ? data.pollOptions.map((x) => String(x || '').trim()).filter(Boolean)
      : [],
    eventDate: String(data.eventDate || '').trim(),
    eventPlace: String(data.eventPlace || '').trim(),
    raw: data,
  };
}

function sortPostsDesc(list) {
  return [...(list || [])].sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

async function loadPostsForUid(uid, postLimit = 30) {
  const list = [];
  if (!uid) return list;
  try {
    const snap = await getDocs(
      query(collection(db, 'user_feed', uid, 'posts'), orderBy('createdAt', 'desc'), limit(postLimit)),
    );
    snap.forEach((docSnap) => list.push(normalizePost(uid, docSnap)));
    return list;
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'user_feed', uid, 'posts'), limit(postLimit)));
      snap.forEach((docSnap) => list.push(normalizePost(uid, docSnap)));
      return sortPostsDesc(list);
    } catch {
      return [];
    }
  }
}
async function loadFollowingSet(myUid) {
  const set = new Set();
  try {
    const snap = await getDocs(query(collection(db, 'user_follows'), where('fromUid', '==', myUid), limit(600)));
    snap.forEach((d) => {
      const toUid = String(d.data()?.toUid || '').trim();
      if (toUid) set.add(toUid);
    });
  } catch {
    // ignore
  }
  return set;
}

async function loadFriendStatus(myUid, targetUid) {
  if (!targetUid || targetUid === myUid) {
    return {
      status: 'self',
      outgoingId: '',
      incomingId: '',
    };
  }

  const outgoingId = `${myUid}__${targetUid}`;
  const incomingId = `${targetUid}__${myUid}`;

  try {
    const [outSnap, inSnap] = await Promise.all([
      getDoc(doc(db, 'friend_requests', outgoingId)),
      getDoc(doc(db, 'friend_requests', incomingId)),
    ]);

    const outStatus = outSnap.exists() ? String(outSnap.data()?.status || '') : '';
    const inStatus = inSnap.exists() ? String(inSnap.data()?.status || '') : '';

    if (outStatus === 'accepted' || inStatus === 'accepted') {
      return { status: 'accepted', outgoingId, incomingId };
    }
    if (outStatus === 'pending') {
      return { status: 'pending_out', outgoingId, incomingId };
    }
    if (inStatus === 'pending') {
      return { status: 'pending_in', outgoingId, incomingId };
    }

    return { status: 'none', outgoingId, incomingId };
  } catch {
    return { status: 'none', outgoingId, incomingId };
  }
}

async function loadCounts(targetUid) {
  const counts = {
    followers: 0,
    following: 0,
    friends: 0,
  };

  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getCountFromServer(query(collection(db, 'user_follows'), where('toUid', '==', targetUid))),
      getCountFromServer(query(collection(db, 'user_follows'), where('fromUid', '==', targetUid))),
    ]);
    counts.followers = Number(followersSnap.data()?.count || 0);
    counts.following = Number(followingSnap.data()?.count || 0);
  } catch {
    try {
      const [followersDocs, followingDocs] = await Promise.all([
        getDocs(query(collection(db, 'user_follows'), where('toUid', '==', targetUid), limit(600))),
        getDocs(query(collection(db, 'user_follows'), where('fromUid', '==', targetUid), limit(600))),
      ]);
      counts.followers = followersDocs.size;
      counts.following = followingDocs.size;
    } catch {
      // ignore
    }
  }

  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('fromUid', '==', targetUid),
          where('status', '==', 'accepted'),
          limit(600),
        ),
      ),
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('toUid', '==', targetUid),
          where('status', '==', 'accepted'),
          limit(600),
        ),
      ),
    ]);

    const unique = new Set();
    fromSnap.forEach((d) => {
      const other = String(d.data()?.toUid || '').trim();
      if (other) unique.add(other);
    });
    toSnap.forEach((d) => {
      const other = String(d.data()?.fromUid || '').trim();
      if (other) unique.add(other);
    });
    counts.friends = unique.size;
  } catch {
    counts.friends = 0;
  }

  return counts;
}

async function loadDiscoverUsers(excludeSet = new Set()) {
  const users = [];

  const collectUsers = (snap) => {
    snap.forEach((d) => {
      const uid = d.id;
      if (!uid || excludeSet.has(uid)) return;
      users.push({ uid, ...(d.data() || {}) });
    });
  };

  try {
    const snap = await getDocs(query(collection(db, 'public_users'), orderBy('exp', 'desc'), limit(40)));
    collectUsers(snap);
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'public_users'), limit(80)));
      collectUsers(snap);
    } catch {
      // ignore
    }
  }

  const unique = new Map();
  users.forEach((u) => {
    if (!unique.has(u.uid)) unique.set(u.uid, u);
  });
  return Array.from(unique.values());
}

function deriveStoryItems(posts) {
  const out = [];
  posts.forEach((post) => {
    const type = String(post.type || '').toLowerCase();
    const media = mediaFromPost(post);
    if (type === 'story' || post.raw?.story === true) {
      out.push(post);
      return;
    }
    if (!media) return;
    if (Date.now() - ts(post.createdAt) <= 72 * 60 * 60 * 1000) {
      out.push(post);
    }
  });
  return sortPostsDesc(out).slice(0, 45);
}

function deriveReelItems(posts) {
  const out = [];
  posts.forEach((post) => {
    const type = String(post.type || '').toLowerCase();
    const media = mediaFromPost(post);
    if (!media) return;
    if (type === 'reel' || isVideoUrl(media)) {
      out.push(post);
    }
  });
  if (!out.length) {
    posts.forEach((post) => {
      if (!mediaFromPost(post)) return;
      out.push(post);
    });
  }
  return sortPostsDesc(out).slice(0, 60);
}

function deriveLiveItems(posts) {
  return sortPostsDesc(
    posts.filter((post) => {
      const type = String(post.type || '').toLowerCase();
      return type === 'poll' || type === 'event';
    }),
  ).slice(0, 30);
}

async function loadStreams() {
  state.targetPosts = await loadPostsForUid(state.targetUid, 70);

  const followingIds = Array.from(state.followingSet).slice(0, 10);
  if (!followingIds.includes(state.me.uid)) followingIds.unshift(state.me.uid);

  const followingBundles = await Promise.all(followingIds.map((uid) => loadPostsForUid(uid, 18)));
  state.followingPosts = sortPostsDesc(followingBundles.flat()).slice(0, 140);

  const exclude = new Set([state.me.uid, state.targetUid, ...state.followingSet]);
  const discoverUsers = await loadDiscoverUsers(exclude);
  const discoverIds = discoverUsers.slice(0, 8).map((u) => u.uid);

  const discoverBundles = await Promise.all(discoverIds.map((uid) => loadPostsForUid(uid, 16)));
  state.discoverPosts = sortPostsDesc(discoverBundles.flat()).slice(0, 120);

  const allForStories = [...state.targetPosts, ...state.followingPosts, ...state.discoverPosts];
  state.storyItems = deriveStoryItems(allForStories);
  state.reelItems = deriveReelItems(allForStories);
  state.liveItems = deriveLiveItems(allForStories);

  if (state.reelIndex >= state.reelItems.length) state.reelIndex = 0;
  if (state.storyIndex >= state.storyItems.length) state.storyIndex = 0;
}

async function loadPendingRequests() {
  if (!state.me?.uid) return [];

  try {
    const snap = await getDocs(
      query(
        collection(db, 'friend_requests'),
        where('toUid', '==', state.me.uid),
        where('status', '==', 'pending'),
        limit(70),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'friend_requests'), where('toUid', '==', state.me.uid), limit(90)));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((item) => String(item.status || '') === 'pending');
    } catch {
      return [];
    }
  }
}

async function loadNotifications() {
  if (!state.me?.uid) return [];

  try {
    const snap = await getDocs(
      query(collection(db, 'user_notifications', state.me.uid, 'items'), orderBy('createdAt', 'desc'), limit(50)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'user_notifications', state.me.uid, 'items'), limit(50)));
      return sortPostsDesc(
        snap.docs.map((d) => ({ id: d.id, createdAt: d.data()?.createdAt, ...(d.data() || {}) })),
      );
    } catch {
      return [];
    }
  }
}

async function loadConversations() {
  if (!state.me?.uid) return [];

  try {
    const snap = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', state.me.uid), limit(40)),
    );

    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    list.sort((a, b) => ts(b.lastAt || b.updatedAt || b.createdAt) - ts(a.lastAt || a.updatedAt || a.createdAt));
    return list;
  } catch {
    return [];
  }
}

async function loadSavedItems() {
  if (!state.me?.uid) return [];

  try {
    const snap = await getDocs(
      query(collection(db, 'user_saves', state.me.uid, 'items'), orderBy('savedAt', 'desc'), limit(80)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'user_saves', state.me.uid, 'items'), limit(80)));
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a, b) => ts(b.savedAt) - ts(a.savedAt));
    } catch {
      return [];
    }
  }
}

async function loadNetworkLists() {
  const targetUid = state.targetUid;
  const out = {
    followers: [],
    following: [],
    friends: [],
    suggestions: [],
  };

  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(query(collection(db, 'user_follows'), where('toUid', '==', targetUid), limit(250))),
      getDocs(query(collection(db, 'user_follows'), where('fromUid', '==', targetUid), limit(250))),
    ]);

    const followerIds = followersSnap.docs
      .map((d) => String(d.data()?.fromUid || '').trim())
      .filter(Boolean);
    const followingIds = followingSnap.docs
      .map((d) => String(d.data()?.toUid || '').trim())
      .filter(Boolean);

    const allIds = new Set([...followerIds, ...followingIds]);
    const profilePairs = await Promise.all(
      Array.from(allIds).map(async (uid) => ({ uid, profile: await getPublicUser(uid) })),
    );
    const map = new Map(profilePairs.map((p) => [p.uid, p.profile]));

    out.followers = followerIds.map((uid) => ({ uid, profile: map.get(uid) })).filter((x) => x.profile);
    out.following = followingIds.map((uid) => ({ uid, profile: map.get(uid) })).filter((x) => x.profile);
  } catch {
    // ignore
  }

  try {
    const [fromSnap, toSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('fromUid', '==', targetUid),
          where('status', '==', 'accepted'),
          limit(250),
        ),
      ),
      getDocs(
        query(
          collection(db, 'friend_requests'),
          where('toUid', '==', targetUid),
          where('status', '==', 'accepted'),
          limit(250),
        ),
      ),
    ]);

    const friendIds = new Set();
    fromSnap.forEach((d) => {
      const v = String(d.data()?.toUid || '').trim();
      if (v) friendIds.add(v);
    });
    toSnap.forEach((d) => {
      const v = String(d.data()?.fromUid || '').trim();
      if (v) friendIds.add(v);
    });

    const friendProfiles = await Promise.all(
      Array.from(friendIds).map(async (uid) => ({ uid, profile: await getPublicUser(uid) })),
    );

    out.friends = friendProfiles.filter((x) => x.profile);
  } catch {
    // ignore
  }

  try {
    const exclude = new Set([
      state.me.uid,
      state.targetUid,
      ...state.followingSet,
      ...out.friends.map((x) => x.uid),
    ]);

    const discoverUsers = await loadDiscoverUsers(exclude);
    out.suggestions = discoverUsers
      .filter((profile) => profile?.uid)
      .slice(0, 20)
      .map((profile) => ({ uid: profile.uid, profile }));
  } catch {
    out.suggestions = [];
  }

  return out;
}
function renderIdentity() {
  const target = state.targetPublic || {};
  const me = state.me || {};
  const isSelf = state.targetUid === state.me.uid;

  const displayName = pickDisplayName(target, me.displayName || me.email || 'Usuario');
  const handle = pickHandle(target, state.targetUid);
  const photoURL = String(target.photoURL || '').trim();
  const coverURL = String(target.coverURL || '').trim();
  const bio = pickBio(target);
  const city = pickCity(target);

  setAvatar(ui.leftAvatarImg, ui.leftAvatarFallback, photoURL, displayName);
  setAvatar(ui.heroAvatarImg, ui.heroAvatarFallback, photoURL, displayName);
  setAvatar(ui.topAvatarImg, ui.topAvatarFallback, photoURL, displayName);
  setAvatar(ui.composerInlineAvatarImg, ui.composerInlineAvatarFallback, photoURL, displayName);

  if (ui.leftName) ui.leftName.textContent = displayName;
  if (ui.leftHandle) ui.leftHandle.textContent = handle;
  if (ui.profileCity) ui.profileCity.textContent = city || 'Online';
  if (ui.heroName) ui.heroName.textContent = displayName;
  if (ui.heroHandle) ui.heroHandle.textContent = handle;
  if (ui.heroBio) ui.heroBio.textContent = bio;

  if (ui.topAvatarLink) {
    ui.topAvatarLink.href = isSelf
      ? 'perfil-fusion.html'
      : `perfil-fusion.html?uid=${encodeURIComponent(state.targetUid)}`;
  }

  const plan = String(target.plan || state.meUserDoc?.plan || 'free').trim();
  const role = String(target.role || state.meUserDoc?.role || 'user').trim();

  if (ui.heroPlanBadge) ui.heroPlanBadge.textContent = plan.toUpperCase();
  if (ui.heroRoleBadge) ui.heroRoleBadge.textContent = role === 'admin' ? 'ADMIN' : 'CREATOR';

  if (ui.heroCover) {
    if (coverURL) {
      ui.heroCover.style.background = `linear-gradient(120deg, rgba(0,56,147,0.72), rgba(11,52,129,0.72)), url('${coverURL}') center/cover no-repeat`;
    } else {
      ui.heroCover.style.background =
        'linear-gradient(122deg, rgba(0,56,147,0.9), rgba(11,52,129,0.9)), linear-gradient(26deg, rgba(252,209,22,0.22), rgba(206,17,38,0.2))';
    }
  }

  if (ui.countFollowers) ui.countFollowers.textContent = String(state.counts.followers);
  if (ui.countFollowing) ui.countFollowing.textContent = String(state.counts.following);
  if (ui.countFriends) ui.countFriends.textContent = String(state.counts.friends);

  if (ui.btnMessage) {
    ui.btnMessage.href = isSelf
      ? 'mensajes.html'
      : `mensajes.html?chat=${encodeURIComponent(state.targetUid)}`;
  }

  if (ui.btnFollow) {
    if (isSelf) {
      ui.btnFollow.textContent = 'Tu perfil';
      ui.btnFollow.disabled = true;
    } else if (state.followingSet.has(state.targetUid)) {
      ui.btnFollow.textContent = 'Siguiendo';
      ui.btnFollow.disabled = false;
    } else {
      ui.btnFollow.textContent = 'Seguir';
      ui.btnFollow.disabled = false;
    }
  }

  if (ui.btnFriend) {
    if (isSelf) {
      ui.btnFriend.textContent = 'Tu perfil';
      ui.btnFriend.disabled = true;
    } else if (state.friendStatus === 'accepted') {
      ui.btnFriend.textContent = 'Amigos';
      ui.btnFriend.disabled = true;
    } else if (state.friendStatus === 'pending_out') {
      ui.btnFriend.textContent = 'Pendiente';
      ui.btnFriend.disabled = false;
    } else if (state.friendStatus === 'pending_in') {
      ui.btnFriend.textContent = 'Aceptar';
      ui.btnFriend.disabled = false;
    } else {
      ui.btnFriend.textContent = 'Agregar';
      ui.btnFriend.disabled = false;
    }
  }

  const levelText = isSelf ? '' : '';
  setLeftStatus(levelText, false);

  renderMeters();
}

function renderMeters() {
  const postCount = state.targetPosts.length;
  const storyCount = state.storyItems.length;
  const reelCount = state.reelItems.length;

  const impact = clamp(Math.round(state.counts.followers * 0.3 + postCount * 1.2 + reelCount * 2.4), 8, 100);
  const creative = clamp(Math.round(storyCount * 2.8 + reelCount * 1.9 + state.liveItems.length * 1.8), 8, 100);
  const community = clamp(Math.round(state.counts.friends * 3 + state.counts.following * 0.35), 8, 100);

  if (ui.meterImpact) ui.meterImpact.style.width = `${impact}%`;
  if (ui.meterCreative) ui.meterCreative.style.width = `${creative}%`;
  if (ui.meterCommunity) ui.meterCommunity.style.width = `${community}%`;
}

function createPostHTML(post, compact = false) {
  const ownerUid = String(post.ownerUid || '').trim();
  const postId = String(post.id || '').trim();
  const key = safePostKey(ownerUid, postId);
  const author = esc(post.authorName || 'Usuario');
  const handle = post.authorHandle ? `@${esc(post.authorHandle)}` : `uid:${esc(shortUid(ownerUid))}`;
  const text = hydrateTagText(post.text || '');
  const media = mediaFromPost(post);
  const authorInitial = esc(String(post.authorName || 'U').trim().charAt(0).toUpperCase() || 'U');
  const authorHref = `perfil-fusion.html?uid=${encodeURIComponent(ownerUid)}`;

  const tags = Array.isArray(post.tags) && post.tags.length
    ? `<div class="post-tags">${post.tags.map((tag) => `#${esc(tag)}`).join(' ')}</div>`
    : '';

  const mediaBlock = (() => {
    if (!media) return '';
    if (isVideoUrl(media)) {
      return `<div class="media-block"><video controls preload="metadata" src="${esc(media)}"></video></div>`;
    }
    return `<div class="media-block"><img loading="lazy" src="${esc(media)}" alt="media" /></div>`;
  })();

  const pollBlock = post.type === 'poll' && post.pollOptions.length
    ? `<div class="post-meta">Poll: ${post.pollOptions.map((x) => esc(x)).join(' | ')}</div>`
    : '';

  const eventBlock = post.type === 'event'
    ? `<div class="post-meta">Event: ${esc(post.eventDate || '-')}${post.eventPlace ? ` @ ${esc(post.eventPlace)}` : ''}</div>`
    : '';

  const commentPanel = compact
    ? ''
    : `
      <div class="comments-panel" data-comments-panel="${key}">
        <div class="comments-list" data-comments-list="${key}"></div>
        <div class="comment-form">
          <input class="input" type="text" data-comment-input="${key}" placeholder="Escribe un comentario" />
          <button class="btn-white-outline" data-post-action="comment-send" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">Enviar</button>
        </div>
      </div>
    `;

  const actionRow = compact
    ? `
      <div class="post-actions">
        <button class="post-action-btn" data-post-action="react" data-reaction="like" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x2665; Like</button>
        <button class="post-action-btn" data-post-action="comments" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x1F4AC; Comentarios</button>
      </div>
    `
    : `
      <div class="post-actions">
        <button class="post-action-btn" data-post-action="react" data-reaction="like" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x2665; Like</button>
        <button class="post-action-btn" data-post-action="comments" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x1F4AC; Comentarios</button>
        <button class="post-action-btn" data-post-action="save" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x1F516; Guardar</button>
        <button class="post-action-btn" data-post-action="share" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">&#x21AA; Compartir</button>
      </div>
    `;

  return `
    <article class="post-card" data-owner="${esc(ownerUid)}" data-post="${esc(postId)}">
      <div class="post-head">
        <a class="post-author" href="${authorHref}">
          <span class="post-avatar">${authorInitial}</span>
          <span class="post-author-meta">
            <strong>${author}</strong>
            <span>${handle}</span>
          </span>
        </a>
        <div class="post-time">${formatAgo(post.createdAt)}</div>
      </div>
      <p class="post-text">${text || ''}</p>
      ${tags}
      ${mediaBlock}
      ${pollBlock}
      ${eventBlock}
      ${actionRow}
      <div class="post-meta" data-reaction-summary="${key}">Reacciones: ...</div>
      ${commentPanel}
    </article>
  `;
}

function renderPostList(container, posts, opts = {}) {
  if (!container) return;
  const list = Array.isArray(posts) ? posts : [];
  const max = Number(opts.max || 0) || list.length;
  const compact = opts.compact === true;
  const items = list.slice(0, max);

  if (!items.length) {
    container.innerHTML = '<div class="empty-state">Sin contenido por ahora.</div>';
    return;
  }

  container.innerHTML = items.map((post) => createPostHTML(post, compact)).join('');
  hydrateReactionSummaries(container, items.slice(0, compact ? 4 : 10)).catch(() => null);
}

function postsForFeedSource(source) {
  if (source === 'following') return state.followingPosts;
  if (source === 'discover') return state.discoverPosts;
  return state.targetPosts;
}

function filterPosts(posts, queryText) {
  const q = normalize(queryText);
  if (!q) return posts;
  return posts.filter((post) => {
    const hay = normalize(
      [
        post.authorName,
        post.authorHandle,
        post.text,
        ...(Array.isArray(post.tags) ? post.tags : []),
        post.type,
      ].join(' '),
    );
    return hay.includes(q);
  });
}

function renderHub() {
  renderPostList(ui.hubMiniFeed, state.followingPosts, { max: 6, compact: true });

  const spotlight = sortPostsDesc(state.discoverPosts).slice(0, 1);
  renderPostList(ui.hubSpotlight, spotlight, { max: 1, compact: false });

  renderStories();
}

function renderFeed() {
  const sourcePosts = postsForFeedSource(state.feedSource);
  const filtered = filterPosts(sourcePosts, state.feedSearch);
  renderPostList(ui.feedList, filtered, { max: 80, compact: false });
}

function renderStories() {
  const list = state.storyItems.slice(0, 40);

  if (!list.length) {
    if (ui.storiesStrip) {
      ui.storiesStrip.innerHTML = '<div class="empty-state">Sin stories recientes.</div>';
    }
    if (ui.storiesGrid) {
      ui.storiesGrid.innerHTML = '<div class="empty-state">Sin stories recientes.</div>';
    }
    if (ui.storiesHint) ui.storiesHint.textContent = '0 stories';
    return;
  }

  if (ui.storiesHint) ui.storiesHint.textContent = `${list.length} stories activas`;

  if (ui.storiesStrip) {
    ui.storiesStrip.innerHTML = list
      .slice(0, 14)
      .map((post, idx) => {
        const media = mediaFromPost(post);
        const title = esc(post.authorName || 'Story');
        const mediaHtml = media
          ? `<img loading="lazy" src="${esc(media)}" alt="story" />`
          : `<span style="font-size:28px;color:#fcd116">S</span>`;
        return `
          <button class="story-pill" data-story-open="${idx}" type="button">
            <div class="story-pill-media">${mediaHtml}</div>
            <div class="story-pill-title">${title}</div>
          </button>
        `;
      })
      .join('');
  }

  if (ui.storiesGrid) {
    ui.storiesGrid.innerHTML = list
      .map((post, idx) => {
        const media = mediaFromPost(post);
        const meta = `${esc(post.authorName || 'Story')} | ${formatAgo(post.createdAt)}`;
        const mediaHtml = media
          ? `<img loading="lazy" src="${esc(media)}" alt="story" />`
          : `<span style="font-size:34px;color:#003893">S</span>`;
        return `
          <button class="story-tile" data-story-open="${idx}" type="button">
            <div class="story-tile-media">${mediaHtml}</div>
            <div class="story-tile-meta">${meta}</div>
          </button>
        `;
      })
      .join('');
  }
}

function renderReelStage() {
  if (!ui.reelStage) return;
  const reels = state.reelItems;
  if (!reels.length) {
    ui.reelStage.innerHTML = '<div class="reel-empty">Sin reels por ahora.</div>';
    return;
  }

  const idx = clamp(state.reelIndex, 0, reels.length - 1);
  state.reelIndex = idx;
  const post = reels[idx];
  const media = mediaFromPost(post);

  const mediaHtml = media
    ? isVideoUrl(media)
      ? `<video controls preload="metadata" src="${esc(media)}"></video>`
      : `<img loading="lazy" src="${esc(media)}" alt="reel" />`
    : '<div class="empty-state">Sin media</div>';

  ui.reelStage.innerHTML = `
    <div class="reel-card-wrap" data-owner="${esc(post.ownerUid)}" data-post="${esc(post.id)}">
      <div class="reel-head">
        <strong>${esc(post.authorName || 'Usuario')}</strong>
        <span>${idx + 1}/${reels.length} | ${formatAgo(post.createdAt)}</span>
      </div>
      <div class="reel-media">${mediaHtml}</div>
      <div class="reel-caption">${esc(post.text || 'Reel')}</div>
    </div>
  `;
}

function simpleItemHTML({ title = '', sub = '', actions = '' }) {
  return `
    <article class="simple-item">
      <div class="simple-item-head">
        <div class="simple-item-title">${esc(title)}</div>
      </div>
      <div class="simple-item-sub">${sub}</div>
      ${actions ? `<div class="simple-item-actions">${actions}</div>` : ''}
    </article>
  `;
}
function renderNetwork() {
  if (ui.networkRequests) {
    if (!state.pendingRequests.length) {
      ui.networkRequests.innerHTML = '<div class="empty-state">Sin solicitudes pendientes.</div>';
    } else {
      ui.networkRequests.innerHTML = state.pendingRequests
        .slice(0, 30)
        .map((req) => {
          const uid = String(req.fromUid || '').trim();
          const profile = cache.publicUsers.get(uid) || null;
          const name = pickDisplayName(profile, uid || 'Usuario');
          const sub = `${pickHandle(profile, uid)} | ${formatAgo(req.createdAt)}`;
          const actions = `
            <button class="btn-yellow" data-request-action="accept" data-request-id="${esc(req.id)}" type="button">Aceptar</button>
            <button class="btn-white-outline" data-request-action="decline" data-request-id="${esc(req.id)}" type="button">Ignorar</button>
          `;
          return simpleItemHTML({ title: name, sub, actions });
        })
        .join('');
    }
  }

  const renderProfileList = (root, list, emptyText) => {
    if (!root) return;
    if (!list.length) {
      root.innerHTML = `<div class="empty-state">${esc(emptyText)}</div>`;
      return;
    }

    root.innerHTML = list
      .slice(0, 50)
      .map((item) => {
        const profile = item.profile;
        const uid = item.uid;
        const name = pickDisplayName(profile, uid);
        const sub = `${pickHandle(profile, uid)} | uid:${esc(shortUid(uid))}`;
        const actions = `
          <a class="btn-white-outline" href="perfil-fusion.html?uid=${encodeURIComponent(uid)}">Ver</a>
          <a class="btn-white-outline" href="mensajes.html?chat=${encodeURIComponent(uid)}">Chat</a>
        `;
        return simpleItemHTML({ title: name, sub, actions });
      })
      .join('');
  };

  renderProfileList(ui.networkFollowers, state.network.followers, 'Sin followers.');
  renderProfileList(ui.networkFollowing, state.network.following, 'Sin following.');
  renderProfileList(ui.networkFriends, state.network.friends, 'Sin friends.');

  if (ui.networkSuggestions) {
    if (!state.network.suggestions.length) {
      ui.networkSuggestions.innerHTML = '<div class="empty-state">Sin sugerencias nuevas.</div>';
    } else {
      ui.networkSuggestions.innerHTML = state.network.suggestions
        .slice(0, 20)
        .map((item) => {
          const profile = item.profile;
          const uid = item.uid;
          const name = pickDisplayName(profile, uid);
          const sub = `${pickHandle(profile, uid)} | exp:${Number(profile?.exp || 0)}`;
          const actions = `
            <button class="btn-yellow" data-suggest-follow="${esc(uid)}" type="button">Seguir</button>
            <button class="btn-white-outline" data-suggest-friend="${esc(uid)}" type="button">Agregar</button>
          `;
          return simpleItemHTML({ title: name, sub, actions });
        })
        .join('');
    }
  }
}

function renderPulse() {
  if (ui.pulseNotifications) {
    const list = state.notifications.slice(0, 30);
    if (!list.length) {
      ui.pulseNotifications.innerHTML = '<div class="empty-state">Sin notificaciones.</div>';
    } else {
      ui.pulseNotifications.innerHTML = list
        .map((item) => {
          const title = String(item.title || item.type || 'Notificacion').trim();
          const sub = `${esc(String(item.body || item.message || '').slice(0, 180))}<br>${formatAgo(item.createdAt)}`;
          return simpleItemHTML({ title, sub });
        })
        .join('');
    }
  }

  if (ui.pulseConversations) {
    const list = state.conversations.slice(0, 30);
    if (!list.length) {
      ui.pulseConversations.innerHTML = '<div class="empty-state">Sin conversaciones.</div>';
    } else {
      ui.pulseConversations.innerHTML = list
        .map((item) => {
          const title = String(item.title || item.type || `Conv ${shortUid(item.id)}`).trim();
          const lastText = String(item.lastMessage?.text || '').trim();
          const sub = `${esc(lastText || 'Sin ultimo mensaje')}<br>${formatAgo(item.lastAt || item.updatedAt || item.createdAt)}`;
          const actions = `<a class="btn-white-outline" href="mensajes.html?conv=${encodeURIComponent(item.id)}">Abrir</a>`;
          return simpleItemHTML({ title, sub, actions });
        })
        .join('');
    }
  }

  if (ui.pulseSaves) {
    const list = state.savedItems.slice(0, 30);
    if (!list.length) {
      ui.pulseSaves.innerHTML = '<div class="empty-state">Sin guardados.</div>';
    } else {
      ui.pulseSaves.innerHTML = list
        .map((item) => {
          const title = String(item.postText || item.title || item.postId || 'Guardado').trim().slice(0, 70);
          const sub = `${esc(item.postOwnerUid || '')} | ${formatAgo(item.savedAt || item.createdAt)}`;
          const href = `perfil-fusion.html?uid=${encodeURIComponent(String(item.postOwnerUid || '').trim())}`;
          const actions = `<a class="btn-white-outline" href="${esc(href)}">Ir al perfil</a>`;
          return simpleItemHTML({ title, sub, actions });
        })
        .join('');
    }
  }

  if (ui.pulseEvents) {
    const list = state.liveItems.slice(0, 30);
    if (!list.length) {
      ui.pulseEvents.innerHTML = '<div class="empty-state">Sin eventos o polls.</div>';
    } else {
      ui.pulseEvents.innerHTML = list
        .map((item) => {
          const title = `${item.type.toUpperCase()} | ${item.authorName || shortUid(item.ownerUid)}`;
          const detail =
            item.type === 'event'
              ? `${item.eventDate || '-'} ${item.eventPlace ? `@ ${item.eventPlace}` : ''}`
              : item.pollOptions.join(' | ');
          const sub = `${esc(detail || item.text || '-')}<br>${formatDateTime(item.createdAt)}`;
          return simpleItemHTML({ title, sub });
        })
        .join('');
    }
  }
}

function renderTopbarMeta() {
  if (!ui.topNotifCount) return;
  const total = Number(state.notifications?.length || 0);
  ui.topNotifCount.textContent = String(total);
  ui.topNotifCount.style.display = total > 0 ? 'grid' : 'none';
}

function renderTagsAndLiveBoard() {
  const tagScores = new Map();
  const addTag = (tag) => {
    const key = normalize(tag).replace(/^#/, '');
    if (!key) return;
    tagScores.set(key, Number(tagScores.get(key) || 0) + 1);
  };

  [...state.targetPosts, ...state.followingPosts, ...state.discoverPosts]
    .slice(0, 220)
    .forEach((post) => {
      (post.tags || []).forEach((tag) => addTag(tag));
      const inline = String(post.text || '').match(/#[a-z0-9_]{1,30}/gi) || [];
      inline.forEach((token) => addTag(token));
    });

  const topTags = Array.from(tagScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24);

  if (ui.trendingTags) {
    if (!topTags.length) {
      ui.trendingTags.innerHTML = '<div class="empty-state">Sin tags.</div>';
    } else {
      ui.trendingTags.innerHTML = topTags
        .map(
          ([tag, score]) =>
            `<button class="tag-chip" data-tag-search="${esc(tag)}" type="button">#${esc(tag)} (${score})</button>`,
        )
        .join('');
    }
  }

  if (ui.liveBoard) {
    const top = sortPostsDesc([...state.liveItems, ...state.discoverPosts]).slice(0, 10);
    if (!top.length) {
      ui.liveBoard.innerHTML = '<div class="empty-state">Sin actividad en vivo.</div>';
    } else {
      ui.liveBoard.innerHTML = top
        .map((post) => {
          const title = `${(post.type || 'post').toUpperCase()} | ${post.authorName || shortUid(post.ownerUid)}`;
          const sub = `${esc(String(post.text || '').slice(0, 120) || '-')}<br>${formatAgo(post.createdAt)}`;
          return simpleItemHTML({ title, sub });
        })
        .join('');
    }
  }
}

function renderAll() {
  renderIdentity();
  renderHub();
  renderFeed();
  renderReelStage();
  renderNetwork();
  renderPulse();
  renderTagsAndLiveBoard();
  renderTopbarMeta();
}

function getPostByOwnerAndId(ownerUid, postId) {
  const all = [...state.targetPosts, ...state.followingPosts, ...state.discoverPosts];
  return all.find((post) => post.ownerUid === ownerUid && post.id === postId) || null;
}

async function reactionSummary(ownerUid, postId) {
  const key = `${ownerUid}__${postId}`;
  if (cache.reactionSummary.has(key)) return cache.reactionSummary.get(key);

  const stats = {
    total: 0,
    like: 0,
    fire: 0,
    support: 0,
  };

  try {
    const snap = await getDocs(query(collection(db, 'user_feed', ownerUid, 'posts', postId, 'reactions'), limit(400)));
    snap.forEach((d) => {
      const type = String(d.data()?.type || '').trim().toLowerCase();
      stats.total += 1;
      if (type === 'like' || type === 'fire' || type === 'support') stats[type] += 1;
    });
  } catch {
    // ignore
  }

  cache.reactionSummary.set(key, stats);
  return stats;
}

function reactionSummaryLabel(sum) {
  if (!sum || !sum.total) return 'Sin reacciones';
  return `\u2665 ${sum.like}  \u2022  \uD83D\uDD25 ${sum.fire}  \u2022  \uD83E\uDD1D ${sum.support}`;
}

async function hydrateReactionSummaries(container, posts) {
  const target = container || document;
  const list = Array.isArray(posts) ? posts : [];
  await Promise.all(
    list.map(async (post) => {
      const key = safePostKey(post.ownerUid, post.id);
      const node = target.querySelector(`[data-reaction-summary="${key}"]`);
      if (!node) return;
      const sum = await reactionSummary(post.ownerUid, post.id);
      node.textContent = reactionSummaryLabel(sum);
    }),
  );
}

async function toggleReaction(ownerUid, postId, type) {
  if (!state.me?.uid) return;
  const rid = `${state.me.uid}__${type}`;
  const ref = doc(db, 'user_feed', ownerUid, 'posts', postId, 'reactions', rid);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        userId: state.me.uid,
        type,
        createdAt: serverTimestamp(),
      });
    }

    cache.reactionSummary.delete(`${ownerUid}__${postId}`);
    renderFeed();
    renderHub();
    setComposerMsg('Reaccion actualizada.');
  } catch (err) {
    console.warn('reaction failed', err);
    setComposerMsg('No se pudo reaccionar.', true);
  }
}

async function toggleComments(ownerUid, postId) {
  const key = safePostKey(ownerUid, postId);
  const panels = $$(`[data-comments-panel="${key}"]`);
  if (!panels.length) return;

  const shouldOpen = !panels[0].classList.contains('open');
  panels.forEach((panel) => panel.classList.toggle('open', shouldOpen));
  if (!shouldOpen) return;

  let comments = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'user_feed', ownerUid, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(120)),
    );
    comments = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, 'user_feed', ownerUid, 'posts', postId, 'comments'), limit(120)));
      comments = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
    } catch {
      comments = [];
    }
  }

  const html = comments.length
    ? comments
        .map(
          (item) => `
          <article class="comment-item">
            <strong>${esc(item.authorName || item.authorUid || 'Usuario')}</strong>
            <p>${esc(item.text || '')}</p>
            <span class="simple-item-sub">${formatAgo(item.createdAt)}</span>
          </article>
        `,
        )
        .join('')
    : '<div class="empty-state">Sin comentarios.</div>';

  $$(`[data-comments-list="${key}"]`).forEach((node) => {
    node.innerHTML = html;
  });
}

async function sendComment(ownerUid, postId, triggerEl = null) {
  const key = safePostKey(ownerUid, postId);
  const localInput = triggerEl
    ?.closest?.('.comment-form')
    ?.querySelector?.(`[data-comment-input="${key}"]`);
  const allInputs = $$(`[data-comment-input="${key}"]`);
  const fallbackInput = allInputs.find((node) => String(node?.value || '').trim()) || allInputs[0] || null;
  const input = localInput || fallbackInput;
  const value = String(input?.value || '').trim();
  if (!value) return;

  try {
    await addDoc(collection(db, 'user_feed', ownerUid, 'posts', postId, 'comments'), {
      authorUid: state.me.uid,
      authorName: pickDisplayName(state.mePublic, state.me.displayName || state.me.email || 'Usuario'),
      text: value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (input) input.value = '';
    await toggleComments(ownerUid, postId);
    setComposerMsg('Comentario enviado.');
  } catch (err) {
    console.warn('comment failed', err);
    setComposerMsg('No se pudo comentar.', true);
  }
}

async function savePost(ownerUid, postId) {
  if (!state.me?.uid) return;
  const post = getPostByOwnerAndId(ownerUid, postId);
  if (!post) return;

  const key = `${ownerUid}__${postId}`;
  try {
    await setDoc(doc(db, 'user_saves', state.me.uid, 'items', key), {
      postOwnerUid: ownerUid,
      postId,
      postText: post.text || '',
      postImageURL: mediaFromPost(post) || '',
      postType: post.type || 'post',
      savedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      collectionId: 'default',
    });
    setComposerMsg('Guardado en tu lista.');
    state.savedItems = await loadSavedItems();
    renderPulse();
  } catch (err) {
    console.warn('save failed', err);
    setComposerMsg('No se pudo guardar.', true);
  }
}

async function sharePost(ownerUid, postId) {
  const link = `${location.origin}/perfil-fusion.html?uid=${encodeURIComponent(ownerUid)}&post=${encodeURIComponent(postId)}`;
  try {
    await navigator.clipboard.writeText(link);
    setComposerMsg('Link copiado.');
  } catch {
    setComposerMsg(link);
  }
}
function renderStoryModal() {
  if (!ui.storyModal || !ui.storyModalTitle || !ui.storyModalMediaWrap || !ui.storyModalText) return;
  const stories = state.storyItems;
  if (!stories.length) return;
  const idx = clamp(state.storyIndex, 0, stories.length - 1);
  state.storyIndex = idx;

  const item = stories[idx];
  const media = mediaFromPost(item);
  ui.storyModalTitle.textContent = `${item.authorName || 'Story'} | ${idx + 1}/${stories.length}`;
  ui.storyModalText.textContent = item.text || '-';

  if (!media) {
    ui.storyModalMediaWrap.innerHTML = '<div class="empty-state">Sin media</div>';
  } else if (isVideoUrl(media)) {
    ui.storyModalMediaWrap.innerHTML = `<video controls preload="metadata" src="${esc(media)}"></video>`;
  } else {
    ui.storyModalMediaWrap.innerHTML = `<img loading="lazy" src="${esc(media)}" alt="story" />`;
  }
}

function openStoryModal(index) {
  if (!ui.storyModal) return;
  state.storyIndex = clamp(Number(index || 0), 0, Math.max(0, state.storyItems.length - 1));
  renderStoryModal();
  ui.storyModal.hidden = false;
}

function closeStoryModal() {
  if (!ui.storyModal) return;
  ui.storyModal.hidden = true;
}

function nextStory(step = 1) {
  const len = state.storyItems.length;
  if (!len) return;
  state.storyIndex = (state.storyIndex + step + len) % len;
  renderStoryModal();
}

async function refreshAllData({ fullNetwork = false } = {}) {
  state.friendStatus = 'none';
  state.pendingRequests = [];

  state.followingSet = await loadFollowingSet(state.me.uid);

  const friendMeta = await loadFriendStatus(state.me.uid, state.targetUid);
  state.friendStatus = friendMeta.status;
  state.outgoingFriendId = friendMeta.outgoingId;
  state.incomingFriendId = friendMeta.incomingId;

  state.counts = await loadCounts(state.targetUid);

  await loadStreams();

  const [pending, notifications, conversations, saves] = await Promise.all([
    loadPendingRequests(),
    loadNotifications(),
    loadConversations(),
    loadSavedItems(),
  ]);

  state.pendingRequests = pending;
  state.notifications = notifications;
  state.conversations = conversations;
  state.savedItems = saves;

  if (fullNetwork) {
    const network = await loadNetworkLists();
    state.network = network;
  }

  renderAll();
}

async function handleFollow() {
  if (!state.me?.uid || state.targetUid === state.me.uid) return;
  const id = `${state.me.uid}__${state.targetUid}`;
  const isFollowing = state.followingSet.has(state.targetUid);

  try {
    if (isFollowing) {
      await deleteDoc(doc(db, 'user_follows', id));
      state.followingSet.delete(state.targetUid);
      setComposerMsg('Has dejado de seguir este perfil.');
    } else {
      await setDoc(doc(db, 'user_follows', id), {
        fromUid: state.me.uid,
        toUid: state.targetUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      state.followingSet.add(state.targetUid);
      setComposerMsg('Ahora sigues este perfil.');
    }

    state.counts = await loadCounts(state.targetUid);
    renderIdentity();
    renderMeters();
  } catch (err) {
    console.warn('follow failed', err);
    setComposerMsg('No se pudo actualizar follow.', true);
  }
}

async function handleFriendAction() {
  if (!state.me?.uid || state.targetUid === state.me.uid) return;

  try {
    if (state.friendStatus === 'none') {
      const id = `${state.me.uid}__${state.targetUid}`;
      await setDoc(doc(db, 'friend_requests', id), {
        fromUid: state.me.uid,
        toUid: state.targetUid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setComposerMsg('Solicitud enviada.');
    } else if (state.friendStatus === 'pending_out' && state.outgoingFriendId) {
      await updateDoc(doc(db, 'friend_requests', state.outgoingFriendId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      setComposerMsg('Solicitud cancelada.');
    } else if (state.friendStatus === 'pending_in' && state.incomingFriendId) {
      await updateDoc(doc(db, 'friend_requests', state.incomingFriendId), {
        status: 'accepted',
        updatedAt: serverTimestamp(),
      });
      setComposerMsg('Ahora son amigos.');
    } else {
      setComposerMsg('Ya son amigos.');
      return;
    }

    const meta = await loadFriendStatus(state.me.uid, state.targetUid);
    state.friendStatus = meta.status;
    state.outgoingFriendId = meta.outgoingId;
    state.incomingFriendId = meta.incomingId;
    state.counts = await loadCounts(state.targetUid);
    state.pendingRequests = await loadPendingRequests();
    state.network = await loadNetworkLists();
    renderAll();
  } catch (err) {
    console.warn('friend action failed', err);
    setComposerMsg('No se pudo actualizar amistad.', true);
  }
}

async function handleRequestAction(requestId, action) {
  if (!requestId) return;
  const nextStatus = action === 'accept' ? 'accepted' : 'declined';

  try {
    await updateDoc(doc(db, 'friend_requests', requestId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });

    state.pendingRequests = await loadPendingRequests();
    state.counts = await loadCounts(state.targetUid);
    state.network = await loadNetworkLists();
    renderAll();
    setComposerMsg(nextStatus === 'accepted' ? 'Solicitud aceptada.' : 'Solicitud ignorada.');
  } catch (err) {
    console.warn('request action failed', err);
    setComposerMsg('No se pudo actualizar solicitud.', true);
  }
}

async function followSuggestion(targetUid) {
  if (!targetUid || targetUid === state.me.uid) return;
  const id = `${state.me.uid}__${targetUid}`;

  try {
    await setDoc(doc(db, 'user_follows', id), {
      fromUid: state.me.uid,
      toUid: targetUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    state.followingSet.add(targetUid);
    state.network = await loadNetworkLists();
    renderNetwork();
    setComposerMsg('Siguiendo usuario sugerido.');
  } catch (err) {
    console.warn('suggest follow failed', err);
    setComposerMsg('No se pudo seguir sugerencia.', true);
  }
}

async function addSuggestionFriend(targetUid) {
  if (!targetUid || targetUid === state.me.uid) return;

  try {
    await setDoc(doc(db, 'friend_requests', `${state.me.uid}__${targetUid}`), {
      fromUid: state.me.uid,
      toUid: targetUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setComposerMsg('Solicitud enviada.');
  } catch (err) {
    console.warn('suggest friend failed', err);
    setComposerMsg('No se pudo enviar solicitud.', true);
  }
}

async function publishFromComposer() {
  if (!state.me?.uid) return;

  const mode = String(ui.composerMode?.value || 'post').trim().toLowerCase();
  const text = String(ui.composerText?.value || '').trim();
  const media = String(ui.composerMedia?.value || '').trim();
  const tags = extractTags(text, ui.composerTags?.value || '');

  const pollRaw = String(ui.composerPoll?.value || '').trim();
  const pollOptions = pollRaw
    ? pollRaw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const eventDate = String(ui.composerEventDate?.value || '').trim();
  const eventPlace = String(ui.composerEventPlace?.value || '').trim();

  if (!text && !media && mode !== 'event' && mode !== 'poll') {
    setComposerMsg('Escribe texto o media URL para publicar.', true);
    return;
  }

  if (mode === 'poll' && pollOptions.length < 2) {
    setComposerMsg('Poll necesita minimo 2 opciones.', true);
    return;
  }

  if (mode === 'event' && !eventDate) {
    setComposerMsg('Event necesita fecha.', true);
    return;
  }

  const typeMap = {
    post: 'user',
    story: 'story',
    reel: 'reel',
    poll: 'poll',
    event: 'event',
  };

  const post = {
    authorUid: state.me.uid,
    authorName: pickDisplayName(state.mePublic, state.me.displayName || state.me.email || 'Usuario'),
    authorHandle: String(state.mePublic?.handle || '').trim(),
    text,
    tags,
    type: typeMap[mode] || 'user',
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (media) {
    if (isVideoUrl(media)) post.videoURL = media;
    else post.imageURL = media;
  }

  if (mode === 'story') {
    post.story = true;
    post.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  if (mode === 'poll') {
    post.pollOptions = pollOptions;
  }

  if (mode === 'event') {
    post.eventDate = eventDate;
    post.eventPlace = eventPlace;
  }

  try {
    ui.btnComposerPublish.disabled = true;
    setComposerMsg('Publicando...');

    await addDoc(collection(db, 'user_feed', state.me.uid, 'posts'), post);

    if (ui.composerText) ui.composerText.value = '';
    if (ui.composerMedia) ui.composerMedia.value = '';
    if (ui.composerTags) ui.composerTags.value = '';
    if (ui.composerPoll) ui.composerPoll.value = '';
    if (ui.composerEventDate) ui.composerEventDate.value = '';
    if (ui.composerEventPlace) ui.composerEventPlace.value = '';

    setComposerMsg('Publicado.');

    await refreshAllData({ fullNetwork: false });
  } catch (err) {
    console.warn('publish failed', err);
    setComposerMsg('No se pudo publicar.', true);
  } finally {
    ui.btnComposerPublish.disabled = false;
    updateComposerModeUI();
  }
}

function updateComposerModeUI() {
  const mode = String(ui.composerMode?.value || 'post').trim().toLowerCase();

  const pollOn = mode === 'poll';
  const eventOn = mode === 'event';

  if (ui.composerExtraPoll) ui.composerExtraPoll.style.display = pollOn ? '' : 'none';
  if (ui.composerExtraEventDate) ui.composerExtraEventDate.style.display = eventOn ? '' : 'none';
  if (ui.composerExtraEventPlace) ui.composerExtraEventPlace.style.display = eventOn ? '' : 'none';

  if (ui.composerText) {
    if (mode === 'story') ui.composerText.placeholder = 'Story corta...';
    else if (mode === 'reel') ui.composerText.placeholder = 'Caption reel...';
    else if (mode === 'poll') ui.composerText.placeholder = 'Pregunta poll...';
    else if (mode === 'event') ui.composerText.placeholder = 'Info del evento...';
    else ui.composerText.placeholder = 'Comparte algo...';
  }
}

function clearComposer() {
  if (ui.composerText) ui.composerText.value = '';
  if (ui.composerMedia) ui.composerMedia.value = '';
  if (ui.composerTags) ui.composerTags.value = '';
  if (ui.composerPoll) ui.composerPoll.value = '';
  if (ui.composerEventDate) ui.composerEventDate.value = '';
  if (ui.composerEventPlace) ui.composerEventPlace.value = '';
  setComposerMsg('');
}
function bindStaticEvents() {
  document.addEventListener('click', async (event) => {
    const portalBtn = event.target.closest('[data-portal-target]');
    if (portalBtn) {
      const target = String(portalBtn.getAttribute('data-portal-target') || '').trim();
      if (target) setActivePortal(target);
    }

    const feedBtn = event.target.closest('[data-feed-source]');
    if (feedBtn) {
      const source = String(feedBtn.getAttribute('data-feed-source') || '').trim();
      if (source) setFeedSource(source);
    }

    const storyBtn = event.target.closest('[data-story-open]');
    if (storyBtn) {
      const idx = Number(storyBtn.getAttribute('data-story-open') || 0);
      openStoryModal(idx);
    }

    const closeStory = event.target.closest('[data-story-close]');
    if (closeStory) closeStoryModal();

    const postAction = event.target.closest('[data-post-action]');
    if (postAction) {
      const action = String(postAction.getAttribute('data-post-action') || '').trim();
      const ownerUid = String(postAction.getAttribute('data-owner') || '').trim();
      const postId = String(postAction.getAttribute('data-post') || '').trim();

      if (action === 'react') {
        const reactionType = String(postAction.getAttribute('data-reaction') || 'like').trim();
        await toggleReaction(ownerUid, postId, reactionType);
      }

      if (action === 'comments') {
        await toggleComments(ownerUid, postId);
      }

      if (action === 'comment-send') {
        await sendComment(ownerUid, postId, postAction);
      }

      if (action === 'save') {
        await savePost(ownerUid, postId);
      }

      if (action === 'share') {
        await sharePost(ownerUid, postId);
      }

      if (action === 'open-profile' && ownerUid) {
        location.href = `perfil-fusion.html?uid=${encodeURIComponent(ownerUid)}`;
      }
    }

    const requestBtn = event.target.closest('[data-request-action]');
    if (requestBtn) {
      const id = String(requestBtn.getAttribute('data-request-id') || '').trim();
      const action = String(requestBtn.getAttribute('data-request-action') || '').trim();
      await handleRequestAction(id, action);
    }

    const followSuggest = event.target.closest('[data-suggest-follow]');
    if (followSuggest) {
      const uid = String(followSuggest.getAttribute('data-suggest-follow') || '').trim();
      await followSuggestion(uid);
    }

    const friendSuggest = event.target.closest('[data-suggest-friend]');
    if (friendSuggest) {
      const uid = String(friendSuggest.getAttribute('data-suggest-friend') || '').trim();
      await addSuggestionFriend(uid);
    }

    const tagSearch = event.target.closest('[data-tag-search]');
    if (tagSearch) {
      const tag = String(tagSearch.getAttribute('data-tag-search') || '').trim();
      setActivePortal('feed');
      setFeedSource('discover');
      state.feedSearch = `#${tag}`;
      if (ui.feedSearchInput) ui.feedSearchInput.value = state.feedSearch;
      renderFeed();
    }
  });

  ui.btnFollow?.addEventListener('click', () => handleFollow());
  ui.btnFriend?.addEventListener('click', () => handleFriendAction());
  ui.btnShare?.addEventListener('click', async () => {
    const targetLink = `${location.origin}/perfil-fusion.html?uid=${encodeURIComponent(state.targetUid)}`;
    try {
      await navigator.clipboard.writeText(targetLink);
      setComposerMsg('Link de perfil copiado.');
    } catch {
      setComposerMsg(targetLink);
    }
  });

  ui.composerMode?.addEventListener('change', updateComposerModeUI);
  ui.btnComposerPublish?.addEventListener('click', () => publishFromComposer());
  ui.btnComposerClear?.addEventListener('click', () => clearComposer());
  ui.btnComposerToggle?.addEventListener('click', () => {
    const collapsed = String(ui.fusionComposer?.dataset.collapsed || '0') === '1';
    setComposerCollapsed(!collapsed);
    if (collapsed) ui.composerText?.focus();
  });

  ui.feedSearchInput?.addEventListener('input', () => {
    state.feedSearch = String(ui.feedSearchInput.value || '').trim();
    renderFeed();
  });

  ui.btnFeedReset?.addEventListener('click', () => {
    state.feedSearch = '';
    if (ui.feedSearchInput) ui.feedSearchInput.value = '';
    setFeedSource(DEFAULT_FEED_SOURCE);
  });

  ui.btnReelPrev?.addEventListener('click', () => {
    if (!state.reelItems.length) return;
    state.reelIndex = (state.reelIndex - 1 + state.reelItems.length) % state.reelItems.length;
    renderReelStage();
  });

  ui.btnReelNext?.addEventListener('click', () => {
    if (!state.reelItems.length) return;
    state.reelIndex = (state.reelIndex + 1) % state.reelItems.length;
    renderReelStage();
  });

  let reelWheelLock = false;
  ui.reelStage?.addEventListener(
    'wheel',
    (event) => {
      if (state.activePortal !== 'reels') return;
      event.preventDefault();
      if (reelWheelLock) return;
      reelWheelLock = true;
      if (event.deltaY > 0) ui.btnReelNext?.click();
      else if (event.deltaY < 0) ui.btnReelPrev?.click();
      window.setTimeout(() => {
        reelWheelLock = false;
      }, 260);
    },
    { passive: false },
  );

  let reelTouchY = 0;
  ui.reelStage?.addEventListener('touchstart', (event) => {
    if (!event.touches?.length) return;
    reelTouchY = Number(event.touches[0].clientY || 0);
  });
  ui.reelStage?.addEventListener('touchend', (event) => {
    const endY = Number(event.changedTouches?.[0]?.clientY || reelTouchY);
    const delta = reelTouchY - endY;
    if (Math.abs(delta) < 48) return;
    if (state.activePortal !== 'reels') return;
    if (delta > 0) ui.btnReelNext?.click();
    else ui.btnReelPrev?.click();
  });

  ui.reelStage?.addEventListener('dblclick', async () => {
    if (state.activePortal !== 'reels') return;
    const post = state.reelItems[state.reelIndex];
    if (!post) return;
    await toggleReaction(post.ownerUid, post.id, 'fire');
  });

  ui.storyCloseBtn?.addEventListener('click', () => closeStoryModal());
  ui.storyPrevBtn?.addEventListener('click', () => nextStory(-1));
  ui.storyNextBtn?.addEventListener('click', () => nextStory(1));

  ui.shortcutComposer?.addEventListener('click', () => {
    setActivePortal('feed');
    setComposerCollapsed(false);
    ui.composerText?.focus();
  });

  ui.btnBottomCreate?.addEventListener('click', () => {
    setActivePortal('feed');
    setComposerCollapsed(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    ui.composerText?.focus();
  });

  ui.btnBottomProfile?.addEventListener('click', () => {
    setActivePortal('feed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = String(event.key || '').toLowerCase();
    const active = document.activeElement;
    const typing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      String(active?.getAttribute?.('contenteditable') || '').toLowerCase() === 'true';

    if (key === 'escape') closeStoryModal();

    if (typing) return;

    if (key === '/') {
      event.preventDefault();
      setActivePortal('feed');
      ui.feedSearchInput?.focus();
      ui.feedSearchInput?.select();
      return;
    }

    if (key === 'c') {
      event.preventDefault();
      setActivePortal('feed');
      setComposerCollapsed(false);
      ui.composerText?.focus();
      return;
    }

    if (key === '1') setActivePortal('feed');
    if (key === '2') setActivePortal('reels');
    if (key === '3') setActivePortal('stories');
    if (key === '4') setActivePortal('network');
    if (key === '5') setActivePortal('pulse');

    if (key === 'arrowdown' && state.activePortal === 'reels') {
      event.preventDefault();
      ui.btnReelNext?.click();
    }
    if (key === 'arrowup' && state.activePortal === 'reels') {
      event.preventDefault();
      ui.btnReelPrev?.click();
    }
  });
}

async function bootstrap(user) {
  state.me = user;
  state.targetUid = await resolveTargetUid(user);
  if (!state.targetUid) state.targetUid = user.uid;

  const [mePublic, targetPublic, myUserDoc] = await Promise.all([
    getPublicUser(user.uid),
    getPublicUser(state.targetUid),
    loadMyUserDoc(user.uid),
  ]);

  state.mePublic = mePublic;
  state.targetPublic = targetPublic || mePublic;
  state.meUserDoc = myUserDoc;

  await refreshAllData({ fullNetwork: true });

  setComposerCollapsed(true);
  setFeedSource(DEFAULT_FEED_SOURCE);

  const postFromUrl = String(qs.get('post') || '').trim();
  if (postFromUrl) {
    setActivePortal('feed');
    state.feedSearch = postFromUrl;
    if (ui.feedSearchInput) ui.feedSearchInput.value = postFromUrl;
    renderFeed();
  }

  const portalFromUrl = String(qs.get('portal') || '').trim().toLowerCase();
  if (portalFromUrl) setActivePortal(portalFromUrl);
  else if (postFromUrl) setActivePortal('feed');
  else setActivePortal(DEFAULT_PORTAL);
}

bindStaticEvents();
updateComposerModeUI();
setComposerCollapsed(true);
setActivePortal(DEFAULT_PORTAL);
setFeedSource(DEFAULT_FEED_SOURCE);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    location.href = `login.html?next=${encodeURIComponent(next)}`;
    return;
  }

  try {
    await bootstrap(user);
  } catch (err) {
    console.error('[perfil-fusion] bootstrap failed', err);
    setComposerMsg('Error cargando perfil fusion.', true);
  }
});
