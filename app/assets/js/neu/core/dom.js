export function byId(id) {
  return document.getElementById(id);
}

export function query(selector, root = document) {
  return root.querySelector(selector);
}

export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function wire(root, eventName, selector, handler, options) {
  if (!(root instanceof EventTarget) || typeof handler !== 'function') return () => {};
  const onEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!selector || target.closest(selector)) handler(event);
  };
  root.addEventListener(eventName, onEvent, options);
  return () => root.removeEventListener(eventName, onEvent, options);
}

export function init() {
  return { byId, query, queryAll, wire };
}
