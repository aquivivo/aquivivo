import { db } from '../core/firebase.js';
import {
  collection as fsCollection,
  doc as fsDoc,
  getDoc as fsGetDoc,
  getDocs as fsGetDocs,
  limit as fsLimit,
  query as fsQuery,
  runTransaction as fsRunTransaction,
  serverTimestamp as fsServerTimestamp,
  setDoc as fsSetDoc,
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

export function runTransaction(updateFn) {
  return fsRunTransaction(db, updateFn);
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
    limit,
    getDoc,
    getDocs,
    setDoc,
    runTransaction,
    serverTimestamp,
  };
}
