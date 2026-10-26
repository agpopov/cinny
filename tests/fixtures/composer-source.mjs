import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parse } from '@typescript-eslint/parser';

export function sourceCallback(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = parse(source, { range: true, ecmaFeatures: { jsx: true } });
  let found;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === name) {
      const argument = node.init.arguments[0];
      found = source.slice(...argument.range);
    }
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    });
  }
  visit(ast);
  assert.ok(found, name);
  // Native type stripping only. JSX is parsed for locations, never transformed.
  return stripTypeScriptTypes(`(${found})`);
}

export function sourceModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = parse(source, { range: true, ecmaFeatures: { jsx: true } });
  let body = '';
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') continue;
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (declaration) body += `${source.slice(...declaration.range)}\n`;
  }
  return stripTypeScriptTypes(body);
}
