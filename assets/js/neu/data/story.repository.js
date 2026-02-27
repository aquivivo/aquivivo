import { db, storage } from '../core/firebase.js';
import {
  collection as fsCollection,
  deleteDoc as fsDeleteDoc,
  doc as fsDoc,
  getDocs as fsGetDocs,
  limit as fsLimit,
  orderBy as fsOrderBy,
  query as fsQuery,
  where as fsWhere,
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import {
  deleteObject as fsDeleteObject,
  ref as fsStorageRef,
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

export function getDocs(ref) {
  return fsGetDocs(ref);
}

export function deleteDoc(ref) {
  return fsDeleteDoc(ref);
}

export function storageRef(pathOrRef, child) {
  if (typeof pathOrRef === 'string') return fsStorageRef(storage, pathOrRef);
  if (pathOrRef && child != null) return fsStorageRef(pathOrRef, child);
  return fsStorageRef(pathOrRef);
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
    getDocs,
    deleteDoc,
    storageRef,
    deleteObject,
  };
}
