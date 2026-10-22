import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const mockDocument = (t, document) => {
  const original = globalThis.document;
  globalThis.document = document;
  t.after(() => {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  });
};

// Run the source directly using Node's native type stripping. No bundler,
// TypeScript compiler, generated JS, or application build is involved.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const mime = await import('../src/app/utils/mimeTypes.ts');
const { getDirectMedia, getGifProviderEmbed, getProviderMedia, getPreviewMedia, getHttpUrl } =
  await import('../src/app/utils/urlPreview.ts');
const { ImagePack } = await import('../src/app/plugins/custom-emoji/ImagePack.ts');
const { PackImageReader } = await import('../src/app/plugins/custom-emoji/PackImageReader.ts');
const { ImageUsage } = await import('../src/app/plugins/custom-emoji/types.ts');
const { authenticatedMediaRequest, isHomeserverMediaUrl, isAuthenticatedMediaUrl } = await import(
  '../src/util/mediaRequest.ts'
);
const { loadImageElement, loadVideoElement, getThumbnailDimensions } = await import(
  '../src/app/utils/dom.ts'
);

for (const [filename, type] of [
  ['meme.GIF', 'image/gif'],
  ['meme.webp', 'image/webp'],
  ['clip.webm', 'video/webm'],
  ['clip.MP4', 'video/mp4'],
  ['clip.mov', 'video/quicktime'],
  ['clip.m4v', 'video/mp4'],
  ['image.apng', 'image/apng'],
  ['image.avif', 'image/avif'],
  ['video.ogv', 'video/ogg'],
]) {
  test(`file type inferred for ${filename} when the picker omits it`, () => {
    for (const missing of ['', 'application/octet-stream']) {
      assert.equal(mime.getMediaMimeType(filename, missing), type);
    }
    const file = mime.safeFile(new File(['media'], filename, { lastModified: 1234 }));
    assert.equal(file.type, mime.getBlobSafeMimeType(type));
    assert.equal(file.lastModified, 1234);
    assert.equal(file.size, 5);
    assert.equal(file.name, filename);
  });
}
test('explicit MIME types win over misleading file extensions', () => {
  assert.equal(mime.getMediaMimeType('meme.gif', 'text/html'), 'text/html');
  assert.equal(
    mime.safeFile(new File(['html'], 'meme.gif', { type: 'text/html' })).type,
    'text/html'
  );
  assert.equal(mime.getBlobSafeMimeType(' VIDEO/WEBM ; codecs=vp9'), 'video/webm');
  assert.equal(mime.getBlobSafeMimeType('image/svg+xml'), mime.FALLBACK_MIMETYPE);
});
test('unknown and prototype names never become MIME types', () => {
  for (const filename of ['README', 'a.exe', 'a.constructor', 'a.toString', 'a.__proto__']) {
    assert.equal(mime.getMediaMimeType(filename), mime.FALLBACK_MIMETYPE);
  }
});
for (const [url, kind] of [
  ['https://media.tenor.com/id/meme.gif', 'image'],
  ['https://media.giphy.com/media/id/giphy.gif', 'image'],
  ['https://cdn.example/meme.WEBP?token=abc#view', 'image'],
  ['https://cdn.example/clip.mp4?download=1', 'video'],
  ['https://cdn.example/clip.webm', 'video'],
]) {
  test(`direct ${kind} link: ${url}`, () => {
    assert.deepEqual(getDirectMedia(url), { url, kind });
  });
}
test('unsafe URLs and non-media pages are never embedded as media', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:image/gif;base64,AA==',
    'file:///meme.gif',
    '//host/meme.gif',
    'https://user:pass@host/meme.gif',
    'invalid',
  ]) {
    assert.equal(getHttpUrl(url), undefined);
    assert.equal(getDirectMedia(url), undefined);
  }
  assert.equal(getDirectMedia('https://tenor.com/view/funny-123'), undefined);
  assert.equal(getDirectMedia('https://host/player.html', 'text/html'), undefined);
  assert.equal(getDirectMedia('https://host/clip.mp4', 'text/html'), undefined);
});
test('Open Graph media supports extensionless typed video, never HTML players', () => {
  assert.deepEqual(
    getPreviewMedia({ 'og:video': 'https://host/content?id=5', 'og:video:type': 'video/mp4' }),
    { url: 'https://host/content?id=5', kind: 'video' }
  );
  assert.equal(
    getPreviewMedia({ 'og:video': 'https://host/player', 'og:video:type': 'text/html' }),
    undefined
  );
  assert.equal(
    getPreviewMedia({ 'og:video': 'javascript:bad', 'og:video:type': 'video/mp4' }),
    undefined
  );
  assert.equal(getPreviewMedia({ 'og:video': 'https://host/image.gif' }), undefined);
  assert.equal(getPreviewMedia({}), undefined);
});

