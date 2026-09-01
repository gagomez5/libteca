"use strict";

import { esc, formatCosto, uniqueSorted } from './utils.js';
import { state, STATUS_LABELS, STATUS_NEXT, ICONS, isPremiumUser } from './state.js';
import { renderColumnConfigPanel, sortItems, tableHeaderHTML, tableRowHTML, BOOK_COLUMNS, WISH_COLUMNS } from './table.js';

var GROUP_EMPTY_LABEL = { author:'Sin autor', saga:'Sin saga', genre:'Sin género', status:'' };

export function syncControlsUI(){
  document.getElementById('search-input').value = state.filters.search;
  document.getElementById('wish-search-input').value = state.wishFilters.search;

  document.querySelectorAll('#group-panel .group-opt').forEach(function(btn){
    btn.classList.toggle('selected', btn.getAttribute('data-group') === state.groupBy);
  });
  document.getElementById('btn-toggle-group').classList.toggle('active', !!state.groupBy);

  document.querySelectorAll('#wish-group-panel .group-opt').forEach(function(btn){
    btn.classList.toggle('selected', btn.getAttribute('data-group') === state.wishGroupBy);
  });
  document.getElementById('btn-toggle-wish-group').classList.toggle('active', !!state.wishGroupBy);

  var bookFilterCount = ['author','saga','genre','status','edicion'].filter(function(k){ return !!state.filters[k]; }).length;
  document.getElementById('btn-toggle-filters').classList.toggle('active', bookFilterCount > 0);
  document.getElementById('filters-label').textContent = bookFilterCount > 0 ? 'Filtros ('+bookFilterCount+')' : 'Filtros';

  document.getElementById('wish-filter-costo-op').value = state.wishFilters.costoOp;
  var costoValInput = document.getElementById('wish-filter-costo-val');
  if(document.activeElement !== costoValInput){
    costoValInput.value = state.wishFilters.costoVal != null ? state.wishFilters.costoVal : '';
  }

  var wishFilterActive = !!state.wishFilters.author || !!state.wishFilters.tienda || (isPremiumUser() && !!state.wishFilters.costoOp && state.wishFilters.costoVal != null);
  document.getElementById('btn-toggle-wish-filters').classList.toggle('active', wishFilterActive);

  document.getElementById('btn-clear-book-all').classList.toggle('hidden', bookFilterCount === 0 && !state.groupBy);
  document.getElementById('btn-clear-wish-all').classList.toggle('hidden', !wishFilterActive && !state.wishGroupBy);

  document.getElementById('btn-book-view-mosaico').classList.toggle('active', state.bookViewMode === 'mosaico');
  document.getElementById('btn-book-view-listado').classList.toggle('active', state.bookViewMode === 'listado');
  document.getElementById('btn-wish-view-mosaico').classList.toggle('active', state.wishViewMode === 'mosaico');
  document.getElementById('btn-wish-view-listado').classList.toggle('active', state.wishViewMode === 'listado');

  var lockListado = !isPremiumUser();
  ['btn-book-view-listado','btn-wish-view-listado'].forEach(function(idLk){
    var btnLk = document.getElementById(idLk);
    btnLk.classList.toggle('locked', lockListado);
    btnLk.title = lockListado ? 'Función de Lector Premium' : 'Vista listado';
  });
  var lockCostoFilter = !isPremiumUser();
  document.getElementById('wish-filter-costo-op').disabled = lockCostoFilter;
  document.getElementById('wish-filter-costo-val').disabled = lockCostoFilter;
  document.getElementById('wish-filter-costo-op').closest('.filter-field-cost').classList.toggle('locked', lockCostoFilter);
  document.getElementById('wish-filter-costo-op').closest('.filter-field-cost').title = lockCostoFilter ? 'Función de Lector Premium' : '';

  document.getElementById('btn-toggle-group').disabled = (state.bookViewMode === 'listado');
  document.getElementById('btn-toggle-wish-group').disabled = (state.wishViewMode === 'listado');

  document.getElementById('btn-book-columns').classList.toggle('hidden', state.bookViewMode !== 'listado');
  document.getElementById('btn-wish-columns').classList.toggle('hidden', state.wishViewMode !== 'listado');
}

