import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { copyStaticAssets, serveStaticAssets, staticAssets } from '../scripts/static-assets.mjs';
import { commitMessage } from '../scripts/commit.mjs';
import {
  productionCsp,
  injectCsp,
  contentSecurityPolicyPlugin,
  inlineHashes,
} from '../security/csp.mjs';
const temporary = async (t) => {
  const path = await mkdtemp(resolve(tmpdir(), 'cinny-p1-tools-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
};
test('static resources copy exact files and directories without glob expansion', async (t) => {
  const root = await temporary(t);
  await mkdir(resolve(root, 'source/assets'), { recursive: true });
  await writeFile(resolve(root, 'source/index.html'), 'Call');
  await writeFile(resolve(root, 'source/assets/file.js'), 'module');
  await writeFile(resolve(root, 'worker.mjs'), 'worker');
  await copyStaticAssets(root, resolve(root, 'output'), [
    ['source', 'public/element-call'],
    ['worker.mjs', 'pdf.worker.min.js'],
  ]);
  assert.equal(
    await readFile(resolve(root, 'output/public/element-call/assets/file.js'), 'utf8'),
    'module'
  );
  assert.equal(await readFile(resolve(root, 'output/pdf.worker.min.js'), 'utf8'), 'worker');
  await Promise.all(staticAssets.map(([from]) => access(from)));
});
test('static asset middleware handles base paths, WASM MIME and traversal', async (t) => {
  const root = await temporary(t);
  await mkdir(resolve(root, 'source/assets'), { recursive: true });
  await writeFile(resolve(root, 'source/assets/file.wasm'), 'wasm');
  const serve = serveStaticAssets(root, '/cinny/', [['source', 'public/call']]);
  const request = async (url) => {
    const response = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    let next = false;
    await serve({ url }, response, (error) => {
      assert.ifError(error);
      next = true;
    });
    return { ...response, next };
  };
  const result = await request('/cinny/public/call/assets/file.wasm?v=1');
  assert.equal(result.body.toString(), 'wasm');
  assert.equal(result.headers['Content-Type'], 'application/wasm');
  assert.equal((await request('/cinny/public/call/%2e%2e%2fsecret')).statusCode, 403);
  assert.equal((await request('/cinny/public/call/%zz')).statusCode, 400);
  assert.equal((await request('/cinny/public/call/missing.js')).next, true);
  assert.equal((await request('/cinny/public/call/assets/file.wasm?import')).next, true);
});
test('CSP permits pinned bootstrap hashes and WASM without universal script or eval permissions', () => {
  const csp = productionCsp();
  const scripts = csp.split('; ').find((d) => d.startsWith('script-src'));
  for (const unsafe of [
    "'unsafe-inline'",
    "'unsafe-eval'",
    ' blob:',
    ' data:',
    ' https:;',
    ' http:',
  ])
    assert.equal(scripts.includes(unsafe), false, unsafe);
  assert.ok(scripts.includes("'wasm-unsafe-eval'"));
  assert.equal([...scripts.matchAll(/sha256-/g)].length, 2);
  const html = injectCsp('<html><head><script src="test.js"></script></head></html>');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
});
test('CSP hashes match HTML parser normalization for Windows CRLF and lone CR', () => {
  const source = '\n      window.bootstrapReady = true;\n    ';
  const expected = `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
  for (const lineEnding of ['\n', '\r\n', '\r']) {
    const html = `<script>${source.replaceAll('\n', lineEnding)}</script>`;
    assert.deepEqual(inlineHashes(html), [expected]);
  }
  assert.deepEqual(inlineHashes('<script src="main.js"></script><script> \r\n </script>'), []);
  assert.notDeepEqual(inlineHashes('<script>window.bootstrapReady=false;</script>'), [expected]);
});
test('CSP hook secures copied Call and exports consistent Netlify/nginx headers', async (t) => {
  const output = await temporary(t);
  await mkdir(resolve(output, 'public/element-call'), { recursive: true });
  await writeFile(resolve(output, 'public/element-call/index.html'), '<html><head></head></html>');
  const plugin = contentSecurityPolicyPlugin();
  plugin.configResolved({ root: output, build: { outDir: '.' } });
  plugin.writeBundle.handler();
  assert.ok(
    (await readFile(resolve(output, 'public/element-call/index.html'), 'utf8')).includes(
      'Content-Security-Policy'
    )
  );
  assert.ok(
    (await readFile(resolve(output, '_headers'), 'utf8')).includes(
      `${productionCsp()}; frame-ancestors 'self'`
    )
  );
  assert.ok(
    (await readFile(resolve(output, 'security-headers.conf'), 'utf8')).includes(productionCsp())
  );
  assert.equal(plugin.writeBundle.sequential, true);
  assert.equal(plugin.apply, 'build');
});
test('interactive commit helper produces conventional messages without invoking a shell', () => {
  assert.equal(
    commitMessage('fix', 'room', 'Сохранить черновики', 'Подробности'),
    'fix(room): Сохранить черновики\n\nПодробности\n'
  );
  assert.throws(() => commitMessage('unknown', '', 'message'));
  assert.throws(() => commitMessage('fix', 'room)\nmalformed', 'message'));
  assert.equal(
    commitMessage('docs', '', 'literal $(echo secret)'),
    'docs: literal $(echo secret)\n'
  );
});
test('updated Vite, React, vanilla-extract, PWA and router modules load and agree on peer ranges', async () => {
  const [{ vanillaExtractPlugin }, { default: react }, { VitePWA }, router] = await Promise.all([
    import('@vanilla-extract/vite-plugin'),
    import('@vitejs/plugin-react'),
    import('vite-plugin-pwa'),
    import('react-router-dom'),
  ]);
  assert.equal(typeof vanillaExtractPlugin, 'function');
  assert.equal(typeof react, 'function');
  assert.equal(typeof VitePWA, 'function');
  const room = '!room:matrix.example';
  const thread = '$thread:matrix.example';
  const routes = [{ path: '/client/room/:roomId', id: 'room' }];
  assert.equal(
    router.matchRoutes(
      routes,
      `/client/room/${encodeURIComponent(room)}?event=${encodeURIComponent(thread)}`
    )[0].params.roomId,
    room
  );
  const vite = JSON.parse(await readFile('node_modules/vite/package.json', 'utf8'));
  assert.equal(vite.version, '7.3.7');
  for (const name of ['@vanilla-extract/vite-plugin', '@vitejs/plugin-react', 'vite-plugin-pwa']) {
    const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    assert.ok(pkg.peerDependencies.vite.includes('7'));
  }
});
