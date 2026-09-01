"use strict";

// Estado mutable compartido entre módulos. Se agrupa en un único objeto porque
// una binding importada (`import {x} from './state.js'`) es de solo lectura:
// reasignarla (`x = ...`) tira TypeError en runtime dentro de otro módulo.
// Mutar una propiedad (`state.x = ...` / `state.x.push(...)`) sí está permitido,
// porque nunca se reasigna el binding `state` en sí, sólo sus propiedades.
export var state = {
  books: [],
  wishlist: [],
  allAuthors: [],
  bookNumeroTouched: false,
  wishNumeroTouched: false,
  newBookIds: {},
  currentUserId: null,
  isGuest: false,
  notifications: [],
  currentNotifDetailId: null,

  authMode: 'login', // 'login' | 'signup' | 'recover'
  cameFromGuest: false,
  migrationInProgress: false,
  authBackGuardActive: false,

  groupBy: '', // '' | 'author' | 'saga' | 'genre' | 'status'
  currentGroups: [],
  filters: { search:'', author:'', saga:'', genre:'', status:'', edicion:'' },
  wishFilters: { search:'', author:'', tienda:'', costoOp:'gt', costoVal:null },
  wishGroupBy: '', // '' | 'author'
  currentWishGroups: [],
  openGroupContext: null, // { type:'book'|'wish', label:'...' } | null

  bookViewMode: 'mosaico', // 'mosaico' | 'listado'
  wishViewMode: 'mosaico', // 'mosaico' | 'listado'
  bookTableSort: { key: 'title', dir: 'asc' }, // dir: 'asc' | 'desc'
  wishTableSort: { key: 'title', dir: 'asc' },
  // key -> boolean. 'title' y 'actions' no están aquí: son columnas fijas siempre visibles.
  bookTableColumns: {
    cover:false, author:true, saga:true, numero_saga:true,
    genre:false, status:true, edicion:false, costo:true,
    tienda:false, created_at:false
  },
  wishTableColumns: {
    cover:false, author:true, saga:true, numero_saga:true,
    costo:true, tienda:true, created_at:false
  },

  currentUserRole: 'free' // 'administrador' | 'fundador' | 'premium' | 'free'
};

// Constantes: nunca se reasignan, así que no necesitan vivir dentro de `state`
// (exportarlas sueltas evita el riesgo de reasignación de bindings importadas).
export var LIBRARY_CAP = 10;
export var WISHLIST_CAP = 10;
export var DEFAULT_TITLE = 'Mi Biblioteca';
export var STATUS_LABELS = { pendiente:'Pendiente', leyendo:'Leyendo', leido:'Leído' };
export var ROLE_LABELS = { administrador:'Administrador', fundador:'Lector Fundador', premium:'Lector Premium', free:'Lector' };
export var STATUS_NEXT = { pendiente:'leyendo', leyendo:'leido', leido:'leido' };
export var ICONS = {
  check:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>',
  edit:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  trash:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  cart:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h2l2.6 12.4a2 2 0 002 1.6h9a2 2 0 002-1.8L21 7H6"/></svg>',
  heart:'<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8B3A3A" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
  gem:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12"/></svg>',
  book:'<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B8874F" stroke-width="1.6"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
  bookOpen:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5c3 0 7 .5 9 2v13c-2-1.5-6-2-9-2z"/><path d="M22 5c-3 0-7 .5-9 2v13c2-1.5 6-2 9-2z"/></svg>',
  sortAsc:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  sortDesc:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  sortNeutral:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>',
  eye:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a21.27 21.27 0 015.06-6.06M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a21.27 21.27 0 01-2.16 3.19"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/></svg>'
};

export function isPremiumTier(role){ return role === 'premium' || role === 'fundador' || role === 'administrador'; }
export function isPremiumUser(){ return isPremiumTier(state.currentUserRole); }
export function canAddBook(){ return isPremiumUser() || state.books.length < LIBRARY_CAP; }
export function canAddWish(){ return isPremiumUser() || state.wishlist.length < WISHLIST_CAP; }
