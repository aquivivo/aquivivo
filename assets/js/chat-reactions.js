const MINI_CHAT_REACTION_EMOJIS = [
  '\u{1F44D}',
  '\u{2764}\u{FE0F}',
  '\u{1F602}',
  '\u{1F62E}',
  '\u{1F622}',
];

export function createMiniChatReactionController({
  db,
  collection,
  onSnapshot,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  getCurrentUid,
  esc,
  fmtTime,
  messageContentHtml,
  reactionCollection = 'neuChatReactions',
  documentRef = document,
  windowRef = window,
}) {
  let reactionOutsideClickWired = false;

  function selectorEscape(value) {
    const raw = String(value || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(raw);
    }
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function runSafeUnsubscribe(unsub) {
    if (typeof unsub !== 'function') return;
    try {
      unsub();
    } catch {
      // ignore unsubscribe failures
    }
  }

  function clearReactionListeners(unsubMap, dataMap) {
    if (unsubMap instanceof Map) {
      unsubMap.forEach((unsub) => runSafeUnsubscribe(unsub));
      unsubMap.clear();
    }
    if (dataMap instanceof Map) dataMap.clear();
  }

  function summarizeReactions(snapshot) {
    const counts = new Map();
    let myEmoji = '';
    const currentUid = String(getCurrentUid() || '').trim();

    (snapshot?.docs || []).forEach((docSnap) => {
      const data = docSnap.data() || {};
      const emoji = String(data.emoji || '').trim();
      const uid = String(data.uid || docSnap.id || '').trim();
      if (!emoji || !uid) return;
      counts.set(emoji, Number(counts.get(emoji) || 0) + 1);
      if (uid === currentUid) myEmoji = emoji;
    });

    const pills = [];
    MINI_CHAT_REACTION_EMOJIS.forEach((emoji) => {
      const count = Number(counts.get(emoji) || 0);
      if (count > 0) pills.push({ emoji, count });
      counts.delete(emoji);
    });
    counts.forEach((count, emoji) => {
      if (count > 0) pills.push({ emoji, count });
    });

    return { myEmoji, pills };
  }

  function reactionPillClassName(summary, emoji, {
    animated = false,
    removing = false,
  } = {}) {
    const myEmoji = String(summary?.myEmoji || '').trim();
    const classes = ['mini-chat-v4-reaction-pill'];
    if (myEmoji && myEmoji === emoji) classes.push('active-reaction');
    if (animated) classes.push('mini-chat-reaction-animated');
    if (removing) classes.push('mini-chat-reaction-remove');
    return classes.join(' ');
  }

  function diffReactionSummary(previousSummary, nextSummary) {
    const previousPills = new Map(
      (Array.isArray(previousSummary?.pills) ? previousSummary.pills : [])
        .map((item) => [String(item?.emoji || '').trim(), Number(item?.count || 0)]),
    );
    const nextPills = new Map(
      (Array.isArray(nextSummary?.pills) ? nextSummary.pills : [])
        .map((item) => [String(item?.emoji || '').trim(), Number(item?.count || 0)]),
    );

    const added = new Set();
    const updated = new Set();
    const removed = new Set();
    const emojis = new Set([...previousPills.keys(), ...nextPills.keys()]);

    emojis.forEach((emoji) => {
      const prevCount = Number(previousPills.get(emoji) || 0);
      const nextCount = Number(nextPills.get(emoji) || 0);
      if (!prevCount && nextCount > 0) {
        added.add(emoji);
        return;
      }
      if (prevCount > 0 && !nextCount) {
        removed.add(emoji);
        return;
      }
      if (prevCount !== nextCount) {
        updated.add(emoji);
      }
    });

    return { added, updated, removed };
  }

  function reactionPillsHtml(summary) {
    const pills = Array.isArray(summary?.pills) ? summary.pills : [];
    if (!pills.length) return '';
    const animated = summary?.animated instanceof Set ? summary.animated : new Set();
    return pills
      .map((item) => {
        const emoji = String(item?.emoji || '').trim();
        const count = Number(item?.count || 0);
        if (!emoji || count <= 0) return '';
        return `<button class="${reactionPillClassName(summary, emoji, {
          animated: animated.has(emoji),
        })}" type="button" data-reaction-emoji="${esc(emoji)}">${esc(emoji)} ${esc(count)}</button>`;
      })
      .join('');
  }

  function reactionPickerHtml(summary) {
    const myEmoji = String(summary?.myEmoji || '').trim();
    return MINI_CHAT_REACTION_EMOJIS.map((emoji) => {
      const active = myEmoji && myEmoji === emoji ? ' active-reaction' : '';
      return `<button class="mini-chat-v4-reaction-option${active}" type="button" data-reaction-pick="${esc(emoji)}" aria-label="Reaccionar ${esc(emoji)}">${esc(emoji)}</button>`;
    }).join('');
  }

  function animateReactionAppearance(element) {
    if (!(element instanceof HTMLElement)) return;
    element.classList.remove('mini-chat-reaction-animated');
    void element.offsetWidth;
    element.classList.add('mini-chat-reaction-animated');
    element.addEventListener(
      'animationend',
      () => {
        element.classList.remove('mini-chat-reaction-animated');
      },
      { once: true },
    );
  }

  function animateReactionRemoval(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.classList.contains('mini-chat-reaction-remove')) return;
    element.classList.add('mini-chat-reaction-remove');
    element.addEventListener(
      'animationend',
      () => {
        element.remove();
      },
      { once: true },
    );
  }

  function patchReactionPills(container, summary, diff) {
    if (!(container instanceof HTMLElement)) return;
    const pills = Array.isArray(summary?.pills) ? summary.pills : [];
    const existingButtons = new Map();
    container
      .querySelectorAll('.mini-chat-v4-reaction-pill[data-reaction-emoji]')
      .forEach((node) => {
        if (!(node instanceof HTMLButtonElement)) return;
        existingButtons.set(String(node.dataset.reactionEmoji || '').trim(), node);
      });

    pills.forEach((item) => {
      const emoji = String(item?.emoji || '').trim();
      const count = Number(item?.count || 0);
      if (!emoji || count <= 0) return;

      let button = existingButtons.get(emoji) || null;
      if (!(button instanceof HTMLButtonElement)) {
        button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.reactionEmoji = emoji;
      } else {
        existingButtons.delete(emoji);
      }

      button.className = reactionPillClassName(summary, emoji);
      button.textContent = `${emoji} ${count}`;
      container.appendChild(button);

      if (diff.added.has(emoji) || diff.updated.has(emoji)) {
        animateReactionAppearance(button);
      }
    });

    existingButtons.forEach((button, emoji) => {
      if (!diff.removed.has(emoji)) {
        button.className = reactionPillClassName(summary, emoji);
        return;
      }
      animateReactionRemoval(button);
    });
  }

  function patchReactionPicker(container, summary) {
    if (!(container instanceof HTMLElement)) return;
    const nextHtml = reactionPickerHtml(summary);
    if (container.innerHTML === nextHtml) return;
    container.innerHTML = nextHtml;
  }

  function applyReactionSummaryToDom(conversationId, messageId, summary, diff) {
    const convId = String(conversationId || '').trim();
    const msgId = String(messageId || '').trim();
    if (!convId || !msgId) return false;

    const rows = documentRef.querySelectorAll(
      `.mini-chat-v4-message-row[data-conv-id="${selectorEscape(convId)}"][data-msg-id="${selectorEscape(msgId)}"]`,
    );
    if (!rows.length) return false;

    rows.forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      patchReactionPills(row.querySelector('.mini-chat-v4-reactions'), summary, diff);
      patchReactionPicker(row.querySelector('.mini-chat-v4-reaction-picker'), summary);
    });
    return true;
  }

  function messageHtml(message, conversationId, reactionData = new Map()) {
    const currentUid = String(getCurrentUid() || '').trim();
    const mine = String(message?.senderId || '').trim() === currentUid;
    const bubbleClass = mine
      ? 'mini-chat-v4-bubble mini-chat-v4-bubble--me'
      : 'mini-chat-v4-bubble mini-chat-v4-bubble--other';
    const rowClass = mine
      ? 'mini-chat-v4-message-row is-me'
      : 'mini-chat-v4-message-row is-other';
    const msgId = String(message?.id || '').trim();
    const convId = String(conversationId || '').trim();
    const summary = reactionData instanceof Map ? reactionData.get(msgId) : null;
    const reactionsHtml = reactionPillsHtml(summary);
    const pickerHtml = reactionPickerHtml(summary);
    const contentHtml = messageContentHtml(message);

    return `
      <div class="${rowClass}" data-conv-id="${esc(convId)}" data-msg-id="${esc(msgId)}">
        <article class="${bubbleClass}">
          ${contentHtml}
          <div class="mini-chat-v4-bubble-meta">${esc(fmtTime(message?.createdAt))}</div>
        </article>
        <div class="mini-chat-v4-reactions">${reactionsHtml}</div>
        <div class="mini-chat-v4-reaction-picker">${pickerHtml}</div>
      </div>
    `;
  }

  function closeAllReactionPickers(exceptRow = null) {
    documentRef
      .querySelectorAll('.mini-chat-v4-message-row.is-picker-open')
      .forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (exceptRow instanceof HTMLElement && node === exceptRow) return;
        node.classList.remove('is-picker-open');
      });
  }

  function wireReactionOutsideClick() {
    if (reactionOutsideClickWired) return;
    reactionOutsideClickWired = true;

    documentRef.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        closeAllReactionPickers();
        return;
      }
      if (
        target.closest('.mini-chat-v4-reaction-picker') ||
        target.closest('.mini-chat-v4-bubble') ||
        target.closest('.mini-chat-v4-reaction-pill')
      ) {
        return;
      }
      closeAllReactionPickers();
    });
  }

  function wireReactionInteractions(container) {
    if (!(container instanceof HTMLElement)) return;
    if (container.dataset.reactionWired === '1') return;
    container.dataset.reactionWired = '1';

    container.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.mini-chat-v4-file')) return;

      const pickerBtn = target.closest('[data-reaction-pick]');
      if (pickerBtn instanceof HTMLElement) {
        const row = pickerBtn.closest('.mini-chat-v4-message-row');
        if (!(row instanceof HTMLElement) || !container.contains(row)) return;
        const convId = String(row.dataset.convId || '').trim();
        const msgId = String(row.dataset.msgId || '').trim();
        const emoji = String(pickerBtn.getAttribute('data-reaction-pick') || '').trim();
        if (!convId || !msgId || !emoji) return;
        event.preventDefault();
        event.stopPropagation();
        toggleReaction(convId, msgId, emoji).catch((error) => {
          console.warn('[mini-chat-v4] toggle reaction failed', error);
        });
        row.classList.remove('is-picker-open');
        return;
      }

      const reactionPill = target.closest('.mini-chat-v4-reaction-pill[data-reaction-emoji]');
      if (reactionPill instanceof HTMLElement) {
        const row = reactionPill.closest('.mini-chat-v4-message-row');
        if (!(row instanceof HTMLElement) || !container.contains(row)) return;
        const convId = String(row.dataset.convId || '').trim();
        const msgId = String(row.dataset.msgId || '').trim();
        const emoji = String(reactionPill.getAttribute('data-reaction-emoji') || '').trim();
        if (!convId || !msgId || !emoji) return;
        event.preventDefault();
        event.stopPropagation();
        toggleReaction(convId, msgId, emoji).catch((error) => {
          console.warn('[mini-chat-v4] toggle reaction failed', error);
        });
        return;
      }

      const bubble = target.closest('.mini-chat-v4-bubble');
      if (!(bubble instanceof HTMLElement)) return;
      const row = bubble.closest('.mini-chat-v4-message-row');
      if (!(row instanceof HTMLElement) || !container.contains(row)) return;
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !row.classList.contains('is-picker-open');
      closeAllReactionPickers();
      if (willOpen) row.classList.add('is-picker-open');
    });
  }

  function syncReactionListeners({
    conversationId,
    rows = [],
    reactionUnsubs = new Map(),
    reactionData = new Map(),
    onChange = () => {},
  } = {}) {
    const convId = String(conversationId || '').trim();
    if (!convId) {
      clearReactionListeners(reactionUnsubs, reactionData);
      return;
    }

    const messageIds = new Set(
      rows
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean),
    );

    reactionUnsubs.forEach((unsub, msgId) => {
      if (messageIds.has(msgId)) return;
      runSafeUnsubscribe(unsub);
      reactionUnsubs.delete(msgId);
      reactionData.delete(msgId);
    });

    messageIds.forEach((msgId) => {
      if (reactionUnsubs.has(msgId)) return;
      const reactionsCol = collection(
        db,
        reactionCollection,
        convId,
        'messages',
        msgId,
        'reactions',
      );
      const unsub = onSnapshot(
        reactionsCol,
        (snapshot) => {
          const previousSummary = reactionData.get(msgId) || null;
          const nextSummary = summarizeReactions(snapshot);
          reactionData.set(msgId, nextSummary);
          const diff = diffReactionSummary(previousSummary, nextSummary);
          const patched = applyReactionSummaryToDom(convId, msgId, nextSummary, diff);
          if (!patched) onChange();
        },
        () => {
          const previousSummary = reactionData.get(msgId) || null;
          reactionData.delete(msgId);
          const patched = applyReactionSummaryToDom(
            convId,
            msgId,
            { myEmoji: '', pills: [] },
            diffReactionSummary(previousSummary, { myEmoji: '', pills: [] }),
          );
          if (!patched) onChange();
        },
      );
      reactionUnsubs.set(msgId, unsub);
    });
  }

  async function toggleReaction(conversationId, messageId, emoji) {
    const convId = String(conversationId || '').trim();
    const msgId = String(messageId || '').trim();
    const safeEmoji = String(emoji || '').trim();
    const currentUid = String(getCurrentUid() || '').trim();
    if (!convId || !msgId || !safeEmoji || !currentUid) return;

    const reactionRef = doc(
      db,
      reactionCollection,
      convId,
      'messages',
      msgId,
      'reactions',
      currentUid,
    );

    const snapshot = await getDoc(reactionRef);
    const existingEmoji = String(snapshot.data()?.emoji || '').trim();
    if (snapshot.exists() && existingEmoji === safeEmoji) {
      await deleteDoc(reactionRef);
      return;
    }

    await setDoc(reactionRef, {
      uid: currentUid,
      emoji: safeEmoji,
      createdAt: serverTimestamp(),
    });
  }

  return {
    clearReactionListeners,
    messageHtml,
    runSafeUnsubscribe,
    syncReactionListeners,
    toggleReaction,
    wireReactionInteractions,
    wireReactionOutsideClick,
  };
}
