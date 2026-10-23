import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Run TypeScript sources with native type stripping, without a compiler/build.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { downloadMedia, needsMediaBlob } = await import('../src/app/utils/media.ts');
const { handleMobileLinkClick, installMobileLinks } = await import(
  '../src/app/utils/mobileLinks.ts'
);
const mediaUrl = 'https://matrix.example/_matrix/client/v1/media/download/server/image';

const mockGlobal = (t, name, value) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
};

function browser(t, { native = true, controller = null, session = true } = {}) {
  const storage = new Map(
    session
      ? Object.entries({
          cinny_hs_base_url: 'https://matrix.example',
          cinny_user_id: '@me:matrix.example',
          cinny_device_id: 'DEVICE',
          cinny_access_token: 'private-token',
        })
      : []
  );
  const calls = [];
  mockGlobal(t, 'isTauri', native);
  mockGlobal(t, 'navigator', { userAgent: 'Android', serviceWorker: { controller } });
  mockGlobal(t, 'localStorage', { getItem: (key) => storage.get(key) ?? null });
  mockGlobal(t, 'window', {
    location: { origin: 'https://tauri.localhost' },
    __TAURI_INTERNALS__: {
      invoke: async (command, args) => calls.push({ command, args }),
    },
  });
  return { calls, storage };
}

test('native Android loads protected media without a service worker', (t) => {
  browser(t);
  assert.equal(needsMediaBlob(mediaUrl), true);
  // An exposed controller is insufficient on the bundled WebView origin.
  navigator.serviceWorker.controller = {};
  assert.equal(needsMediaBlob(mediaUrl), true);
});

test('ordinary browsers retain the upstream service worker path', (t) => {
  browser(t, { native: false });
  assert.equal(needsMediaBlob(mediaUrl), false);
  navigator.serviceWorker.controller = {};
  assert.equal(needsMediaBlob(mediaUrl), false);
});

test('legacy endpoints, local stickers and external GIFs retain their original loading', (t) => {
  browser(t);
  for (const src of [
    'https://matrix.example/_matrix/media/v3/download/server/image',
    'https://media.tenor.com/example.gif',
    '/public/res/stickers/example.webp',
    'blob:https://tauri.localhost/image',
  ]) {
    assert.equal(needsMediaBlob(src), false, src);
  }
});

test('protected media requests carry Bearer auth without cookies or URL tokens', async (t) => {
  browser(t);
  t.mock.method(globalThis, 'fetch', async (request) => {
    assert.equal(request.url, mediaUrl);
    assert.equal(request.headers.get('Authorization'), 'Bearer private-token');
    assert.equal(request.mode, 'cors');
    assert.equal(request.credentials, 'omit');
    return new Response('original-media', { headers: { 'Content-Type': 'image/gif' } });
  });
  const blob = await downloadMedia(mediaUrl);
  assert.equal(blob.type, 'image/gif');
  assert.equal(await blob.text(), 'original-media');
});

test('media tokens never reach other origins or non-media endpoints', async (t) => {
  browser(t);
  t.mock.method(globalThis, 'fetch', async (request) => {
    assert.equal(request.headers.get('Authorization'), null, request.url);
    return new Response('public-media');
  });
  for (const src of [
    'https://evil.example/_matrix/client/v1/media/download/server/image',
    'https://matrix.example.evil/_matrix/client/v1/media/download/server/image',
    'https://matrix.example/_matrix/client/v1/media/download-evil',
    'https://matrix.example/public.gif',
  ]) {
    assert.equal(needsMediaBlob(src), false);
    await downloadMedia(src);
  }
});

test('logged-out clients do not use protected media credentials', async (t) => {
  browser(t, { session: false });
  assert.equal(needsMediaBlob(mediaUrl), false);
  t.mock.method(globalThis, 'fetch', async (request) => {
    assert.equal(request.headers.get('Authorization'), null);
    return new Response('unauthorized', { status: 401 });
  });
  await assert.rejects(downloadMedia(mediaUrl), /401/);
});

