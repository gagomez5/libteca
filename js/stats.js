"use strict";

import { esc, formatCosto, sagaKey } from './utils.js';
import { state, isPremiumUser, ICONS } from './state.js';

var ICON_CHECK = '<path d="M20 6L9 17l-5-5"/>';
var ICON_CALENDAR = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';
var ICON_DOLLAR = '<line x1="12" y1="1" x2="12" y2="23" stroke-linecap="round"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke-linecap="round" stroke-linejoin="round"/>';
var ICON_USER = '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>';
var ICON_CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>';
var ICON_TREND = '<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7h-6v6"/>';
var ICON_STORE = '<path d="M3 3h18l-2 7H5z"/><path d="M5 10v10h14V10"/><path d="M9 20v-5h6v5"/>';
var ICON_TAG = '<path d="M20.59 13.41L11 3.83A2 2 0 009.53 3H4a1 1 0 00-1 1v5.53a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.83 0l5.59-5.59a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>';
var ICON_LAYERS = '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/>';
var ICON_LOCK = '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>';

// ---------- funciones puras de cálculo ----------

function getBooksReadInYear(books, year){
  return books.filter(function(b){
    return b.fecha_leido && new Date(b.fecha_leido).getFullYear() === year;
  }).length;
}

function getBooksReadInMonth(books, year, month){
  return books.filter(function(b){
    if(!b.fecha_leido) return false;
    var d = new Date(b.fecha_leido);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
}

function getTotalInvestido(books){
  return books.reduce(function(sum, b){ return sum + (b.costo != null ? Number(b.costo) : 0); }, 0);
}

function getTopAuthor(books){
  var counts = {};
  books.forEach(function(b){
    var a = (b.author||'').trim();
    if(a) counts[a] = (counts[a]||0) + 1;
  });
  var best = null;
  Object.keys(counts).forEach(function(a){
    if(!best || counts[a] > best.count) best = { author:a, count:counts[a] };
  });
  return best;
}

function getAvgDaysToFinish(books){
  var diffs = [];
  books.forEach(function(b){
    if(!b.fecha_inicio_lectura || !b.fecha_leido) return;
    var days = (new Date(b.fecha_leido).getTime() - new Date(b.fecha_inicio_lectura).getTime()) / 86400000;
    if(days >= 0) diffs.push(days);
  });
  if(!diffs.length) return null;
  return diffs.reduce(function(a,b){ return a+b; }, 0) / diffs.length;
}

function last12MonthBuckets(months){
  months = months || 12;
  var now = new Date();
  var buckets = [];
  for(var i = months - 1; i >= 0; i--){
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year:d.getFullYear(), month:d.getMonth(), label:d.toLocaleDateString('es-ES',{month:'short',year:'2-digit'}), value:0 });
  }
  return buckets;
}

function getBooksReadByMonth(books, months){
  var buckets = last12MonthBuckets(months);
  books.forEach(function(b){
    if(!b.fecha_leido) return;
    var d = new Date(b.fecha_leido);
    for(var j=0;j<buckets.length;j++){
      if(buckets[j].year===d.getFullYear() && buckets[j].month===d.getMonth()){ buckets[j].value++; break; }
    }
  });
  return buckets;
}

function getReadingStreak(books){
  var byMonth = {};
  books.forEach(function(b){
    if(!b.fecha_leido) return;
    var d = new Date(b.fecha_leido);
    var key = d.getFullYear()+'-'+d.getMonth();
    byMonth[key] = (byMonth[key]||0) + 1;
  });
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  // Si el mes en curso todavía no tiene ningún libro terminado no rompe la racha
  // (puede sumar uno antes de que termine) — se empieza a contar desde el mes anterior.
  if(!byMonth[y+'-'+m]){ m--; if(m<0){ m=11; y--; } }
  var streak = 0;
  while(byMonth[y+'-'+m]){ streak++; m--; if(m<0){ m=11; y--; } }
  return streak;
}

