"use strict";

import { state } from './state.js';
import { dbManageSubscription } from './db.js';
import { reportError, trackEvent } from './telemetry.js';
import { showToast } from './ui.js';
import { formatShortDate, formatUSD } from './utils.js';
import { loadData } from './auth.js';

var PLAN_LABELS = { monthly:'Mensual', annual:'Anual', lifetime:'De por vida' };
var PLAN_PRICE_LINE = { monthly:'US$1.99/mes', annual:'US$19.99/año' };

var ERROR_MESSAGES = {
  not_eligible: 'Esta acción ya no está disponible para tu suscripción. Cierra y vuelve a abrir "Gestionar suscripción" para ver el estado actual.',
  no_subscription: 'No encontramos una suscripción activa en tu cuenta.',
  invalid_upgrade_path: 'Ese cambio de plan no está disponible.',
  lemonsqueezy_error: 'Hubo un problema al comunicarnos con el procesador de pagos. Intenta de nuevo en un momento.',
  manage_subscription_failed: 'No pudimos procesar la solicitud. Intenta de nuevo en un momento.'
};
function errorMessageFor(err){
  return ERROR_MESSAGES[err && err.code] || ERROR_MESSAGES.manage_subscription_failed;
}

export function openManageSubscriptionModal(){
  trackEvent('manage_subscription_opened');
  state.manageSubUI = { screen:'main', preview:null, targetPlan:null, busy:false };
  renderManageSubModal();
  document.getElementById('modal-manage-subscription').classList.remove('hidden');
}
export function closeManageSubscriptionModal(){
  document.getElementById('modal-manage-subscription').classList.add('hidden');
  state.manageSubUI = null;
}
export function manageSubGoBack(){
  if(!state.manageSubUI) return;
  state.manageSubUI.screen = 'main';
  state.manageSubUI.preview = null;
  state.manageSubUI.targetPlan = null;
  renderManageSubModal();
}

function setBusy(btnEl, busyLabel){
  if(!state.manageSubUI) return;
  state.manageSubUI.busy = true;
  document.querySelectorAll('#manage-sub-body [data-action]').forEach(function(b){ b.disabled = true; });
  if(btnEl && busyLabel){ btnEl.textContent = busyLabel; }
}
function clearBusy(){
  if(!state.manageSubUI) return;
  state.manageSubUI.busy = false;
}