test('GIFS.RU share URL resolves to its animation without Matrix preview metadata', () => {
  // Actual share URL reported by a user. The ID is case-sensitive (O, not zero).
  for (const url of [
    'https://gifs.ru/gifs/rabota-rabotayu-pechatayu-4Oib7Z?utm_source=share&utm_medium=copy_link',
    'https://www.gifs.ru/gifs/rabota-rabotayu-pechatayu-4Oib7Z/',
    'https://gifs.ru/gifs/4Oib7Z',
    'https://gifs.ru/embed/4Oib7Z#view',
  ]) {
    assert.equal(getGifProviderEmbed(url), 'https://gifs.ru/embed/4Oib7Z');
  }
});
test('provider embeds preserve GIF ID case and remove tracking parameters', () => {
  assert.equal(
    getGifProviderEmbed('http://gifs.ru/gifs/cat-ABCdef?url=https://evil.example'),
    'https://gifs.ru/embed/ABCdef'
  );
});
test('provider embeds reject other sites, credentials, ports and unexpected paths', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://gifs.ru.evil.example/gifs/cat-4Oib7Z',
    'https://evil.example/gifs/cat-4Oib7Z',
    'https://gifs.ru@evil.example/gifs/cat-4Oib7Z',
    'https://evil.example@gifs.ru/gifs/cat-4Oib7Z',
    'https://gifs.ru:8443/gifs/cat-4Oib7Z',
    'https://gifs.ru/search/cat-4Oib7Z',
    'https://gifs.ru/gifs/cat-4Oib7Z/extra',
    'https://gifs.ru/gifs/cat-%344Oib7Z',
    'https://gifs.ru/gifs/cat-4Oib7ZZ',
    'https://gifs.ru/gifs/cat-4Oib7',
    'https://gifs.ru/',
    null,
  ]) {
    assert.equal(getGifProviderEmbed(url), undefined, String(url));
  }
});

for (const [urls, media] of [
  [
    [
      'https://giphy.com/gifs/3oriO0OEd9QIDdllqo',
      'https://www.giphy.com/gifs/cat-typing-3oriO0OEd9QIDdllqo?utm_source=share',
      'https://giphy.com/stickers/cat-3oriO0OEd9QIDdllqo',
      'https://giphy.com/embed/3oriO0OEd9QIDdllqo',
    ],
    { url: 'https://i.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif', kind: 'image' },
  ],
  [
    [
      'https://tenor.com/view/cat-typing-gif-18240062',
      'https://www.tenor.com/view/18240062',
      'https://tenor.com/embed/18240062',
      'https://tenor.com/boHeI.gif',
      'https://tenor.com/view/cat-typing-gif-18240062.gif?utm_source=share',
    ],
    { url: 'https://tenor.com/view/18240062.gif', kind: 'image' },
  ],
  [
    ['https://i.imgur.com/llGqCrR.gifv', 'https://imgur.com/llGqCrR.gifv?utm_source=share'],
    { url: 'https://i.imgur.com/llGqCrR.mp4', kind: 'video', loop: true },
  ],
  [
    ['https://imgur.com/llGqCrR', 'https://www.imgur.com/llGqCrR/?utm_source=share'],
    { url: 'https://i.imgur.com/llGqCrR.gif', kind: 'image' },
  ],
]) {
  for (const url of urls) {
    test(`provider GIF share resolves locally: ${url}`, () => {
      assert.deepEqual(getProviderMedia(url), media);
    });
  }
}
test('Tenor IDs keep full precision beyond JavaScript safe integers', () => {
  assert.equal(
    getProviderMedia('https://tenor.com/view/cat-gif-12345678901234567890')?.url,
    'https://tenor.com/view/12345678901234567890.gif'
  );
});
test('provider media rejects spoofed hosts, HTML pages, collections and arbitrary players', () => {
  for (const url of [
    'https://tenor.com.evil.example/view/cat-18240062',
    'https://user:pass@tenor.com/view/cat-18240062',
    'https://tenor.com:8443/view/cat-18240062',
    'https://tenor.com/search/cat-gifs',
    'https://tenor.com/search',
    'https://tenor.com/about',
    'https://tenor.com/view/cat-18240062/extra',
    'https://giphy.com/explore/cat-typing',
    'https://giphy.com/gifs/cat-123<script>',
    'https://giphy.com/gifs/cat-123456/extra',
    'https://imgur.com/a/llGqCrR',
    'https://imgur.com/gallery/llGqCrR',
    'https://imgur.com/about',
    'https://imgur.com/privacy',
    'https://evil.example/llGqCrR.gifv',
    'javascript:alert(1)',
    undefined,
  ])
    assert.equal(getProviderMedia(url), undefined, String(url));
});

