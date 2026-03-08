export function createMiniChatUploadController({
  storage,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  esc,
}) {
  const CHAT_UPLOAD_TEXT = Object.freeze({
    userFallback: 'Usuario',
    replyMessage: '[Mensaje]',
    replyImage: '[Imagen]',
    replyFile: '[Archivo]',
    replyAudio: '[Audio]',
    deletedMessage: 'Mensaje eliminado',
    attachmentFallback: '[Adjunto]',
    edited: 'editado',
  });

  let uploadInFlight = false;

  function acquireUploadLock() {
    if (uploadInFlight) return false;
    uploadInFlight = true;
    return true;
  }

  function releaseUploadLock() {
    uploadInFlight = false;
  }

  function sanitizeFileName(fileName) {
    return String(fileName || 'archivo').replace(/[^\w.\-]+/g, '_');
  }

  function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  function messageAttachmentType(message = {}) {
    const rawType = String(message?.type || '').trim().toLowerCase();
    if (rawType === 'audio' || rawType === 'image' || rawType === 'file' || rawType === 'text') {
      return rawType;
    }
    const imageUrl = String(message?.imageUrl || '').trim();
    if (imageUrl) return 'image';
    const fileUrl = String(message?.fileUrl || '').trim();
    if (fileUrl) {
      const fileName = String(message?.fileName || '').trim().toLowerCase();
      if (String(message?.mimeType || '').trim().toLowerCase().startsWith('audio/')) return 'audio';
      if (fileName.endsWith('.webm') || fileName.endsWith('.ogg') || fileName.endsWith('.mp3') || fileName.endsWith('.wav')) {
        return 'audio';
      }
      return 'file';
    }
    return 'text';
  }

  function messageContentHtml(message = {}) {
    const deleted = message?.deleted === true;
    const type = messageAttachmentType(message);
    const textRaw = String(message?.text || '').trim();
    const safeText = esc(textRaw).replace(/\n/g, '<br />');
    const replyToMessageId = String(message?.replyToMessageId || '').trim();
    const replyToTextRaw = String(message?.replyToText || '').trim();
    const replyToSenderName = String(message?.replyToSenderName || '').trim() || CHAT_UPLOAD_TEXT.userFallback;
    const safeReplyText = esc(replyToTextRaw).replace(/\n/g, '<br />');
    const replyType = String(message?.replyToType || '').trim().toLowerCase();
    const imageUrl = String(message?.imageUrl || '').trim();
    const fileUrl = String(message?.fileUrl || imageUrl).trim();
    const fileName = String(message?.fileName || (imageUrl ? 'imagen' : '')).trim() || 'archivo';
    const fileSize = formatFileSize(message?.fileSize);
    const fileLabel = fileSize ? `${fileName} (${fileSize})` : fileName;
    const out = [];
    const hasReplyMetadata = Boolean(
      replyToMessageId ||
      replyToTextRaw ||
      replyType === 'audio' ||
      replyType === 'image' ||
      replyType === 'file',
    );

    if (hasReplyMetadata) {
      const replyLabel = replyType === 'audio'
        ? CHAT_UPLOAD_TEXT.replyAudio
        : replyType === 'image'
          ? CHAT_UPLOAD_TEXT.replyImage
          : replyType === 'file'
            ? CHAT_UPLOAD_TEXT.replyFile
            : safeReplyText || CHAT_UPLOAD_TEXT.replyMessage;
      out.push(`
        <div class="mini-chat-v4-reply-snippet">
          <div class="mini-chat-v4-reply-author">${esc(replyToSenderName)}</div>
          <div class="mini-chat-v4-reply-text">${replyLabel}</div>
        </div>
      `);
    }

    if (deleted) {
      out.push(`<div class="mini-chat-v4-bubble-text mini-chat-v4-bubble-text--deleted">${CHAT_UPLOAD_TEXT.deletedMessage}</div>`);
      return out.join('');
    }

    if (type === 'image' && fileUrl) {
      out.push(`<img class="mini-chat-v4-image" src="${esc(fileUrl)}" alt="${esc(fileName)}" loading="lazy" />`);
    } else if (type === 'audio' && fileUrl) {
      const mimeType = String(message?.mimeType || 'audio/webm').trim() || 'audio/webm';
      out.push(`
        <div class="mini-chat-v4-audio-player" data-mini-chat-audio-player="1">
          <button class="mini-chat-v4-audio-toggle" type="button" data-mini-chat-audio-toggle="1" aria-label="Reproducir audio">
            <span class="mini-chat-v4-audio-toggle-icon" data-mini-chat-audio-icon="1">&#9654;</span>
          </button>
          <button class="mini-chat-v4-audio-track" type="button" data-mini-chat-audio-track="1" aria-label="Mover reproducción">
            <span class="mini-chat-v4-audio-progress" data-mini-chat-audio-progress="1"></span>
          </button>
          <span class="mini-chat-v4-audio-time" data-mini-chat-audio-time="1">0:00</span>
          <audio class="mini-chat-v4-audio" preload="metadata">
            <source src="${esc(fileUrl)}" type="${esc(mimeType)}" />
          </audio>
        </div>
      `);
    } else if (type === 'file' && fileUrl) {
      out.push(
        `<a class="mini-chat-v4-file" href="${esc(fileUrl)}" download="${esc(fileName)}" target="_blank" rel="noopener">&#128206; ${esc(fileLabel)}</a>`,
      );
    }

    if (safeText) out.push(`<div class="mini-chat-v4-bubble-text">${safeText}</div>`);
    if (message?.editedAt) out.push(`<div class="mini-chat-v4-edited-label">${CHAT_UPLOAD_TEXT.edited}</div>`);
    if (!out.length) out.push(`<div class="mini-chat-v4-bubble-text">${CHAT_UPLOAD_TEXT.attachmentFallback}</div>`);
    return out.join('');
  }

  function uploadAttachmentToStorage(convId, file, onProgress = () => {}) {
    const safeConvId = String(convId || '').trim();
    if (!safeConvId || !(file instanceof File)) {
      return Promise.reject(new Error('invalid-upload-input'));
    }

    const fileType = String(file.type || '').toLowerCase();
    const isAudio = fileType.startsWith('audio/');
    const safeName = sanitizeFileName(file.name);
    const path = isAudio
      ? `chat/${safeConvId}/audio/${Date.now()}.webm`
      : `chat/${safeConvId}/${Date.now()}_${safeName}`;
    const refObj = storageRef(storage, path);
    const task = uploadBytesResumable(refObj, file);

    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          const total = Number(snapshot?.totalBytes || 0);
          const transferred = Number(snapshot?.bytesTransferred || 0);
          const progress = total > 0 ? (transferred / total) * 100 : 0;
          onProgress(progress);
        },
        (error) => reject(error),
        async () => {
          try {
            const fileUrl = await getDownloadURL(task.snapshot.ref);
            resolve({
              fileUrl,
              fileName: isAudio
                ? (file.name || 'voice-message.webm')
                : (file.name || safeName || 'archivo'),
              fileSize: file.size || 0,
              mimeType: file.type || (isAudio ? 'audio/webm' : ''),
              type: isAudio
                ? 'audio'
                : String(file.type || '').toLowerCase().startsWith('image/')
                  ? 'image'
                  : 'file',
            });
          } catch (error) {
            reject(error);
          }
        },
      );
    });
  }

  return {
    acquireUploadLock,
    releaseUploadLock,
    formatFileSize,
    messageAttachmentType,
    messageContentHtml,
    uploadAttachmentToStorage,
  };
}
