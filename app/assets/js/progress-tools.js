import { db } from './firebase-init.js';
import {
  arrayUnion,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

const CHECKPOINT_SIZE = 3;

function clean(value) {
  return String(value || '').trim();
}

function normalizeClaimKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function todayIso() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function checkpointDocIds(blockNo, routeMeta = {}) {
  const block = Math.max(1, Number(blockNo || 1));
  const track = clean(routeMeta.track).toLowerCase();
  const view = clean(routeMeta.view).toLowerCase();
  const flow = clean(routeMeta.flow).toLowerCase();
  const parts = [track, view, flow].filter(Boolean);
  const specific = parts.length ? `${block}__${parts.join('__')}` : `${block}`;
  const ids = [specific, `${block}`];
  return Array.from(new Set(ids));
}

export function checkpointBlockRange(blockNo) {
  const block = Math.max(1, Number(blockNo || 1));
  const start = (block - 1) * CHECKPOINT_SIZE;
  const end = start + CHECKPOINT_SIZE - 1;
  return { start, end };
}

export function requiredCheckpointCountForRouteIndex(routeIndex) {
  const idx = Number(routeIndex);
  if (!Number.isFinite(idx) || idx < 0) return 0;
  return Math.floor((idx + 1) / CHECKPOINT_SIZE);
}

export async function hasCheckpoint(uid, blockNo, routeMeta = {}) {
  const userId = clean(uid);
  if (!userId) return false;

  const ids = checkpointDocIds(blockNo, routeMeta);
  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db, 'user_progress', userId, 'checkpoints', id));
      if (!snap.exists()) continue;
      const data = snap.data() || {};
      if (data.passed === true || data.completed === true) return true;
      const score = Number(data.scorePct || 0);
      if (Number.isFinite(score) && score >= 80) return true;
    } catch {
      // ignore and try next id
    }
  }

  return false;
}

export async function writeCheckpoint(uid, blockNo, result = {}, routeMeta = {}) {
  const userId = clean(uid);
  const block = Math.max(1, Number(blockNo || 1));
  if (!userId) throw new Error('Missing uid');

  const ids = checkpointDocIds(block, routeMeta);
  const targetId = ids[0];
  const passed = result?.passed === true;

  const payload = {
    block,
    passed,
    completed: passed,
    scorePct: Number(result?.scorePct || 0),
    answered: Number(result?.answered || 0),
    correct: Number(result?.correct || 0),
    level: clean(result?.level),
    lastTopicId: clean(result?.lastTopicId),
    track: clean(routeMeta?.track).toLowerCase(),
    view: clean(routeMeta?.view).toLowerCase(),
    flow: clean(routeMeta?.flow).toLowerCase(),
    updatedAt: serverTimestamp(),
  };

  if (passed) payload.completedAt = serverTimestamp();

  await setDoc(doc(db, 'user_progress', userId, 'checkpoints', targetId), payload, {
    merge: true,
  });

  // Keep backward-compat generic checkpoint id as well.
  if (targetId !== String(block)) {
    await setDoc(
      doc(db, 'user_progress', userId, 'checkpoints', String(block)),
      payload,
      { merge: true },
    );
  }

  return { id: targetId, ...payload };
}

export async function applyLearningReward(uid, options = {}) {
  const userId = clean(uid);
  if (!userId) return { applied: false, reason: 'missing_uid' };

  const exp = Math.max(0, Number(options?.exp || 0));
  const badges = (Array.isArray(options?.badges) ? options.badges : [])
    .map((v) => clean(v))
    .filter(Boolean);
  const oncePerDayKey = normalizeClaimKey(options?.oncePerDayKey);
  const onceEverKey = normalizeClaimKey(options?.onceEverKey);
  const source = clean(options?.source);

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const current = snap.exists() ? snap.data() || {} : {};
  const claims = current.rewardClaims || {};
  const day = todayIso();

  if (onceEverKey && claims[`ever_${onceEverKey}`] === true) {
    return { applied: false, reason: 'once_ever' };
  }
  if (oncePerDayKey && claims[`day_${oncePerDayKey}`] === day) {
    return { applied: false, reason: 'once_per_day' };
  }

  const patch = {
    updatedAt: serverTimestamp(),
  };

  if (exp > 0) patch.exp = increment(exp);
  if (badges.length) patch.badges = arrayUnion(...badges);
  if (source) patch.lastRewardSource = source;
  if (onceEverKey) patch[`rewardClaims.ever_${onceEverKey}`] = true;
  if (oncePerDayKey) patch[`rewardClaims.day_${oncePerDayKey}`] = day;

  try {
    await updateDoc(userRef, patch);
  } catch {
    await setDoc(userRef, patch, { merge: true });
  }

  return { applied: true, expGranted: exp, badgesGranted: badges };
}