test('download errors reject before decryption and remain retryable', async (t) => {
  browser(t);
  let attempt = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempt += 1;
    return attempt === 1
      ? new Response('unauthorized', { status: 401 })
      : new Response(new Uint8Array([0, 1, 2, 255]));
  });
  await assert.rejects(downloadMedia(mediaUrl), /401/);
  assert.deepEqual(
    new Uint8Array(await (await downloadMedia(mediaUrl)).arrayBuffer()),
    new Uint8Array([0, 1, 2, 255])
  );
});

test('cancellation reaches the authenticated fetch', async (t) => {
  browser(t);
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', (request) => {
    assert.equal(request.headers.get('Authorization'), 'Bearer private-token');
    return new Promise((resolve, reject) => {
      if (request.signal.aborted) reject(request.signal.reason);
      else request.signal.addEventListener('abort', () => reject(request.signal.reason));
    });
  });
  const pending = downloadMedia(mediaUrl, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

function click(t, href, overrides = {}) {
  class Anchor {
    constructor() {
      this.href = href;
    }

    hasAttribute(name) {
      return (
        (name === 'download' && !!overrides.download) ||
        (name === 'data-mobile-in-app' && !!overrides.inApp)
      );
    }
  }
  mockGlobal(t, 'HTMLAnchorElement', Anchor);
  return {
    button: 0,
    defaultPrevented: false,
    composedPath: () => [{}, new Anchor()],
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

for (const href of ['https://example.org/page?a=1#part', 'mailto:me@example.org', 'tel:+123']) {
  test(`Android opens external link through the native opener: ${href}`, (t) => {
    const { calls } = browser(t);
    const event = click(t, href);
    handleMobileLinkClick(event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(calls, [{ command: 'plugin:opener|open_url', args: { url: href } }]);
  });
}

for (const action of ['login', 'register']) {
  test(`Android keeps SSO ${action} and its local callback in the WebView`, (t) => {
    const { calls } = browser(t);
    const url = new URL('https://matrix.example/_matrix/client/v3/login/sso/redirect/oidc');
    url.searchParams.set('redirectUrl', 'http://tauri.localhost/#/login/matrix.example');
    url.searchParams.set('action', action);
    const event = click(t, url.href, { inApp: true });
    handleMobileLinkClick(event);
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(calls, []);

    // The exception belongs to the auth link, not the whole homeserver.
    handleMobileLinkClick(click(t, 'https://matrix.example/help'));
    assert.deepEqual(calls, [
      { command: 'plugin:opener|open_url', args: { url: 'https://matrix.example/help' } },
    ]);
  });
}

test('native opener preserves internal links, handled mentions, downloads and click modifiers', (t) => {
  const { calls } = browser(t);
  for (const [href, overrides] of [
    ['https://tauri.localhost/#/room', {}],
    ['https://matrix.to/#/@me:matrix.example', { defaultPrevented: true }],
    ['blob:https://tauri.localhost/file', {}],
    ['javascript:alert(1)', {}],
    ['file:///etc/passwd', {}],
    ['https://example.org/file', { download: true }],
    ['https://example.org/', { button: 2 }],
    ['https://example.org/', { altKey: true }],
  ]) {
    handleMobileLinkClick(click(t, href, overrides));
  }
  assert.deepEqual(calls, []);
});

test('mobile link integration only registers in the native mobile app', (t) => {
  browser(t, { native: false });
  const listeners = [];
  mockGlobal(t, 'document', {
    addEventListener: (type, handler) => listeners.push({ type, handler }),
  });
  installMobileLinks();
  assert.deepEqual(listeners, []);
  globalThis.isTauri = true;
  installMobileLinks();
  assert.deepEqual(listeners, [{ type: 'click', handler: handleMobileLinkClick }]);
});
