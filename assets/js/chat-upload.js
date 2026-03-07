export function createMiniChatUploadController({
  storage,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
  esc,
}) {
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
    if (rawType === 'image' || rawType === 'file' || rawType === 'text') return rawType;
    const imageUrl = String(message?.imageUrl || '').trim();
    if (imageUrl) return 'image';
    const fileUrl = String(message?.fileUrl || '').trim();
    if (fileUrl) return 'file';
    return 'text';
  }

  function messageContentHtml(message = {}) {
    const type = messageAttachmentType(message);
    const textRaw = String(message?.text || '').trim();
    const safeText = esc(textRaw).replace(/\n/g, '<br />');
    const imageUrl = String(message?.imageUrl || '').trim();
    const fileUrl = String(message?.fileUrl || imageUrl).trim();
    const fileName = String(message?.fileName || (imageUrl ? 'imagen' : '')).trim() || 'archivo';
    const fileSize = formatFileSize(message?.fileSize);
    const fileLabel = fileSize ? `${fileName} (${fileSize})` : fileName;
    const out = [];

    if (type === 'image' && fileUrl) {
      out.push(`<img class="mini-chat-v4-image" src="${esc(fileUrl)}" alt="${esc(fileName)}" loading="lazy" />`);
    } else if (type === 'file' && fileUrl) {
      out.push(
        `<a class="mini-chat-v4-file" href="${esc(fileUrl)}" download="${esc(fileName)}" target="_blank" rel="noopener">&#128206; ${esc(fileLabel)}</a>`,
      );
    }

    if (safeText) out.push(`<div class="mini-chat-v4-bubble-text">${safeText}</div>`);
    if (!out.length) out.push('<div class="mini-chat-v4-bubble-text">[Adjunto]</div>');
    return out.join('');
  }

  function uploadAttachmentToStorage(convId, file, onProgress = () => {}) {
    const safeConvId = String(convId || '').trim();
    if (!safeConvId || !(file instanceof File)) {
      return Promise.reject(new Error('invalid-upload-input'));
    }

    const safeName = sanitizeFileName(file.name);
    const path = `chat/${safeConvId}/${Date.now()}_${safeName}`;
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
              fileName: file.name || safeName || 'archivo',
              fileSize: file.size || 0,
              type: String(file.type || '').toLowerCase().startsWith('image/')
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
