import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';

const { getMessageUrls, getSoleMessageUrl } = await import('../src/app/utils/messageUrls.ts');
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

test('the reported Cyrillic Tenor link resolves from plain and formatted messages', () => {
  const share =
    'https://tenor.com/ru/view/ну-и-пожалуйста-ну-и-не-нужно-котёнок-gif-9559614367641425665';
  const encoded = encodeURI(share);
  for (const urls of [
    getMessageUrls(share),
    getMessageUrls(linkToPlainText(encoded, share), linkToHtml(encoded, share)),
  ]) {
    assert.deepEqual(urls, [encoded]);
    assert.deepEqual(getProviderMedia(urls[0]), {
      url: 'https://tenor.com/view/9559614367641425665.gif',
      kind: 'image',
    });
  }
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

test('only a single visible URL may be replaced by its loaded media', () => {
  assert.equal(getSoleMessageUrl(` \n${url}\n `), url);
  assert.equal(getSoleMessageUrl('fallback', `<p><a href="${url}">${url}</a></p>`), url);
  assert.equal(getSoleMessageUrl('fallback', `<p>${url}</p>`), url);
  for (const body of [
    `Look ${url}`,
    `${url} caption`,
    `${url}\n${url}`,
    `${url} https://example.org/`,
    `[${url}](${url})`,
  ]) {
    assert.equal(getSoleMessageUrl(body), undefined, body);
  }
  for (const html of [
    `<a href="${url}">Caption</a>`,
    `<a href="https://example.org/">${url}</a>`,
    `<p>${url}</p><p>Caption</p>`,
    `<a href="${url}">${url}</a><img src="https://example.org/image.png">`,
    `<span data-mx-spoiler>${url}</span>`,
    `<pre><code>${url}</code></pre>`,
  ])
    assert.equal(getSoleMessageUrl(url, html), undefined, html);
});
