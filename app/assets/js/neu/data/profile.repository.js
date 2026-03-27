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
  orderBy as fsOrderBy,
  query as fsQuery,
  runTransaction as fsRunTransaction,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  where as fsWhere,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteObject as fsDeleteObject,
  getDownloadURL as fsGetDownloadURL,
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

export function runTransaction(updateFn) {
  return fsRunTransaction(db, updateFn);
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

export function deleteObject(ref) {
  return fsDeleteObject(ref);
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
    runTransaction,
    serverTimestamp,
    increment,
    deleteField,
    storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject,
  };
}
