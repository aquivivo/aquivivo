import { db, storage } from '../core/firebase.js';
import {
  collection as fsCollection,
  deleteDoc as fsDeleteDoc,
  deleteField as fsDeleteField,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  increment as fsIncrement,
  limit as fsLimit,
  onSnapshot as fsOnSnapshot,
  orderBy as fsOrderBy,
  query as fsQuery,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
  startAfter as fsStartAfter,
  updateDoc as fsUpdateDoc,
  where as fsWhere,
  writeBatch as fsWriteBatch,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  getDownloadURL as fsGetDownloadURL,
  getStorage as fsGetStorage,
  ref as fsStorageRef,
  uploadBytes as fsUploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

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

export function startAfter(...args) {
  return fsStartAfter(...args);
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

export function writeBatch() {
  return fsWriteBatch(db);
}

export function serverTimestamp() {
  return fsServerTimestamp();
}

export function increment(value) {
  return fsIncrement(value);
}

export function deleteField() {
  return fsDeleteField();
}

export function storageRef(pathOrRef, child) {
  if (typeof pathOrRef === 'string') return fsStorageRef(storage, pathOrRef);
  if (pathOrRef && child != null) return fsStorageRef(pathOrRef, child);
  return fsStorageRef(pathOrRef);
}

export function uploadBytes(ref, file, metadata) {
  return fsUploadBytes(ref, file, metadata);
}

export function getDownloadURL(ref) {
  return fsGetDownloadURL(ref);
}

export function getStorage(appInstance = null) {
  return appInstance ? fsGetStorage(appInstance) : fsGetStorage();
}

export function init() {
  return {
    doc,
    collection,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    increment,
    deleteField,
    storageRef,
    uploadBytes,
    getDownloadURL,
    getStorage,
  };
}
