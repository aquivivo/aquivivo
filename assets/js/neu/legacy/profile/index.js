export function createLegacyProfileModule(deps) {
  const {
    NEU_FOLLOWS_COLLECTION,
    NEU_POST_PRIMARY_COLLECTION,
    NEU_PROFILE_FEED_LIMIT,
    NEU_PROFILE_ME,
    NEU_PROFILE_PARAM,
    NEU_QA,
    NEU_USERS_COLLECTION,
    activateFeedSource,
    auth,
    collection,
    db,
    deleteDoc,
    doc,
    esc,
    getDoc,
    getDocs,
    getProfileParamRaw,
    getProfileUidFromQuery,
    isDisabled,
    isProfileRouteActive,
    limit,
    neuApplyProfileToUi,
    neuAvatarLetter,
    neuChatSetHint,
    neuCurrentUid,
    neuDecorateFeedPostMenus,
    neuEnsureHandle,
    neuGetFeedList,
    neuGetProfileForActiveRoute,
    neuInitProfileEditor,
    neuIsPermissionDenied,
    neuIsVideoUrl,
    neuLoadOrCreateProfile,
    neuNormalizeProfile,
    neuOpenProfileMessage,
    neuProfileDocRef,
    neuProfileHref,
    neuProfileState,
    neuPublicProfileState,
    neuQaTrace,
    neuSetProfileEditorVisible,
    neuSetProfileModalOpen,
    neuSetProfileReadOnly,
    neuSocialAppHref,
    neuSuggestedState,
    neuTs,
    neuWireProfileIdentitySync,
    normalizeProfileParam,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateNeuRouteParams,
    where,
  } = deps;

  function neuProfileFallback(uid) {
    const cleanUid = String(uid || '').trim();
    const displayName = cleanUid ? `Usuario ${cleanUid.slice(0, 6)}` : 'Usuario';
    return {
      displayName,
      handle: neuEnsureHandle('', displayName, cleanUid),
      city: '',
      bio: '',
      avatarUrl: '',
      avatarStoragePath: '',
    };
  }

  function neuApplyProfileRouteDefault(meUid) {
    const params = new URLSearchParams(location.search);
    const currentProfile = String(params.get(NEU_PROFILE_PARAM) || '').trim();
    const legacyUid = String(params.get('uid') || '').trim();

    if (!currentProfile && legacyUid) {
      params.set(NEU_PROFILE_PARAM, legacyUid);
      params.delete('uid');
    }

    const effectiveProfile = String(params.get(NEU_PROFILE_PARAM) || '').trim();
    if (!effectiveProfile) {
      if (!String(params.get('portal') || '').trim()) {
        params.set('portal', 'feed');
      }
      params.set(NEU_PROFILE_PARAM, NEU_PROFILE_ME);
    } else {
      const normalized = normalizeProfileParam(effectiveProfile, meUid);
      if (normalized && normalized !== effectiveProfile) params.set(NEU_PROFILE_PARAM, normalized);
    }

    const nextHref = `${location.pathname}?${params.toString()}${location.hash}`;
    const currentHref = `${location.pathname}${location.search}${location.hash}`;
    if (nextHref !== currentHref) history.replaceState(null, '', nextHref);
  }

  async function neuLoadViewedProfile(targetUid, isOwn) {
    if (isOwn) {
      const loaded = await neuLoadOrCreateProfile(targetUid);
      return { profile: loaded.profile, readOnly: loaded.readOnly };
    }

    try {
      const snap = await getDoc(neuProfileDocRef(targetUid));
      if (!snap.exists()) return { profile: neuProfileFallback(targetUid), readOnly: true };
      return { profile: neuNormalizeProfile(snap.data() || {}, targetUid), readOnly: true };
    } catch (error) {
      if (neuIsPermissionDenied(error)) {
        return { profile: neuProfileFallback(targetUid), readOnly: true };
      }
      throw error;
    }
  }

  async function neuLoadFollowCounts(targetUid) {
    try {
      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(collection(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers')),
        getDocs(collection(db, NEU_FOLLOWS_COLLECTION, targetUid, 'following')),
      ]);
      return { followers: followersSnap.size, following: followingSnap.size };
    } catch (error) {
      if (NEU_QA) console.warn('[neu-follow] count failed', error);
      return { followers: 0, following: 0 };
    }
  }

  async function neuLoadFollowingFlag(meUid, targetUid) {
    if (!meUid || !targetUid || meUid === targetUid) return false;
    try {
      const snap = await getDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid));
      return snap.exists();
    } catch (error) {
      if (NEU_QA) console.warn('[neu-follow] flag failed', error);
      return false;
    }
  }

  function neuSyncProfileCountsUi() {
    if (!neuPublicProfileState.profileMode) return;

    const followers = Math.max(0, Number(neuPublicProfileState.followersCount || 0));
    const following = Math.max(0, Number(neuPublicProfileState.followingCount || 0));

    const followersEl = document.getElementById('countFollowers');
    const friendsEl = document.getElementById('countFriends');
    const followingEl = document.getElementById('countFollowing');

    if (followersEl instanceof HTMLElement) followersEl.textContent = String(followers);
    if (friendsEl instanceof HTMLElement) friendsEl.textContent = String(following);
    if (followingEl instanceof HTMLElement) {
      followingEl.textContent = String(following);
      followingEl.classList.remove('is-hidden');
    }
  }

  function neuSyncProfileActionsUi() {
    const followBtn = document.getElementById('btnFusionFollow');
    const editBtn = document.getElementById('btnNeuEditProfile');
    const friendBtn = document.getElementById('btnFusionFriend');
    const shareBtn = document.getElementById('btnFusionShare');
    const messageBtn = document.getElementById('btnFusionMessage');
    const sourceSwitch = document.getElementById('feedSourceSwitch');

    const isProfileMode = neuPublicProfileState.profileMode;
    const isOwn = neuPublicProfileState.isOwn;

    if (sourceSwitch instanceof HTMLElement) sourceSwitch.style.display = isProfileMode ? 'none' : '';
    if (friendBtn instanceof HTMLElement) friendBtn.classList.add('is-hidden');
    if (shareBtn instanceof HTMLElement) shareBtn.classList.add('is-hidden');

    const meUid = neuCurrentUid();
    const routeProfileUid = getProfileUidFromQuery(meUid);
    const routeTargetUid = routeProfileUid && routeProfileUid !== meUid ? routeProfileUid : '';
    const messageTargetUid = isProfileMode && !isOwn
      ? String(neuPublicProfileState.targetUid || routeTargetUid || '').trim()
      : '';
    if (messageBtn instanceof HTMLElement) {
      messageBtn.setAttribute('data-chat-uid', messageTargetUid);
      messageBtn.removeAttribute('data-open-chat');
      messageBtn.removeAttribute('data-open-chat-name');
    }
    if (messageBtn instanceof HTMLAnchorElement) {
      messageBtn.href = neuSocialAppHref({ portal: 'pulse' });
    }

    if (!(followBtn instanceof HTMLButtonElement)) return;
    if (!(editBtn instanceof HTMLElement)) return;

    if (!isProfileMode) {
      editBtn.classList.add('is-hidden');
      followBtn.classList.remove('is-hidden');
      return;
    }

    if (isOwn) {
      editBtn.classList.remove('is-hidden');
      followBtn.classList.add('is-hidden');
      return;
    }

    editBtn.classList.add('is-hidden');
    followBtn.classList.remove('is-hidden');
    followBtn.disabled = neuPublicProfileState.followLoading;
    followBtn.textContent = neuPublicProfileState.followLoading
      ? 'Cargando...'
      : neuPublicProfileState.isFollowing
        ? 'Siguiendo'
        : 'Seguir';
    followBtn.classList.toggle('btn-yellow', !neuPublicProfileState.isFollowing);
    followBtn.classList.toggle('btn-white-outline', neuPublicProfileState.isFollowing);
  }

  async function neuRefreshFollowUiState() {
    if (!neuPublicProfileState.profileMode) return;
    const { meUid, targetUid, isOwn } = neuPublicProfileState;
    const [counts, following] = await Promise.all([
      neuLoadFollowCounts(targetUid),
      neuLoadFollowingFlag(meUid, targetUid),
    ]);

    neuPublicProfileState.followersCount = Number(counts.followers || 0);
    neuPublicProfileState.followingCount = Number(counts.following || 0);
    neuPublicProfileState.isFollowing = isOwn ? false : !!following;
    neuSyncProfileCountsUi();
    neuSyncProfileActionsUi();
  }

  function neuProfilePostFromDoc(docSnap, targetUid, profile) {
    const data = docSnap.data() || {};
    const ownerUid = String(data.ownerUid || '').trim();
    if (!ownerUid || ownerUid !== targetUid) return null;

    const tags = Array.isArray(data.tags)
      ? data.tags.map((tag) => String(tag || '').replace(/^#/, '').trim()).filter(Boolean)
      : [];

    const displayName = String(data.authorName || data.displayName || profile?.displayName || 'Usuario').trim() || 'Usuario';
    const handle = neuEnsureHandle(data.authorHandle || profile?.handle || '', displayName, ownerUid);
    return {
      id: String(docSnap.id || '').trim(),
      ownerUid,
      text: String(data.text || data.content || '').trim(),
      tags,
      type: String(data.type || 'post').trim().toLowerCase() || 'post',
      media: String(data.videoURL || data.mediaURL || data.imageURL || data.imageUrl || data.media || '').trim(),
      createdAt: data.createdAt || data.updatedAt || null,
      authorName: displayName,
      authorHandle: handle,
    };
  }

  async function neuLoadProfilePosts(targetUid, profile) {
    const attempts = [
      query(collection(db, NEU_POST_PRIMARY_COLLECTION), where('ownerUid', '==', targetUid), orderBy('createdAt', 'desc'), limit(NEU_PROFILE_FEED_LIMIT)),
      query(collection(db, NEU_POST_PRIMARY_COLLECTION), where('ownerUid', '==', targetUid), limit(NEU_PROFILE_FEED_LIMIT)),
    ];

    const byId = new Map();
    for (const q of attempts) {
      try {
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const post = neuProfilePostFromDoc(docSnap, targetUid, profile);
          if (post && post.id) byId.set(post.id, post);
        });
      } catch {
        // keep trying fallback query variants
      }
    }

    return Array.from(byId.values()).sort((a, b) => neuTs(b.createdAt) - neuTs(a.createdAt));
  }

  function neuFormatAgoShort(value) {
    const ts = neuTs(value);
    if (!ts) return 'ahora';
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min}m`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 6) return `${weeks}sem`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mes`;
    const years = Math.floor(days / 365);
    return `${years}a`;
  }

  function neuRenderProfileEmptyState() {
    const feed = neuGetFeedList();
    if (!(feed instanceof HTMLElement)) return;
    const text = neuPublicProfileState.isOwn
      ? 'Aun no has publicado nada'
      : 'Este usuario aun no ha publicado nada';
    feed.innerHTML = `
      <div class="empty-feed-state">
        <p class="empty-feed-title">${esc(text)}</p>
        <p class="empty-feed-sub">${esc(neuPublicProfileState.isOwn ? 'Comparte tu primera publicacion' : 'Vuelve pronto para ver novedades')}</p>
      </div>
    `;
  }

  function neuFilterProfilePosts(posts, queryText) {
    const q = String(queryText || '').trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => {
      const haystack = [
        post.authorName,
        post.authorHandle,
        post.text,
        post.type,
        ...(Array.isArray(post.tags) ? post.tags : []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  function neuRenderProfileFeedPosts(posts) {
    const feed = neuGetFeedList();
    if (!(feed instanceof HTMLElement)) return;
    if (!Array.isArray(posts) || !posts.length) {
      neuRenderProfileEmptyState();
      return;
    }

    const items = posts.map((post) => {
      const authorHref = neuProfileHref(post.ownerUid);
      const media = String(post.media || '').trim();
      const mediaHtml = media
        ? neuIsVideoUrl(media)
          ? `<div class="media-block"><video controls preload="metadata" src="${esc(media)}"></video></div>`
          : `<div class="media-block"><img loading="lazy" src="${esc(media)}" alt="post" /></div>`
        : '';
      const tagsHtml =
        Array.isArray(post.tags) && post.tags.length
          ? `<div class="post-tags">${post.tags.map((tag) => `#${esc(tag)}`).join(' ')}</div>`
          : '';
      const meta = `${esc(String(post.type || 'post').toUpperCase())} | ${esc(neuFormatAgoShort(post.createdAt))}`;
      const textHtml = esc(String(post.text || '')).replace(/\n/g, '<br />');
      const actionsHtml = `
        <div class="neu-post-quick-actions">
          <button class="btn-white-outline neu-post-share-chat" type="button" data-neu-post-share-chat="1">Enviar por chat</button>
        </div>
      `;

      return `
        <article class="post-card" data-owner="${esc(post.ownerUid)}" data-post="${esc(post.id)}">
          <div class="post-head">
            <a class="post-author" href="${authorHref}">
              <span class="post-avatar">${esc(neuAvatarLetter(post.authorName))}</span>
              <span class="post-author-meta">
                <strong>${esc(post.authorName || 'Usuario')}</strong>
                <span>${esc(post.authorHandle || '')}</span>
              </span>
            </a>
          </div>
          <p class="post-text">${textHtml || '-'}</p>
          ${mediaHtml}
          ${tagsHtml}
          <div class="post-meta">${meta}</div>
          ${actionsHtml}
        </article>
      `;
    });

    feed.innerHTML = items.join('');
  }

  async function neuRefreshProfileFeed(forceReload = false) {
    if (!isProfileRouteActive()) {
      if (neuPublicProfileState.profileMode) {
        neuPublicProfileState.profileMode = false;
        neuPublicProfileState.viewedProfile = null;
        neuSyncProfileActionsUi();
      }
      return;
    }
    if (!neuPublicProfileState.profileMode) return;
    if (neuPublicProfileState.postsLoading) return;
    if (!neuPublicProfileState.targetUid) return;

    const shouldReload =
      forceReload ||
      neuPublicProfileState.postsLoadedFor !== neuPublicProfileState.targetUid ||
      !Array.isArray(neuPublicProfileState.posts);

    if (shouldReload) {
      neuPublicProfileState.postsLoading = true;
      try {
        neuPublicProfileState.posts = await neuLoadProfilePosts(
          neuPublicProfileState.targetUid,
          neuGetProfileForActiveRoute(),
        );
        neuPublicProfileState.postsLoadedFor = neuPublicProfileState.targetUid;
      } catch (error) {
        console.error('[neu-profile] posts load failed', error);
        neuPublicProfileState.posts = [];
        neuPublicProfileState.postsLoadedFor = neuPublicProfileState.targetUid;
      } finally {
        neuPublicProfileState.postsLoading = false;
      }
    }

    const queryText = String(document.getElementById('feedSearchInput')?.value || '').trim();
    const filtered = neuFilterProfilePosts(neuPublicProfileState.posts, queryText);
    neuRenderProfileFeedPosts(filtered);

    if (!isDisabled('decorators')) {
      window.setTimeout(() => {
        neuDecorateFeedPostMenus();
      }, 0);
    }
  }

  async function neuToggleFollowForViewedProfile() {
    const { meUid, targetUid, isOwn } = neuPublicProfileState;
    if (!neuPublicProfileState.profileMode || !meUid || !targetUid || isOwn) return;
    if (neuPublicProfileState.followLoading) return;

    const wasFollowing = neuPublicProfileState.isFollowing;
    const prevFollowers = neuPublicProfileState.followersCount;

    neuPublicProfileState.followLoading = true;
    neuPublicProfileState.isFollowing = !wasFollowing;
    neuPublicProfileState.followersCount = Math.max(0, prevFollowers + (wasFollowing ? -1 : 1));
    neuSyncProfileCountsUi();
    neuSyncProfileActionsUi();

    try {
      if (wasFollowing) {
        await Promise.all([
          deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid)),
          deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers', meUid)),
        ]);
      } else {
        const now = serverTimestamp();
        await Promise.all([
          setDoc(
            doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', targetUid),
            { sourceUid: meUid, targetUid, createdAt: now, updatedAt: now },
            { merge: true },
          ),
          setDoc(
            doc(db, NEU_FOLLOWS_COLLECTION, targetUid, 'followers', meUid),
            { sourceUid: meUid, targetUid, createdAt: now, updatedAt: now },
            { merge: true },
          ),
        ]);
      }
    } catch (error) {
      console.error('[neu-follow] toggle failed', error);
      neuPublicProfileState.isFollowing = wasFollowing;
      neuPublicProfileState.followersCount = prevFollowers;
    } finally {
      neuPublicProfileState.followLoading = false;
      neuSyncProfileCountsUi();
      neuSyncProfileActionsUi();
    }
  }

  function neuSuggestedRootNode() {
    const node = document.getElementById('pulseSuggestedUsers');
    return node instanceof HTMLElement ? node : null;
  }

  function neuSuggestedCardNode() {
    const node = document.getElementById('pulseSuggestedCard');
    return node instanceof HTMLElement ? node : null;
  }

  function neuSuggestedButtonLabel(uid) {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return 'Seguir';
    return neuSuggestedState.followingSet.has(cleanUid) ? 'Siguiendo' : 'Seguir';
  }

  function neuRenderSuggestedUsers() {
    const root = neuSuggestedRootNode();
    if (!(root instanceof HTMLElement)) return;

    if (neuSuggestedState.loading) {
      root.innerHTML = '<div class="empty-state">Cargando sugerencias...</div>';
      return;
    }

    if (!Array.isArray(neuSuggestedState.rows) || !neuSuggestedState.rows.length) {
      root.innerHTML = '<div class="empty-state">Sin sugerencias por ahora.</div>';
      return;
    }

    const items = neuSuggestedState.rows
      .map((row) => {
        const uid = String(row.uid || '').trim();
        const displayName = String(row.displayName || 'Usuario').trim() || 'Usuario';
        const handle = neuEnsureHandle(row.handle || row.username || '', displayName, uid);
        const city = String(row.cityPl || row.city || '').trim();
        const avatarUrl = String(row.avatarUrl || '').trim();
        const followLabel = neuSuggestedButtonLabel(uid);
        const isFollowing = followLabel === 'Siguiendo';
        const avatarHtml = avatarUrl
          ? `<img loading="lazy" src="${esc(avatarUrl)}" alt="avatar" />`
          : `<span>${esc(neuAvatarLetter(displayName))}</span>`;
        return `
          <article class="neu-suggested-item" data-neu-suggested-item="${esc(uid)}">
            <a class="avatar-frame neu-suggested-avatar" href="${esc(neuProfileHref(uid))}">${avatarHtml}</a>
            <a class="neu-suggested-copy" href="${esc(neuProfileHref(uid))}">
              <strong>${esc(displayName)}</strong>
              <span>${esc(handle)}${city ? ` · ${esc(city)}` : ''}</span>
            </a>
            <button
              class="${isFollowing ? 'btn-white-outline' : 'btn-yellow'} neu-suggested-follow-btn${isFollowing ? ' is-following' : ''}"
              type="button"
              data-neu-suggest-follow="${esc(uid)}"
            >${esc(followLabel)}</button>
          </article>
        `;
      })
      .join('');

    root.innerHTML = `<div class="neu-suggested-list">${items}</div>`;
  }

  async function neuLoadFollowingSet(meUid) {
    const cleanUid = String(meUid || '').trim();
    if (!cleanUid) return new Set();
    try {
      const snap = await getDocs(query(collection(db, NEU_FOLLOWS_COLLECTION, cleanUid, 'following'), limit(400)));
      const next = new Set();
      snap.forEach((row) => {
        const id = String(row.id || '').trim();
        const targetUid = String(row.data()?.targetUid || '').trim();
        if (id) next.add(id);
        if (targetUid) next.add(targetUid);
      });
      return next;
    } catch {
      return new Set();
    }
  }

  async function neuFetchSuggestedUsers(meUid) {
    const cleanUid = String(meUid || '').trim();
    if (!cleanUid) return [];

    const attempts = [
      query(
        collection(db, NEU_USERS_COLLECTION),
        where('onboardingCompleted', '==', true),
        orderBy('followersCount', 'desc'),
        limit(20),
      ),
      query(
        collection(db, NEU_USERS_COLLECTION),
        where('onboardingCompleted', '==', true),
        orderBy('createdAt', 'desc'),
        limit(20),
      ),
      query(collection(db, NEU_USERS_COLLECTION), where('onboardingCompleted', '==', true), limit(20)),
    ];

    const byUid = new Map();
    for (const q of attempts) {
      try {
        const snap = await getDocs(q);
        snap.forEach((row) => {
          const uid = String(row.id || '').trim();
          if (!uid || uid === cleanUid || byUid.has(uid)) return;
          const profile = neuNormalizeProfile(row.data() || {}, uid);
          byUid.set(uid, {
            uid,
            displayName: profile.displayName,
            handle: profile.handle,
            username: String(row.data()?.username || '').trim(),
            city: profile.city,
            cityPl: String(row.data()?.cityPl || '').trim(),
            avatarUrl: profile.avatarUrl,
          });
        });
        if (byUid.size >= 10) break;
      } catch {
        // try next fallback
      }
    }

    return Array.from(byUid.values()).slice(0, 10);
  }

  function neuFocusSuggestedCard() {
    const card = neuSuggestedCardNode();
    if (!(card instanceof HTMLElement)) return;
    card.classList.add('is-focus');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      card.classList.remove('is-focus');
    }, 1800);
  }

  async function neuLoadSuggestedUsers({ force = false, focus = false } = {}) {
    const meUid = String(neuCurrentUid() || '').trim();
    if (!meUid) return;
    if (neuSuggestedState.loading) return;
    if (!force && neuSuggestedState.uid === meUid && neuSuggestedState.rows.length) {
      if (focus) neuFocusSuggestedCard();
      return;
    }

    neuSuggestedState.loading = true;
    neuRenderSuggestedUsers();
    try {
      const [rows, followingSet] = await Promise.all([neuFetchSuggestedUsers(meUid), neuLoadFollowingSet(meUid)]);
      neuSuggestedState.uid = meUid;
      neuSuggestedState.rows = rows;
      neuSuggestedState.followingSet = followingSet;
    } catch (error) {
      neuSuggestedState.rows = [];
      neuSuggestedState.followingSet = new Set();
      if (NEU_QA) console.warn('[neu-suggested] load failed', error);
    } finally {
      neuSuggestedState.loading = false;
      neuRenderSuggestedUsers();
      if (focus) neuFocusSuggestedCard();
    }
  }

  async function neuToggleSuggestedFollow(targetUid) {
    const meUid = String(neuCurrentUid() || '').trim();
    const cleanTarget = String(targetUid || '').trim();
    if (!meUid || !cleanTarget || cleanTarget === meUid) return;
    if (neuSuggestedState.loading) return;

    const wasFollowing = neuSuggestedState.followingSet.has(cleanTarget);
    if (wasFollowing) neuSuggestedState.followingSet.delete(cleanTarget);
    else neuSuggestedState.followingSet.add(cleanTarget);
    neuRenderSuggestedUsers();

    if (neuPublicProfileState.profileMode && !neuPublicProfileState.isOwn && neuPublicProfileState.targetUid === cleanTarget) {
      neuPublicProfileState.isFollowing = !wasFollowing;
      neuPublicProfileState.followersCount = Math.max(0, Number(neuPublicProfileState.followersCount || 0) + (wasFollowing ? -1 : 1));
      neuSyncProfileCountsUi();
      neuSyncProfileActionsUi();
    }

    try {
      if (wasFollowing) {
        await Promise.all([
          deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', cleanTarget)),
          deleteDoc(doc(db, NEU_FOLLOWS_COLLECTION, cleanTarget, 'followers', meUid)),
        ]);
      } else {
        const now = serverTimestamp();
        await Promise.all([
          setDoc(
            doc(db, NEU_FOLLOWS_COLLECTION, meUid, 'following', cleanTarget),
            { sourceUid: meUid, targetUid: cleanTarget, createdAt: now, updatedAt: now },
            { merge: true },
          ),
          setDoc(
            doc(db, NEU_FOLLOWS_COLLECTION, cleanTarget, 'followers', meUid),
            { sourceUid: meUid, targetUid: cleanTarget, createdAt: now, updatedAt: now },
            { merge: true },
          ),
        ]);
      }
    } catch (error) {
      if (wasFollowing) neuSuggestedState.followingSet.add(cleanTarget);
      else neuSuggestedState.followingSet.delete(cleanTarget);
      neuRenderSuggestedUsers();
      if (NEU_QA) console.warn('[neu-suggested] follow failed', error);
    }
  }

  function neuWirePublicProfileEvents() {
    if (neuPublicProfileState.wired) return;
    neuPublicProfileState.wired = true;

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const suggestFollowBtn = target.closest('[data-neu-suggest-follow]');
        if (suggestFollowBtn instanceof HTMLElement) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const targetUid = String(suggestFollowBtn.getAttribute('data-neu-suggest-follow') || '').trim();
          neuToggleSuggestedFollow(targetUid).catch((error) => {
            if (NEU_QA) console.warn('[neu-suggested] follow click failed', error);
          });
          return;
        }

        const followBtn = target.closest('#btnFusionFollow');
        if (followBtn && neuPublicProfileState.profileMode) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          neuToggleFollowForViewedProfile().catch((error) => {
            console.error('[neu-follow] click handler failed', error);
          });
          return;
        }

        const messageBtn = target.closest('#btnFusionMessage');
        if (messageBtn instanceof HTMLButtonElement) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const meUid = neuCurrentUid();
          const routeProfileUid = getProfileUidFromQuery(meUid);
          const dataUid = String(messageBtn.getAttribute('data-chat-uid') || '').trim();
          const chatUid =
            dataUid ||
            String(neuPublicProfileState.targetUid || '').trim() ||
            String(routeProfileUid || '').trim();
          neuQaTrace('profile_message_click', {
            meUid,
            dataUid,
            profileTargetUid: String(neuPublicProfileState.targetUid || '').trim(),
            routeProfileUid: String(routeProfileUid || '').trim(),
            resolvedChatUid: chatUid,
          });
          if (!chatUid || chatUid === meUid) {
            neuQaTrace('profile_message_click_guard_block', {
              meUid,
              resolvedChatUid: chatUid,
            });
            return;
          }
          neuOpenProfileMessage(chatUid).catch((error) => {
            console.error('[neu-chat] profile button failed', error);
            neuChatSetHint('No se pudo iniciar el chat.', true);
          });
          return;
        }

        const feedSourceBtn = target.closest('[data-feed-source]');
        if (feedSourceBtn && neuPublicProfileState.profileMode) {
          const source = String(feedSourceBtn.getAttribute('data-feed-source') || '')
            .trim()
            .toLowerCase();
          if (source !== 'target') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            activateFeedSource('target');
          }
          window.setTimeout(() => {
            neuRefreshProfileFeed(false).catch(() => null);
          }, 0);
          return;
        }

        const portalTrigger = target.closest('[data-portal-target], .fusion-bottom-nav .bottom-nav-btn');
        if (portalTrigger) {
          window.setTimeout(() => {
            neuInitPublicProfile(auth.currentUser).catch(() => null);
          }, 120);
        }
      },
      true,
    );

    if (neuPublicProfileState.feedWired) return;
    neuPublicProfileState.feedWired = true;
    document.getElementById('feedSearchInput')?.addEventListener('input', () => {
      if (!neuPublicProfileState.profileMode) return;
      neuRefreshProfileFeed(false).catch(() => null);
    });

    window.addEventListener('popstate', () => {
      neuInitPublicProfile(auth.currentUser).catch(() => null);
    });
  }

  async function neuInitPublicProfile(user) {
    const meUid = String(user?.uid || auth.currentUser?.uid || '').trim();
    if (!meUid) return;
    if (neuPublicProfileState.initializing) return;
    neuPublicProfileState.initializing = true;

    try {
      neuApplyProfileRouteDefault(meUid);

      const rawProfile = getProfileParamRaw();
      const profileMode = !!rawProfile;
      if (!profileMode) {
        neuPublicProfileState.profileMode = false;
        neuPublicProfileState.viewedProfile = null;
        if (neuProfileState.profile) neuApplyProfileToUi(neuProfileState.profile);
        neuSyncProfileActionsUi();
        neuWirePublicProfileEvents();
        return;
      }

      const targetUid = getProfileUidFromQuery(meUid);
      if (!targetUid) {
        neuPublicProfileState.profileMode = false;
        neuPublicProfileState.targetUid = '';
        neuPublicProfileState.viewedProfile = null;
        neuPublicProfileState.isOwn = true;
        if (neuProfileState.profile) neuApplyProfileToUi(neuProfileState.profile);
        neuSyncProfileActionsUi();
        neuWirePublicProfileEvents();
        return;
      }
      const isOwn = targetUid === meUid;
      const changedTarget = neuPublicProfileState.targetUid !== targetUid;
      neuPublicProfileState.meUid = meUid;
      neuPublicProfileState.targetUid = targetUid;
      neuPublicProfileState.profileMode = true;
      neuPublicProfileState.isOwn = isOwn;
      if (changedTarget) {
        neuPublicProfileState.viewedProfile = null;
        neuPublicProfileState.posts = [];
        neuPublicProfileState.postsLoadedFor = '';
        neuPublicProfileState.postsLoading = false;
      }

      if (!isOwn && getProfileParamRaw() !== targetUid) {
        updateNeuRouteParams({ profileMode: true, profileUid: targetUid });
      }

      if (isOwn) {
        neuPublicProfileState.viewedProfile = null;
        await neuInitProfileEditor(user);
      } else {
        const loaded = await neuLoadViewedProfile(targetUid, false);
        neuPublicProfileState.viewedProfile = loaded.profile;
        neuSetProfileReadOnly(true, '');
        neuSetProfileEditorVisible(false);
        neuSetProfileModalOpen(false);
        neuApplyProfileToUi(neuPublicProfileState.viewedProfile);
        neuWireProfileIdentitySync();
      }

      await neuRefreshFollowUiState();
      neuSyncProfileCountsUi();
      neuSyncProfileActionsUi();
      neuWirePublicProfileEvents();
      activateFeedSource('target');
      await neuRefreshProfileFeed(true);
    } finally {
      neuPublicProfileState.initializing = false;
    }
  }

  return {
    neuSyncProfileCountsUi,
    neuSyncProfileActionsUi,
    neuLoadSuggestedUsers,
    neuInitPublicProfile,
    neuRefreshProfileFeed,
  };
}
