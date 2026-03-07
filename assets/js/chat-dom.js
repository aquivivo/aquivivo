const EMPTY_CONVERSATIONS_HTML = '<div class="mini-chat-v4-empty">Sin conversaciones.</div>';
const EMPTY_MESSAGES_HTML = '<div class="mini-chat-v4-empty">Sin mensajes.</div>';

function defaultNorm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function maybeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.toMillis === 'function') {
    const parsed = new Date(value.toMillis());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  const seconds = Number(value?.seconds ?? value?._seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
    const parsed = new Date(seconds * 1000 + Math.floor((Number.isFinite(nanoseconds) ? nanoseconds : 0) / 1e6));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{10}$/.test(trimmed)) {
      const parsed = new Date(Number(trimmed) * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (/^\d{12,}$/.test(trimmed)) {
      const parsed = new Date(Number(trimmed));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function fmtTime(value) {
  const date = maybeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function initials(value) {
  const text = String(value || '').trim();
  if (!text) return 'AV';
  const parts = text.split(/\s+/).slice(0, 2);
  const joined = parts.map((part) => part[0] || '').join('');
  return (joined || text.slice(0, 2)).toUpperCase();
}

export function conversationLastMs(conversation) {
  const date =
    maybeDate(conversation?.lastAt) ||
    maybeDate(conversation?.updatedAt) ||
    maybeDate(conversation?.createdAt);
  return date ? date.getTime() : 0;
}

export function getConversationTitle(
  conversation,
  currentName = '',
  norm = defaultNorm,
) {
  if (!conversation) return 'Conversacion';

  const explicit = String(conversation.title || '').trim();
  if (explicit) return explicit;

  const otherName = String(conversation.otherName || conversation.displayName || '').trim();
  if (otherName) return otherName;

  if (conversation.type === 'group') return 'Grupo';
  if (conversation.type === 'support') return 'Soporte';

  const participantNames = Array.isArray(conversation.participantNames)
    ? conversation.participantNames
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    : [];

  if (participantNames.length) {
    const otherName = participantNames.find((name) => norm(name) !== norm(currentName));
    if (otherName) return otherName;
    return participantNames[0];
  }

  const lastSender = String(conversation.lastMessage?.senderName || '').trim();
  if (lastSender && norm(lastSender) !== norm(currentName)) return lastSender;

  return 'Conversacion';
}

export function getConversationPreview(conversation) {
  const raw = String(conversation?.lastMessage?.text || '').trim();
  if (raw) return raw;
  const fallback = String(conversation?.lastMessageText || '').trim();
  if (fallback) return fallback;
  return 'Sin mensajes';
}

export function isUnread(conversation, currentUid = '') {
  const unreadCount = Number(conversation?.unreadCount || 0);
  if (Number.isFinite(unreadCount) && unreadCount > 0) return true;

  const uid = String(currentUid || '').trim();
  if (!conversation || !uid) return false;
  if (conversation.lastMessage?.senderId === uid) return false;

  const lastAt = maybeDate(conversation.lastAt);
  if (!lastAt) return false;

  const readAt = maybeDate(conversation.reads?.[uid]);
  if (!readAt) return true;

  return lastAt.getTime() > readAt.getTime();
}

export function buildConversationListHtml({
  conversations = [],
  activeConversationId = '',
  currentUid = '',
  currentName = 'Usuario',
  esc = (value) => String(value || ''),
  norm = defaultNorm,
} = {}) {
  const sorted = [...conversations].sort(
    (a, b) => conversationLastMs(b) - conversationLastMs(a),
  );
  const unreadCount = sorted.filter((conversation) => isUnread(conversation, currentUid)).length;

  if (!sorted.length) {
    return {
      html: EMPTY_CONVERSATIONS_HTML,
      unreadCount,
    };
  }

  const html = sorted
    .slice(0, 40)
    .map((conversation) => {
      const titleRaw = getConversationTitle(conversation, currentName, norm);
      const previewRaw = getConversationPreview(conversation);
      const activeClass = conversation.id === activeConversationId ? ' is-active' : '';
      const unreadDot = isUnread(conversation, currentUid)
        ? '<span class="mini-chat-v4-row-unread"></span>'
        : '';
      const search = esc(`${titleRaw} ${previewRaw}`.toLowerCase());

      return `
        <button class="mini-chat-v4-row${activeClass}" type="button" data-open-conv="${esc(conversation.id)}" data-search="${search}">
          <span class="mini-chat-v4-row-avatar">${esc(initials(titleRaw))}</span>
          <span class="mini-chat-v4-row-main">
            <span class="mini-chat-v4-row-top">
              <span class="mini-chat-v4-row-title">${esc(titleRaw)}</span>
              <span class="mini-chat-v4-row-time">${esc(fmtTime(conversation.lastAt))}</span>
            </span>
            <span class="mini-chat-v4-row-preview">${esc(previewRaw)}</span>
          </span>
          ${unreadDot}
        </button>
      `;
    })
    .join('');

  return { html, unreadCount };
}

export function buildMessagesHtml({
  rows = [],
  conversationId = '',
  reactionData = new Map(),
  messageHtml,
  emptyHtml = EMPTY_MESSAGES_HTML,
} = {}) {
  if (!Array.isArray(rows) || !rows.length) return emptyHtml;
  return rows
    .map((message) => messageHtml(message, conversationId, reactionData))
    .join('');
}

export function buildThreadWindowMarkup() {
  return `
    <div class="mini-chat-v4-thread-container">
      <div class="mini-chat-v4-thread-header">
        <span class="mini-chat-v4-thread-title">Loading...</span>
        <div class="mini-chat-v4-thread-actions">
          <button class="mini-chat-v4-thread-min" type="button" aria-label="Minimizar">&minus;</button>
          <button class="mini-chat-v4-thread-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
      </div>
      <div class="mini-chat-v4-typing" hidden></div>
      <div class="mini-chat-v4-thread-messages"></div>
      <div class="mini-chat-v4-upload-progress-wrap" hidden>
        <div class="mini-chat-v4-upload-progress"></div>
      </div>
      <div class="mini-chat-v4-thread-compose">
        <button class="mini-chat-v4-thread-attach" type="button" aria-label="Adjuntar">&#128206;</button>
        <textarea placeholder="Escribe un mensaje..." rows="1"></textarea>
        <button class="mini-chat-v4-thread-send" type="button" aria-label="Enviar">&#10148;</button>
        <input class="mini-chat-v4-thread-file-input" type="file" hidden />
      </div>
    </div>
  `;
}

export function buildInboxThreadMarkup() {
  return `
    <section class="mini-chat-v4-thread-view mini-chat-v4-thread-view--page" id="miniChatThreadView">
      <header class="mini-chat-v4-thread-head">
        <button class="mini-chat-v4-icon mini-chat-v4-page-back" id="miniChatBack" type="button" aria-label="Volver">&#8592;</button>

        <div class="mini-chat-v4-thread-user">
          <div class="mini-chat-v4-thread-avatar" id="miniChatThreadAvatar">AV</div>
          <div class="mini-chat-v4-thread-meta">
            <div class="mini-chat-v4-thread-title" id="miniChatThreadTitle">Conversacion</div>
            <div class="mini-chat-v4-thread-status" id="miniChatThreadStatus">Activo ahora</div>
          </div>
        </div>

        <a class="mini-chat-v4-open-thread" id="miniChatOpenThread" href="#" aria-label="Abrir detalles">&#8505;</a>
      </header>

      <div class="mini-chat-v4-typing" id="miniChatTyping" hidden></div>
      <div class="mini-chat-v4-messages" id="miniChatMessages"></div>

      <div class="mini-chat-v4-upload-progress-wrap" id="miniChatUploadProgressWrap" hidden>
        <div class="mini-chat-v4-upload-progress" id="miniChatUploadProgress"></div>
      </div>

      <footer class="mini-chat-v4-compose">
        <button class="mini-chat-v4-attach" id="miniChatAttach" type="button" aria-label="Adjuntar">&#128206;</button>
        <textarea id="miniChatInput" rows="1" placeholder="Escribe un mensaje..."></textarea>
        <button class="mini-chat-v4-send" id="miniChatSend" type="button" aria-label="Enviar">&#10148;</button>
        <input id="miniChatFileInput" type="file" hidden />
      </footer>
    </section>
  `;
}

export function buildDockMarkup() {
  return `
    <button class="mini-chat-v4-launcher" id="miniChatLauncher" type="button" aria-label="Mensajes">
      <span class="mini-chat-v4-launcher-icon" aria-hidden="true">&#128172;</span>
      <span class="mini-chat-v4-badge" id="miniChatBadge" style="display:none;">0</span>
    </button>

    <section class="mini-chat-v4-panel" id="miniChatPanel" hidden>
      <div class="mini-chat-v4-list-view" id="miniChatListView">
        <header class="mini-chat-v4-head">
          <div class="mini-chat-v4-head-left">
            <div class="mini-chat-v4-head-title">Mensajes</div>
          </div>
          <div class="mini-chat-v4-head-actions">
            <button class="mini-chat-v4-icon" id="miniChatMinimize" type="button" aria-label="Minimizar">&#8722;</button>
            <button class="mini-chat-v4-icon" id="miniChatClose" type="button" aria-label="Cerrar">&times;</button>
          </div>
        </header>

        <div class="mini-chat-v4-search-wrap">
          <input id="miniChatSearch" type="text" placeholder="Buscar" autocomplete="off" />
        </div>

        <div class="mini-chat-v4-list" id="miniChatList"></div>

        <a class="mini-chat-v4-open-full" id="miniChatOpenFull" href="mensajes.html">Abrir vista completa</a>
      </div>

      <div class="mini-chat-v4-thread-view" id="miniChatThreadView" hidden>
        <header class="mini-chat-v4-thread-head">
          <button class="mini-chat-v4-icon" id="miniChatBack" type="button" aria-label="Volver">&#8592;</button>

          <div class="mini-chat-v4-thread-user">
            <div class="mini-chat-v4-thread-avatar" id="miniChatThreadAvatar">AV</div>
            <div class="mini-chat-v4-thread-meta">
              <div class="mini-chat-v4-thread-title" id="miniChatThreadTitle">Conversacion</div>
              <div class="mini-chat-v4-thread-status" id="miniChatThreadStatus">Activo ahora</div>
            </div>
          </div>

          <a class="mini-chat-v4-open-thread" id="miniChatOpenThread" href="mensajes.html" aria-label="Abrir detalles">&#8505;</a>
        </header>

        <div class="mini-chat-v4-typing" id="miniChatTyping" hidden></div>
        <div class="mini-chat-v4-messages" id="miniChatMessages"></div>

        <div class="mini-chat-v4-upload-progress-wrap" id="miniChatUploadProgressWrap" hidden>
          <div class="mini-chat-v4-upload-progress" id="miniChatUploadProgress"></div>
        </div>

        <footer class="mini-chat-v4-compose">
          <button class="mini-chat-v4-attach" id="miniChatAttach" type="button" aria-label="Adjuntar">&#128206;</button>
          <textarea id="miniChatInput" rows="1" placeholder="Escribe un mensaje..."></textarea>
          <button class="mini-chat-v4-send" id="miniChatSend" type="button" aria-label="Enviar">&#10148;</button>
          <input id="miniChatFileInput" type="file" hidden />
        </footer>
      </div>
    </section>
  `;
}
