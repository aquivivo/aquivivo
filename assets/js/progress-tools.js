import { db } from './firebase-init.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function safeNum(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function normalizeDayKey(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return '';
  const m = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseDayKey(raw) {
  const txt = normalizeDayKey(raw);
  if (!txt) return null;
  const [y, m, d] = txt.split('-').map((v) => Number(v));
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dayDiff(left, right) {
  const a = parseDayKey(left);
  const b = parseDayKey(right);
  if (!a || !b) return 0;
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bMid - aMid) / DAY_MS);
}

function normalizeBadge(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

function sanitizeRoutePart(raw, fallback) {
  const out = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return out || fallback;
}

export function localDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function checkpointRouteKey({ track = '', view = '', flow = 'continuous' } = {}) {
  const flowKey = sanitizeRoutePart(flow || 'continuous', 'continuous');
  const viewKey = sanitizeRoutePart(view || 'default', 'default');
  const trackKey = sanitizeRoutePart(track || 'global', 'global');
  return `${flowKey}__${viewKey}__${trackKey}`;
}

export function checkpointDocId(blockNumber, routeOpts = {}) {
  const block = Math.max(1, Math.floor(safeNum(blockNumber, 1)));
  return `CHECKPOINT__${checkpointRouteKey(routeOpts)}__${block}`;
}

export function requiredCheckpointCountForRouteIndex(routeIndex) {
  const idx = Math.max(0, Math.floor(safeNum(routeIndex, 0)));
  return Math.max(0, Math.floor(idx / 3));
}

export function checkpointBlockRange(blockNumber) {
  const block = Math.max(1, Math.floor(safeNum(blockNumber, 1)));
  const start = (block - 1) * 3;
  const end = start + 2;
  return { block, start, end };
}

export async function readCheckpoint(uid, blockNumber, routeOpts = {}) {
  const userId = String(uid || '').trim();
  const block = Math.max(1, Math.floor(safeNum(blockNumber, 1)));
  if (!userId || !block) return null;
  try {
    const ref = doc(db, 'user_progress', userId, 'topics', checkpointDocId(block, routeOpts));
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() || {} : null;
  } catch (e) {
    console.warn('[progress-tools] readCheckpoint failed', e);
    return null;
  }
}

export async function hasCheckpoint(uid, blockNumber, routeOpts = {}) {
  const data = await readCheckpoint(uid, blockNumber, routeOpts);
  return data?.passed === true;
}

export async function writeCheckpoint(uid, blockNumber, payload = {}, routeOpts = {}) {
  const userId = String(uid || '').trim();
  const block = Math.max(1, Math.floor(safeNum(blockNumber, 1)));
  if (!userId || !block) return;
  const routeKey = checkpointRouteKey(routeOpts);
  const ref = doc(db, 'user_progress', userId, 'topics', checkpointDocId(block, routeOpts));
  await setDoc(
    ref,
    {
      kind: 'checkpoint',
      routeKey,
      block,
      passed: payload?.passed === true,
      scorePct: safeNum(payload?.scorePct, 0),
      answered: safeNum(payload?.answered, 0),
      correct: safeNum(payload?.correct, 0),
      level: String(payload?.level || '').toUpperCase() || null,
      lastTopicId: payload?.lastTopicId || null,
      updatedAt: serverTimestamp(),
      completedAt: payload?.passed === true ? serverTimestamp() : null,
    },
    { merge: true },
  );
}

export async function applyLearningReward(
  uid,
  { exp = 0, badges = [], oncePerDayKey = '', onceEverKey = '', source = '' } = {},
) {
  const userId = String(uid || '').trim();
  if (!userId) return null;

  const ref = doc(db, 'public_users', userId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() || {} : {};
  const today = localDayKey(new Date());
  const prevDay = normalizeDayKey(prev.lastStudyDate || prev.lastStudyDay || '');

  const logSet = new Set(cleanList(prev.studyLog).map(normalizeDayKey).filter(Boolean));
  const isNewDay = prevDay !== today;

  let streak = safeNum(prev.streakDays ?? prev.streak, 0);
  let studyDays = safeNum(prev.studyDays ?? prev.daysLearned, 0);

  if (isNewDay) {
    const diff = prevDay ? dayDiff(prevDay, today) : 0;
    streak = diff === 1 ? Math.max(1, streak + 1) : 1;
    studyDays += 1;
    logSet.add(today);
  }

  const rewardDaily = isObj(prev.dailyAwards) ? { ...prev.dailyAwards } : {};
  const rewardKeys = isObj(prev.rewardKeys) ? { ...prev.rewardKeys } : {};

  const dayKey = sanitizeRoutePart(oncePerDayKey, '');
  const everKey = sanitizeRoutePart(onceEverKey, '');

  let allowAward = true;
  if (dayKey && String(rewardDaily[dayKey] || '') === today) allowAward = false;
  if (everKey && rewardKeys[everKey] === true) allowAward = false;

  if (dayKey && allowAward) rewardDaily[dayKey] = today;
  if (everKey && allowAward) rewardKeys[everKey] = true;

  const baseExp = safeNum(prev.exp, 0);
  const expGain = allowAward ? Math.max(0, Math.floor(safeNum(exp, 0))) : 0;
  const expTotal = baseExp + expGain;

  const badgeSet = new Set(cleanList(prev.badges).map(normalizeBadge).filter(Boolean));
  if (allowAward) {
    cleanList(badges).forEach((b) => {
      const key = normalizeBadge(b);
      if (key) badgeSet.add(key);
    });
  }
  if (streak >= 3) badgeSet.add('streak_3');
  if (streak >= 7) badgeSet.add('streak_7');
  if (streak >= 30) badgeSet.add('streak_30');

  const studyLog = Array.from(logSet).sort();
  const recent = studyLog.filter((d) => {
    const diff = dayDiff(d, today);
    return diff >= 0 && diff <= 13;
  }).length;
  const consistencyPct = clamp(Math.round((recent / 14) * 100), 0, 100);

  await setDoc(
    ref,
    {
      exp: expTotal,
      streakDays: streak,
      streak,
      studyDays,
      daysLearned: studyDays,
      consistencyPct,
      lastStudyDate: today,
      lastStudyDay: today,
      studyLog: studyLog.slice(-90),
      badges: Array.from(badgeSet),
      dailyAwards: rewardDaily,
      rewardKeys,
      lastRewardSource: String(source || '').trim() || null,
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    expGain,
    expTotal,
    streak,
    studyDays,
    consistencyPct,
    awarded: allowAward,
  };
}