export function coverHTML(cover, title){
  if(cover){
    return '<div class="cover-wrap">' +
      '<img src="'+esc(cover)+'" alt="'+esc(title)+'" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="cover-placeholder" style="display:none"><span>'+esc(title)+'</span></div>' +
      '</div>';
  }
  return '<div class="cover-wrap"><div class="cover-placeholder" style="display:flex"><span>'+esc(title)+'</span></div></div>';
}

export function coverThumbHTML(cover, title){
  if(cover){
    return '<div class="cover-thumb-sm"><img src="'+esc(cover)+'" alt="'+esc(title)+'" onerror="this.style.display=\'none\'"></div>';
  }
  return '<div class="cover-thumb-sm"></div>';
}

export function renderStats(){
  var total = state.books.length;
  var leidos = state.books.filter(function(b){ return b.status === 'leido'; }).length;
  var leyendo = state.books.filter(function(b){ return b.status === 'leyendo'; }).length;
  var pendientes = total - leidos - leyendo;
  function activeClass(val){ return state.filters.status === val ? ' stat-active' : ''; }
  document.getElementById('stats').innerHTML =
    '<div class="stat clickable'+activeClass('')+'" data-action="filter-stat" data-status=""><b>'+total+'</b> <span>libros</span></div>' +
    '<div class="stat clickable'+activeClass('leyendo')+'" data-action="filter-stat" data-status="leyendo"><b style="color:#8A5F2C">'+leyendo+'</b> <span>leyendo</span></div>' +
    '<div class="stat clickable'+activeClass('leido')+'" data-action="filter-stat" data-status="leido"><b style="color:var(--sage-dark)">'+leidos+'</b> <span>leídos</span></div>' +
    '<div class="stat clickable'+activeClass('pendiente')+'" data-action="filter-stat" data-status="pendiente"><b style="color:var(--burgundy-dark)">'+pendientes+'</b> <span>pendientes</span></div>';
}

export function bookMatchesFilters(b, exclude){
  var s = state.filters.search.toLowerCase();
  if(s){
    var hay = (b.title+' '+b.author+' '+(b.genre||'')+' '+(b.saga||'')).toLowerCase();
    if(hay.indexOf(s) === -1) return false;
  }
  if(exclude !== 'author' && state.filters.author && b.author !== state.filters.author) return false;
  if(exclude !== 'saga' && state.filters.saga && b.saga !== state.filters.saga) return false;
  if(exclude !== 'genre' && state.filters.genre && b.genre !== state.filters.genre) return false;
  if(exclude !== 'status' && state.filters.status && b.status !== state.filters.status) return false;
  if(exclude !== 'edicion' && state.filters.edicion && (b.edicion||'normal') !== state.filters.edicion) return false;
  return true;
}

export function renderFilterOptions(){
  fillSelect('filter-author', uniqueSorted(state.books.filter(function(b){return bookMatchesFilters(b,'author');}).map(function(b){return b.author;})), state.filters.author);
  fillSelect('filter-saga', uniqueSorted(state.books.filter(function(b){return bookMatchesFilters(b,'saga');}).map(function(b){return b.saga;})), state.filters.saga);
  fillSelect('filter-genre', uniqueSorted(state.books.filter(function(b){return bookMatchesFilters(b,'genre');}).map(function(b){return b.genre;})), state.filters.genre);
}
export function fillSelect(id, options, selected){
  var el = document.getElementById(id);
  el.innerHTML = '<option value="">Todos</option>' + options.map(function(o){
    return '<option value="'+esc(o)+'"'+(o===selected?' selected':'')+'>'+esc(o)+'</option>';
  }).join('');
}

export function filteredBooks(){
  return state.books.filter(function(b){ return bookMatchesFilters(b, null); });
}

