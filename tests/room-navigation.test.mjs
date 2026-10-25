import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStore } from 'jotai';
import './register-unread-source.mjs';
const { allRoomsAtom } = await import('../src/app/state/room-list/roomList.ts');
const { factoryRoomIdByActivity, factoryRoomIdByAtoZ } = await import('../src/app/utils/sort.ts');

test('repeated membership events preserve room order and do not notify list subscribers', () => {
  const store = createStore();
  store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: ['!one', '!two'] });
  const before = store.get(allRoomsAtom);
  let updates = 0;
  const unsubscribe = store.sub(allRoomsAtom, () => {
    updates += 1;
  });
  store.set(allRoomsAtom, { type: 'PUT', roomId: '!one' });
  store.set(allRoomsAtom, { type: 'DELETE', roomId: '!missing' });
  assert.equal(store.get(allRoomsAtom), before);
  assert.equal(updates, 0);
  store.set(allRoomsAtom, { type: 'PUT', roomId: '!three' });
  assert.deepEqual(store.get(allRoomsAtom), ['!one', '!two', '!three']);
  store.set(allRoomsAtom, { type: 'DELETE', roomId: '!two' });
  assert.deepEqual(store.get(allRoomsAtom), ['!one', '!three']);
  unsubscribe();
});

test('equal names or activity timestamps have deterministic room ID tie breaks', () => {
  const mx = { getRoom: () => ({ name: 'Same room name', getLastActiveTimestamp: () => 42 }) };
  for (const compare of [factoryRoomIdByActivity(mx), factoryRoomIdByAtoZ(mx)]) {
    assert.deepEqual(['!b', '!a'].sort(compare), ['!a', '!b']);
    assert.deepEqual(['!a', '!b'].sort(compare), ['!a', '!b']);
  }
});