function getSpendByTienda(books){
  var totals = {};
  books.forEach(function(b){
    if(b.costo == null) return;
    var t = (b.tienda||'').trim() || 'Sin tienda';
    totals[t] = (totals[t]||0) + Number(b.costo);
  });
  return Object.keys(totals).map(function(k){ return { label:k, value:totals[k] }; })
    .sort(function(a,b){ return b.value - a.value; });
}

function getSpendByTime(books, months){
  var buckets = last12MonthBuckets(months);
  books.forEach(function(b){
    if(b.costo == null || !b.created_at) return;
    var d = new Date(b.created_at);
    for(var j=0;j<buckets.length;j++){
      if(buckets[j].year===d.getFullYear() && buckets[j].month===d.getMonth()){ buckets[j].value += Number(b.costo); break; }
    }
  });
  return buckets;
}

function getMostExpensiveBook(books){
  var best = null;
  books.forEach(function(b){
    if(b.costo == null) return;
    if(!best || Number(b.costo) > Number(best.costo)) best = b;
  });
  return best;
}

function getAvgCostoPerBook(books){
  var withCosto = books.filter(function(b){ return b.costo != null; });
  if(!withCosto.length) return null;
  return withCosto.reduce(function(s,b){ return s + Number(b.costo); }, 0) / withCosto.length;
}

function countBy(items, getKey){
  var counts = {};
  items.forEach(function(item){
    var k = getKey(item);
    if(k) counts[k] = (counts[k]||0) + 1;
  });
  return Object.keys(counts).map(function(k){ return { label:k, value:counts[k] }; })
    .sort(function(a,b){ return b.value - a.value; });
}

function getGenreDistribution(books){
  return countBy(books, function(b){ return (b.genre||'').trim(); });
}

function getTopAuthors(books, n){
  return countBy(books, function(b){ return (b.author||'').trim(); }).slice(0, n||5);
}

function getSagaProgress(books, wishlist){
  var groups = {};
  function addItem(item, isBook){
    var saga = (item.saga||'').trim();
    if(!saga) return;
    var key = sagaKey(item.author, saga);
    if(!groups[key]) groups[key] = { author:item.author||'', saga:saga, owned:0, read:0, total:0 };
    groups[key].total++;
    if(isBook){
      groups[key].owned++;
      if(item.status === 'leido') groups[key].read++;
    }
  }
  books.forEach(function(b){ addItem(b, true); });
  wishlist.forEach(function(w){ addItem(w, false); });
  return Object.keys(groups).map(function(k){ return groups[k]; })
    .filter(function(g){ return g.total >= 2; })
    .sort(function(a,b){ return b.total - a.total; });
}

function getTotalPagesRead(books){
  var sum = 0;
  books.forEach(function(b){
    if(b.status === 'leido' && b.isbn_data && b.isbn_data.page_count != null){
      sum += Number(b.isbn_data.page_count);
    }
  });
  return sum;
}

function getTopPublisher(books){
  var counts = {};
  books.forEach(function(b){
    var p = b.isbn_data && b.isbn_data.publisher ? String(b.isbn_data.publisher).trim() : '';
    if(p) counts[p] = (counts[p]||0) + 1;
  });
  var best = null;
  Object.keys(counts).forEach(function(p){
    if(!best || counts[p] > best.count) best = { label:p, count:counts[p] };
  });
  return best;
}

function getLanguageBreakdown(books){
  return countBy(books, function(b){ return b.isbn_data && b.isbn_data.language ? String(b.isbn_data.language).trim() : ''; });
}

function getTopSubjects(books, n){
  var counts = {};
  books.forEach(function(b){
    if(!b.isbn_data || !Array.isArray(b.isbn_data.subjects)) return;
    b.isbn_data.subjects.forEach(function(s){
      var v = String(s||'').trim();
      if(v) counts[v] = (counts[v]||0) + 1;
    });
  });
  return Object.keys(counts).map(function(k){ return { label:k, value:counts[k] }; })
    .sort(function(a,b){ return b.value - a.value; }).slice(0, n||5);
}