export function bookCardHTML(b){
  var sagaTag = b.saga ? (b.saga + (b.numero_saga != null ? ' #'+b.numero_saga : '')) : '';
  var tags = [sagaTag, b.genre].filter(Boolean).join(' · ');
  var stampHtml = '';
  if(b.status==='leido') stampHtml = '<div class="stamp stamp-leido">LEÍDO</div>';
  else if(b.status==='leyendo') stampHtml = '<div class="stamp stamp-leyendo">LEYENDO</div>';
  var newHtml = state.newBookIds[b.id] ? '<div class="new-badge">NUEVO</div>' : '';
  return '<div class="card'+(b.edicion==='especial' ? ' card-especial' : '')+'">' +
    '<div class="cover-click" data-action="view-book" data-id="'+b.id+'" style="position:relative">' + coverHTML(b.cover, b.title) +
      stampHtml + newHtml +
    '</div>' +
    '<div class="card-body">' +
      '<div class="card-title">'+esc(b.title)+'</div>' +
      '<div class="card-author">'+esc(b.author)+'</div>' +
      (tags ? '<div class="card-tags">'+esc(tags)+'</div>' : '') +
      '<div class="card-actions">' + bookActionsHTML(b) +
      '</div>' +
    '</div></div>';
}

export function bookActionsHTML(b){
  return '<button class="toggle-btn '+b.status+'" data-action="toggle-status" data-id="'+b.id+'">'+ICONS.check+' '+STATUS_LABELS[b.status]+'</button>' +
    '<button class="icon-btn'+(b.edicion==='especial' ? ' icon-btn-especial' : '')+'" data-action="toggle-edicion" data-id="'+b.id+'" title="Edición especial">'+ICONS.gem+'</button>' +
    '<button class="icon-btn" data-action="edit-book" data-id="'+b.id+'" aria-label="Editar libro">'+ICONS.edit+'</button>' +
    '<button class="icon-btn" data-action="delete-book" data-id="'+b.id+'" aria-label="Eliminar libro">'+ICONS.trash+'</button>';
}

export function bookRowActionsSheetHTML(b){
  return (b.status==='leido' ? '' : '<button type="button" class="row-action-item" data-action="toggle-status" data-id="'+b.id+'">'+ICONS.check+' Marcar como '+STATUS_LABELS[STATUS_NEXT[b.status]]+'</button>') +
    '<button type="button" class="row-action-item" data-action="toggle-edicion" data-id="'+b.id+'">'+ICONS.gem+' '+(b.edicion==='especial' ? 'Quitar edición especial' : 'Marcar edición especial')+'</button>' +
    '<button type="button" class="row-action-item" data-action="edit-book" data-id="'+b.id+'">'+ICONS.edit+' Editar</button>' +
    '<button type="button" class="row-action-item row-action-danger" data-action="delete-book" data-id="'+b.id+'">'+ICONS.trash+' Eliminar</button>';
}

export function wishRowActionsSheetHTML(w){
  return '<button type="button" class="row-action-item" data-action="buy-wish" data-id="'+w.id+'">'+ICONS.cart+' Ya lo compré</button>' +
    '<button type="button" class="row-action-item" data-action="edit-wish" data-id="'+w.id+'">'+ICONS.edit+' Editar</button>' +
    '<button type="button" class="row-action-item row-action-danger" data-action="delete-wish" data-id="'+w.id+'">'+ICONS.trash+' Eliminar</button>';
}

export function emptyBooksHTML(){
  return '<div class="empty" style="grid-column:1/-1">' + ICONS.book +
    '<p class="title">'+(state.books.length===0 ? 'Tu biblioteca está vacía' : 'Ningún libro coincide con los filtros')+'</p>' +
    '<p class="subtitle">'+(state.books.length===0 ? 'Añade el primer libro físico de tu colección.' : 'Prueba a ajustar la búsqueda o los filtros.')+'</p></div>';
}

