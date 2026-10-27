import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';

const { getMessageUrls } = await import('../src/app/utils/messageUrls.ts');
const { linkToPlainText, linkToHtml } = await import('../src/app/components/editor/links.ts');
const { getProviderMedia } = await import('../src/app/utils/urlPreview.ts');
const url = 'https://tenor.com/ru/view/craving-break-me-if-you-can-gif-12802980';

test('a link serialized by the actual editor retains its preview address', () => {
  const body = linkToPlainText(url, url);
  const html = linkToHtml(url, url);
  assert.deepEqual(getMessageUrls(body, html), [url]);
  assert.deepEqual(getProviderMedia(getMessageUrls(body, html)[0]), {
    url: 'https://tenor.com/view/12802980.gif',
    kind: 'image',
  });
});

test('formatted links use their destination, not the label or plaintext fallback', () => {
  assert.deepEqual(getMessageUrls('GIF', `<p><a href="${url}">GIF</a></p>`), [url]);
  assert.deepEqual(getMessageUrls(url, '<a href="https://example.org/">' + url + '</a>'), [
    'https://example.org/',
  ]);
  assert.deepEqual(getMessageUrls(url, '<p>No visible link</p>'), []);
});

test('formatted links decode entities and deduplicate anchors and visible text', () => {
  const href = 'https://example.org/?a=1&b=2';
  assert.deepEqual(
    getMessageUrls('fallback', `<a href="https://example.org/?a=1&amp;b=2">link</a><p>${href}</p>`),
    [href]
  );
  assert.deepEqual(getMessageUrls('fallback', `<p>${url}</p><a href="${url}">GIF</a>`), [url]);
});

test('reply fallbacks, spoilers, code and active HTML never trigger preview requests', () => {
  for (const html of [
    `<mx-reply><blockquote><a href="${url}">quoted</a></blockquote></mx-reply><p>Reply</p>`,
    `<span data-mx-spoiler><a href="${url}">secret</a></span>`,
    `<pre><code>${url}</code></pre>`,
    `<script>${url}</script>`,
    `<a href="javascript:alert(1)">link</a>`,
    `<a href="https://user:password@example.org/">link</a>`,
  ]) {
    assert.deepEqual(getMessageUrls('fallback', html), [], html);
  }
});

test('plain messages keep ordinary link previews and preserve order', () => {
  assert.deepEqual(getMessageUrls(`See ${url} and https://example.org/. ${url}`), [
    url,
    'https://example.org/',
  ]);
  assert.deepEqual(getMessageUrls('no link'), []);
});
