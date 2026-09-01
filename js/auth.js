"use strict";

import { uniqueSorted } from './utils.js';
import { state, DEFAULT_TITLE, isPremiumUser } from './state.js';
import { sb, guestSet, dbSelectBooks, dbSelectWishlist, dbSelectProfile, dbSelectAuthors, dbSelectSubscription } from './db.js';
import { reportError } from './telemetry.js';
import { showToast, updateUserAvatar, renderUserRoleBadge, renderUpgradeMenuItems } from './ui.js';
import { renderAll } from './render.js';
import { renderAuthorDatalist } from './forms-shared.js';
import { loadNotifications, updateNotifDot } from './notifications.js';

var REMEMBERED_EMAIL_KEY = 'remembered_email';

export function applyRememberedEmail(){
  var emailInput = document.getElementById('auth-email');
  var rememberBox = document.getElementById('auth-remember-me');
  var passwordInput = document.getElementById('auth-password');
  var remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
  if(remembered){
    emailInput.value = remembered;
    rememberBox.checked = true;
  } else {
    emailInput.value = '';
    rememberBox.checked = false;
  }
  passwordInput.value = '';
}
export function saveRememberedEmail(email, remember){
  if(remember){ localStorage.setItem(REMEMBERED_EMAIL_KEY, email); }
  else { localStorage.removeItem(REMEMBERED_EMAIL_KEY); }
}

