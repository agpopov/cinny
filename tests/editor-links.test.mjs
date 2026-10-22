import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createEditor, Editor, Element, Node, Transforms } from 'slate';
import { withHistory } from 'slate-history';

const types = new URL('../src/app/components/editor/types.ts', import.meta.url).href;
const constants = new URL('./fixtures/editor-types.mjs', import.meta.url).href;
// Native type stripping only; enum constants are fixtures, with no bundler/compiler.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (candidate.href === types) return nextResolve(constants, context);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  canSetLink,
  getLinkHref,
  getSelectedLink,
  pasteLink,
  removeLink,
  setLink,
  linkToHtml,
  linkToPlainText,
} = await import('../src/app/components/editor/links.ts');

const url = 'https://example.org/page?q=1&b=2#section';
const paragraph = (children) => ({ type: 'paragraph', children });
const link = (text, href = url) => ({ type: 'link', href, children: [{ text }] });
function editor(children = [paragraph([{ text: 'Read this word please' }])]) {
  const result = withHistory(createEditor());
  result.isInline = (node) => ['link', 'mention', 'emoticon', 'command'].includes(node.type);
  result.isVoid = (node) => ['mention', 'emoticon', 'command'].includes(node.type);
  result.children = structuredClone(children);
  return result;
}
function select(e, start = 10, end = 14) {
  Transforms.select(e, {
    anchor: { path: [0, 0], offset: start },
    focus: { path: [0, 0], offset: end },
  });
}
const links = (e) => Array.from(Node.elements(e)).filter(([n]) => n.type === 'link');

test('pasting a URL wraps the selected word and preserves the surrounding message', () => {
  const e = editor();
  select(e);
  assert.equal(pasteLink(e, url), true);
  assert.deepEqual(
    e.children[0],
    paragraph([{ text: 'Read this ' }, link('word'), { text: ' please' }])
  );
  assert.equal(Editor.string(e, []), 'Read this word please');
  e.insertText('!');
  assert.equal(links(e)[0][0].children[0].text, 'word');
  assert.equal(Editor.string(e, []), 'Read this word! please');
});

test('backward selections and formatted text retain their text and marks', () => {
  const e = editor([
    paragraph([
      { text: 'before ' },
      { text: 'bold', bold: true },
      { text: ' italic', italic: true },
      { text: ' after' },
    ]),
  ]);
  Transforms.select(e, {
    anchor: { path: [0, 2], offset: 7 },
    focus: { path: [0, 1], offset: 0 },
  });
  assert.equal(pasteLink(e, url), true);
  assert.deepEqual(links(e)[0][0].children, [
    { text: 'bold', bold: true },
    { text: ' italic', italic: true },
  ]);
});

test('plain text, multiple URLs and a collapsed caret retain normal paste behavior', () => {
  for (const value of [
    'ordinary text',
    'https://one.example https://two.example',
    'https://one.example\nhttps://two.example',
    'javascript:alert(1)',
    'data:text/html,foo',
  ]) {
    const e = editor();
    select(e);
    const before = structuredClone(e.children);
    assert.equal(pasteLink(e, value), false, value);
    assert.deepEqual(e.children, before);
  }
  const e = editor();
  select(e, 10, 10);
  assert.equal(pasteLink(e, url), false);
});

test('toolbar insertion supports custom labels and a URL as the default label', () => {
  const e = editor([paragraph([{ text: '' }])]);
  select(e, 0, 0);
  assert.equal(setLink(e, url, 'Documentation'), true);
  assert.equal(links(e)[0][0].children[0].text, 'Documentation');
  setLink(e, 'https://second.example/');
  assert.equal(links(e)[1][0].children[0].text, 'https://second.example/');
});

test('editing or unlinking existing links retains their label and formatting', () => {
  const e = editor([paragraph([{ text: '' }, link('original'), { text: '' }])]);
  Transforms.select(e, { path: [0, 1, 0], offset: 3 });
  assert.equal(getSelectedLink(e)[0].href, url);
  assert.equal(setLink(e, 'https://new.example/'), true);
  assert.equal(links(e).length, 1);
  assert.equal(links(e)[0][0].href, 'https://new.example/');
  Transforms.select(e, { path: [0, 1, 0], offset: 3 });
  removeLink(e);
  assert.equal(links(e).length, 0);
  assert.equal(Editor.string(e, []), 'original');
});