export function renderGroupedBooksGrid(list){
  var grid = document.getElementById('grid-books');
  var map = {};
  list.forEach(function(b){
    var raw = state.groupBy === 'status' ? b.status : (b[state.groupBy] || '');
    var label = state.groupBy === 'status' ? STATUS_LABELS[raw] : (raw || GROUP_EMPTY_LABEL[state.groupBy]);
    if(!map[raw]) map[raw] = { label: label, items: [] };
    map[raw].items.push(b);
  });
  if(state.groupBy === 'saga'){
    Object.keys(map).forEach(function(k){
      map[k].items.sort(function(a,b){
        if(a.numero_saga == null) return b.numero_saga == null ? 0 : 1;
        if(b.numero_saga == null) return -1;
        return a.numero_saga - b.numero_saga;
      });
    });
  }
  state.currentGroups = Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){
    return a.label.localeCompare(b.label, 'es');
  });
  grid.className = 'grid';
  grid.innerHTML = state.currentGroups.map(function(g, i){
    return '<div class="card group-card" data-action="open-group" data-index="'+i+'">' +
      '<div class="group-card-inner">' +
        '<div class="group-card-count">'+g.items.length+'</div>' +
        '<div class="group-card-label">'+esc(g.label)+'</div>' +
        '<div class="group-card-sub">'+(g.items.length===1?'libro':'libros')+'</div>' +
      '</div></div>';
  }).join('');
}

export function renderBooksGrid(){
  renderColumnConfigPanel('book');
  var list = filteredBooks();
  var grid = document.getElementById('grid-books');
  var table = document.getElementById('table-books');
  if(state.bookViewMode === 'listado'){
    grid.className = 'hidden';
    grid.innerHTML = '';
    table.classList.remove('hidden');
    renderBooksTable(list);
    return;
  }
  table.classList.add('hidden');
  if(list.length === 0){
    grid.className = '';
    grid.innerHTML = emptyBooksHTML();
    return;
  }
  if(state.groupBy){
    renderGroupedBooksGrid(list);
    return;
  }
  grid.className = 'grid';
  grid.innerHTML = list.map(bookCardHTML).join('');
}

export function wishCardHTML(w){
  var sagaTag = w.saga ? (w.saga + (w.numero_saga != null ? ' #'+w.numero_saga : '')) : '';
  var stampHtml = w.costo ? '<div class="stamp stamp-costo">'+esc(formatCosto(w.costo))+'</div>' : '';
  return '<div class="card">' + '<div class="cover-click" data-action="view-wish" data-id="'+w.id+'" style="position:relative">' + coverHTML(w.cover, w.title) + stampHtml + '</div>' +
    '<div class="card-body">' +
      '<div class="card-title">'+esc(w.title)+'</div>' +
      '<div class="card-author">'+esc(w.author)+'</div>' +
      (sagaTag ? '<div class="card-tags">'+esc(sagaTag)+'</div>' : '') +
      (w.tienda ? '<div class="card-notes">'+esc(w.tienda)+'</div>' : '') +
      '<div class="card-actions">' + wishActionsHTML(w) +
      '</div>' +
    '</div></div>';
}

export function wishActionsHTML(w){
  return '<button class="buy-btn" data-action="buy-wish" data-id="'+w.id+'">'+ICONS.cart+' Ya lo compré</button>' +
    '<button class="icon-btn" data-action="edit-wish" data-id="'+w.id+'" aria-label="Editar">'+ICONS.edit+'</button>' +
    '<button class="icon-btn" data-action="delete-wish" data-id="'+w.id+'" aria-label="Eliminar de la wishlist">'+ICONS.trash+'</button>';
}

export function wishMatchesFilters(w, exclude){
  var s = state.wishFilters.search.toLowerCase();
  if(s){
    var hay = (w.title+' '+w.author).toLowerCase();
    if(hay.indexOf(s) === -1) return false;
  }
  if(exclude !== 'author' && state.wishFilters.author && w.author !== state.wishFilters.author) return false;
  if(exclude !== 'tienda' && state.wishFilters.tienda && (w.tienda||'') !== state.wishFilters.tienda) return false;
  if(isPremiumUser() && state.wishFilters.costoOp && state.wishFilters.costoVal != null){
    if(w.costo == null) return false;
    if(state.wishFilters.costoOp === 'gt' && !(Number(w.costo) > state.wishFilters.costoVal)) return false;
    if(state.wishFilters.costoOp === 'lt' && !(Number(w.costo) < state.wishFilters.costoVal)) return false;
  }
  return true;
}

export function filteredWishlist(){
  return state.wishlist.filter(function(w){ return wishMatchesFilters(w, null); });
}