// ---------- helpers de render ----------

function statTileHTML(colorVar, iconPath, num, label){
  return '<div class="stat">' +
    '<span class="stat-icon" style="background:'+colorVar+'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" stroke-width="1.8">'+iconPath+'</svg></span>' +
    '<span class="stat-text"><span class="stat-num">'+esc(String(num))+'</span><span class="stat-label">'+esc(label)+'</span></span></div>';
}

function statWideHTML(colorVar, iconPath, value, sub){
  return '<div class="stat stat-wide">' +
    '<span class="stat-icon" style="background:'+colorVar+'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" stroke-width="1.8">'+iconPath+'</svg></span>' +
    '<span class="stat-text"><span class="stat-num">'+esc(value)+'</span><span class="stat-label">'+esc(sub)+'</span></span></div>';
}

function capItems(items, max){
  max = max || 8;
  if(items.length <= max) return items;
  var head = items.slice(0, max - 1);
  var restSum = items.slice(max - 1).reduce(function(s,i){ return s + i.value; }, 0);
  head.push({ label:'Otros', value:restSum });
  return head;
}

function svgBarRowsHTML(items, opts){
  opts = opts || {};
  var colorVar = opts.colorVar || 'var(--coral)';
  var formatValue = opts.formatValue || function(v){ return String(v); };
  var capped = capItems(items, opts.max);
  if(!capped.length || capped.every(function(i){ return i.value === 0; })){
    return '<p class="stats-empty-metric">Sin datos todavía.</p>';
  }
  var maxVal = Math.max.apply(null, capped.map(function(i){ return i.value; }));
  return capped.map(function(item){
    var pct = maxVal > 0 ? Math.max(2, (item.value / maxVal) * 100) : 0;
    return '<div class="bar-row">' +
      '<span class="bar-row-label" title="'+esc(item.label)+'">'+esc(item.label)+'</span>' +
      '<span class="bar-row-track"><svg viewBox="0 0 100 10" preserveAspectRatio="none">' +
        '<rect width="100" height="10" rx="3" fill="var(--border)"/>' +
        '<rect width="'+pct+'" height="10" rx="3" fill="'+colorVar+'"/></svg></span>' +
      '<span class="bar-row-value">'+esc(formatValue(item.value))+'</span></div>';
  }).join('');
}

function svgColumnsHTML(items, opts){
  opts = opts || {};
  var colorVar = opts.colorVar || 'var(--teal)';
  if(!items.length || items.every(function(i){ return i.value === 0; })){
    return '<p class="stats-empty-metric">Sin datos todavía.</p>';
  }
  var maxVal = Math.max.apply(null, items.map(function(i){ return i.value; }));
  var n = items.length;
  var gap = 4;
  var barW = (100 - gap*(n-1)) / n;
  var rects = items.map(function(item, idx){
    var h = maxVal > 0 ? Math.max(2, (item.value / maxVal) * 100) : 2;
    var x = idx * (barW + gap);
    var y = 100 - h;
    return '<rect x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+barW.toFixed(2)+'" height="'+h.toFixed(2)+'" rx="2" fill="'+colorVar+'"/>';
  }).join('');
  var labels = items.map(function(item){ return '<span>'+esc(item.label)+'</span>'; }).join('');
  return '<div class="chart-columns"><svg viewBox="0 0 100 100" preserveAspectRatio="none">'+rects+'</svg></div>' +
    '<div class="chart-labels" style="grid-template-columns:repeat('+n+',1fr)">'+labels+'</div>';
}

