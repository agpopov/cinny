import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Execute the TypeScript source with Node's native type stripping, without a build.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { builtinStickerPacks, getBuiltinSticker, getBuiltinStickerAssetUrl } = await import(
  '../src/app/plugins/custom-emoji/builtinStickers.ts'
);
const { builtinStickerManifest } = await import(
  '../src/app/plugins/custom-emoji/builtinStickerManifest.ts'
);
const { resolveSticker } = await import('../src/app/plugins/custom-emoji/resolveSticker.ts');
const { ImageUsage } = await import('../src/app/plugins/custom-emoji/types.ts');
const { PackImageReader } = await import('../src/app/plugins/custom-emoji/PackImageReader.ts');
const sourcePath = (sticker) =>
  new URL(
    `../public/res/stickers/${sticker.asset.slice('public/stickers/'.length)}`,
    import.meta.url
  );
const images = builtinStickerPacks.flatMap((pack) => pack.getImages(ImageUsage.Sticker));
const first = images[0];
const firstAsset = getBuiltinSticker(first.url);
const firstBytes = readFileSync(sourcePath(firstAsset));
const assetResponse = () => new Response(firstBytes, { headers: { 'Content-Type': 'image/png' } });

// Every bundled file is checked, including metadata used in the Matrix event.
for (const pack of builtinStickerPacks) {
  test(`default pack ${pack.meta.name} has visible stickers, a working icon and unique shortcodes`, () => {
    const stickers = pack.getImages(ImageUsage.Sticker);
    assert.ok(stickers.length >= 12);
    assert.equal(pack.deleted, false);
    assert.equal(pack.getImages(ImageUsage.Emoticon).length, 0);
    assert.equal(new Set(stickers.map((image) => image.shortcode)).size, stickers.length);
    assert.ok(getBuiltinStickerAssetUrl(pack.getAvatarUrl(ImageUsage.Sticker), '/'));
    for (const image of stickers) {
      assert.ok(image.body);
      assert.deepEqual(image.info, getBuiltinSticker(image.url).info);
    }
  });
}
test('48 bundled stickers are available without user, room or account data', () => {
  assert.equal(builtinStickerPacks.length, 3);
  assert.equal(images.length, 48);
  assert.equal(new Set(images.map((image) => image.url)).size, 48);
  assert.equal(new Set(builtinStickerPacks.map((pack) => pack.id)).size, 3);
  assert.equal(
    builtinStickerManifest.reduce((total, pack) => total + pack.stickers.length, 0),
    48
  );
});
test('asset URLs respect installations at the root and under a subpath', () => {
  assert.equal(getBuiltinStickerAssetUrl(first.url, '/'), `/${firstAsset.asset}`);
  assert.equal(getBuiltinStickerAssetUrl(first.url, '/chat/'), `/chat/${firstAsset.asset}`);
  assert.equal(getBuiltinStickerAssetUrl(first.url, '/chat'), `/chat/${firstAsset.asset}`);
  assert.equal(getBuiltinStickerAssetUrl('builtin-sticker:unknown/nope', '/'), undefined);
});
test('each PNG matches its dimensions, size and pinned upstream SHA-256', () => {
  const sources = JSON.parse(
    readFileSync(new URL('../public/res/stickers/SOURCES.json', import.meta.url), 'utf8')
  );
  assert.match(sources.revision, /^[a-f0-9]{40}$/);
  assert.equal(sources.license, 'MIT');
  assert.match(
    readFileSync(new URL('../public/res/stickers/LICENSE.txt', import.meta.url), 'utf8'),
    /Copyright \(c\) Microsoft Corporation/
  );
  for (const pack of builtinStickerManifest) {
    for (const sticker of pack.stickers) {
      const bytes = readFileSync(sourcePath(sticker));
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.length, sticker.info.size);
      assert.equal(bytes.readUInt32BE(16), sticker.info.w);
      assert.equal(bytes.readUInt32BE(20), sticker.info.h);
      const source = sources.files.find((file) =>
        file.asset.endsWith(`/${pack.id}/${sticker.id}.png`)
      );
      assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    }
  }
});
test('room and account packs cannot inject local sticker keys or HTTP URLs', () => {
  for (const url of [
    first.url,
    firstAsset.asset,
    'https://evil.example/sticker.png',
    'javascript:alert(1)',
  ]) {
    assert.equal(PackImageReader.fromPackImage('injected', { url }), undefined);
  }
  assert.ok(PackImageReader.fromPackImage('custom', { url: 'mxc://server/custom' }));
});
test('existing MXC stickers send without downloading or uploading anything', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('MXC stickers do not need fetching');
  });
  const mx = {
    uploadContent: async () => {
      assert.fail('MXC stickers do not need uploading');
    },
  };
  assert.equal(await resolveSticker(mx, 'mxc://server/sticker', '/'), 'mxc://server/sticker');
});
test('selecting a bundled sticker uploads its actual PNG and returns a portable MXC URL', async (t) => {
  const fetched = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    fetched.push(args);
    return assetResponse();
  });
  const mx = {
    uploadContent: async (file, options) => {
      assert.equal(file.name, `${firstAsset.id}.png`);
      assert.equal(file.type, 'image/png');
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), firstBytes);
      assert.equal(options.includeFilename, false);
      return { content_uri: 'mxc://server/uploaded-sticker' };
    },
  };
  assert.equal(await resolveSticker(mx, first.url, '/chat/'), 'mxc://server/uploaded-sticker');
  assert.equal(fetched[0][0], `/chat/${firstAsset.asset}`);
  assert.equal(fetched[0][1].credentials, 'omit');
});
test('repeated and simultaneous selections share one upload per client', async (t) => {
  let fetches = 0;
  let uploadCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetches += 1;
    return assetResponse();
  });
  const mx = {
    uploadContent: async () => {
      uploadCount += 1;
      return { content_uri: 'mxc://server/shared' };
    },
  };
  assert.deepEqual(
    await Promise.all([resolveSticker(mx, first.url, '/'), resolveSticker(mx, first.url, '/')]),
    ['mxc://server/shared', 'mxc://server/shared']
  );
  assert.equal(await resolveSticker(mx, first.url, '/'), 'mxc://server/shared');
  assert.equal(fetches, 1);
  assert.equal(uploadCount, 1);
  const secondClient = {
    uploadContent: async () => ({ content_uri: 'mxc://other-server/sticker' }),
  };
  assert.equal(await resolveSticker(secondClient, first.url, '/'), 'mxc://other-server/sticker');
  assert.equal(fetches, 2);
});
test('download failure can be retried without poisoning the upload cache', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return requests === 1 ? new Response('unavailable', { status: 503 }) : assetResponse();
  });
  const mx = { uploadContent: async () => ({ content_uri: 'mxc://server/retried' }) };
  await assert.rejects(resolveSticker(mx, first.url, '/'), /Не удалось загрузить/);
  assert.equal(await resolveSticker(mx, first.url, '/'), 'mxc://server/retried');
});
test('failed uploads can be retried', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assetResponse());
  let attempts = 0;
  const mx = {
    uploadContent: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return { content_uri: 'mxc://server/retried' };
    },
  };
  await assert.rejects(resolveSticker(mx, first.url, '/'), /offline/);
  assert.equal(await resolveSticker(mx, first.url, '/'), 'mxc://server/retried');
});
test('unknown keys and arbitrary URLs never trigger a fetch or an upload', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('untrusted input must not be fetched');
  });
  const mx = {
    uploadContent: async () => {
      assert.fail('untrusted input must not be uploaded');
    },
  };
  for (const key of [
    'builtin-sticker:cats/../../secret',
    'builtin-sticker:cats/unknown',
    'https://evil.example/sticker.png',
    'file:///secret',
    'javascript:bad',
  ]) {
    await assert.rejects(resolveSticker(mx, key, '/'), /Неизвестный стикер/);
  }
});
test('a missing asset served as an HTML page is rejected before upload', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>SPA fallback</html>'));
  const mx = {
    uploadContent: async () => {
      assert.fail('HTML is not a sticker');
    },
  };
  await assert.rejects(resolveSticker(mx, first.url, '/'), /Повреждён файл/);
});
test('a valid-size file with the wrong PNG signature is rejected before upload', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(firstBytes.length)));
  const mx = {
    uploadContent: async () => {
      assert.fail('invalid file must not be uploaded');
    },
  };
  await assert.rejects(resolveSticker(mx, first.url, '/'), /Повреждён файл/);
});
test('invalid server upload responses never become event URLs and can be retried', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => assetResponse());
  let attempts = 0;
  const mx = {
    uploadContent: async () => {
      attempts += 1;
      return { content_uri: attempts === 1 ? '/local/sticker.png' : 'mxc://server/fixed' };
    },
  };
  await assert.rejects(resolveSticker(mx, first.url, '/'), /Сервер не вернул/);
  assert.equal(await resolveSticker(mx, first.url, '/'), 'mxc://server/fixed');
});
