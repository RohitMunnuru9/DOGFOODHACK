const key = 'dogfood.localPreviewSession';
let memoryToken = '';

export function getDemoSession() {
  if (memoryToken) return memoryToken;
  try { return window.sessionStorage.getItem(key) || ''; }
  catch { return ''; }
}

export function setDemoSession(token) {
  memoryToken = token || '';
  try {
    if (memoryToken) window.sessionStorage.setItem(key, memoryToken);
    else window.sessionStorage.removeItem(key);
  } catch { /* The in-memory token still works when browser storage is unavailable. */ }
}
