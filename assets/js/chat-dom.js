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
          <button class="mini-chat-v4-thread-call" data-mini-chat-role="call" type="button" aria-label="Llamar">&#128222;</button>
          <button class="mini-chat-v4-thread-hangup" data-mini-chat-role="hangup" type="button" aria-label="Colgar" hidden>&#128222;</button>
          <button class="mini-chat-v4-thread-min" type="button" aria-label="Minimizar">&minus;</button>
          <button class="mini-chat-v4-thread-close" type="button" aria-label="Cerrar">&times;</button>
        </div>
      </div>
      <div class="mini-chat-v4-typing" hidden></div>
      <div class="mini-chat-v4-thread-messages"></div>
      <div class="mini-chat-ai-suggestions" data-mini-chat-role="ai-suggestions" hidden></div>
      <div class="mini-chat-v4-upload-progress-wrap" hidden>
        <div class="mini-chat-v4-upload-progress"></div>
      </div>
      <div class="mini-chat-v4-thread-compose">
        <button class="mini-chat-v4-thread-attach" type="button" aria-label="Adjuntar">&#128206;</button>
        <button class="mini-chat-v4-thread-record" type="button" aria-label="Grabar voz">&#127897;</button>
        <button class="mini-chat-v4-thread-speech" data-mini-chat-role="speech" type="button" aria-label="Dictar mensaje">&#127908;</button>
        <textarea placeholder="Escribe un mensaje..." rows="1"></textarea>
        <button class="mini-chat-v4-thread-send" type="button" aria-label="Enviar">&#10148;</button>
        <input class="mini-chat-v4-thread-file-input" type="file" hidden />
      </div>
    </div>
  `;
}

export function buildInboxThreadMarkup() {
  return `
    <section class="mini-chat-v4-thread-view mini-chat-v4-thread-view--page" data-mini-chat-role="thread-view">
      <header class="mini-chat-v4-thread-head">
        <button class="mini-chat-v4-icon mini-chat-v4-page-back" data-mini-chat-role="back" type="button" aria-label="Volver">&#8592;</button>

        <div class="mini-chat-v4-thread-user">
          <div class="mini-chat-v4-thread-avatar" data-mini-chat-role="thread-avatar">AV</div>
          <div class="mini-chat-v4-thread-meta">
            <div class="mini-chat-v4-thread-title" data-mini-chat-role="thread-title">Conversacion</div>
            <div class="mini-chat-v4-thread-status" data-mini-chat-role="thread-status">Activo ahora</div>
          </div>
        </div>

        <div class="mini-chat-v4-thread-head-actions">
          <button class="mini-chat-v4-icon mini-chat-v4-call" data-mini-chat-role="call" type="button" aria-label="Llamar">&#128222;</button>
          <button class="mini-chat-v4-icon mini-chat-v4-hangup" data-mini-chat-role="hangup" type="button" aria-label="Colgar" hidden>&#128222;</button>
          <a class="mini-chat-v4-open-thread" data-mini-chat-role="open-thread" href="#" aria-label="Abrir detalles">&#8505;</a>
        </div>
      </header>

      <div class="mini-chat-v4-typing" data-mini-chat-role="typing" hidden></div>
      <div class="mini-chat-v4-messages" data-mini-chat-role="messages"></div>
      <div class="mini-chat-ai-suggestions" data-mini-chat-role="ai-suggestions" hidden></div>

      <div class="mini-chat-v4-upload-progress-wrap" data-mini-chat-role="upload-wrap" hidden>
        <div class="mini-chat-v4-upload-progress" data-mini-chat-role="upload-bar"></div>
      </div>

      <footer class="mini-chat-v4-compose">
        <button class="mini-chat-v4-attach" data-mini-chat-role="attach" type="button" aria-label="Adjuntar">&#128206;</button>
        <button class="mini-chat-v4-record" data-mini-chat-role="record" type="button" aria-label="Grabar voz">&#127897;</button>
        <button class="mini-chat-v4-speech" data-mini-chat-role="speech" type="button" aria-label="Dictar mensaje">&#127908;</button>
        <textarea data-mini-chat-role="input" rows="1" placeholder="Escribe un mensaje..."></textarea>
        <button class="mini-chat-v4-send" data-mini-chat-role="send" type="button" aria-label="Enviar">&#10148;</button>
        <input data-mini-chat-role="file-input" type="file" hidden />
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

      <div class="mini-chat-v4-thread-view" data-mini-chat-role="thread-view" hidden>
        <header class="mini-chat-v4-thread-head">
          <button class="mini-chat-v4-icon" data-mini-chat-role="back" type="button" aria-label="Volver">&#8592;</button>

          <div class="mini-chat-v4-thread-user">
            <div class="mini-chat-v4-thread-avatar" data-mini-chat-role="thread-avatar">AV</div>
            <div class="mini-chat-v4-thread-meta">
              <div class="mini-chat-v4-thread-title" data-mini-chat-role="thread-title">Conversacion</div>
              <div class="mini-chat-v4-thread-status" data-mini-chat-role="thread-status">Activo ahora</div>
            </div>
          </div>

          <div class="mini-chat-v4-thread-head-actions">
            <button class="mini-chat-v4-icon mini-chat-v4-call" data-mini-chat-role="call" type="button" aria-label="Llamar">&#128222;</button>
            <button class="mini-chat-v4-icon mini-chat-v4-hangup" data-mini-chat-role="hangup" type="button" aria-label="Colgar" hidden>&#128222;</button>
            <a class="mini-chat-v4-open-thread" data-mini-chat-role="open-thread" href="mensajes.html" aria-label="Abrir detalles">&#8505;</a>
          </div>
        </header>

        <div class="mini-chat-v4-typing" data-mini-chat-role="typing" hidden></div>
        <div class="mini-chat-v4-messages" data-mini-chat-role="messages"></div>
        <div class="mini-chat-ai-suggestions" data-mini-chat-role="ai-suggestions" hidden></div>

        <div class="mini-chat-v4-upload-progress-wrap" data-mini-chat-role="upload-wrap" hidden>
          <div class="mini-chat-v4-upload-progress" data-mini-chat-role="upload-bar"></div>
        </div>

        <footer class="mini-chat-v4-compose">
          <button class="mini-chat-v4-attach" data-mini-chat-role="attach" type="button" aria-label="Adjuntar">&#128206;</button>
          <button class="mini-chat-v4-record" data-mini-chat-role="record" type="button" aria-label="Grabar voz">&#127897;</button>
          <button class="mini-chat-v4-speech" data-mini-chat-role="speech" type="button" aria-label="Dictar mensaje">&#127908;</button>
          <textarea data-mini-chat-role="input" rows="1" placeholder="Escribe un mensaje..."></textarea>
          <button class="mini-chat-v4-send" data-mini-chat-role="send" type="button" aria-label="Enviar">&#10148;</button>
          <input data-mini-chat-role="file-input" type="file" hidden />
        </footer>
      </div>
    </section>
  `;
}
