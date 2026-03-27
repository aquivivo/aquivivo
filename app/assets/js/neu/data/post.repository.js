import { db } from '../core/firebase.js';
import {
  collection as fsCollection,
  deleteDoc as fsDeleteDoc,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  limit as fsLimit,
  onSnapshot as fsOnSnapshot,
  orderBy as fsOrderBy,
  query as fsQuery,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  where as fsWhere,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';

export function doc(...args) {
  if (typeof args[0] === 'string') return fsDoc(db, ...args);
  return fsDoc(...args);
}

export function collection(...args) {
  if (typeof args[0] === 'string') return fsCollection(db, ...args);
  return fsCollection(...args);
}

export function query(...args) {
  return fsQuery(...args);
}

export function where(...args) {
  return fsWhere(...args);
}

export function orderBy(...args) {
  return fsOrderBy(...args);
}

export function limit(...args) {
  return fsLimit(...args);
}

export function getDoc(ref) {
  return fsGetDoc(ref);
}

export function getDocs(ref) {
  return fsGetDocs(ref);
}

export function setDoc(ref, payload, options) {
  return fsSetDoc(ref, payload, options);
}

export function updateDoc(ref, payload) {
  return fsUpdateDoc(ref, payload);
}

export function deleteDoc(ref) {
  return fsDeleteDoc(ref);
}

export function onSnapshot(ref, next, error) {
  return fsOnSnapshot(ref, next, error);
}

export function serverTimestamp() {
  return fsServerTimestamp();
}

export function init() {
  return {
    doc,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
  };
}
