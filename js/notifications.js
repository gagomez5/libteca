"use strict";

import { esc } from './utils.js';
import { state } from './state.js';
import { sb, withClockSkewRetry } from './db.js';
import { reportError } from './telemetry.js';
import { showToast } from './ui.js';

export function loadNotifications(){
  var expired = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  return sb.from('notifications').delete().lt('created_at', expired).then(function(){
    return withClockSkewRetry(function(){
      return sb.from('notification_receipts')
        .select('id, read, created_at, notifications(message, created_at)')
        .order('created_at', { ascending:true });
    });
  }).then(function(res){
    if(res.error){
      console.error(res.error);
      state.notifications = [];
    } else {
      state.notifications = (res.data || [])
        .filter(function(r){ return r.notifications; })
        .map(function(r){
          return {
            receiptId: r.id,
            read: r.read,
            message: r.notifications.message,
            created_at: r.notifications.created_at || r.created_at
          };
        });
    }
    updateNotifDot();
  });
}
export function updateNotifDot(){
  var hasUnread = state.notifications.some(function(n){ return !n.read; });
  document.getElementById('notif-dot').classList.toggle('hidden', !hasUnread);
  document.getElementById('btn-notifications').classList.toggle('has-unread', hasUnread);
}
export function formatNotifDate(iso){
  if(!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) + ' · ' + d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
}
export function renderNotifList(){
  var container = document.getElementById('notif-list');
  if(state.notifications.length === 0){
    container.innerHTML = '<div class="notif-empty">No tienes notificaciones todavía.</div>';
    return;
  }
  container.innerHTML = state.notifications.map(function(n){
    return '<div class="notif-row'+(n.read?' read':'')+'" data-action="open-notification-detail" data-id="'+n.receiptId+'">' +
      '<div class="notif-unread-dot"></div>' +
      '<div class="notif-content">' +
        '<div class="notif-message">'+esc(n.message)+'</div>' +
        '<div class="notif-date">'+formatNotifDate(n.created_at)+'</div>' +
      '</div>' +
      '<button class="notif-delete-x" data-action="delete-notification-inline" data-id="'+n.receiptId+'" aria-label="Eliminar"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
    '</div>';
  }).join('');
}
export function openNotificationDetail(receiptId){
  var n = state.notifications.find(function(x){ return x.receiptId===receiptId; });
  if(!n) return;
  state.currentNotifDetailId = receiptId;
  document.getElementById('notif-detail-date').textContent = formatNotifDate(n.created_at);
  document.getElementById('notif-detail-message').textContent = n.message;
  document.getElementById('modal-notification-detail').classList.remove('hidden');
}
export function markNotificationRead(receiptId){
  return sb.from('notification_receipts').update({ read:true }).eq('id', receiptId).then(function(res){
    if(!res.error){
      state.notifications = state.notifications.map(function(n){ return n.receiptId===receiptId ? Object.assign({}, n, { read:true }) : n; });
      updateNotifDot();
    }
    return res;
  });
}
export function deleteNotification(receiptId){
  return sb.from('notification_receipts').delete().eq('id', receiptId).then(function(res){
    if(!res.error){
      state.notifications = state.notifications.filter(function(n){ return n.receiptId!==receiptId; });
      updateNotifDot();
    }
    return res;
  });
}
export function markAllNotificationsRead(){
  var unreadIds = state.notifications.filter(function(n){ return !n.read; }).map(function(n){ return n.receiptId; });
  if(unreadIds.length === 0) return;
  sb.from('notification_receipts').update({ read:true }).in('id', unreadIds).then(function(res){
    if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
    state.notifications = state.notifications.map(function(n){ return Object.assign({}, n, { read:true }); });
    updateNotifDot();
    renderNotifList();
  });
}
export function deleteAllNotifications(){
  if(state.notifications.length === 0) return;
  var ids = state.notifications.map(function(n){ return n.receiptId; });
  sb.from('notification_receipts').delete().in('id', ids).then(function(res){
    if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
    state.notifications = [];
    updateNotifDot();
    renderNotifList();
  });
}
