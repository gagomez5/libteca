"use strict";

import { esc, sagaKey, uniqueSorted } from './utils.js';
import { state } from './state.js';
import { sb, guestGet, isOwnCoverUrl, validateImageLoads, downloadCoverToStorage, deleteOwnStorageCover } from './db.js';
import { openConfirmModal } from './ui.js';

export function renderAuthorDatalist(){
  var el = document.getElementById('author-suggestions');
  el.innerHTML = state.allAuthors.map(function(a){ return '<option value="'+esc(a)+'">'; }).join('');
}
// Los invitados solo VEN la lista compartida de autores; un autor nuevo que escriban
// no se sube a la tabla global hasta que creen una cuenta (ver migrateGuestDataToAccount).
export function ensureAuthorExists(name){
  name = (name||'').trim();
  if(!name || state.isGuest) return;
  sb.from('authors').upsert([{ name:name }], { onConflict:'name', ignoreDuplicates:true }).then(function(){
    var exists = state.allAuthors.some(function(a){ return a.toLowerCase() === name.toLowerCase(); });
    if(!exists){
      state.allAuthors.push(name);
      state.allAuthors.sort();
      renderAuthorDatalist();
    }
  }).catch(function(){});
}
export function resolveCoverAndSubmit(data, previousCover, submitBtnId, saveFn){
  if(!data.cover || isOwnCoverUrl(data.cover)){
    saveFn(data);
    if(!data.cover && previousCover && isOwnCoverUrl(previousCover)){
      deleteOwnStorageCover(previousCover);
    }
    return;
  }
  var btn = document.getElementById(submitBtnId);
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando portada…';
  function restoreBtn(){ btn.disabled = false; btn.textContent = originalText; }
  function askKeepOrDrop(){
    restoreBtn();
    openConfirmModal('Portada no válida', 'El link de la portada no parece ser una imagen válida. Puedes guardar el libro sin portada, o cancelar y seguir editando el link.', function(){
      data.cover = '';
      saveFn(data);
    }, 'Guardar sin portada');
  }
  validateImageLoads(data.cover).then(function(ok){
    if(!ok){ askKeepOrDrop(); return; }
    downloadCoverToStorage(data.cover).then(function(newUrl){
      data.cover = newUrl;
      restoreBtn();
      saveFn(data);
      if(previousCover && isOwnCoverUrl(previousCover) && previousCover !== newUrl){
        deleteOwnStorageCover(previousCover);
      }
    }).catch(function(){
      askKeepOrDrop();
    });
  });
}

export function getUsedSagaNumbers(author, saga, excludeType, excludeId){
  if(!(author||'').trim() || !(saga||'').trim()) return [];
  var key = sagaKey(author, saga);
  var used = [];
  state.books.forEach(function(b){
    if(excludeType==='book' && b.id===excludeId) return;
    if(b.numero_saga != null && sagaKey(b.author, b.saga) === key) used.push(Number(b.numero_saga));
  });
  state.wishlist.forEach(function(w){
    if(excludeType==='wish' && w.id===excludeId) return;
    if(w.numero_saga != null && sagaKey(w.author, w.saga) === key) used.push(Number(w.numero_saga));
  });
  return used;
}
export function suggestNextSagaNumber(author, saga, excludeType, excludeId){
  var used = getUsedSagaNumbers(author, saga, excludeType, excludeId);
  return used.length ? (Math.max.apply(null, used) + 1) : 1;
}
export function updateSagaSuggestions(authorInputId, sagaDatalistId){
  var author = document.getElementById(authorInputId).value.trim();
  var sagas = uniqueSorted(
    state.books.concat(state.wishlist)
      .filter(function(x){ return x.author && x.author.trim().toLowerCase() === author.toLowerCase(); })
      .map(function(x){ return x.saga; })
  );
  document.getElementById(sagaDatalistId).innerHTML = sagas.map(function(s){ return '<option value="'+esc(s)+'">'; }).join('');
}
export function maybeSuggestNumeroSaga(authorInputId, sagaInputId, numeroInputId, touched, excludeType, excludeId){
  if(touched) return;
  var author = document.getElementById(authorInputId).value.trim();
  var saga = document.getElementById(sagaInputId).value.trim();
  var numeroEl = document.getElementById(numeroInputId);
  if(!author || !saga){ numeroEl.value = ''; return; }
  numeroEl.value = suggestNextSagaNumber(author, saga, excludeType, excludeId);
}

export function migrateGuestDataToAccount(){
  var gBooks = guestGet('guest_books', []);
  var gWish = guestGet('guest_wishlist', []);
  var gName = localStorage.getItem('guest_library_name');
  var tasks = [];
  uniqueSorted(gBooks.concat(gWish).map(function(x){ return x.author; })).forEach(function(a){
    ensureAuthorExists(a);
  });
  gBooks.forEach(function(b){
    tasks.push(sb.from('books').insert([{ title:b.title, author:b.author, saga:b.saga, genre:b.genre, cover:b.cover, costo:b.costo, status:b.status, edicion:b.edicion||'normal', numero_saga:b.numero_saga||null, tienda:b.tienda||'' }]));
  });
  gWish.forEach(function(w){
    tasks.push(sb.from('wishlist').insert([{ title:w.title, author:w.author, cover:w.cover, costo:w.costo, tienda:w.tienda||'', saga:w.saga||'', numero_saga:w.numero_saga||null }]));
  });
  if(gName){
    tasks.push(sb.from('profile').upsert({ user_id: state.currentUserId, library_name: gName }));
  }
  return Promise.all(tasks).then(function(){
    localStorage.removeItem('guest_books');
    localStorage.removeItem('guest_wishlist');
    localStorage.removeItem('guest_library_name');
    localStorage.removeItem('guest_pending_migration');
  });
}