export function showAuthScreen(){
  document.getElementById('auth-screen').classList.remove('modal-mode', 'hidden');
  document.getElementById('auth-modal-close').classList.add('hidden');
  document.getElementById('recovery-screen').classList.add('hidden');
  document.getElementById('app-root').classList.add('hidden');
  state.currentUserRole = 'free';
  updateAdminLink();
  applyRememberedEmail();
}
export function updateAdminLink(){
  document.getElementById('btn-admin-link').classList.toggle('hidden', state.isGuest || state.currentUserRole !== 'administrador');
}
export function openAuthModal(){
  state.authMode = 'login';
  state.cameFromGuest = true;
  document.getElementById('auth-screen').classList.add('modal-mode');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-modal-close').classList.remove('hidden');
  document.getElementById('auth-screen').setAttribute('role', 'dialog');
  document.getElementById('auth-screen').setAttribute('aria-modal', 'true');
  document.getElementById('auth-screen').setAttribute('aria-labelledby', 'auth-subtitle');
  applyRememberedEmail();
  updateAuthUI();
}
export function closeAuthModal(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('modal-mode');
  document.getElementById('auth-modal-close').classList.add('hidden');
  document.getElementById('auth-screen').removeAttribute('role');
  document.getElementById('auth-screen').removeAttribute('aria-modal');
  document.getElementById('auth-screen').removeAttribute('aria-labelledby');
  state.cameFromGuest = false;
}
export function updateAccountButton(){
  document.getElementById('btn-logout').textContent = state.isGuest ? 'Ingresar / Crear cuenta' : 'Cerrar sesión';
  document.getElementById('btn-logout').classList.toggle('hidden', !state.isGuest);
  document.getElementById('user-menu-wrap').classList.toggle('hidden', state.isGuest);
  if(state.isGuest){ updateUserAvatar(null); }
}
export function showApp(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('modal-mode');
  document.getElementById('auth-modal-close').classList.add('hidden');
  document.getElementById('recovery-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  updateAccountButton();
}
export function showRecoveryScreen(){
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('recovery-screen').classList.remove('hidden');
}

export function setAuthMsg(text, kind){
  var el = document.getElementById('auth-msg');
  el.textContent = text || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}
export function setRecoveryMsg(text, kind){
  var el = document.getElementById('recovery-msg');
  el.textContent = text || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
}

export function updateAuthUI(){
  var pwField = document.getElementById('auth-password-field');
  var pwInput = document.getElementById('auth-password');
  var submitBtn = document.getElementById('auth-submit-btn');
  var subtitle = document.getElementById('auth-subtitle');
  var toggleText = document.getElementById('auth-toggle-text');
  var toggleBtn = document.getElementById('auth-toggle-btn');
  var toggleWrap = document.getElementById('auth-toggle-wrap');
  var forgotWrap = document.getElementById('forgot-password-wrap');
  var forgotLink = document.getElementById('forgot-password-link');
  var guestDivider = document.getElementById('guest-divider');
  var guestLink = document.getElementById('guest-link');
  var oauthButtons = document.getElementById('oauth-buttons');
  var oauthDivider = document.getElementById('oauth-divider');
  var legalNotice = document.getElementById('auth-legal-notice');
  var rememberField = document.getElementById('auth-remember-field');
  var isModal = document.getElementById('auth-screen').classList.contains('modal-mode');

  setAuthMsg('');
  legalNotice.classList.toggle('hidden', state.authMode === 'recover');

  if(state.authMode === 'recover'){
    pwField.classList.add('hidden');
    pwInput.required = false;
    pwInput.value = '';
    submitBtn.textContent = 'Enviar enlace de recuperación';
    subtitle.textContent = 'Ingresa tu correo para recuperar tu contraseña';
    toggleWrap.classList.add('hidden');
    forgotWrap.classList.remove('hidden');
    forgotLink.textContent = 'Volver a iniciar sesión';
    guestDivider.classList.add('hidden');
    guestLink.classList.add('hidden');
    oauthButtons.classList.add('hidden');
    oauthDivider.classList.add('hidden');
    rememberField.classList.add('hidden');
  } else {
    pwField.classList.remove('hidden');
    pwInput.required = true;
    pwInput.autocomplete = state.authMode === 'login' ? 'current-password' : 'new-password';
    submitBtn.textContent = state.authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
    subtitle.textContent = state.authMode === 'login' ? 'Inicia sesión para ver tus libros' : 'Crea tu cuenta para empezar tu biblioteca';
    toggleText.textContent = state.authMode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
    toggleBtn.textContent = state.authMode === 'login' ? 'Crear una' : 'Iniciar sesión';
    toggleWrap.classList.remove('hidden');
    forgotWrap.classList.add('hidden');
    guestDivider.classList.toggle('hidden', isModal);
    guestLink.classList.toggle('hidden', isModal);
    oauthButtons.classList.remove('hidden');
    oauthDivider.classList.remove('hidden');
    rememberField.classList.toggle('hidden', state.authMode !== 'login');
  }
}

export function startOAuth(provider){
  if(state.cameFromGuest){ localStorage.setItem('guest_pending_migration', '1'); state.cameFromGuest = false; }
  sb.auth.signInWithOAuth({
    provider: provider,
    options: { redirectTo: window.location.origin + window.location.pathname }
  }).then(function(res){
    if(res.error){ setAuthMsg(res.error.message, 'error'); }
  });
}

// ================= DATOS =================
export function backfillGuestFechaLeido(){
  var today = new Date().toISOString();
  var changed = false;
  state.books = state.books.map(function(b){
    if(b.status === 'leido' && !b.fecha_leido){ changed = true; return Object.assign({}, b, { fecha_leido: today }); }
    return b;
  });
  if(changed) guestSet('guest_books', state.books);
}

export function loadData(){
  var loadPromise = Promise.all([
    dbSelectBooks(),
    dbSelectWishlist(),
    dbSelectProfile(),
    dbSelectSubscription()
  ]).then(function(results){
    var bRes = results[0], wRes = results[1], pRes = results[2], sRes = results[3];
    if(bRes.error){ reportError(bRes.error); showToast('Error cargando libros: ' + bRes.error.message, 'error'); state.books = []; } else { state.books = bRes.data || []; if(state.isGuest) backfillGuestFechaLeido(); }
    if(wRes.error){ reportError(wRes.error); showToast('Error cargando wishlist: ' + wRes.error.message, 'error'); state.wishlist = []; } else { state.wishlist = wRes.data || []; }
    var savedTitle = (!pRes.error && pRes.data && pRes.data.library_name) ? pRes.data.library_name : DEFAULT_TITLE;
    document.getElementById('app-title-text').textContent = savedTitle;
    state.currentUserRole = (!state.isGuest && !pRes.error && pRes.data && pRes.data.role) ? pRes.data.role : 'free';
    state.subscription = (!sRes.error && sRes.data) ? sRes.data : null;
    if(!isPremiumUser()){ state.bookViewMode = 'mosaico'; state.wishViewMode = 'mosaico'; }
    updateAdminLink();
    renderUserRoleBadge();
    renderUpgradeMenuItems();
    updateUserAvatar(!state.isGuest && !pRes.error && pRes.data ? pRes.data.avatar_url : null);
    renderAll();
  });
  dbSelectAuthors().then(function(res){
    if(res.error) return;
    state.allAuthors = uniqueSorted((res.data || []).map(function(a){ return a.name; }));
    renderAuthorDatalist();
  }).catch(function(){});
  document.getElementById('btn-notifications').classList.toggle('hidden', state.isGuest);
  if(state.isGuest){
    state.notifications = [];
    updateNotifDot();
  } else {
    loadNotifications();
  }
  return loadPromise;
}
