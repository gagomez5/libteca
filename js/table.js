"use strict";

import { esc, truncatedCellHTML, formatCosto, formatShortDate } from './utils.js';
import { state, STATUS_LABELS, ICONS } from './state.js';
import { coverThumbHTML } from './render.js';

// BOOK_COLUMNS/WISH_COLUMNS y render.js se importan mutuamente (coverThumbHTML
// vive en render.js, que a su vez importa estas columnas de acá): es un ciclo
// seguro porque ninguno de los dos lados se invoca al evaluar el módulo, solo
// dentro de closures (renderCell/tableRowHTML) que corren después de que ambos
// módulos ya terminaron de cargar.
export var BOOK_COLUMNS = [
  { key:'cover', label:'Portada', sortType:null,
    renderCell:function(b){ return '<td>'+coverThumbHTML(b.cover, b.title, b.status)+'</td>'; } },
  { key:'author', label:'Autor', sortType:'string', sortValue:function(b){ return b.author||''; },
    renderCell:function(b){ return truncatedCellHTML(b.author); } },
  { key:'saga', label:'Saga', sortType:'string', sortValue:function(b){ return b.saga||''; },
    renderCell:function(b){ return truncatedCellHTML(b.saga); } },
  { key:'numero_saga', label:'Nº', sortType:'numeric', sortValue:function(b){ return b.numero_saga; },
    renderCell:function(b){ return '<td>'+(b.numero_saga!=null ? esc(b.numero_saga) : '—')+'</td>'; } },
  { key:'genre', label:'Género', sortType:'string', sortValue:function(b){ return b.genre||''; },
    renderCell:function(b){ return truncatedCellHTML(b.genre); } },
  { key:'status', label:'Estado', sortType:'string', sortValue:function(b){ return STATUS_LABELS[b.status]||''; },
    renderCell:function(b){ return '<td>'+esc(STATUS_LABELS[b.status]||'')+'</td>'; } },
  { key:'edicion', label:'Edición', sortType:'string', sortValue:function(b){ return b.edicion==='especial'?'Especial':'Normal'; },
    renderCell:function(b){ return '<td>'+(b.edicion==='especial' ? '<span style="color:var(--emerald);font-weight:700">Especial</span>' : 'Normal')+'</td>'; } },
  { key:'costo', label:'Costo', sortType:'numeric', sortValue:function(b){ return b.costo; },
    renderCell:function(b){ return '<td>'+(b.costo!=null ? esc(formatCosto(b.costo)) : '—')+'</td>'; } },
  { key:'tienda', label:'Tienda', sortType:'string', sortValue:function(b){ return b.tienda||''; },
    renderCell:function(b){ return truncatedCellHTML(b.tienda); } },
  { key:'created_at', label:'Añadido', sortType:'date', sortValue:function(b){ return b.created_at||''; },
    renderCell:function(b){ return '<td>'+esc(formatShortDate(b.created_at))+'</td>'; } }
];

export var WISH_COLUMNS = [
  { key:'cover', label:'Portada', sortType:null,
    renderCell:function(w){ return '<td>'+coverThumbHTML(w.cover, w.title)+'</td>'; } },
  { key:'author', label:'Autor', sortType:'string', sortValue:function(w){ return w.author||''; },
    renderCell:function(w){ return truncatedCellHTML(w.author); } },
  { key:'saga', label:'Saga', sortType:'string', sortValue:function(w){ return w.saga||''; },
    renderCell:function(w){ return truncatedCellHTML(w.saga); } },
  { key:'numero_saga', label:'Nº', sortType:'numeric', sortValue:function(w){ return w.numero_saga; },
    renderCell:function(w){ return '<td>'+(w.numero_saga!=null ? esc(w.numero_saga) : '—')+'</td>'; } },
  { key:'costo', label:'Costo', sortType:'numeric', sortValue:function(w){ return w.costo; },
    renderCell:function(w){ return '<td>'+(w.costo!=null ? esc(formatCosto(w.costo)) : '—')+'</td>'; } },
  { key:'tienda', label:'Tienda', sortType:'string', sortValue:function(w){ return w.tienda||''; },
    renderCell:function(w){ return truncatedCellHTML(w.tienda); } },
  { key:'created_at', label:'Añadido', sortType:'date', sortValue:function(w){ return w.created_at||''; },
    renderCell:function(w){ return '<td>'+esc(formatShortDate(w.created_at))+'</td>'; } }
];

