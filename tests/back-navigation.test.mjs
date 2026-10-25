import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';
const { getBackPath } = await import('../src/app/utils/backNavigation.ts');

test('back from channels, directs and spaces works without WebView history', () => {
  for (const [path, parent] of [
    ['/home/!room:example.org/', '/home/'],
    ['/home/%23room%3Aexample.org/$event/', '/home/'],
    ['/direct/!room:example.org/', '/direct/'],
    ['/%21space%3Aexample.org/!room:example.org/', '/!space%3Aexample.org'],
    ['/%23space%3Aexample.org/!room:example.org/', '/%23space%3Aexample.org'],
    ['/explore/example.org/', '/explore/'],
    ['/inbox/notifications/', '/inbox/'],
  ])
    assert.equal(getBackPath(path), parent, path);
});

test('list roots and authentication retain native back behavior', () => {
  for (const path of [
    '/home/',
    '/direct/',
    '/%21space%3Aexample.org/',
    '/explore/',
    '/inbox/',
    '/login/',
    '/',
  ]) {
    assert.equal(getBackPath(path), undefined, path);
  }
});
