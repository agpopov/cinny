import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePath, matchRoutes } from 'react-router-dom';
import * as paths from '../src/app/pages/pathUtils.ts';
import * as patterns from '../src/app/pages/paths.ts';
import { getCanonicalMatrixPath } from '../src/app/pages/matrixRoutePath.ts';

const paramsOf = (pattern, pathname) => matchRoutes([{ path: pattern }], pathname)?.[0].params;
const room = '!room:05.team';
const space = '!space:05.team';
const event = '$root/event:05.team';
for (const identifier of [
  room,
  '#канал/qa:05.team',
  '!literal%3Avalue:05.team',
  '!serverlessRoom',
]) {
  test(`room navigation round-trips the exact Matrix identifier ${identifier}`, () => {
    for (const [pattern, make] of [
      [patterns.HOME_ROOM_PATH, paths.getHomeRoomPath],
      [patterns.DIRECT_ROOM_PATH, paths.getDirectRoomPath],
    ]) {
      assert.deepEqual(paramsOf(pattern, make(identifier, event)), {
        roomIdOrAlias: identifier,
        eventId: event,
      });
    }
    assert.deepEqual(
      paramsOf(patterns.SPACE_ROOM_PATH, paths.getSpaceRoomPath(space, identifier, event)),
      {
        spaceIdOrAlias: space,
        roomIdOrAlias: identifier,
        eventId: event,
      }
    );
  });
}
test('space routes round-trip IDs and aliases without double encoding', () => {
  for (const value of [space, '#пространство/qa:05.team']) {
    for (const [pattern, make] of [
      [patterns.SPACE_PATH, paths.getSpacePath],
      [patterns.SPACE_LOBBY_PATH, paths.getSpaceLobbyPath],
      [patterns.SPACE_SEARCH_PATH, paths.getSpaceSearchPath],
    ])
      assert.deepEqual(paramsOf(pattern, make(value)), { spaceIdOrAlias: value });
  }
});
test('login/register/reset/explore paths encode ports and full homeserver URLs once', () => {
  for (const server of ['05.team:8448', 'https://matrix.05.team/proxy']) {
    for (const [pattern, make] of [
      [patterns.LOGIN_PATH, paths.getLoginPath],
      [patterns.REGISTER_PATH, paths.getRegisterPath],
      [patterns.RESET_PASSWORD_PATH, paths.getResetPasswordPath],
      [patterns.EXPLORE_SERVER_PATH, paths.getExploreServerPath],
    ])
      assert.deepEqual(paramsOf(pattern, make(server)), { server });
  }
});
for (const [pattern, expected] of [
  [patterns.HOME_ROOM_PATH, paths.getHomeRoomPath(room, event)],
  [patterns.DIRECT_ROOM_PATH, paths.getDirectRoomPath(room, event)],
  [patterns.SPACE_ROOM_PATH, paths.getSpaceRoomPath(space, room, event)],
  [patterns.SPACE_PATH, paths.getSpacePath(space)],
  [patterns.SPACE_LOBBY_PATH, paths.getSpaceLobbyPath(space)],
  [patterns.SPACE_SEARCH_PATH, paths.getSpaceSearchPath(space)],
])
  test(`legacy URLs are canonicalized for ${pattern}`, () => {
    const legacy = generatePath(pattern, {
      spaceIdOrAlias: encodeURIComponent(space),
      roomIdOrAlias: encodeURIComponent(room),
      eventId: encodeURIComponent(event),
    });
    assert.equal(getCanonicalMatrixPath(legacy, paramsOf(pattern, legacy)), expected);
  });
test('valid IDs with literal percent sequences and serverless IDs stay unchanged', () => {
  for (const id of [
    '!literal%3Atext:05.team',
    '!serverlessRoom',
    '#literal%3A:05.team',
    '!bad%invalid',
  ]) {
    const pathname = paths.getHomeRoomPath(id, event);
    assert.equal(
      getCanonicalMatrixPath(pathname, paramsOf(patterns.HOME_ROOM_PATH, pathname)),
      undefined
    );
  }
});