const stickerUrl = 'mxc://example.org/sticker';
const pack = (content) => new ImagePack('pack', content, undefined);
test('packs without usage supply both emojis and stickers', () => {
  const p = pack({ images: { meme: { url: stickerUrl } } });
  assert.equal(p.getImages(ImageUsage.Sticker).length, 1);
  assert.equal(p.getImages(ImageUsage.Emoticon).length, 1);
  assert.equal(p.getAvatarUrl(ImageUsage.Sticker), stickerUrl);
});
test('image usage overrides the pack default; empty/unknown usage inherits', () => {
  const p = pack({
    pack: { usage: ['emoticon'] },
    images: {
      emoji: { url: stickerUrl },
      sticker: { url: stickerUrl, usage: ['sticker'] },
      both: { url: stickerUrl, usage: ['sticker', 'emoticon'] },
      empty: { url: stickerUrl, usage: [] },
      unknown: { url: stickerUrl, usage: ['future'] },
    },
  });
  assert.deepEqual(
    p.getImages(ImageUsage.Sticker).map((i) => i.shortcode),
    ['sticker', 'both']
  );
  assert.deepEqual(
    p.getImages(ImageUsage.Emoticon).map((i) => i.shortcode),
    ['emoji', 'both', 'empty', 'unknown']
  );
});
test('malformed entries cannot hide the valid stickers in a pack', () => {
  const p = pack({
    images: {
      missing: null,
      string: 'bad',
      number: 5,
      unsafe: { url: 'javascript:bad' },
      empty: { url: '' },
      valid: { url: stickerUrl, info: { w: 100, h: 150, mimetype: 'image/gif' } },
    },
  });
  assert.equal(p.getImages(ImageUsage.Sticker).length, 1);
  assert.deepEqual(p.getImages(ImageUsage.Sticker)[0].info, {
    w: 100,
    h: 150,
    mimetype: 'image/gif',
  });
  assert.equal(
    PackImageReader.fromPackImage('bad-info', { url: stickerUrl, info: [] }).info,
    undefined
  );
});
test('new pack snapshots reflect added/removed stickers despite memoization', () => {
  const old = pack({ images: { first: { url: stickerUrl } } });
  assert.equal(old.getImages(ImageUsage.Sticker).length, 1);
  const updated = pack({ images: { first: { url: stickerUrl }, next: { url: `${stickerUrl}2` } } });
  assert.equal(updated.getImages(ImageUsage.Sticker).length, 2);
  assert.equal(pack({}).deleted, true);
  assert.equal(pack({}).getImages(ImageUsage.Sticker).length, 0);
});