test('retargeting part of an existing link splits it without nested anchors', () => {
  const e = editor([paragraph([{ text: '' }, link('one two three'), { text: '' }])]);
  Transforms.select(e, {
    anchor: { path: [0, 1, 0], offset: 4 },
    focus: { path: [0, 1, 0], offset: 7 },
  });
  assert.equal(pasteLink(e, 'https://new.example/'), true);
  assert.deepEqual(
    links(e).map(([n]) => [Node.string(n), n.href]),
    [
      ['one ', url],
      ['two', 'https://new.example/'],
      [' three', url],
    ]
  );
  links(e).forEach(([n]) => assert.ok(n.children.every((child) => !Element.isElement(child))));
});

test('selections spanning paragraphs create one inline link per paragraph', () => {
  const e = editor([paragraph([{ text: 'first' }]), paragraph([{ text: 'second' }])]);
  Transforms.select(e, { anchor: { path: [0, 0], offset: 1 }, focus: { path: [1, 0], offset: 3 } });
  assert.equal(pasteLink(e, url), true);
  assert.deepEqual(
    links(e).map(([n]) => Node.string(n)),
    ['irst', 'sec']
  );
  assert.equal(e.children.length, 2);
});

test('linking code blocks or mention/emoji pills falls back to normal editing', () => {
  for (const children of [
    [{ type: 'code-block', children: [{ type: 'code-line', children: [{ text: 'code' }] }] }],
    [
      paragraph([
        { text: 'hello ' },
        { type: 'mention', id: '@me:example.org', name: 'Me', children: [{ text: '' }] },
        { text: 'world' },
      ]),
    ],
  ]) {
    const e = editor(children);
    Transforms.select(e, Editor.range(e, []));
    assert.equal(canSetLink(e), false);
    assert.equal(pasteLink(e, url), false);
  }
});

test('creating a link is a single undo step and can be redone', () => {
  const e = editor();
  select(e, 20, 20);
  e.insertText('!');
  select(e);
  const before = structuredClone(e.children);
  pasteLink(e, url);
  assert.equal(links(e).length, 1);
  e.undo();
  assert.deepEqual(e.children, before);
  e.redo();
  assert.equal(links(e).length, 1);
});

test('the link dialog can restore a selection after its input takes focus', () => {
  const e = editor();
  select(e);
  const saved = Editor.rangeRef(e, e.selection);
  Transforms.deselect(e);
  assert.ok(saved.current);
  Transforms.select(e, saved.unref());
  assert.equal(setLink(e, url, 'word'), true);
  assert.equal(Node.string(links(e)[0][0]), 'word');
});

test('changing the link label replaces only the saved selection', () => {
  const e = editor();
  select(e);
  setLink(e, url, 'documentation');
  assert.equal(Editor.string(e, []), 'Read this documentation please');
  assert.equal(Node.string(links(e)[0][0]), 'documentation');
});

test('URL validation agrees with Matrix HTML sanitizer and never accepts executable URLs', () => {
  for (const value of [
    'https://example.org/',
    'http://example.org/',
    'mailto:me@example.org',
    'ftp://example.org/file',
    'magnet:?xt=urn:btih:123',
  ])
    assert.equal(getLinkHref(value), value);
  for (const value of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,foo',
    'file:///etc/passwd',
    '//example.org',
    '/relative',
    'not a URL',
  ]) {
    assert.equal(getLinkHref(value), undefined, value);
    assert.equal(linkToHtml(value, 'label'), 'label');
  }
});

test('serialization keeps link text, marks, encoded URLs and escaped HTML attributes', () => {
  assert.equal(linkToPlainText(url, 'word'), `[word](${url})`);
  assert.equal(
    linkToHtml(url, '<strong>word</strong>'),
    '<a href="https://example.org/page?q=1&amp;b=2#section"><strong>word</strong></a>'
  );
  assert.equal(
    linkToHtml('https://example.org/a%20b?q=%22test%22', 'a &amp; b'),
    '<a href="https://example.org/a%20b?q=%22test%22">a &amp; b</a>'
  );
  assert.ok(
    !linkToHtml('https://example.org/?x=" onmouseover="bad', 'text').includes('onmouseover="')
  );
});
