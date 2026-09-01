"use strict";

import { parseCosto, parseSagaNumber } from './utils.js';
import { state } from './state.js';
import { dbUpdateWish, dbInsertWish } from './db.js';
import { reportError } from './telemetry.js';
import { showToast, openConfirmModal } from './ui.js';
import { renderAll } from './render.js';
import { ensureAuthorExists, updateSagaSuggestions } from './forms-shared.js';

export var editingWishId = null;
export var editingWishOriginalCover = '';
var initialWishSnapshot = null;

export function getWishFormData(){
  return {
    title: document.getElementById('w-title').value.trim(),
    author: document.getElementById('w-author').value.trim(),
    saga: document.getElementById('w-saga').value.trim(),
    numero_saga: parseSagaNumber(document.getElementById('w-numero-saga').value),
    cover: document.getElementById('w-cover').value.trim(),
    costo: parseCosto(document.getElementById('w-costo').value),
    tienda: document.getElementById('w-tienda').value.trim()
  };
}

export function openWishModal(item){
  editingWishId = item ? item.id : null;
  editingWishOriginalCover = item ? (item.cover||'') : '';
  document.getElementById('wish-modal-title').textContent = item ? 'Editar deseo' : 'Añadir a wishlist';
  document.getElementById('wish-submit-btn').textContent = item ? 'Guardar cambios' : 'Añadir a wishlist';
  document.getElementById('w-title').value = item ? item.title : '';
  document.getElementById('w-author').value = item ? item.author : '';
  document.getElementById('w-saga').value = item ? (item.saga||'') : '';
  document.getElementById('w-numero-saga').value = (item && item.numero_saga != null) ? item.numero_saga : '';
  document.getElementById('w-cover').value = item ? (item.cover||'') : '';
  document.getElementById('w-costo').value = (item && item.costo != null) ? item.costo : '';
  document.getElementById('w-tienda').value = item ? (item.tienda||'') : '';
  state.wishNumeroTouched = false;
  updateSagaSuggestions('w-author', 'wish-saga-suggestions');
  initialWishSnapshot = JSON.stringify(getWishFormData());
  document.getElementById('modal-wish').classList.remove('hidden');
  document.querySelector('#modal-wish .modal').scrollTop = 0;
}
export function closeWishModal(){ document.getElementById('modal-wish').classList.add('hidden'); }
export function attemptCloseWishModal(){
  var changed = JSON.stringify(getWishFormData()) !== initialWishSnapshot;
  if(changed){
    openConfirmModal('Cambios sin guardar', 'Tienes cambios sin guardar. ¿Salir sin guardarlos?', function(){ closeWishModal(); }, 'Salir sin guardar');
  } else {
    closeWishModal();
  }
}

export function saveWishData(data){
  ensureAuthorExists(data.author);
  if(editingWishId){
    dbUpdateWish(editingWishId, data).then(function(res){
      if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
      state.wishlist = state.wishlist.map(function(w){ return w.id===editingWishId ? res.data[0] : w; });
      closeWishModal(); renderAll();
    });
  } else {
    dbInsertWish(data).then(function(res){
      if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
      state.wishlist = (res.data || []).concat(state.wishlist);
      closeWishModal(); renderAll();
    });
  }
}