test('media authentication preserves video ranges and request properties', () => {
  const original = new Request(
    'https://matrix.example/_matrix/client/v1/media/download/server/id',
    {
      headers: { Range: 'bytes=4096-', 'If-Range': 'etag' },
      mode: 'no-cors',
      credentials: 'include',
      cache: 'no-cache',
    }
  );
  const authenticated = authenticatedMediaRequest(original, 'test-token');
  assert.equal(authenticated.mode, 'cors');
  assert.equal(authenticated.headers.get('Authorization'), 'Bearer test-token');
  assert.equal(authenticated.headers.get('Range'), 'bytes=4096-');
  assert.equal(authenticated.headers.get('If-Range'), 'etag');
  assert.equal(authenticated.credentials, 'omit');
  assert.equal(authenticated.cache, 'no-cache');
  assert.equal(original.headers.get('Authorization'), null);
});
test('tokens are only attached to exact homeserver media endpoints', () => {
  for (const path of ['download/server/id', 'thumbnail/server/id?width=128']) {
    assert.equal(
      isHomeserverMediaUrl(
        `https://matrix.example/_matrix/client/v1/media/${path}`,
        'https://matrix.example'
      ),
      true
    );
  }
  for (const url of [
    'https://evil.example/_matrix/client/v1/media/download/server/id',
    'https://matrix.example.evil/_matrix/client/v1/media/download/server/id',
    'https://matrix.example/_matrix/client/v1/media/download-evil',
    'https://matrix.example/other',
    'bad',
  ]) {
    assert.equal(isHomeserverMediaUrl(url, 'https://matrix.example'), false);
  }
  assert.equal(isAuthenticatedMediaUrl('https://host/_matrix/media/v3/download/server/id'), false);
});

test('preview loading decodes a video frame without calling play()', async (t) => {
  const video = {
    load() {
      queueMicrotask(() => this.onloadeddata?.());
    },
    play() {
      assert.fail('preview must not depend on autoplay');
    },
  };
  t.mock.method(globalThis, 'setTimeout', () => 1);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  mockDocument(t, { createElement: () => video });
  assert.equal(await loadVideoElement('blob:test'), video);
  assert.equal(video.preload, 'auto');
  assert.equal(video.playsInline, true);
  assert.equal(video.muted, true);
  assert.equal(video.onloadeddata, null);
  assert.equal(video.onerror, null);
});
test('video/image errors reject and release their event handlers', async (t) => {
  const elements = [];
  mockDocument(t, {
    createElement: (tag) => {
      const el = {
        load() {
          queueMicrotask(() => this.onerror?.());
        },
        set src(value) {
          this.url = value;
          if (tag === 'img') queueMicrotask(() => this.onerror?.());
        },
      };
      elements.push(el);
      return el;
    },
  });
  await assert.rejects(loadVideoElement('blob:broken'), /Unable to load video/);
  await assert.rejects(loadImageElement('blob:broken'), /Unable to load image/);
  for (const el of elements) assert.equal(el.onerror, null);
});
test('video and image preview timeouts reject instead of blocking sending forever', async (t) => {
  const timeouts = [];
  const removed = [];
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    timeouts.push(callback);
    return timeouts.length;
  });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  mockDocument(t, {
    createElement: () => ({
      load() {},
      removeAttribute(name) {
        removed.push(name);
      },
    }),
  });
  const video = loadVideoElement('blob:hanging-video');
  const image = loadImageElement('blob:hanging-image');
  timeouts.forEach((callback) => callback());
  await assert.rejects(video, /timed out/);
  await assert.rejects(image, /timed out/);
  assert.deepEqual(removed, ['src', 'src']);
});
test('video thumbnails fit both portrait and landscape within their bounds', () => {
  assert.deepEqual(getThumbnailDimensions(1920, 1080), [400, 225]);
  assert.deepEqual(getThumbnailDimensions(1080, 1920), [168, 300]);
});

