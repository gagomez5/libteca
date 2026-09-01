"use strict";

import { state } from './state.js';

// ======= CONFIGURÁ ACÁ TUS CREDENCIALES DE SUPABASE =======
var SUPABASE_URL = 'https://fvlfyezsegbbpwkkwcvm.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2bGZ5ZXpzZWdiYnB3a2t3Y3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjgyNTMsImV4cCI6MjEwMDMwNDI1M30.Nc7zcYF5bgxPhOYPNhjGa9HHYSywVOYxXJi-96zVfT0';
// ===========================================================

export var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= MODO INVITADO (almacenamiento local) =================
export function guestGet(key, fallback){
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; }
}
export function guestSet(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){}
}
export function guestUid(){ return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// Supabase's Auth y PostgREST corren en hosts distintos; justo tras iniciar sesión
// sus relojes pueden estar unos segundos desincronizados y PostgREST rechaza el JWT
// recién emitido con "JWT issued at future" (PGRST303). Se autocorrige en pocos
// segundos, así que reintentamos en vez de mostrar un error y dejar la lista vacía.
export function isClockSkewError(err){
  return !!err && (err.code === 'PGRST303' || /issued at future/i.test(err.message || ''));
}
export function withClockSkewRetry(queryFn, attemptsLeft, delayMs){
  attemptsLeft = attemptsLeft == null ? 3 : attemptsLeft;
  delayMs = delayMs || 1500;
  return queryFn().then(function(res){
    if(res.error && isClockSkewError(res.error) && attemptsLeft > 1){
      return new Promise(function(resolve){
        setTimeout(function(){ resolve(withClockSkewRetry(queryFn, attemptsLeft - 1, delayMs)); }, delayMs);
      });
    }
    return res;
  });
}
export function dbSelectBooks(){
  if(state.isGuest){
    var arr = guestGet('guest_books', []);
    arr.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
    return Promise.resolve({ data: arr, error: null });
  }
  return withClockSkewRetry(function(){ return sb.from('books').select('*').order('created_at', { ascending:false }); });
}
export function dbSelectWishlist(){
  if(state.isGuest){
    var arr = guestGet('guest_wishlist', []);
    arr.sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
    return Promise.resolve({ data: arr, error: null });
  }
  return withClockSkewRetry(function(){ return sb.from('wishlist').select('*').order('created_at', { ascending:false }); });
}
// La tabla `authors` es de lectura pública (compartida entre todos los usuarios), no
// está sujeta a RLS por usuario como el resto de tablas, así que se consulta igual
// para invitados y usuarios con cuenta.
export function dbSelectAuthors(){
  return sb.from('authors').select('name').order('name');
}
export function dbSelectProfile(){
  if(state.isGuest){
    var name = localStorage.getItem('guest_library_name');
    return Promise.resolve({ data: name ? { library_name:name } : null, error:null });
  }
  return withClockSkewRetry(function(){ return sb.from('profile').select('library_name, role, avatar_url').maybeSingle(); });
}
export function dbInsertBook(data){
  if(state.isGuest){
    var arr = guestGet('guest_books', []);
    var row = Object.assign({ id: guestUid(), created_at: new Date().toISOString() }, data);
    row.fecha_leido = (data.status === 'leido') ? new Date().toISOString() : null;
    arr.unshift(row);
    guestSet('guest_books', arr);
    return Promise.resolve({ data:[row], error:null });
  }
  return sb.from('books').insert([data]).select();
}
export function dbUpdateBook(id, data){
  if(state.isGuest){
    var arr = guestGet('guest_books', []);
    var updated = null;
    arr = arr.map(function(b){
      if(b.id===id){
        updated = Object.assign({}, b, data);
        // fecha_leido no es editable por el usuario: solo se fija al pasar a "leido" por primera vez.
        updated.fecha_leido = (data.status === 'leido' && b.status !== 'leido') ? new Date().toISOString() : (b.fecha_leido || null);
        return updated;
      }
      return b;
    });
    guestSet('guest_books', arr);
    return Promise.resolve({ data:[updated], error:null });
  }
  return sb.from('books').update(data).eq('id', id).select();
}
export function dbDeleteBook(id){
  if(state.isGuest){
    var arr = guestGet('guest_books', []).filter(function(b){ return b.id!==id; });
    guestSet('guest_books', arr);
    return Promise.resolve({ error:null });
  }
  return sb.from('books').delete().eq('id', id);
}
export function dbInsertWish(data){
  if(state.isGuest){
    var arr = guestGet('guest_wishlist', []);
    var row = Object.assign({ id: guestUid(), created_at: new Date().toISOString() }, data);
    arr.unshift(row);
    guestSet('guest_wishlist', arr);
    return Promise.resolve({ data:[row], error:null });
  }
  return sb.from('wishlist').insert([data]).select();
}
export function dbUpdateWish(id, data){
  if(state.isGuest){
    var arr = guestGet('guest_wishlist', []);
    var updated = null;
    arr = arr.map(function(w){ if(w.id===id){ updated = Object.assign({}, w, data); return updated; } return w; });
    guestSet('guest_wishlist', arr);
    return Promise.resolve({ data:[updated], error:null });
  }
  return sb.from('wishlist').update(data).eq('id', id).select();
}
export function dbDeleteWish(id){
  if(state.isGuest){
    var arr = guestGet('guest_wishlist', []).filter(function(w){ return w.id!==id; });
    guestSet('guest_wishlist', arr);
    return Promise.resolve({ error:null });
  }
  return sb.from('wishlist').delete().eq('id', id);
}
export function dbSaveProfile(name){
  if(state.isGuest){
    localStorage.setItem('guest_library_name', name);
    return Promise.resolve({ error:null });
  }
  return sb.from('profile').upsert({ user_id: state.currentUserId, library_name: name });
}
export function dbSaveAvatar(url){
  return sb.from('profile').upsert({ user_id: state.currentUserId, avatar_url: url });
}

// ================= SUSCRIPCIÓN (upgrade a Premium vía Lemon Squeezy) =================
export function dbSelectSubscription(){
  if(state.isGuest) return Promise.resolve({ data:null, error:null });
  return sb.from('subscriptions').select('plan, status, current_period_end, ls_customer_portal_url').maybeSingle();
}
export function dbStartCheckout(plan){
  return sb.functions.invoke('create-checkout', { body: { plan: plan } }).then(function(res){
    if(res.error || !res.data || !res.data.url) throw new Error('checkout_failed');
    return res.data.url;
  });
}

// ================= PORTADAS (descarga permanente vía Edge Function) =================
var COVERS_PUBLIC_PREFIX = SUPABASE_URL + '/storage/v1/object/public/covers/';
export function isOwnCoverUrl(url){
  return !!url && url.indexOf(COVERS_PUBLIC_PREFIX) === 0;
}
export function validateImageLoads(url){
  return new Promise(function(resolve){
    var done = false;
    var img = new Image();
    var timer = setTimeout(function(){ if(!done){ done = true; resolve(false); } }, 8000);
    img.onload = function(){ if(!done){ done = true; clearTimeout(timer); resolve(true); } };
    img.onerror = function(){ if(!done){ done = true; clearTimeout(timer); resolve(false); } };
    img.src = url;
  });
}
export function downloadCoverToStorage(url){
  return sb.functions.invoke('download-cover', { body: { url: url } }).then(function(res){
    if(res.error || !res.data || !res.data.url) throw new Error('download_failed');
    return res.data.url;
  });
}
export function deleteOwnStorageCover(url){
  if(!isOwnCoverUrl(url)) return;
  var path = url.slice(COVERS_PUBLIC_PREFIX.length);
  sb.storage.from('covers').remove([path]).catch(function(){});
}

// ================= PERSISTENCIA DE FILTROS/AGRUPAMIENTO (por navegador) =================
var PREF_BOOK_FILTERS = 'pref_book_filters';
var PREF_BOOK_GROUP = 'pref_book_group';
var PREF_WISH_FILTERS = 'pref_wish_filters';
var PREF_WISH_GROUP = 'pref_wish_group';
var PREF_NEW_BOOK_IDS = 'pref_new_book_ids';
var PREF_BOOK_VIEW = 'pref_book_view';
var PREF_WISH_VIEW = 'pref_wish_view';
var PREF_BOOK_TABLE_SORT = 'pref_book_table_sort';
var PREF_WISH_TABLE_SORT = 'pref_wish_table_sort';
var PREF_BOOK_TABLE_COLUMNS = 'pref_book_table_columns';
var PREF_WISH_TABLE_COLUMNS = 'pref_wish_table_columns';

export function savePrefs(){
  try {
    localStorage.setItem(PREF_BOOK_FILTERS, JSON.stringify(state.filters));
    localStorage.setItem(PREF_BOOK_GROUP, state.groupBy);
    localStorage.setItem(PREF_WISH_FILTERS, JSON.stringify(state.wishFilters));
    localStorage.setItem(PREF_WISH_GROUP, state.wishGroupBy);
    localStorage.setItem(PREF_BOOK_VIEW, state.bookViewMode);
    localStorage.setItem(PREF_WISH_VIEW, state.wishViewMode);
    localStorage.setItem(PREF_BOOK_TABLE_SORT, JSON.stringify(state.bookTableSort));
    localStorage.setItem(PREF_WISH_TABLE_SORT, JSON.stringify(state.wishTableSort));
    localStorage.setItem(PREF_BOOK_TABLE_COLUMNS, JSON.stringify(state.bookTableColumns));
    localStorage.setItem(PREF_WISH_TABLE_COLUMNS, JSON.stringify(state.wishTableColumns));
  } catch(e){}
}
export function loadPrefs(){
  try {
    var bf = localStorage.getItem(PREF_BOOK_FILTERS);
    if(bf){ var parsedBf = JSON.parse(bf); state.filters.search = parsedBf.search||''; state.filters.author = parsedBf.author||''; state.filters.saga = parsedBf.saga||''; state.filters.genre = parsedBf.genre||''; state.filters.status = parsedBf.status||''; state.filters.edicion = parsedBf.edicion||''; }
    var bg = localStorage.getItem(PREF_BOOK_GROUP);
    if(bg !== null) state.groupBy = bg;
    var wf = localStorage.getItem(PREF_WISH_FILTERS);
    if(wf){ var parsedWf = JSON.parse(wf); state.wishFilters.search = parsedWf.search||''; state.wishFilters.author = parsedWf.author||''; state.wishFilters.tienda = parsedWf.tienda||''; state.wishFilters.costoOp = parsedWf.costoOp||'gt'; state.wishFilters.costoVal = (parsedWf.costoVal!=null && parsedWf.costoVal!=='') ? Number(parsedWf.costoVal) : null; }
    var wg = localStorage.getItem(PREF_WISH_GROUP);
    if(wg !== null) state.wishGroupBy = wg;
    var nb = localStorage.getItem(PREF_NEW_BOOK_IDS);
    if(nb){ JSON.parse(nb).forEach(function(bid){ state.newBookIds[bid] = true; }); }
    var bv = localStorage.getItem(PREF_BOOK_VIEW);
    if(bv === 'mosaico' || bv === 'listado') state.bookViewMode = bv;
    var wv = localStorage.getItem(PREF_WISH_VIEW);
    if(wv === 'mosaico' || wv === 'listado') state.wishViewMode = wv;
    var bts = localStorage.getItem(PREF_BOOK_TABLE_SORT);
    if(bts){ try{ var pbts = JSON.parse(bts);
      if(pbts && typeof pbts.key==='string') state.bookTableSort.key = pbts.key;
      if(pbts && (pbts.dir==='asc'||pbts.dir==='desc')) state.bookTableSort.dir = pbts.dir;
    } catch(e2){} }
    var wts = localStorage.getItem(PREF_WISH_TABLE_SORT);
    if(wts){ try{ var pwts = JSON.parse(wts);
      if(pwts && typeof pwts.key==='string') state.wishTableSort.key = pwts.key;
      if(pwts && (pwts.dir==='asc'||pwts.dir==='desc')) state.wishTableSort.dir = pwts.dir;
    } catch(e3){} }
    var btc = localStorage.getItem(PREF_BOOK_TABLE_COLUMNS);
    if(btc){ try{ var pbtc = JSON.parse(btc);
      Object.keys(state.bookTableColumns).forEach(function(k){ if(typeof pbtc[k]==='boolean') state.bookTableColumns[k]=pbtc[k]; });
    } catch(e4){} }
    var wtc = localStorage.getItem(PREF_WISH_TABLE_COLUMNS);
    if(wtc){ try{ var pwtc = JSON.parse(wtc);
      Object.keys(state.wishTableColumns).forEach(function(k){ if(typeof pwtc[k]==='boolean') state.wishTableColumns[k]=pwtc[k]; });
    } catch(e5){} }
  } catch(e){}
}
export function saveNewBookIds(){
  try { localStorage.setItem(PREF_NEW_BOOK_IDS, JSON.stringify(Object.keys(state.newBookIds))); } catch(e){}
}