export function manageSubPreviewCancel(btnEl){
  setBusy(btnEl, 'Revisando…');
  dbManageSubscription('preview_cancel').then(function(res){
    clearBusy();
    state.manageSubUI.preview = res;
    if(res.refund_eligible){
      state.manageSubUI.screen = 'cancel-confirm-refund';
    } else if(res.plan === 'lifetime'){
      state.manageSubUI.screen = 'lifetime-downgrade-warn';
    } else {
      state.manageSubUI.screen = 'cancel-confirm-deferred';
    }
    renderManageSubModal();
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

export function manageSubConfirmCancel(btnEl){
  setBusy(btnEl, 'Procesando…');
  dbManageSubscription('cancel').then(function(res){
    clearBusy();
    if(res.outcome === 'refunded'){
      showToast('Se reembolsaron ' + formatUSD(res.refund_amount_cents) + '. Tu cuenta volvió al plan gratuito.');
    } else {
      showToast('Cancelaste la renovación. Conservas Premium hasta el ' + formatShortDate(res.period_end) + '.');
    }
    trackEvent('subscription_cancelled', { outcome: res.outcome });
    closeManageSubscriptionModal();
    loadData();
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

export function manageSubReactivate(btnEl){
  setBusy(btnEl, 'Reactivando…');
  dbManageSubscription('reactivate').then(function(){
    clearBusy();
    showToast('Tu suscripción se reactivó.');
    trackEvent('subscription_reactivated');
    loadData().then(function(){ manageSubGoBack(); });
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

export function manageSubPreviewUpgrade(btnEl, targetPlan){
  setBusy(btnEl, 'Calculando…');
  dbManageSubscription('preview_upgrade', { target_plan: targetPlan }).then(function(res){
    clearBusy();
    state.manageSubUI.preview = res;
    state.manageSubUI.targetPlan = targetPlan;
    state.manageSubUI.screen = 'upgrade-confirm';
    renderManageSubModal();
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

export function manageSubConfirmUpgrade(btnEl){
  var targetPlan = state.manageSubUI.targetPlan;
  setBusy(btnEl, 'Redirigiendo…');
  trackEvent('subscription_upgrade_started', { target_plan: targetPlan });
  dbManageSubscription('upgrade', { target_plan: targetPlan }).then(function(res){
    window.location.href = res.checkout_url;
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

export function manageSubDowngradeConfirm1(){
  state.manageSubUI.screen = 'lifetime-downgrade-final';
  renderManageSubModal();
}
export function manageSubDowngradeConfirm2(btnEl){
  setBusy(btnEl, 'Procesando…');
  dbManageSubscription('downgrade_lifetime', { acknowledge:true }).then(function(){
    clearBusy();
    showToast('Renunciaste a tu acceso Premium. Tu cuenta volvió al plan gratuito.');
    trackEvent('subscription_downgraded_lifetime');
    closeManageSubscriptionModal();
    loadData();
  }).catch(function(err){
    clearBusy();
    reportError(err);
    showToast(errorMessageFor(err), 'error');
    renderManageSubModal();
  });
}

function upgradeButtonsHTML(plan){
  if(plan === 'monthly'){
    return '' +
      '<button type="button" class="btn btn-emerald" data-action="manage-sub-preview-upgrade" data-target-plan="annual">Mejorar a Anual (US$19.99/año)</button>' +
      '<button type="button" class="btn btn-emerald" data-action="manage-sub-preview-upgrade" data-target-plan="lifetime">Mejorar a De por vida (US$49.99)</button>';
  }
  if(plan === 'annual'){
    return '<button type="button" class="btn btn-emerald" data-action="manage-sub-preview-upgrade" data-target-plan="lifetime">Mejorar a De por vida</button>';
  }
  return '';
}

function renderMainScreen(){
  var sub = state.subscription;
  if(!sub) return '<p>No encontramos información de tu suscripción.</p>';
  if(sub.status === 'cancelled'){
    return '' +
      '<p>Cancelaste la renovación de tu plan <strong>' + PLAN_LABELS[sub.plan] + '</strong>. ' +
      'Conservas tu acceso Premium hasta el <strong>' + formatShortDate(sub.current_period_end) + '</strong>; después tu cuenta pasará al plan gratuito.</p>' +
      '<div class="manage-sub-actions">' +
      '<button type="button" class="btn btn-emerald" data-action="manage-sub-reactivate">Reactivar suscripción</button>' +
      '</div>';
  }
  if(sub.plan === 'lifetime'){
    return '' +
      '<p>Tu plan actual: <strong>De por vida</strong> — acceso Premium para siempre, sin pagos recurrentes.</p>' +
      '<div class="manage-sub-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="manage-sub-preview-cancel">Cancelar y volver al plan gratuito</button>' +
      '</div>';
  }
  return '' +
    '<p>Tu plan actual: <strong>' + PLAN_LABELS[sub.plan] + '</strong> — ' + PLAN_PRICE_LINE[sub.plan] + '. ' +
    'Se renueva el ' + formatShortDate(sub.current_period_end) + '.</p>' +
    '<div class="manage-sub-actions">' +
    upgradeButtonsHTML(sub.plan) +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-preview-cancel">Cancelar suscripción</button>' +
    '</div>';
}

function renderCancelConfirmRefund(){
  var p = state.manageSubUI.preview;
  return '' +
    '<p>Tu cargo más reciente fue el <strong>' + formatShortDate(p.charge_date) + '</strong>, dentro de los 14 días de la garantía de reembolso. ' +
    'Si cancelas ahora, se reembolsarán <strong>' + formatUSD(p.refund_amount_cents) + '</strong> y perderás el acceso Premium de inmediato.</p>' +
    '<div class="notif-detail-actions">' +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-back">Volver</button>' +
    '<button type="button" class="btn btn-burgundy" data-action="manage-sub-confirm-cancel">Sí, cancelar y reembolsar</button>' +
    '</div>';
}
function renderCancelConfirmDeferred(){
  var p = state.manageSubUI.preview;
  return '' +
    '<p>Tu suscripción ya pasó el período de reembolso de 14 días. Si cancelas, no se renovará, pero conservas tu acceso Premium hasta el ' +
    '<strong>' + formatShortDate(p.period_end) + '</strong>. Después pasará automáticamente al plan gratuito.</p>' +
    '<div class="notif-detail-actions">' +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-back">Volver</button>' +
    '<button type="button" class="btn btn-burgundy" data-action="manage-sub-confirm-cancel">Sí, cancelar la renovación</button>' +
    '</div>';
}
function renderLifetimeDowngradeWarn(){
  return '' +
    '<p>Tu compra de por vida ya pasó los 14 días de garantía de reembolso. Puedes renunciar a tu acceso Premium cuando quieras, ' +
    'pero como fue un pago único, esto <strong>no genera ningún reembolso</strong>: perderías el acceso de forma permanente sin devolución de tu dinero.</p>' +
    '<div class="notif-detail-actions">' +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-back">Volver</button>' +
    '<button type="button" class="btn btn-burgundy" data-action="manage-sub-downgrade-confirm-1">Entiendo, continuar</button>' +
    '</div>';
}
function renderLifetimeDowngradeFinal(){
  return '' +
    '<p>Última confirmación: al continuar, tu cuenta vuelve al plan gratuito de inmediato y pierdes el acceso Premium de por vida ' +
    '<strong>sin reembolso</strong>. Esta acción no se puede deshacer.</p>' +
    '<div class="notif-detail-actions">' +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-back">Volver</button>' +
    '<button type="button" class="btn btn-burgundy" data-action="manage-sub-downgrade-confirm-2">Sí, renunciar a mi acceso Premium</button>' +
    '</div>';
}
function renderUpgradeConfirm(){
  var p = state.manageSubUI.preview;
  var targetLabel = PLAN_LABELS[state.manageSubUI.targetPlan];
  var currentLabel = PLAN_LABELS[state.subscription.plan];
  var body;
  if(p.proration_applied){
    body = 'Vas a pasar del plan ' + currentLabel + ' al plan ' + targetLabel + '. Como ya pagaste tu período actual (activo hasta el ' +
      formatShortDate(p.period_end) + '), se descuenta el valor no usado: pagarás solo <strong>' + formatUSD(p.amount_cents) + '</strong> en vez de US$49.99.';
  } else {
    body = 'Vas a pasar del plan ' + currentLabel + ' al plan ' + targetLabel + '. Se te cobrará el precio completo: <strong>' + formatUSD(p.amount_cents) + '</strong>. ' +
      'Tu suscripción ' + currentLabel.toLowerCase() + ' actual se cancelará automáticamente al confirmarse el pago.';
  }
  return '' +
    '<p>' + body + '</p>' +
    '<div class="notif-detail-actions">' +
    '<button type="button" class="btn btn-ghost" data-action="manage-sub-back">Volver</button>' +
    '<button type="button" class="btn btn-dark" data-action="manage-sub-confirm-upgrade">Continuar al pago</button>' +
    '</div>';
}

function renderManageSubModal(){
  var container = document.getElementById('manage-sub-body');
  if(!container || !state.manageSubUI) return;
  var screen = state.manageSubUI.screen;
  var html;
  if(screen === 'cancel-confirm-refund') html = renderCancelConfirmRefund();
  else if(screen === 'cancel-confirm-deferred') html = renderCancelConfirmDeferred();
  else if(screen === 'lifetime-downgrade-warn') html = renderLifetimeDowngradeWarn();
  else if(screen === 'lifetime-downgrade-final') html = renderLifetimeDowngradeFinal();
  else if(screen === 'upgrade-confirm') html = renderUpgradeConfirm();
  else html = renderMainScreen();
  container.innerHTML = html;
}
