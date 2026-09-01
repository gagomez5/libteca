"use strict";

export function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

export function formatShortDate(iso){
  if(!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
}

export function truncatedCellHTML(text){
  if(!text) return '<td>—</td>';
  return '<td class="cell-truncate" title="'+esc(text)+'" data-action="show-full-title" data-title="'+esc(text)+'">'+esc(text)+'</td>';
}

export function uniqueSorted(arr){
  var set = {};
  arr.forEach(function(v){ if(v) set[v]=true; });
  return Object.keys(set).sort();
}

export function parseCosto(str){
  str = (str||'').trim();
  if(str === '') return null;
  var n = parseFloat(str);
  return isNaN(n) ? null : n;
}
export function formatCosto(n){
  return '$' + Number(n).toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
export function parseSagaNumber(str){
  str = (str||'').trim();
  if(str === '') return null;
  var n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

// La saga es privada de cada usuario (a diferencia del autor): las sugerencias y la
// numeración se calculan solo sobre los propios libros/wishlist en memoria, que ya
// están limitados al usuario actual (por RLS o por localStorage en modo invitado).
export function sagaKey(author, saga){
  return (author||'').trim().toLowerCase() + '␟' + (saga||'').trim().toLowerCase();
}
