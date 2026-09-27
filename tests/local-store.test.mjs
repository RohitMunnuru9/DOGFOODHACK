import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
globalThis.window = {addEventListener: () => {}};

const store = await import('../src/localStore.js');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('local panels persist, query, notify, and apply a batch', async () => {
  const state = store.doc(store.db, 'system', 'state');
  const observed = [];
  const unsubscribe = store.onSnapshot(state, snap => observed.push(snap.data().currentRound));
  await tick();
  assert.deepEqual(observed, ['phase1']);
  await store.updateDoc(state, {currentRound: 'phase2'});
  await tick();
  assert.deepEqual(observed, ['phase1', 'phase2']);
  unsubscribe();

  const teams = store.collection(store.db, 'teams');
  await store.setDoc(store.doc(store.db, 'teams', 'new-team'), {
    name: 'New Team', track: 'Open Innovation', members: ['A'], count: 1,
  });
  const batch = store.writeBatch(store.db);
  batch.update(store.doc(store.db, 'teams', 'new-team'), {
    members: store.arrayUnion('B'), count: store.increment(2), removed: store.deleteField(),
  });
  await batch.commit();
  const result = await store.getDoc(store.doc(store.db, 'teams', 'new-team'));
  assert.deepEqual(result.data().members, ['A', 'B']);
  assert.equal(result.data().count, 3);
  const matching = await store.getDocs(store.query(teams,
    store.where('track', '==', 'Open Innovation'), store.orderBy('name', 'asc'), store.limit(2)));
  assert.equal(matching.docs.length, 2);
  const changes = [];
  const stopTeams = store.onSnapshot(teams, snap => changes.push(snap.docChanges().map(change => change.type)));
  await tick();
  await store.setDoc(store.doc(store.db, 'teams', 'new-team'), {...result.data(), name: 'Renamed Team'});
  await tick();
  assert.deepEqual(changes.at(-1), ['modified']);
  stopTeams();
  assert.ok(values.has('dogfood-local-panels-v1'));
});

test('browser-only panel data moves to the current storage key', async () => {
  values.delete('dogfood-local-panels-v1');
  values.set('previous-local-panels-v1', JSON.stringify({system: {state: {currentRound: 'restored'}}}));
  const migratedStore = await import('../src/localStore.js?migration');
  const state = await migratedStore.getDoc(migratedStore.doc(migratedStore.db, 'system', 'state'));
  assert.equal(state.data().currentRound, 'restored');
  assert.ok(values.has('dogfood-local-panels-v1'));
  assert.ok(!values.has('previous-local-panels-v1'));
});
