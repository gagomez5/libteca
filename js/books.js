"use strict";

import { parseCosto, parseSagaNumber } from './utils.js';
import { state } from './state.js';
import { dbUpdateBook, dbInsertBook } from './db.js';
import { reportError } from './telemetry.js';
import { showToast, openConfirmModal } from './ui.js';
import { renderAll } from './render.js';
import { ensureAuthorExists, updateSagaSuggestions } from './forms-shared.js';

var currentStatus = 'pendiente';
var currentEdicion = 'normal';
export var editingBookId = null;
export var editingBookOriginalCover = '';
var initialBookSnapshot = null;

export function setStatusUI(status){
  currentStatus = status;
  document.getElementById('status-pendiente').className = 'status-opt' + (status==='pendiente' ? ' selected-pendiente' : '');
  document.getElementById('status-leyendo').className = 'status-opt' + (status==='leyendo' ? ' selected-leyendo' : '');
  document.getElementById('status-leido').className = 'status-opt' + (status==='leido' ? ' selected-leido' : '');
}
export function setEdicionUI(edicion){
  currentEdicion = edicion;
  document.getElementById('edicion-normal').className = 'status-opt' + (edicion==='normal' ? ' selected-normal' : '');
  document.getElementById('edicion-especial').className = 'status-opt' + (edicion==='especial' ? ' selected-especial' : '');
}

export function getBookFormData(){
  return {
    title: document.getElementById('f-title').value.trim(),
    author: document.getElementById('f-author').value.trim(),
    saga: document.getElementById('f-saga').value.trim(),
    numero_saga: parseSagaNumber(document.getElementById('f-numero-saga').value),
    genre: document.getElementById('f-genre').value.trim(),
    cover: document.getElementById('f-cover').value.trim(),
    costo: parseCosto(document.getElementById('f-costo').value),
    tienda: document.getElementById('f-tienda').value.trim(),
    status: currentStatus,
    edicion: currentEdicion
  };
}

export function openBookModal(book){
  editingBookId = book ? book.id : null;
  editingBookOriginalCover = book ? (book.cover||'') : '';
  document.getElementById('book-modal-title').textContent = book ? 'Editar libro' : 'Añadir libro';
  document.getElementById('book-submit-btn').textContent = book ? 'Guardar cambios' : 'Añadir a mi biblioteca';
  document.getElementById('f-title').value = book ? book.title : '';
  document.getElementById('f-author').value = book ? book.author : '';
  document.getElementById('f-saga').value = book ? (book.saga||'') : '';
  document.getElementById('f-numero-saga').value = (book && book.numero_saga != null) ? book.numero_saga : '';
  document.getElementById('f-genre').value = book ? (book.genre||'') : '';
  document.getElementById('f-cover').value = book ? (book.cover||'') : '';
  document.getElementById('f-costo').value = (book && book.costo != null) ? book.costo : '';
  document.getElementById('f-tienda').value = book ? (book.tienda||'') : '';
  setStatusUI(book ? book.status : 'pendiente');
  setEdicionUI(book ? (book.edicion || 'normal') : 'normal');
  state.bookNumeroTouched = false;
  updateSagaSuggestions('f-author', 'book-saga-suggestions');
  initialBookSnapshot = JSON.stringify(getBookFormData());
  document.getElementById('modal-book').classList.remove('hidden');
  document.querySelector('#modal-book .modal').scrollTop = 0;
}
export function closeBookModal(){ document.getElementById('modal-book').classList.add('hidden'); }
export function attemptCloseBookModal(){
  var changed = JSON.stringify(getBookFormData()) !== initialBookSnapshot;
  if(changed){
    openConfirmModal('Cambios sin guardar', 'Tienes cambios sin guardar. ¿Salir sin guardarlos?', function(){ closeBookModal(); }, 'Salir sin guardar');
  } else {
    closeBookModal();
  }
}

export function saveBookData(data){
  ensureAuthorExists(data.author);
  if(editingBookId){
    dbUpdateBook(editingBookId, data).then(function(res){
      if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
      state.books = state.books.map(function(b){ return b.id===editingBookId ? res.data[0] : b; });
      closeBookModal(); renderAll();
    });
  } else {
    dbInsertBook(data).then(function(res){
      if(res.error){ reportError(res.error); showToast('Error: '+res.error.message, 'error'); return; }
      state.books = (res.data || []).concat(state.books);
      closeBookModal(); renderAll();
    });
  }
}