export function compareByColumn(a, b, colDef, dir){
  var av = colDef.sortValue(a), bv = colDef.sortValue(b);
  var mul = dir === 'desc' ? -1 : 1;
  if(colDef.sortType === 'numeric'){
    var aNull = (av == null), bNull = (bv == null);
    if(aNull && bNull) return 0;
    if(aNull) return 1;
    if(bNull) return -1;
    return (av - bv) * mul;
  }
  if(colDef.sortType === 'date'){
    av = av || ''; bv = bv || '';
    if(!av && !bv) return 0;
    if(!av) return 1;
    if(!bv) return -1;
    return (av < bv ? -1 : (av > bv ? 1 : 0)) * mul;
  }
  av = (av||'').toString(); bv = (bv||'').toString();
  if(!av && !bv) return 0;
  if(!av) return 1;
  if(!bv) return -1;
  return av.localeCompare(bv, 'es', { sensitivity:'base' }) * mul;
}

export function sortItems(list, sortKey, sortDir, colDefs){
  var colDef;
  if(sortKey === 'title'){
    colDef = { sortType:'string', sortValue:function(item){ return item.title || ''; } };
  } else {
    colDef = colDefs.filter(function(c){ return c.key === sortKey; })[0];
  }
  if(!colDef || !colDef.sortType) return list.slice();
  return list.slice().sort(function(a, b){ return compareByColumn(a, b, colDef, sortDir); });
}

export function tableHeaderHTML(colDefs, visibilityMap, sortState, scope){
  function sortIcon(key, sortable){
    if(!sortable) return '';
    if(sortState.key === key) return '<span class="sort-icon sort-active">'+(sortState.dir==='asc'?ICONS.sortAsc:ICONS.sortDesc)+'</span>';
    return '<span class="sort-icon">'+ICONS.sortNeutral+'</span>';
  }
  var titleTh = '<th class="col-title-sticky" data-action="sort-column" data-scope="'+scope+'" data-column="title"><span class="th-inner">Título'+sortIcon('title', true)+'</span></th>';
  var midTh = colDefs.filter(function(c){ return visibilityMap[c.key]; }).map(function(c){
    var sortable = !!c.sortType;
    var attrs = sortable ? ' data-action="sort-column" data-scope="'+scope+'" data-column="'+c.key+'"' : '';
    return '<th'+attrs+'><span class="th-inner">'+esc(c.label)+sortIcon(c.key, sortable)+'</span></th>';
  }).join('');
  var actionsTh = '<th class="col-actions">Acciones</th>';
  return '<thead><tr>'+titleTh+midTh+actionsTh+'</tr></thead>';
}

export function tableRowHTML(item, colDefs, visibilityMap, scope){
  var titleTd = '<td class="col-title-sticky" title="'+esc(item.title)+'" data-action="show-full-title" data-title="'+esc(item.title)+'">'+esc(item.title)+'</td>';
  var midTd = colDefs.filter(function(c){ return visibilityMap[c.key]; }).map(function(c){ return c.renderCell(item); }).join('');
  var actionsTd = '<td class="col-actions"><button type="button" class="icon-btn" data-action="open-row-actions" data-scope="'+scope+'" data-id="'+item.id+'" title="Acciones">'+ICONS.edit+'</button></td>';
  return '<tr>'+titleTd+midTd+actionsTd+'</tr>';
}

export function renderColumnConfigPanel(scope){
  var colDefs = scope === 'book' ? BOOK_COLUMNS : WISH_COLUMNS;
  var visibilityMap = scope === 'book' ? state.bookTableColumns : state.wishTableColumns;
  var panel = document.getElementById(scope === 'book' ? 'book-columns-panel' : 'wish-columns-panel');
  var ordered = colDefs.slice().sort(function(a, b){
    var av = visibilityMap[a.key] ? 0 : 1;
    var bv = visibilityMap[b.key] ? 0 : 1;
    return av - bv;
  });
  var rows = ordered.map(function(c){
    var visible = !!visibilityMap[c.key];
    return '<div class="column-config-row'+(visible ? '' : ' col-hidden')+'">' +
      '<span>'+esc(c.label)+'</span>' +
      '<button type="button" class="column-visibility-btn" data-action="toggle-column" data-scope="'+scope+'" data-column="'+c.key+'" title="'+(visible ? 'Ocultar' : 'Mostrar')+'">'+(visible ? ICONS.eye : ICONS.eyeOff)+'</button>' +
    '</div>';
  }).join('');
  panel.innerHTML = '<span class="group-panel-label">Ver/Ocultar</span>' + rows;
}
