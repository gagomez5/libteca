import { reportError, setSentryUser, trackEvent, setAnalyticsUser } from './telemetry.js';
import { esc, formatShortDate, truncatedCellHTML, uniqueSorted, parseCosto, formatCosto, parseSagaNumber, sagaKey } from './utils.js';
import { state, LIBRARY_CAP, WISHLIST_CAP, DEFAULT_TITLE, STATUS_LABELS, STATUS_NEXT, ICONS, isPremiumTier, isPremiumUser, canAddBook, canAddWish } from './state.js';
import { sb, guestGet, guestSet, guestUid, isClockSkewError, withClockSkewRetry, dbSelectBooks, dbSelectWishlist, dbSelectAuthors, dbSelectProfile, dbInsertBook, dbUpdateBook, dbDeleteBook, dbInsertWish, dbUpdateWish, dbDeleteWish, dbSaveProfile, dbSaveAvatar, isOwnCoverUrl, validateImageLoads, downloadCoverToStorage, deleteOwnStorageCover, savePrefs, loadPrefs, saveNewBookIds } from './db.js';
import { compareByColumn, sortItems, tableHeaderHTML, tableRowHTML, renderColumnConfigPanel, BOOK_COLUMNS, WISH_COLUMNS } from './table.js';
import { syncControlsUI, coverHTML, coverThumbHTML, renderStats, bookMatchesFilters, renderFilterOptions, fillSelect, filteredBooks, bookCardHTML, bookActionsHTML, bookRowActionsSheetHTML, wishRowActionsSheetHTML, emptyBooksHTML, renderGroupedBooksGrid, renderBooksGrid, wishCardHTML, wishActionsHTML, wishMatchesFilters, filteredWishlist, renderWishFilterOptions, emptyWishHTML, renderGroupedWishGrid, renderWishStats, renderWishGrid, syncGroupModal, renderBooksTable, renderWishTable, renderAll, openDetailModal } from './render.js';
import { MAX_TITLE_CHARS, AVATAR_ICONS, SCROLL_LOCK_WATCH_IDS, updateUserAvatar, renderIconPicker, saveTitle, finishTitleEdit, showToast, confirmModalCallback, openConfirmModal, closeConfirmModal, syncScrollLock, getTopmostOpenOverlayEl, getFocusableEls, getInitialFocusTarget, syncModalFocus } from './ui.js';
import { renderAuthorDatalist, ensureAuthorExists, resolveCoverAndSubmit, migrateGuestDataToAccount, getUsedSagaNumbers, suggestNextSagaNumber, updateSagaSuggestions, maybeSuggestNumeroSaga } from './forms-shared.js';
import { editingBookId, editingBookOriginalCover, setStatusUI, setEdicionUI, getBookFormData, openBookModal, closeBookModal, attemptCloseBookModal, saveBookData } from './books.js';
import { editingWishId, editingWishOriginalCover, getWishFormData, openWishModal, closeWishModal, attemptCloseWishModal, saveWishData } from './wishlist.js';
import { loadNotifications, updateNotifDot, formatNotifDate, renderNotifList, openNotificationDetail, markNotificationRead, deleteNotification, markAllNotificationsRead, deleteAllNotifications } from './notifications.js';
import { showAuthScreen, updateAdminLink, openAuthModal, closeAuthModal, updateAccountButton, showApp, showRecoveryScreen, setAuthMsg, setRecoveryMsg, updateAuthUI, startOAuth, backfillGuestFechaLeido, loadData } from './auth.js';
(function(){
  "use strict";

  loadPrefs();

  // ================= AUTENTICACIÓN =================
  document.getElementById('auth-toggle-btn').addEventListener('click', function(){
    state.authMode = state.authMode === 'login' ? 'signup' : 'login';
    updateAuthUI();
  });

  document.getElementById('forgot-password-link').addEventListener('click', function(){
    state.authMode = (state.authMode === 'recover') ? 'login' : 'recover';
    updateAuthUI();
  });

  document.getElementById('auth-form').addEventListener('submit', function(e){
    e.preventDefault();
    var email = document.getElementById('auth-email').value.trim();
    var password = document.getElementById('auth-password').value;

    if(state.authMode === 'recover'){
      if(!email){ setAuthMsg('Ingresa tu correo.', 'error'); return; }
      setAuthMsg('Enviando…');
      sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname }).then(function(res){
        if(res.error){ setAuthMsg(res.error.message, 'error'); return; }
        setAuthMsg('Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada (y spam).', 'ok');
      });
      return;
    }

    setAuthMsg('Un momento…');
    if(state.authMode === 'login'){
      if(!password){ setAuthMsg('Ingresa tu contraseña.', 'error'); return; }
      sb.auth.signInWithPassword({ email: email, password: password }).then(function(res){
        if(res.error){
          setAuthMsg(res.error.message, 'error');
          document.getElementById('forgot-password-wrap').classList.remove('hidden');
          document.getElementById('forgot-password-link').textContent = '¿Olvidaste tu contraseña?';
          return;
        }
        setAuthMsg('');
      });
    } else {
      if(!password){ setAuthMsg('Ingresa una contraseña.', 'error'); return; }
      sb.auth.signUp({ email: email, password: password }).then(function(res){
        if(res.error){ setAuthMsg(res.error.message, 'error'); return; }
        trackEvent('signup_completed', { method: 'email' });
        if(state.cameFromGuest){ localStorage.setItem('guest_pending_migration', '1'); state.cameFromGuest = false; }
        if(res.data && res.data.session){
          setAuthMsg('');
        } else {
          setAuthMsg('Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.', 'ok');
        }
      });
    }
  });

  document.getElementById('recovery-form').addEventListener('submit', function(e){
    e.preventDefault();
    var p1 = document.getElementById('recovery-password').value;
    var p2 = document.getElementById('recovery-password-confirm').value;
    if(p1 !== p2){ setRecoveryMsg('Las contraseñas no coinciden.', 'error'); return; }
    if(p1.length < 8){ setRecoveryMsg('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    setRecoveryMsg('Guardando…');
    sb.auth.updateUser({ password: p1 }).then(function(res){
      if(res.error){ setRecoveryMsg(res.error.message, 'error'); return; }
      setRecoveryMsg('Contraseña actualizada. Entrando…', 'ok');
      setTimeout(function(){
        state.authMode = 'login';
        sb.auth.getSession().then(function(r){
          if(r.data && r.data.session && r.data.session.user){
            state.currentUserId = r.data.session.user.id;
            showApp();
            loadData();
          } else {
            showAuthScreen();
          }
        });
      }, 1200);
    });
  });

  document.getElementById('btn-logout').addEventListener('click', function(){
    if(state.isGuest){
      openAuthModal();
    } else {
      sb.auth.signOut();
    }
  });

  document.getElementById('auth-modal-close').addEventListener('click', function(){
    closeAuthModal();
  });

  document.getElementById('guest-link').addEventListener('click', function(){
    state.isGuest = true;
    state.currentUserId = null;
    trackEvent('guest_mode_started');
    showApp();
    loadData();
    history.pushState({ guestEntry: true }, '', location.href);
  });

  window.addEventListener('popstate', function(e){
    if(e.state && e.state.guestEntry){
      state.isGuest = true;
      state.currentUserId = null;
      showApp();
      loadData();
    } else if(state.authBackGuardActive){
      history.pushState({ authApp: true }, '', location.href);
    } else if(state.isGuest){
      state.isGuest = false;
      state.currentUserId = null;
      showAuthScreen();
    }
  });

  window.addEventListener('pageshow', function(e){
    if(e.persisted){ location.reload(); }
  });

  document.getElementById('google-oauth-btn').addEventListener('click', function(){ startOAuth('google'); });
  document.getElementById('apple-oauth-btn').addEventListener('click', function(){ startOAuth('apple'); });

  sb.auth.onAuthStateChange(function(event, session){
    if(event === 'PASSWORD_RECOVERY'){
      showRecoveryScreen();
      return;
    }
    if(session && session.user){
      state.currentUserId = session.user.id;
      setSentryUser(state.currentUserId);
      setAnalyticsUser(state.currentUserId);
      state.isGuest = false;
      if(!state.authBackGuardActive){
        state.authBackGuardActive = true;
        history.pushState({ authApp: true }, '', location.href);
      }
      if(localStorage.getItem('guest_pending_migration') === '1'){
        state.migrationInProgress = true;
        migrateGuestDataToAccount().then(function(){
          state.migrationInProgress = false;
          trackEvent('guest_migration_completed');
          showApp();
          loadData();
        });
        return;
      }
      if(state.migrationInProgress) return;
      showApp();
      loadData();
    } else {
      state.currentUserId = null;
      setSentryUser(null);
      setAnalyticsUser(null);
      state.authBackGuardActive = false;
      localStorage.removeItem('guest_pending_migration');
      showAuthScreen();
    }
  });

  // ================= NOTIFICACIONES =================

  document.getElementById('title-display').addEventListener('click', function(){
    var titleEl = document.getElementById('app-title-text');
    var input = document.getElementById('title-input');
    input.value = titleEl.textContent;
    document.getElementById('title-display').classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
  });

  document.getElementById('title-input').addEventListener('input', function(e){
    var chars = Array.from(e.target.value);
    if(chars.length > MAX_TITLE_CHARS){ e.target.value = chars.slice(0, MAX_TITLE_CHARS).join(''); }
  });

  document.getElementById('title-input').addEventListener('blur', function(){ finishTitleEdit(true); });
  document.getElementById('title-input').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); document.getElementById('title-input').blur(); }
    if(e.key === 'Escape'){ e.preventDefault(); finishTitleEdit(false); }
  });

  // ---------- render helpers ----------

  // ================= VISTA LISTADO (TABLA) =================

  document.getElementById('f-author').addEventListener('blur', function(e){ ensureAuthorExists(e.target.value); });
  document.getElementById('w-author').addEventListener('blur', function(e){ ensureAuthorExists(e.target.value); });
  document.getElementById('f-author').addEventListener('input', function(){
    updateSagaSuggestions('f-author', 'book-saga-suggestions');
    maybeSuggestNumeroSaga('f-author', 'f-saga', 'f-numero-saga', state.bookNumeroTouched, 'book', editingBookId);
  });
  document.getElementById('f-saga').addEventListener('input', function(){
    maybeSuggestNumeroSaga('f-author', 'f-saga', 'f-numero-saga', state.bookNumeroTouched, 'book', editingBookId);
  });
  document.getElementById('f-numero-saga').addEventListener('input', function(){ state.bookNumeroTouched = true; });
  document.getElementById('w-author').addEventListener('input', function(){
    updateSagaSuggestions('w-author', 'wish-saga-suggestions');
    maybeSuggestNumeroSaga('w-author', 'w-saga', 'w-numero-saga', state.wishNumeroTouched, 'wish', editingWishId);
  });
  document.getElementById('w-saga').addEventListener('input', function(){
    maybeSuggestNumeroSaga('w-author', 'w-saga', 'w-numero-saga', state.wishNumeroTouched, 'wish', editingWishId);
  });
  document.getElementById('w-numero-saga').addEventListener('input', function(){ state.wishNumeroTouched = true; });


  document.getElementById('confirm-modal-accept').addEventListener('click', function(){
    var cb = confirmModalCallback;
    closeConfirmModal();
    if(cb) cb();
  });

  // ================= BLOQUEO DE SCROLL DE FONDO =================
  var scrollLockObserver = new MutationObserver(function(){ syncScrollLock(); syncModalFocus(); });
  SCROLL_LOCK_WATCH_IDS.forEach(function(elId){
    var target = document.getElementById(elId);
    if(target) scrollLockObserver.observe(target, { attributes:true, attributeFilter:['class'] });
  });
  syncScrollLock();
  syncModalFocus();

  // ================= ACCESIBILIDAD: foco y teclado en overlays =================
  document.querySelectorAll('.modal-overlay').forEach(function(overlay){
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    var heading = overlay.querySelector('.modal-head h2');
    if(heading){
      if(!heading.id) heading.id = overlay.id + '-heading';
      overlay.setAttribute('aria-labelledby', heading.id);
    }
    var closeBtn = overlay.querySelector('.modal-head > button');
    if(closeBtn && !closeBtn.hasAttribute('aria-label')) closeBtn.setAttribute('aria-label', 'Cerrar');
  });

  function closeOverlayById(id){
    if(id === 'modal-book'){ attemptCloseBookModal(); }
    else if(id === 'modal-wish'){ attemptCloseWishModal(); }
    else if(id === 'modal-group'){ document.getElementById('modal-group').classList.add('hidden'); state.openGroupContext = null; }
    else if(id === 'modal-confirm'){ closeConfirmModal(); }
    else if(id === 'auth-screen'){ closeAuthModal(); }
    else { document.getElementById(id).classList.add('hidden'); }
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){
      var topEl = getTopmostOpenOverlayEl();
      if(topEl){ e.preventDefault(); closeOverlayById(topEl.id); }
      return;
    }
    if(e.key === 'Tab'){
      var topEl2 = getTopmostOpenOverlayEl();
      if(!topEl2) return;
      var focusable = getFocusableEls(topEl2);
      if(focusable.length === 0){ e.preventDefault(); return; }
      var first = focusable[0], last = focusable[focusable.length - 1];
      var active = document.activeElement;
      var needsRedirect = (active === topEl2) || !topEl2.contains(active);
      if(e.shiftKey){
        if(needsRedirect || active === first){ e.preventDefault(); last.focus(); }
      } else {
        if(needsRedirect || active === last){ e.preventDefault(); first.focus(); }
      }
    }
  });

  // ---------- eventos ----------
  document.addEventListener('click', function(e){
    if(e.target.id === 'auth-screen' && e.target.classList.contains('modal-mode')){ closeAuthModal(); return; }
    if(e.target.id === 'modal-book'){ attemptCloseBookModal(); return; }
    if(e.target.id === 'modal-wish'){ attemptCloseWishModal(); return; }
    if(e.target.id === 'modal-group'){ document.getElementById('modal-group').classList.add('hidden'); state.openGroupContext = null; return; }
    if(e.target.id === 'modal-detail'){ document.getElementById('modal-detail').classList.add('hidden'); return; }
    if(e.target.id === 'modal-notifications'){ document.getElementById('modal-notifications').classList.add('hidden'); return; }
    if(e.target.id === 'modal-notification-detail'){ document.getElementById('modal-notification-detail').classList.add('hidden'); return; }
    if(e.target.id === 'modal-confirm'){ closeConfirmModal(); return; }
    if(e.target.id === 'modal-feedback'){ document.getElementById('modal-feedback').classList.add('hidden'); return; }
    if(e.target.id === 'modal-icon-picker'){ document.getElementById('modal-icon-picker').classList.add('hidden'); return; }
    if(e.target.id === 'modal-row-actions'){ document.getElementById('modal-row-actions').classList.add('hidden'); return; }
    var userDropdown = document.getElementById('user-dropdown');
    if(!userDropdown.classList.contains('hidden') && !e.target.closest('#user-menu-wrap')){
      userDropdown.classList.add('hidden');
    }
    var bookColPanel = document.getElementById('book-columns-panel');
    if(!bookColPanel.classList.contains('hidden') && !e.target.closest('#book-columns-wrap')){
      bookColPanel.classList.add('hidden');
    }
    var wishColPanel = document.getElementById('wish-columns-panel');
    if(!wishColPanel.classList.contains('hidden') && !e.target.closest('#wish-columns-wrap')){
      wishColPanel.classList.add('hidden');
    }
    var el = e.target.closest('[data-action]');
    if(!el) return;
    var action = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');

    if(action !== 'open-row-actions' && action !== 'close-row-actions-modal' && el.closest('#modal-row-actions')){
      document.getElementById('modal-row-actions').classList.add('hidden');
    }

    if(id && state.newBookIds[id]){
      delete state.newBookIds[id];
      saveNewBookIds();
      renderBooksGrid();
    }

    if(action === 'tab'){
      var tab = el.getAttribute('data-tab');
      document.getElementById('tab-biblioteca').classList.toggle('active', tab==='biblioteca');
      document.getElementById('tab-wishlist').classList.toggle('active', tab==='wishlist');
      document.getElementById('view-biblioteca').classList.toggle('hidden', tab!=='biblioteca');
      document.getElementById('view-wishlist').classList.toggle('hidden', tab!=='wishlist');
      document.getElementById('wish-stats').classList.toggle('hidden', tab!=='wishlist');
    }
    else if(action === 'toggle-filters'){
      var panel = document.getElementById('filters-panel');
      var willShow = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      if(willShow){ document.getElementById('group-panel').classList.add('hidden'); document.getElementById('book-columns-panel').classList.add('hidden'); }
    }
    else if(action === 'toggle-group'){
      if(state.bookViewMode === 'listado') return;
      var gpanel = document.getElementById('group-panel');
      var gWillShow = gpanel.classList.contains('hidden');
      gpanel.classList.toggle('hidden');
      if(gWillShow){ document.getElementById('filters-panel').classList.add('hidden'); document.getElementById('book-columns-panel').classList.add('hidden'); }
    }
    else if(action === 'set-group'){
      var chosen = el.getAttribute('data-group');
      state.groupBy = (state.groupBy === chosen) ? '' : chosen;
      document.getElementById('group-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderBooksGrid();
    }
    else if(action === 'open-group'){
      var gi = parseInt(el.getAttribute('data-index'), 10);
      var g = state.currentGroups[gi];
      if(!g) return;
      state.openGroupContext = { type:'book', label: g.label };
      document.getElementById('group-modal-title').textContent = g.label + ' · ' + g.items.length + (g.items.length===1?' libro':' libros');
      document.getElementById('grid-group-books').innerHTML = g.items.map(bookCardHTML).join('');
      document.getElementById('modal-group').classList.remove('hidden');
    }
    else if(action === 'close-group-modal'){ document.getElementById('modal-group').classList.add('hidden'); state.openGroupContext = null; }
    else if(action === 'toggle-wish-filters'){
      var wfPanel = document.getElementById('wish-filters-panel');
      var wfWillShow = wfPanel.classList.contains('hidden');
      wfPanel.classList.toggle('hidden');
      if(wfWillShow){ document.getElementById('wish-group-panel').classList.add('hidden'); document.getElementById('wish-columns-panel').classList.add('hidden'); }
    }
    else if(action === 'toggle-wish-group'){
      if(state.wishViewMode === 'listado') return;
      var wgPanel = document.getElementById('wish-group-panel');
      var wgWillShow = wgPanel.classList.contains('hidden');
      wgPanel.classList.toggle('hidden');
      if(wgWillShow){ document.getElementById('wish-filters-panel').classList.add('hidden'); document.getElementById('wish-columns-panel').classList.add('hidden'); }
    }
    else if(action === 'set-wish-group'){
      var wChosen = el.getAttribute('data-group');
      state.wishGroupBy = (state.wishGroupBy === wChosen) ? '' : wChosen;
      document.getElementById('wish-group-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderWishGrid();
    }
    else if(action === 'open-wish-group'){
      var wgi = parseInt(el.getAttribute('data-index'), 10);
      var wg = state.currentWishGroups[wgi];
      if(!wg) return;
      state.openGroupContext = { type:'wish', label: wg.label };
      document.getElementById('group-modal-title').textContent = wg.label + ' · ' + wg.items.length + (wg.items.length===1?' libro':' libros');
      document.getElementById('grid-group-books').innerHTML = wg.items.map(wishCardHTML).join('');
      document.getElementById('modal-group').classList.remove('hidden');
    }
    else if(action === 'set-book-view'){
      var newBookView = el.getAttribute('data-view');
      if(newBookView === 'listado' && !isPremiumUser()){ trackEvent('paywall_shown', { context: 'listado_view_book' }); showToast('La vista Listado es una función de Lector Premium.'); return; }
      if(newBookView === state.bookViewMode) return;
      state.bookViewMode = newBookView;
      if(state.bookViewMode === 'listado'){ document.getElementById('group-panel').classList.add('hidden'); }
      document.getElementById('book-columns-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderBooksGrid();
    }
    else if(action === 'set-wish-view'){
      var newWishView = el.getAttribute('data-view');
      if(newWishView === 'listado' && !isPremiumUser()){ trackEvent('paywall_shown', { context: 'listado_view_wish' }); showToast('La vista Listado es una función de Lector Premium.'); return; }
      if(newWishView === state.wishViewMode) return;
      state.wishViewMode = newWishView;
      if(state.wishViewMode === 'listado'){ document.getElementById('wish-group-panel').classList.add('hidden'); }
      document.getElementById('wish-columns-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderWishGrid();
    }
    else if(action === 'toggle-column-config'){
      var ccScope = el.getAttribute('data-scope');
      var panelId = ccScope === 'book' ? 'book-columns-panel' : 'wish-columns-panel';
      var cpanel = document.getElementById(panelId);
      var ccWillShow = cpanel.classList.contains('hidden');
      cpanel.classList.toggle('hidden');
      if(ccWillShow){
        if(ccScope === 'book'){
          document.getElementById('filters-panel').classList.add('hidden');
          document.getElementById('group-panel').classList.add('hidden');
        } else {
          document.getElementById('wish-filters-panel').classList.add('hidden');
          document.getElementById('wish-group-panel').classList.add('hidden');
        }
      }
    }
    else if(action === 'toggle-column'){
      var tcScope = el.getAttribute('data-scope');
      var tcCol = el.getAttribute('data-column');
      var tcMap = tcScope === 'book' ? state.bookTableColumns : state.wishTableColumns;
      tcMap[tcCol] = !tcMap[tcCol];
      savePrefs();
      if(tcScope === 'book') renderBooksGrid(); else renderWishGrid();
    }
    else if(action === 'sort-column'){
      var scScope = el.getAttribute('data-scope');
      var scCol = el.getAttribute('data-column');
      var scColDefs = scScope === 'book' ? BOOK_COLUMNS : WISH_COLUMNS;
      var scState = scScope === 'book' ? state.bookTableSort : state.wishTableSort;
      if(scCol !== 'title'){
        var scDef = scColDefs.filter(function(c){ return c.key === scCol; })[0];
        if(!scDef || !scDef.sortType) return;
      }
      if(scState.key === scCol){ scState.dir = scState.dir === 'asc' ? 'desc' : 'asc'; }
      else { scState.key = scCol; scState.dir = 'asc'; }
      savePrefs();
      if(scScope === 'book') renderBooksGrid(); else renderWishGrid();
    }
    else if(action === 'show-full-title'){
      showToast(el.getAttribute('data-title'));
    }
    else if(action === 'open-row-actions'){
      var oraScope = el.getAttribute('data-scope');
      var oraItem = oraScope === 'book' ? state.books.find(function(b){return b.id===id;}) : state.wishlist.find(function(w){return w.id===id;});
      if(!oraItem) return;
      document.getElementById('row-actions-title').textContent = oraItem.title;
      document.getElementById('row-actions-body').innerHTML = oraScope === 'book' ? bookRowActionsSheetHTML(oraItem) : wishRowActionsSheetHTML(oraItem);
      document.getElementById('modal-row-actions').classList.remove('hidden');
    }
    else if(action === 'close-row-actions-modal'){ document.getElementById('modal-row-actions').classList.add('hidden'); }
    else if(action === 'filter-stat'){
      var clickedStatus = el.getAttribute('data-status');
      state.filters.status = (clickedStatus === '' ? '' : (state.filters.status === clickedStatus ? '' : clickedStatus));
      document.getElementById('filter-status').value = state.filters.status;
      savePrefs(); syncControlsUI();
      renderStats();
      renderFilterOptions();
      renderBooksGrid();
    }
    else if(action === 'reset-book-filters'){
      state.filters = { search: state.filters.search, author:'', saga:'', genre:'', status:'', edicion:'' };
      document.getElementById('filter-author').value = '';
      document.getElementById('filter-saga').value = '';
      document.getElementById('filter-genre').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-edicion').value = '';
      savePrefs(); syncControlsUI();
      renderStats();
      renderFilterOptions();
      renderBooksGrid();
    }
    else if(action === 'reset-wish-filters'){
      state.wishFilters.author = '';
      state.wishFilters.tienda = '';
      state.wishFilters.costoOp = 'gt';
      state.wishFilters.costoVal = null;
      document.getElementById('wish-filter-author').value = '';
      document.getElementById('wish-filter-tienda').value = '';
      document.getElementById('wish-filter-costo-op').value = 'gt';
      document.getElementById('wish-filter-costo-val').value = '';
      savePrefs(); syncControlsUI();
      renderWishFilterOptions();
      renderWishGrid();
    }
    else if(action === 'clear-book-all'){
      state.filters = { search: state.filters.search, author:'', saga:'', genre:'', status:'' };
      state.groupBy = '';
      document.getElementById('filter-author').value = '';
      document.getElementById('filter-saga').value = '';
      document.getElementById('filter-genre').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filters-panel').classList.add('hidden');
      document.getElementById('group-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderStats();
      renderFilterOptions();
      renderBooksGrid();
    }
    else if(action === 'clear-wish-all'){
      state.wishFilters.author = '';
      state.wishFilters.tienda = '';
      state.wishFilters.costoOp = 'gt';
      state.wishFilters.costoVal = null;
      state.wishGroupBy = '';
      document.getElementById('wish-filter-author').value = '';
      document.getElementById('wish-filter-tienda').value = '';
      document.getElementById('wish-filter-costo-op').value = 'gt';
      document.getElementById('wish-filter-costo-val').value = '';
      document.getElementById('wish-filters-panel').classList.add('hidden');
      document.getElementById('wish-group-panel').classList.add('hidden');
      savePrefs(); syncControlsUI();
      renderWishFilterOptions();
      renderWishGrid();
    }
    else if(action === 'add-book'){
      if(!canAddBook()){ trackEvent('paywall_shown', { context: 'add_book_cap' }); showToast('Alcanzaste el límite de 10 libros. Actualiza a Lector Premium para agregar más.'); return; }
      openBookModal(null);
    }
    else if(action === 'edit-book'){ openBookModal(state.books.find(function(b){return b.id===id;})); }
    else if(action === 'view-book'){
      var vb = state.books.find(function(x){return x.id===id;});
      if(vb) openDetailModal(vb, 'book');
    }
    else if(action === 'view-wish'){
      var vw = state.wishlist.find(function(x){return x.id===id;});
      if(vw) openDetailModal(vw, 'wish');
    }
    else if(action === 'close-detail-modal'){ document.getElementById('modal-detail').classList.add('hidden'); }
    else if(action === 'open-notifications'){
      renderNotifList();
      document.getElementById('modal-notifications').classList.remove('hidden');
    }
    else if(action === 'close-notifications-modal'){ document.getElementById('modal-notifications').classList.add('hidden'); }
    else if(action === 'open-notification-detail'){ openNotificationDetail(id); }
    else if(action === 'close-notification-detail-modal'){ document.getElementById('modal-notification-detail').classList.add('hidden'); }
    else if(action === 'close-confirm-modal'){ closeConfirmModal(); }
    else if(action === 'delete-notification-inline'){
      deleteNotification(id).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        renderNotifList();
      });
    }
    else if(action === 'mark-all-read'){ markAllNotificationsRead(); }
    else if(action === 'delete-all-notifications'){
      openConfirmModal('Eliminar notificaciones', '¿Eliminar todas las notificaciones? Esta acción no se puede deshacer.', function(){ deleteAllNotifications(); });
    }
    else if(action === 'mark-read-detail'){
      markNotificationRead(state.currentNotifDetailId).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        document.getElementById('modal-notification-detail').classList.add('hidden');
        renderNotifList();
      });
    }
    else if(action === 'delete-notification-detail'){
      deleteNotification(state.currentNotifDetailId).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        document.getElementById('modal-notification-detail').classList.add('hidden');
        renderNotifList();
      });
    }
    else if(action === 'toggle-user-menu'){ document.getElementById('user-dropdown').classList.toggle('hidden'); }
    else if(action === 'open-icon-picker'){
      document.getElementById('user-dropdown').classList.add('hidden');
      renderIconPicker();
      document.getElementById('modal-icon-picker').classList.remove('hidden');
    }
    else if(action === 'close-icon-picker-modal'){ document.getElementById('modal-icon-picker').classList.add('hidden'); }
    else if(action === 'pick-avatar-icon'){
      var pickedIcon = el.getAttribute('data-icon');
      dbSaveAvatar(pickedIcon).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        updateUserAvatar(pickedIcon);
        document.getElementById('modal-icon-picker').classList.add('hidden');
        showToast('Ícono de perfil actualizado');
      });
    }
    else if(action === 'do-logout'){
      document.getElementById('user-dropdown').classList.add('hidden');
      sb.auth.signOut();
    }
    else if(action === 'open-feedback'){
      document.getElementById('user-dropdown').classList.add('hidden');
      document.getElementById('feedback-message').value = '';
      document.getElementById('modal-feedback').classList.remove('hidden');
    }
    else if(action === 'close-feedback-modal'){ document.getElementById('modal-feedback').classList.add('hidden'); }
    else if(action === 'submit-feedback'){
      var feedbackText = document.getElementById('feedback-message').value.trim();
      if(!feedbackText){ showToast('Escribe un mensaje.'); return; }
      var feedbackBtn = document.getElementById('feedback-submit-btn');
      feedbackBtn.disabled = true;
      sb.rpc('submit_feedback', { message: feedbackText }).then(function(res){
        feedbackBtn.disabled = false;
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        document.getElementById('modal-feedback').classList.add('hidden');
        showToast('¡Gracias por tu feedback!');
      });
    }
    else if(action === 'close-book-modal'){ attemptCloseBookModal(); }
    else if(action === 'close-wish-modal'){ attemptCloseWishModal(); }
    else if(action === 'add-wish'){
      if(!canAddWish()){ trackEvent('paywall_shown', { context: 'add_wish_cap' }); showToast('Alcanzaste el límite de 10 libros en tu wishlist. Actualiza a Lector Premium para agregar más.'); return; }
      openWishModal(null);
    }
    else if(action === 'edit-wish'){ openWishModal(state.wishlist.find(function(w){return w.id===id;})); }
    else if(action === 'set-status'){ setStatusUI(el.getAttribute('data-status')); }
    else if(action === 'set-edicion'){ setEdicionUI(el.getAttribute('data-edicion')); }
    else if(action === 'toggle-status'){
      var book = state.books.find(function(b){return b.id===id;});
      var newStatus = STATUS_NEXT[book.status] || 'pendiente';
      if(newStatus === book.status){ return; }
      dbUpdateBook(id, { status:newStatus }).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        state.books = state.books.map(function(b){ return b.id===id ? Object.assign({},b,{status:newStatus}) : b; });
        renderAll();
      });
    }
    else if(action === 'toggle-edicion'){
      var beBook = state.books.find(function(b){return b.id===id;});
      var newEdicion = beBook.edicion === 'especial' ? 'normal' : 'especial';
      dbUpdateBook(id, { edicion:newEdicion }).then(function(res){
        if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
        state.books = state.books.map(function(b){ return b.id===id ? Object.assign({},b,{edicion:newEdicion}) : b; });
        renderAll();
      });
    }
    else if(action === 'delete-book'){
      openConfirmModal('Eliminar libro', 'Vas a eliminar este libro de tu biblioteca. Esta acción es permanente y no se puede deshacer.', function(){
        var delBook = state.books.find(function(b){return b.id===id;});
        dbDeleteBook(id).then(function(res){
          if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
          state.books = state.books.filter(function(b){ return b.id!==id; });
          renderAll();
          if(delBook) deleteOwnStorageCover(delBook.cover);
        });
      });
    }
    else if(action === 'delete-wish'){
      openConfirmModal('Eliminar de la wishlist', 'Vas a eliminar este libro de tu wishlist. Esta acción es permanente y no se puede deshacer.', function(){
        var delWish = state.wishlist.find(function(w){return w.id===id;});
        dbDeleteWish(id).then(function(res){
          if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
          state.wishlist = state.wishlist.filter(function(w){ return w.id!==id; });
          renderAll();
          if(delWish) deleteOwnStorageCover(delWish.cover);
        });
      });
    }
    else if(action === 'buy-wish'){
      if(!canAddBook()){ trackEvent('paywall_shown', { context: 'buy_wish_cap' }); showToast('Alcanzaste el límite de 10 libros. Actualiza a Lector Premium para agregarlo.'); return; }
      var item = state.wishlist.find(function(w){return w.id===id;});
      if(!item) return;
      dbInsertBook({ title:item.title, author:item.author, saga:item.saga||'', numero_saga:item.numero_saga||null, genre:'', cover:item.cover, costo:item.costo, status:'pendiente', edicion:'normal' }).then(function(insRes){
        if(insRes.error){ reportError(insRes.error); showToast('Error: '+insRes.error.message, 'error'); return; }
        dbDeleteWish(id).then(function(delRes){
          if(delRes.error){ reportError(delRes.error); showToast('Error: '+delRes.error.message, 'error'); return; }
          var newBooks = insRes.data || [];
          state.books = newBooks.concat(state.books);
          newBooks.forEach(function(nb){ state.newBookIds[nb.id] = true; });
          saveNewBookIds();
          state.wishlist = state.wishlist.filter(function(w){ return w.id!==id; });
          renderAll();
          var libName = document.getElementById('app-title-text').textContent;
          showToast('Libro agregado a tu biblioteca "'+libName+'"');
        });
      });
    }
  });

  document.getElementById('search-input').addEventListener('input', function(e){
    state.filters.search = e.target.value;
    savePrefs();
    renderFilterOptions();
    renderBooksGrid();
  });
  ['filter-author','filter-saga','filter-genre','filter-status','filter-edicion'].forEach(function(id){
    document.getElementById(id).addEventListener('change', function(e){
      var key = id.replace('filter-','');
      state.filters[key] = e.target.value;
      savePrefs(); syncControlsUI();
      renderStats();
      renderFilterOptions();
      renderBooksGrid();
    });
  });

  document.getElementById('wish-search-input').addEventListener('input', function(e){
    state.wishFilters.search = e.target.value;
    savePrefs();
    renderWishFilterOptions();
    renderWishGrid();
  });
  document.getElementById('wish-filter-author').addEventListener('change', function(e){
    state.wishFilters.author = e.target.value;
    savePrefs(); syncControlsUI();
    renderWishFilterOptions();
    renderWishGrid();
  });
  document.getElementById('wish-filter-tienda').addEventListener('change', function(e){
    state.wishFilters.tienda = e.target.value;
    savePrefs(); syncControlsUI();
    renderWishFilterOptions();
    renderWishGrid();
  });
  document.getElementById('wish-filter-costo-op').addEventListener('change', function(e){
    state.wishFilters.costoOp = e.target.value;
    savePrefs(); syncControlsUI();
    renderWishFilterOptions();
    renderWishGrid();
  });
  document.getElementById('wish-filter-costo-val').addEventListener('input', function(e){
    state.wishFilters.costoVal = parseCosto(e.target.value);
    savePrefs(); syncControlsUI();
    renderWishFilterOptions();
    renderWishGrid();
  });

  document.getElementById('form-book').addEventListener('submit', function(e){
    e.preventDefault();
    var data = getBookFormData();
    if(!data.title || !data.author) return;
    if(data.saga && data.numero_saga != null){
      var used = getUsedSagaNumbers(data.author, data.saga, 'book', editingBookId);
      if(used.indexOf(data.numero_saga) !== -1){
        showToast('El número '+data.numero_saga+' de la saga "'+data.saga+'" ya está repetido');
      }
    }
    resolveCoverAndSubmit(data, editingBookOriginalCover, 'book-submit-btn', saveBookData);
  });

  document.getElementById('form-wish').addEventListener('submit', function(e){
    e.preventDefault();
    var data = getWishFormData();
    if(!data.title || !data.author) return;
    if(data.saga && data.numero_saga != null){
      var used = getUsedSagaNumbers(data.author, data.saga, 'wish', editingWishId);
      if(used.indexOf(data.numero_saga) !== -1){
        showToast('El número '+data.numero_saga+' de la saga "'+data.saga+'" ya está repetido');
      }
    }
    resolveCoverAndSubmit(data, editingWishOriginalCover, 'wish-submit-btn', saveWishData);
  });

})();
