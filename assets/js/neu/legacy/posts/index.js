export function createLegacyPostsModule(deps) {
  const {
    NEU_POST_MODE_CREATE,
    NEU_POST_MODE_EDIT,
    NEU_POST_PRIMARY_COLLECTION,
    NEU_PROFILE_ME,
    NEU_QUICK_POST_MAX,
    auth,
    collection,
    db,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    isDisabled,
    neuChatRecomputeModalLock,
    neuCurrentUid,
    neuDefaultProfile,
    neuEnsureHandle,
    neuExtractTags,
    neuGetFeedList,
    neuIsVideoUrl,
    neuPostCrudState,
    neuProfileHref,
    neuProfileState,
    neuQuickPostState,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
  } = deps;

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

  function neuSetComposerInlineMsg(text, bad = false) {
    const msg = document.getElementById('composerMsg');
    if (!(msg instanceof HTMLElement)) return;
    msg.textContent = String(text || '');
    msg.style.color = bad ? '#ff91a2' : 'rgba(230,236,255,0.9)';
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

  return {
    neuOpenQuickPostModal,
    neuWireQuickPostEvents,
    neuDecorateFeedPostMenus,
    neuWirePostCrudEvents,
  };
}