export function renderWishFilterOptions(){
  fillSelect('wish-filter-author', uniqueSorted(state.wishlist.filter(function(w){return wishMatchesFilters(w,'author');}).map(function(w){return w.author;})), state.wishFilters.author);
  fillSelect('wish-filter-tienda', uniqueSorted(state.wishlist.filter(function(w){return wishMatchesFilters(w,'tienda');}).map(function(w){return w.tienda;})), state.wishFilters.tienda);
}

export function emptyWishHTML(){
  return '<div class="empty" style="grid-column:1/-1">' + ICONS.heart +
    '<p class="title">'+(state.wishlist.length===0 ? 'Tu wishlist está vacía' : 'Ningún libro coincide con la búsqueda')+'</p>' +
    '<p class="subtitle">'+(state.wishlist.length===0 ? 'Guarda aquí los libros que quieres comprar más adelante.' : 'Prueba a ajustar la búsqueda o el filtro.')+'</p></div>';
}

export function renderGroupedWishGrid(list){
  var grid = document.getElementById('grid-wishlist');
  var map = {};
  list.forEach(function(w){
    var raw = w.author || '';
    var label = raw || 'Sin autor';
    if(!map[raw]) map[raw] = { label: label, items: [] };
    map[raw].items.push(w);
  });
  state.currentWishGroups = Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){
    return a.label.localeCompare(b.label, 'es');
  });
  grid.className = 'grid';
  grid.innerHTML = state.currentWishGroups.map(function(g, i){
    return '<div class="card group-card" data-action="open-wish-group" data-index="'+i+'">' +
      '<div class="group-card-inner">' +
        '<div class="group-card-count">'+g.items.length+'</div>' +
        '<div class="group-card-label">'+esc(g.label)+'</div>' +
        '<div class="group-card-sub">'+(g.items.length===1?'libro':'libros')+'</div>' +
      '</div></div>';
  }).join('');
}

export function renderWishStats(){
  if(!isPremiumUser()){
    document.getElementById('wish-stats').innerHTML =
      '<span class="wish-stats-locked" title="Función de Lector Premium">Total y promedio disponibles en Lector Premium</span>';
    return;
  }
  var withCosto = state.wishlist.filter(function(w){ return w.costo != null; });
  var total = withCosto.reduce(function(sum, w){ return sum + Number(w.costo); }, 0);
  var promedio = withCosto.length ? total / withCosto.length : 0;
  document.getElementById('wish-stats').innerHTML =
    '<span>Total <b>'+formatCosto(total)+'</b></span>' +
    '<span>Promedio <b>'+formatCosto(promedio)+'</b></span>';
}

export function renderWishGrid(){
  renderColumnConfigPanel('wish');
  var grid = document.getElementById('grid-wishlist');
  var table = document.getElementById('table-wishlist');
  renderWishStats();
  document.getElementById('wish-badge').textContent = state.wishlist.length;
  document.getElementById('wish-badge').classList.toggle('hidden', state.wishlist.length===0);
  var list = filteredWishlist();
  if(state.wishViewMode === 'listado'){
    grid.className = 'hidden';
    grid.innerHTML = '';
    table.classList.remove('hidden');
    renderWishTable(list);
    return;
  }
  table.classList.add('hidden');
  if(list.length === 0){
    grid.className = '';
    grid.innerHTML = emptyWishHTML();
    return;
  }
  if(state.wishGroupBy){
    renderGroupedWishGrid(list);
    return;
  }
  grid.className = 'grid';
  grid.innerHTML = list.map(wishCardHTML).join('');
}

export function syncGroupModal(){
  if(document.getElementById('modal-group').classList.contains('hidden')) return;
  if(!state.openGroupContext) return;
  if(state.openGroupContext.type === 'book'){
    renderGroupedBooksGrid(filteredBooks());
    var g = state.currentGroups.find(function(x){ return x.label === state.openGroupContext.label; });
    if(!g){ document.getElementById('modal-group').classList.add('hidden'); state.openGroupContext = null; return; }
    document.getElementById('group-modal-title').textContent = g.label + ' · ' + g.items.length + (g.items.length===1?' libro':' libros');
    document.getElementById('grid-group-books').innerHTML = g.items.map(bookCardHTML).join('');
  } else {
    renderGroupedWishGrid(filteredWishlist());
    var wg = state.currentWishGroups.find(function(x){ return x.label === state.openGroupContext.label; });
    if(!wg){ document.getElementById('modal-group').classList.add('hidden'); state.openGroupContext = null; return; }
    document.getElementById('group-modal-title').textContent = wg.label + ' · ' + wg.items.length + (wg.items.length===1?' libro':' libros');
    document.getElementById('grid-group-books').innerHTML = wg.items.map(wishCardHTML).join('');
  }
}

