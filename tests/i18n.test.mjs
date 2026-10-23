import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const ru = JSON.parse(readFileSync(new URL('../public/locales/ru.json', import.meta.url)));
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (/\.[jt]sx?$/.test(path)) files.push(path);
  }
}
collect(new URL('../src', import.meta.url).pathname);
const sources = files.map((path) =>
  ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
);

// Brand names, examples and date-format notation intentionally stay unchanged.
const technicalLabels = new Set([
  'Cinny',
  'Enter',
  'URL',
  'AM',
  'PM',
  'Twitter',
  'matrix-js-sdk',
  'The Matrix.org Foundation C.I.C',
  'Apache 2.0',
  'twemoji-colr',
  'Mozilla Foundation',
  'Twemoji',
  'Twitter, Inc and other contributors',
  'CC-BY 4.0',
  'Google',
  'YY',
  'YYYY',
  'MM',
  'MMM',
  'MMMM',
  'DD',
  'dd',
  'ddd',
  'dddd',
  'user123',
]);
const labelAttributes = new Set([
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'label',
  'description',
  'subTitle',
  'message',
  'caption',
]);

test('literal translation keys used by the app exist in the Russian dictionary', () => {
  const missing = [];
  for (const source of sources) {
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === 't' &&
        node.arguments.length &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text;
        if (!Object.hasOwn(ru, key)) missing.push(`${source.fileName}: ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
});

test('Russian translations preserve interpolation parameters', () => {
  const variables = (value) => [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)].map((m) => m[1]).sort();
  for (const [key, value] of Object.entries(ru)) {
    const expected = variables(key);
    const actual = variables(value);
    // i18next plural keys can introduce the implicit count parameter.
    if (/_(zero|one|two|few|many|other)$/.test(key) && !expected.includes('count')) {
      assert.deepEqual(
        actual.filter((name) => name !== 'count'),
        expected,
        key
      );
    } else assert.deepEqual(actual, expected, key);
  }
});

test('visible JSX labels use translations instead of English literals', () => {
  const untranslated = [];
  for (const source of sources) {
    function visit(node) {
      let text;
      if (ts.isJsxText(node)) text = node.text.replace(/\s+/g, ' ').trim();
      if (
        ts.isJsxAttribute(node) &&
        labelAttributes.has(node.name.text) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer)
      )
        text = node.initializer.text;
      if (
        text &&
        /[A-Za-z]{2}/.test(text) &&
        !/[А-Яа-яЁё]/.test(text) &&
        !technicalLabels.has(text) &&
        !/^(https?:\/\/|[@#])/.test(text)
      ) {
        untranslated.push(`${source.fileName}: ${text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(untranslated, []);
});
