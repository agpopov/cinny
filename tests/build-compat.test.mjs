// Separate from source-only tests: this regression invokes Vite and SWC.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';

test('production top-level-await transform compiles and preserves async exports', async () => {
  const output = await mkdtemp(join(tmpdir(), 'cinny-build-regression-'));
  try {
    const entry = join(output, 'entry.mjs');
    await writeFile(entry, 'export const value = await Promise.resolve(42);');
    await build({
      configFile: false,
      logLevel: 'error',
      plugins: [topLevelAwait()],
      build: {
        target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14.1'],
        outDir: output,
        emptyOutDir: false,
        lib: { entry, formats: ['es'], fileName: () => 'async.mjs' },
      },
    });
    const result = await import(pathToFileURL(join(output, 'async.mjs')).href);
    assert.ok(result.__tla instanceof Promise);
    await result.__tla;
    assert.equal(result.value, 42);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