export function renderBooksTable(list){
  var wrap = document.getElementById('table-books');
  if(list.length === 0){ wrap.innerHTML = emptyBooksHTML(); return; }
  var sorted = sortItems(list, state.bookTableSort.key, state.bookTableSort.dir, BOOK_COLUMNS);
  wrap.innerHTML = '<div class="table-scroll"><table class="data-table">' +
    tableHeaderHTML(BOOK_COLUMNS, state.bookTableColumns, state.bookTableSort, 'book') +
    '<tbody>' + sorted.map(function(b){ return tableRowHTML(b, BOOK_COLUMNS, state.bookTableColumns, 'book'); }).join('') + '</tbody></table></div>';
}

export function renderWishTable(list){
  var wrap = document.getElementById('table-wishlist');
  if(list.length === 0){ wrap.innerHTML = emptyWishHTML(); return; }
  var sorted = sortItems(list, state.wishTableSort.key, state.wishTableSort.dir, WISH_COLUMNS);
  wrap.innerHTML = '<div class="table-scroll"><table class="data-table">' +
    tableHeaderHTML(WISH_COLUMNS, state.wishTableColumns, state.wishTableSort, 'wish') +
    '<tbody>' + sorted.map(function(w){ return tableRowHTML(w, WISH_COLUMNS, state.wishTableColumns, 'wish'); }).join('') + '</tbody></table></div>';
}

export function renderAll(){
  renderStats();
  renderFilterOptions();
  renderWishFilterOptions();
  syncControlsUI();
  renderBooksGrid();
  renderWishGrid();
  syncGroupModal();
}

export function openDetailModal(item, type){
  document.getElementById('detail-cover').innerHTML = coverHTML(item.cover, item.title);
  document.getElementById('detail-title').textContent = item.title;
  document.getElementById('detail-author').textContent = item.author;

  var sagaRow = document.getElementById('detail-saga-row');
  var numeroRow = document.getElementById('detail-numero-row');
  var genreRow = document.getElementById('detail-genre-row');
  var statusRow = document.getElementById('detail-status-row');
  var costoRow = document.getElementById('detail-costo-row');
  var edicionRow = document.getElementById('detail-edicion-row');
  var tiendaRow = document.getElementById('detail-tienda-row');

  if(item.costo != null){ document.getElementById('detail-costo-value').textContent = formatCosto(item.costo); costoRow.classList.remove('hidden'); } else { costoRow.classList.add('hidden'); }

  if(item.saga){ document.getElementById('detail-saga-value').textContent = item.saga; sagaRow.classList.remove('hidden'); } else { sagaRow.classList.add('hidden'); }
  if(item.saga && item.numero_saga != null){ document.getElementById('detail-numero-value').textContent = item.numero_saga; numeroRow.classList.remove('hidden'); } else { numeroRow.classList.add('hidden'); }
  if(item.tienda){ document.getElementById('detail-tienda-value').textContent = item.tienda; tiendaRow.classList.remove('hidden'); } else { tiendaRow.classList.add('hidden'); }

  if(type === 'book'){
    if(item.genre){ document.getElementById('detail-genre-value').textContent = item.genre; genreRow.classList.remove('hidden'); } else { genreRow.classList.add('hidden'); }
    var badge = document.getElementById('detail-status-value');
    badge.textContent = STATUS_LABELS[item.status];
    badge.className = 'detail-status-badge status-badge-' + item.status;
    statusRow.classList.remove('hidden');
    edicionRow.classList.toggle('hidden', item.edicion !== 'especial');
  } else {
    genreRow.classList.add('hidden');
    statusRow.classList.add('hidden');
    edicionRow.classList.add('hidden');
  }

  document.getElementById('modal-detail').classList.remove('hidden');
  document.querySelector('#modal-detail .modal').scrollTop = 0;
}
