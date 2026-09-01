"use strict";

import { reportError } from './telemetry.js';
import { state, DEFAULT_TITLE, ROLE_LABELS, ICONS } from './state.js';
import { dbSaveProfile } from './db.js';
import { esc } from './utils.js';

export var MAX_TITLE_CHARS = 20;
export var AVATAR_ICONS = ['📚','🦉','🐱','🐶','🦊','🐼','🌙','⭐','🌸','☕'];
export var SCROLL_LOCK_WATCH_IDS = ['modal-book','modal-wish','modal-detail','modal-notifications',
  'modal-notification-detail','modal-feedback','modal-icon-picker','modal-group','modal-row-actions',
  'modal-confirm','modal-upgrade','auth-screen','book-columns-panel','wish-columns-panel','user-dropdown'];

var currentAvatarIcon = null;
export function updateUserAvatar(icon){
  currentAvatarIcon = icon || null;
  var iconEl = document.getElementById('user-avatar-icon');
  var def = document.getElementById('user-avatar-default');
  if(icon){
    iconEl.textContent = icon;
    iconEl.classList.remove('hidden');
    def.classList.add('hidden');
  } else {
    iconEl.classList.add('hidden');
    iconEl.textContent = '';
    def.classList.remove('hidden');
  }
}
export function renderUserRoleBadge(){
  var el = document.getElementById('user-role-badge');
  if(!el) return;
  var role = state.currentUserRole;
  var label = ROLE_LABELS[role] || ROLE_LABELS.free;
  var iconHTML = '';
  if(role === 'premium' || role === 'fundador'){
    iconHTML = '<span class="user-role-icon">'+ICONS.bookOpen+'</span>';
  } else if(role === 'administrador'){
    iconHTML = '<span class="user-role-icon user-role-icon-emoji">🐉</span>';
  }
  el.className = 'user-role-badge role-' + role;
  el.innerHTML = iconHTML + '<span class="user-role-label">' + esc(label) + '</span>';
}
export function renderUpgradeMenuItems(){
  var upgradeBtn = document.getElementById('btn-open-upgrade');
  var manageLink = document.getElementById('link-manage-subscription');
  if(!upgradeBtn || !manageLink) return;
  var role = state.currentUserRole;
  var sub = state.subscription;
  upgradeBtn.classList.toggle('hidden', role !== 'free');
  var showManage = role === 'premium' && !!sub && sub.status === 'active' && sub.plan !== 'lifetime' && !!sub.ls_customer_portal_url;
  manageLink.classList.toggle('hidden', !showManage);
  if(showManage) manageLink.href = sub.ls_customer_portal_url;
}
export function renderIconPicker(){
  document.getElementById('icon-picker-grid').innerHTML = AVATAR_ICONS.map(function(icon){
    return '<button type="button" class="icon-picker-opt'+(icon===currentAvatarIcon?' selected':'')+'" data-action="pick-avatar-icon" data-icon="'+icon+'">'+icon+'</button>';
  }).join('');
}

export function saveTitle(newTitle){
  var clean = Array.from(newTitle.trim()).slice(0, MAX_TITLE_CHARS).join('');
  if(!clean) clean = DEFAULT_TITLE;
  document.getElementById('app-title-text').textContent = clean;
  dbSaveProfile(clean).then(function(res){
    if(res.error){ reportError(res.error); showToast('Error guardando el nombre: ' + res.error.message, 'error'); }
  });
}

export function finishTitleEdit(save){
  var input = document.getElementById('title-input');
  input.classList.add('hidden');
  document.getElementById('title-display').classList.remove('hidden');
  if(save){ saveTitle(input.value); }
}

var toastTimer = null;
export function showToast(msg, type){
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, type === 'error' ? 5000 : 3500);
}

export var confirmModalCallback = null;
export function openConfirmModal(title, message, onConfirm, acceptLabel){
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  document.getElementById('confirm-modal-accept').textContent = acceptLabel || 'Eliminar';
  confirmModalCallback = onConfirm;
  document.getElementById('modal-confirm').classList.remove('hidden');
  document.querySelector('#modal-confirm .modal').scrollTop = 0;
}
export function closeConfirmModal(){
  document.getElementById('modal-confirm').classList.add('hidden');
  confirmModalCallback = null;
}

// ================= BLOQUEO DE SCROLL DE FONDO =================
var scrollLockY = 0;
export function syncScrollLock(){
  var overlayOpen = Array.prototype.some.call(document.querySelectorAll('.modal-overlay'), function(el){
    return !el.classList.contains('hidden');
  });
  var authScreen = document.getElementById('auth-screen');
  var authModalOpen = authScreen.classList.contains('modal-mode') && !authScreen.classList.contains('hidden');
  var bookColOpen = !document.getElementById('book-columns-panel').classList.contains('hidden');
  var wishColOpen = !document.getElementById('wish-columns-panel').classList.contains('hidden');
  var userMenuOpen = !document.getElementById('user-dropdown').classList.contains('hidden');
  var anyOpen = overlayOpen || authModalOpen || bookColOpen || wishColOpen || userMenuOpen;
  var wasLocked = document.documentElement.classList.contains('scroll-locked');
  if(anyOpen && !wasLocked){
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = (-scrollLockY) + 'px';
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--sbw', sbw + 'px');
    document.documentElement.classList.add('scroll-locked');
    window.scrollTo(0, 0);
  } else if(!anyOpen && wasLocked){
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }
}

export function getTopmostOpenOverlayEl(){
  var best = null, bestZ = -1;
  SCROLL_LOCK_WATCH_IDS.forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    var isOpen = id === 'auth-screen' ?
      (el.classList.contains('modal-mode') && !el.classList.contains('hidden')) :
      !el.classList.contains('hidden');
    if(!isOpen) return;
    var z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
    if(z >= bestZ){ bestZ = z; best = el; }
  });
  return best;
}

export function getFocusableEls(container){
  return Array.prototype.filter.call(
    container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),
    function(el){ return el.offsetParent !== null; }
  );
}

export function getInitialFocusTarget(overlay){
  var field = overlay.querySelector('form input:not([type="hidden"]):not([disabled]), form select:not([disabled]), form textarea:not([disabled])');
  if(field && field.offsetParent !== null) return field;
  return overlay;
}

var a11yPrevFocus = null;
var a11yCurrentTarget = null;
export function syncModalFocus(){
  var topEl = getTopmostOpenOverlayEl();
  if(topEl === a11yCurrentTarget) return;
  if(topEl){
    if(!a11yPrevFocus) a11yPrevFocus = document.activeElement;
    if(!topEl.hasAttribute('tabindex')) topEl.setAttribute('tabindex', '-1');
    getInitialFocusTarget(topEl).focus();
  } else {
    if(a11yPrevFocus && typeof a11yPrevFocus.focus === 'function' && document.body.contains(a11yPrevFocus)) a11yPrevFocus.focus();
    a11yPrevFocus = null;
  }
  a11yCurrentTarget = topEl;
}
