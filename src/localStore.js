// Browser-only dashboard data. Shared DOGFOOD event data stays in SQLite.
const STORAGE_KEY = 'dogfood-local-panels-v1';
const listeners = new Set();
let memory = null;

const initialData = () => ({
  system: {state: {currentRound: 'phase1', roundStatus: 'ongoing', notifications: []}},
  users: {
    'local-admin': {name: 'Local Admin', email: 'admin@localhost', role: 'admin'},
    'local-contestant': {name: 'Local Contestant', email: 'contestant@localhost', role: 'contestant', teamId: 'preview-team', attendanceMarked: true},
    'local-jury': {name: 'Local Jury', email: 'jury@localhost', role: 'jury', assignedTrack: 'Open Innovation'},
    'local-helper': {name: 'Local Helper', email: 'helper@localhost', role: 'helper', helperRole: 'Registration Desk', assignedTrack: 'Open Innovation'},
  },
  teams: {
    'preview-team': {teamId: 'PREVIEW-01', name: 'Preview Team', track: 'Open Innovation', status: 'ready', memberCount: 1,
      members: ['Local Contestant'], leaderEmail: 'contestant@localhost', attendanceMarked: true},
  },
});

function read() {
  if (memory) return memory;
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && key !== STORAGE_KEY && key.endsWith('-local-panels-v1')) {
          saved = localStorage.getItem(key);
          if (saved) {
            JSON.parse(saved);
            localStorage.setItem(STORAGE_KEY, saved);
            localStorage.removeItem(key);
          }
          break;
        }
      }
    }
    memory = saved ? JSON.parse(saved) : initialData();
  } catch (_) { memory = initialData(); }
  return memory;
}

function write(value) {
  memory = value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
  catch (error) { console.error('Unable to persist local dashboard panels:', error); }
  queueMicrotask(() => { for (const listener of [...listeners]) listener(); });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      memory = null;
      for (const listener of [...listeners]) listener();
    }
  });
}

const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const pathOf = segments => segments.join('/');
const splitDoc = reference => {
  const segments = reference.path.split('/');
  const id = segments.pop();
  return [segments.join('/'), id];
};

const fieldValue = (value, field) => field.split('.').reduce((item, key) => item?.[key], value);
const snapshot = (id, value) => ({id, exists: () => value !== undefined, data: () => copy(value)});
const querySnapshot = docs => ({docs, empty: docs.length === 0, size: docs.length,
  forEach: callback => docs.forEach(callback)});

function resolve(reference) {
  const state = read();
  if (reference.kind === 'doc') {
    const [collectionPath, id] = splitDoc(reference);
    return snapshot(id, state[collectionPath]?.[id]);
  }
  const source = state[reference.path] || {};
  let rows = Object.entries(source).map(([id, value]) => ({id, value}));
  for (const rule of reference.rules || []) {
    if (rule.kind === 'where') {
      rows = rows.filter(row => rule.op === '==' && fieldValue(row.value, rule.field) === rule.value);
    } else if (rule.kind === 'orderBy') {
      rows.sort((a, b) => {
        const left = fieldValue(a.value, rule.field);
        const right = fieldValue(b.value, rule.field);
        return (left == null ? 1 : right == null ? -1 : left < right ? -1 : left > right ? 1 : 0) *
          (rule.direction === 'desc' ? -1 : 1);
      });
    } else if (rule.kind === 'limit') rows = rows.slice(0, rule.count);
  }
  return querySnapshot(rows.map(row => snapshot(row.id, row.value)));
}

function applyFields(existing, changes, merge) {
  const next = merge ? {...existing} : {};
  for (const [key, value] of Object.entries(changes)) {
    if (value?.__localOp === 'delete') delete next[key];
    else if (value?.__localOp === 'arrayUnion') next[key] = [...new Set([...(next[key] || []), ...value.values])];
    else if (value?.__localOp === 'increment') next[key] = (Number(next[key]) || 0) + value.amount;
    else next[key] = copy(value);
  }
  return next;
}

function mutate(state, reference, changes, mode) {
  const [collectionPath, id] = splitDoc(reference);
  state[collectionPath] ||= {};
  if (mode === 'update' && !(id in state[collectionPath])) throw Error('Local record does not exist: ' + reference.path);
  state[collectionPath][id] = applyFields(state[collectionPath][id] || {}, changes,
    mode === 'update' || mode === 'merge');
}

export const db = {};
export const doc = (_db, ...segments) => ({kind: 'doc', path: pathOf(segments)});
export const collection = (_db, ...segments) => ({kind: 'collection', path: pathOf(segments)});
export const where = (field, op, value) => ({kind: 'where', field, op, value});
export const orderBy = (field, direction = 'asc') => ({kind: 'orderBy', field, direction});
export const limit = count => ({kind: 'limit', count});
export const query = (reference, ...rules) => ({...reference, rules: [...(reference.rules || []), ...rules]});
export const getDoc = async reference => resolve(reference);
export const getDocs = async reference => resolve(reference);
export const onSnapshot = (reference, callback) => {
  let active = true;
  let previous = new Map();
  const emit = () => {
    if (!active) return;
    const result = resolve(reference);
    if (reference.kind !== 'doc') {
      const current = new Map(result.docs.map(item => [item.id, JSON.stringify(item.data())]));
      const changes = result.docs.flatMap(item => {
        const before = previous.get(item.id);
        const after = current.get(item.id);
        return before === undefined ? [{type: 'added', doc: item}] :
          before !== after ? [{type: 'modified', doc: item}] : [];
      });
      for (const [id, value] of previous) {
        if (!current.has(id)) changes.push({type: 'removed', doc: snapshot(id, JSON.parse(value))});
      }
      result.docChanges = () => changes;
      previous = current;
    }
    callback(result);
  };
  listeners.add(emit);
  queueMicrotask(emit);
  return () => { active = false; listeners.delete(emit); };
};
export const setDoc = async (reference, changes, options = {}) => {
  const state = copy(read());
  mutate(state, reference, changes, options.merge ? 'merge' : 'set');
  write(state);
};
export const updateDoc = async (reference, changes) => {
  const state = copy(read());
  mutate(state, reference, changes, 'update');
  write(state);
};
export const addDoc = async (reference, changes) => {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() :
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  await setDoc(doc(db, ...reference.path.split('/'), id), changes);
  return {id};
};
export const deleteField = () => ({__localOp: 'delete'});
export const arrayUnion = (...values) => ({__localOp: 'arrayUnion', values});
export const increment = amount => ({__localOp: 'increment', amount});
export const writeBatch = () => {
  const operations = [];
  return {
    update: (reference, changes) => operations.push([reference, changes, 'update']),
    set: (reference, changes, options = {}) => operations.push([reference, changes, options.merge ? 'merge' : 'set']),
    commit: async () => {
      const state = copy(read());
      for (const [reference, changes, mode] of operations) mutate(state, reference, changes, mode);
      write(state);
    },
  };
};

export const auth = {currentUser: {uid: 'local-admin', email: 'admin@localhost', displayName: 'Local Admin'}};

export const storage = {};
export const ref = (_storage, name) => ({name});
export const getBytes = async ({name}) => {
  const safeName = encodeURIComponent(name);
  const response = await fetch(`/media/${safeName}`);
  if (!response.ok) throw Error(`Local media is unavailable: ${name}`);
  return response.arrayBuffer();
};