function sagaProgressHTML(groups){
  if(!groups.length) return '<p class="stats-empty-metric">Todavía no tenés sagas con más de un volumen registrado.</p>';
  return groups.slice(0, 8).map(function(g){
    var readPct = g.total > 0 ? (g.read / g.total) * 100 : 0;
    var ownedPct = g.total > 0 ? (g.owned / g.total) * 100 : 0;
    var label = g.saga + (g.author ? ' — ' + g.author : '');
    return '<div class="saga-progress-item">' +
      '<div class="saga-progress-head"><span title="'+esc(label)+'">'+esc(label)+'</span><strong>'+g.owned+'/'+g.total+'</strong></div>' +
      '<span class="saga-progress-bar"><svg viewBox="0 0 100 10" preserveAspectRatio="none">' +
        '<rect width="100" height="10" rx="3" fill="var(--border)"/>' +
        '<rect width="'+ownedPct+'" height="10" rx="3" fill="var(--amber)"/>' +
        '<rect width="'+readPct+'" height="10" rx="3" fill="var(--teal)"/></svg></span></div>';
  }).join('');
}

function lockedSectionHTML(title){
  return '<div class="stats-section stats-locked">' +
    '<span class="stats-locked-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--paper)" stroke-width="2">'+ICON_LOCK+'</svg></span>' +
    '<p class="stats-locked-title">'+esc(title)+'</p>' +
    '<p class="stats-locked-sub">Función de Lector Premium</p>' +
    '<button type="button" class="btn btn-dark" data-action="open-upgrade">Actualizar a Premium</button></div>';
}

// ---------- secciones ----------

function freeStatsHTML(books){
  var now = new Date();
  var readYear = getBooksReadInYear(books, now.getFullYear());
  var readMonth = getBooksReadInMonth(books, now.getFullYear(), now.getMonth());
  var totalInvestido = getTotalInvestido(books);
  var topAuthor = getTopAuthor(books);
  var tiles =
    statTileHTML('var(--teal)', ICON_CHECK, readYear, 'leídos este año') +
    statTileHTML('var(--amber)', ICON_CALENDAR, readMonth, 'leídos este mes') +
    statTileHTML('var(--coral)', ICON_DOLLAR, formatCosto(totalInvestido), 'invertido en tu biblioteca');
  if(topAuthor){
    tiles += statWideHTML('var(--violet)', ICON_USER, topAuthor.author,
      topAuthor.count + (topAuthor.count===1 ? ' libro — tu autor con más obras' : ' libros — tu autor con más obras'));
  }
  return '<div class="stats">' + tiles + '</div>';
}

function ritmoLecturaSectionHTML(books){
  if(!isPremiumUser()) return lockedSectionHTML('Ritmo de lectura');
  var avgDays = getAvgDaysToFinish(books);
  var streak = getReadingStreak(books);
  var byMonth = getBooksReadByMonth(books, 12);
  return '<div class="stats-section">' +
    '<h3 class="stats-section-title">Ritmo de lectura</h3>' +
    '<div class="stats-subgrid">' +
      statTileHTML('var(--teal)', ICON_CLOCK, avgDays!=null ? Math.round(avgDays)+' días' : '—', 'promedio para terminar un libro') +
      statTileHTML('var(--amber)', ICON_TREND, streak, streak===1 ? 'mes de racha' : 'meses de racha') +
    '</div>' +
    '<p class="stats-chart-label">Libros leídos por mes</p>' +
    svgColumnsHTML(byMonth, { colorVar:'var(--teal)' }) +
  '</div>';
}

function finanzasSectionHTML(books){
  if(!isPremiumUser()) return lockedSectionHTML('Finanzas');
  var byTienda = getSpendByTienda(books);
  var byTime = getSpendByTime(books, 12);
  var mostExpensive = getMostExpensiveBook(books);
  var avgCosto = getAvgCostoPerBook(books);
  var tiles = statTileHTML('var(--coral)', ICON_DOLLAR, avgCosto!=null ? formatCosto(avgCosto) : '—', 'promedio por libro');
  if(mostExpensive){
    tiles += statWideHTML('var(--amber)', ICON_TAG, mostExpensive.title, formatCosto(mostExpensive.costo) + ' — tu libro más caro');
  }
  return '<div class="stats-section">' +
    '<h3 class="stats-section-title">Finanzas</h3>' +
    '<div class="stats-subgrid">' + tiles + '</div>' +
    '<p class="stats-chart-label">Gasto por mes</p>' +
    svgColumnsHTML(byTime, { colorVar:'var(--coral)' }) +
    '<p class="stats-chart-label">Gasto por tienda</p>' +
    svgBarRowsHTML(byTienda, { colorVar:'var(--amber)', formatValue:formatCosto }) +
  '</div>';
}

