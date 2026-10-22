import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inlineHashes = (html) =>
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim())
    .map((source) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`);

/** Hash only known bootstrap scripts. Recomputed when embedded Call is updated. */
export const productionCsp = () => {
  const hashes = [
    ...inlineHashes(readFileSync(new URL('../index.html', import.meta.url), 'utf8')),
    ...inlineHashes(
      readFileSync(
        new URL(
          '../node_modules/@element-hq/element-call-embedded/dist/index.html',
          import.meta.url
        ),
        'utf8'
      )
    ),
  ];
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(
      ' '
    )} https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.recaptcha.net/recaptcha/`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' blob: data: https: http:",
    "media-src 'self' blob: data: https: http:",
    // Homeservers, media repositories and LiveKit endpoints are user-configurable.
    "connect-src 'self' https: wss: http: ws: blob: ipc: http://ipc.localhost",
    "worker-src 'self' blob:",
    "frame-src 'self' https://gifs.ru https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/",
    "manifest-src 'self'",
  ].join('; ');
};

export const injectCsp = (html) =>
  html.replace(
    /<head(?:\s[^>]*)?>/i,
    (head) =>
      `${head}<meta http-equiv="Content-Security-Policy" content="${productionCsp()
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')}">`
  );

export const contentSecurityPolicyPlugin = () => {
  let outDir;
  return {
    name: 'cinny-content-security-policy',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const callHtml = resolve(outDir, 'public/element-call/index.html');
        writeFileSync(callHtml, injectCsp(readFileSync(callHtml, 'utf8')));
        const policy = `${productionCsp()}; frame-ancestors 'self'`;
        writeFileSync(
          resolve(outDir, '_headers'),
          `/*\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`
        );
        writeFileSync(
          resolve(outDir, 'security-headers.conf'),
          `add_header Content-Security-Policy "${policy}" always;\nadd_header X-Content-Type-Options nosniff always;\nadd_header Referrer-Policy strict-origin-when-cross-origin always;\n`
        );
      },
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: productionCsp() },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
};