// Test message construction with a media-service double; the DOM decoding,
// thumbnail generation, failure handling and URL lifetime use production code.
registerHooks({
  load(url, context, nextLoad) {
    if (url === new URL('../src/app/utils/matrix.ts', import.meta.url).href) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
        export const getImageInfo = (...args) => globalThis.mediaFixture.imageInfo(...args);
        export const getVideoInfo = (...args) => globalThis.mediaFixture.videoInfo(...args);
        export const encryptFile = (...args) => globalThis.mediaFixture.encrypt(...args);
        export const getThumbnailContent = (...args) => globalThis.mediaFixture.thumbnailContent(...args);
      `,
      };
    }
    return nextLoad(url, context);
  },
});
const { getImageMsgContent, getVideoMsgContent } = await import(
  '../src/app/features/room/msgContent.ts'
);

const messageFixture = (t, decode = true) => {
  const original = new File(['media'], 'meme.gif', { type: 'image/gif' });
  const item = { originalFile: original, file: original, metadata: { markedAsSpoiler: true } };
  const video = {
    videoWidth: 800,
    videoHeight: 600,
    load() {
      queueMicrotask(() => (decode ? this.onloadeddata : this.onerror)?.());
    },
    removeAttribute() {},
  };
  const image = {
    width: 800,
    height: 600,
    set src(value) {
      queueMicrotask(() => (decode ? this.onload : this.onerror)?.());
    },
    removeAttribute() {},
  };
  const thumbnail = new Blob(['thumbnail'], { type: 'image/jpeg' });
  const uploaded = [];
  const revoked = [];
  const metadataFiles = [];
  const thumbnailArgs = [];
  const encryptedInfo = { v: 'v2', key: {}, iv: 'iv', hashes: {} };
  globalThis.mediaFixture = {
    imageInfo: (element, file) => {
      metadataFiles.push(file);
      return { w: 800, h: 600, mimetype: file.type, size: file.size };
    },
    videoInfo: (element, file) => {
      metadataFiles.push(file);
      return { w: 800, h: 600, mimetype: file.type, size: file.size, duration: 3000 };
    },
    encrypt: async (file) => ({
      file: new File(['encrypted thumbnail bytes'], 'encrypted', {
        type: 'application/octet-stream',
      }),
      encInfo: encryptedInfo,
    }),
    thumbnailContent: (args) => {
      thumbnailArgs.push(args);
      return {
        thumbnail_info: { mimetype: args.thumbnail.type },
        ...(args.encInfo
          ? { thumbnail_file: { ...args.encInfo, url: args.mxc } }
          : { thumbnail_url: args.mxc }),
      };
    },
  };
  t.after(() => {
    delete globalThis.mediaFixture;
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(URL, 'createObjectURL', () => 'blob:test-media');
  t.mock.method(URL, 'revokeObjectURL', (url) => {
    revoked.push(url);
  });
  mockDocument(t, {
    createElement(tag) {
      if (tag === 'img') return image;
      if (tag === 'video') return video;
      // Drawing a thumbnail succeeds; blurhash is deliberately unsupported.
      return {
        getContext: () => ({ drawImage() {} }),
        toBlob(callback) {
          callback(thumbnail);
        },
      };
    },
  });
  const mx = {
    uploadContent: async (file) => {
      uploaded.push(file);
      return { content_uri: 'mxc://host/thumbnail' };
    },
  };
  return { item, mx, revoked, metadataFiles, thumbnail, thumbnailArgs, uploaded, encryptedInfo };
};

test('GIF messages keep MIME, size and spoiler when decoding fails', async (t) => {
  const f = messageFixture(t, false);
  const content = await getImageMsgContent(f.mx, f.item, 'mxc://host/gif');
  assert.equal(content.msgtype, 'm.image');
  assert.deepEqual(content.info, { mimetype: 'image/gif', size: 5 });
  assert.equal(content.url, 'mxc://host/gif');
  assert.equal(content['page.codeberg.everypizza.msc4193.spoiler'], true);
  assert.deepEqual(f.revoked, ['blob:test-media']);
});
test('encrypted videos retain original metadata if the codec is unsupported', async (t) => {
  const f = messageFixture(t, false);
  f.item.originalFile = new File(['video'], 'clip.webm', { type: 'video/webm' });
  f.item.file = new File(['encrypted-video'], 'encrypted', { type: 'application/octet-stream' });
  f.item.encInfo = f.encryptedInfo;
  const content = await getVideoMsgContent(f.mx, f.item, 'mxc://host/video');
  assert.equal(content.msgtype, 'm.video');
  assert.equal(content.filename, 'clip.webm');
  assert.deepEqual(content.info, { mimetype: 'video/webm', size: 5 });
  assert.equal(content.file.url, 'mxc://host/video');
  assert.equal(content.url, undefined);
  assert.deepEqual(f.revoked, ['blob:test-media']);
});
test('blurhash failure never prevents an image message; metadata uses plaintext file', async (t) => {
  const f = messageFixture(t);
  f.item.file = new File(['encrypted image'], 'encrypted', { type: 'application/octet-stream' });
  f.item.encInfo = f.encryptedInfo;
  const content = await getImageMsgContent(f.mx, f.item, 'mxc://host/image');
  assert.equal(content.info.mimetype, 'image/gif');
  assert.equal(content.info.w, 800);
  assert.equal(f.metadataFiles[0], f.item.originalFile);
  assert.equal(content.file.url, 'mxc://host/image');
  assert.deepEqual(f.revoked, ['blob:test-media']);
});
test('thumbnail upload failure never prevents a video message', async (t) => {
  const f = messageFixture(t);
  f.item.originalFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
  f.mx.uploadContent = async () => {
    throw new Error('upload unavailable');
  };
  const content = await getVideoMsgContent(f.mx, f.item, 'mxc://host/video');
  assert.equal(content.info.mimetype, 'video/mp4');
  assert.equal(content.info.duration, 3000);
  assert.equal(content.url, 'mxc://host/video');
  assert.deepEqual(f.revoked, ['blob:test-media']);
});
test('encrypted thumbnail metadata uses the original image, never ciphertext MIME', async (t) => {
  const f = messageFixture(t);
  f.item.originalFile = new File(['video'], 'clip.webm', { type: 'video/webm' });
  f.item.encInfo = f.encryptedInfo;
  const content = await getVideoMsgContent(f.mx, f.item, 'mxc://host/video');
  assert.equal(f.uploaded[0].type, 'application/octet-stream');
  assert.equal(f.thumbnailArgs[0].thumbnail, f.thumbnail);
  assert.equal(content.info.thumbnail_info.mimetype, 'image/jpeg');
  assert.equal(content.info.thumbnail_file.url, 'mxc://host/thumbnail');
  assert.equal(content.info.thumbnail_url, undefined);
  assert.equal(f.metadataFiles[0], f.item.originalFile);
  assert.deepEqual(f.revoked, ['blob:test-media']);
});

test('invalid preferred Open Graph URLs do not mask a valid fallback video', () => {
  assert.deepEqual(
    getPreviewMedia({ 'og:video:secure_url': '', 'og:video:url': 'https://host/video.webm' }),
    { url: 'https://host/video.webm', kind: 'video' }
  );
});

const { sendAttachments } = await import('../src/app/utils/sendAttachments.ts');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
test('parallel preview completion preserves message selection order', async () => {
  const first = deferred();
  const second = deferred();
  const sent = [];
  const removed = [];
  const sending = sendAttachments([1, 2], {
    prepare: (item) => (item === 1 ? first.promise : second.promise),
    send: async (content) => {
      sent.push(content);
    },
    isPending: () => true,
    onSent: (item) => {
      removed.push(item);
    },
  });
  second.resolve('second');
  await Promise.resolve();
  assert.deepEqual(sent, []);
  first.resolve('first');
  assert.deepEqual(await sending, []);
  assert.deepEqual(sent, ['first', 'second']);
  assert.deepEqual(removed, [1, 2]);
});
test('failed sends and failed preparation retain attachments for retry', async () => {
  const pending = new Set([1, 2, 3]);
  const sent = [];
  const failures = await sendAttachments([1, 2, 3], {
    prepare: async (item) => {
      if (item === 1) throw new Error('decode');
      return item;
    },
    send: async (item) => {
      if (item === 2) throw new Error('offline');
      sent.push(item);
    },
    isPending: (item) => pending.has(item),
    onSent: (item) => {
      pending.delete(item);
    },
  });
  assert.deepEqual(
    failures.map((error) => error.message),
    ['decode', 'offline']
  );
  assert.deepEqual(sent, [3]);
  assert.deepEqual([...pending], [1, 2]);
});
test('canceling an attachment while its preview loads prevents sending', async () => {
  const preparing = deferred();
  const pending = new Set([1]);
  const sending = sendAttachments([1], {
    prepare: () => preparing.promise,
    send: async () => {
      assert.fail('canceled file must not be sent');
    },
    isPending: (item) => pending.has(item),
    onSent: () => {
      assert.fail('canceled file must not be removed again');
    },
  });
  pending.delete(1);
  preparing.resolve('content');
  assert.deepEqual(await sending, []);
});
test('attachment removal waits for the server to accept the message', async () => {
  const accepted = deferred();
  const removed = [];
  const sending = sendAttachments([1], {
    prepare: async () => 'content',
    send: () => accepted.promise,
    isPending: () => true,
    onSent: (item) => {
      removed.push(item);
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(removed, []);
  accepted.resolve({ event_id: '$accepted' });
  assert.deepEqual(await sending, []);
  assert.deepEqual(removed, [1]);
});