function desglosesSectionHTML(books, wishlist){
  if(!isPremiumUser()) return lockedSectionHTML('Autores, sagas y géneros');
  var genreDist = getGenreDistribution(books);
  var topAuthors = getTopAuthors(books, 5);
  var sagaProgress = getSagaProgress(books, wishlist);
  return '<div class="stats-section">' +
    '<h3 class="stats-section-title">Autores, sagas y géneros</h3>' +
    '<p class="stats-chart-label">Top autores</p>' +
    svgBarRowsHTML(topAuthors, { colorVar:'var(--violet)' }) +
    '<p class="stats-chart-label">Por género</p>' +
    svgBarRowsHTML(genreDist, { colorVar:'var(--teal)' }) +
    '<p class="stats-chart-label">Progreso de sagas</p>' +
    sagaProgressHTML(sagaProgress) +
  '</div>';
}

function isbnMetadataSectionHTML(books){
  if(!isPremiumUser()) return lockedSectionHTML('Metadata de ISBN');
  var withIsbnData = books.filter(function(b){ return !!b.isbn_data; });
  if(!withIsbnData.length){
    return '<div class="stats-section">' +
      '<h3 class="stats-section-title">Metadata de ISBN</h3>' +
      '<p class="stats-empty-metric">Todavía no tenés libros con datos de ISBN. Usá "Añadir por ISBN" para que la app complete editorial, páginas, idioma y temas automáticamente.</p></div>';
  }
  var totalPages = getTotalPagesRead(books);
  var topPublisher = getTopPublisher(books);
  var languages = getLanguageBreakdown(books);
  var topSubjects = getTopSubjects(books, 5);
  var tiles = statTileHTML('var(--teal)', ICON_LAYERS, totalPages, 'páginas leídas');
  if(topPublisher){
    tiles += statWideHTML('var(--coral)', ICON_STORE, topPublisher.label,
      topPublisher.count + (topPublisher.count===1 ? ' libro — tu editorial más frecuente' : ' libros — tu editorial más frecuente'));
  }
  return '<div class="stats-section">' +
    '<h3 class="stats-section-title">Metadata de ISBN</h3>' +
    '<div class="stats-subgrid">' + tiles + '</div>' +
    '<p class="stats-chart-label">Idiomas</p>' +
    svgBarRowsHTML(languages, { colorVar:'var(--amber)' }) +
    '<p class="stats-chart-label">Temas más comunes</p>' +
    svgBarRowsHTML(topSubjects, { colorVar:'var(--violet)' }) +
  '</div>';
}

export function renderStatsDashboard(){
  var el = document.getElementById('view-stats');
  if(!el) return;
  var books = state.books;
  var wishlist = state.wishlist;
  if(books.length === 0 && wishlist.length === 0){
    el.innerHTML = '<h2 class="view-heading">Estadísticas</h2>' +
      '<div class="empty">' + ICONS.book +
      '<p class="title">Todavía no hay datos</p>' +
      '<p class="subtitle">Añade libros a tu biblioteca para empezar a ver tus estadísticas.</p></div>';
    return;
  }
  el.innerHTML =
    '<h2 class="view-heading">Estadísticas</h2>' +
    freeStatsHTML(books) +
    '<div class="stats-sections">' +
      '<div class="stats-section-grid">' +
        ritmoLecturaSectionHTML(books) +
        finanzasSectionHTML(books) +
      '</div>' +
      '<div class="stats-section-grid">' +
        desglosesSectionHTML(books, wishlist) +
        isbnMetadataSectionHTML(books) +
      '</div>' +
    '</div>';
}
