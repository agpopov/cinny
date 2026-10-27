import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export const staticAssets = [
  ['node_modules/@element-hq/element-call-embedded/dist', 'public/element-call'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.js'],
  ['node_modules/pdfjs-dist/cmaps', 'public/pdfjs/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'public/pdfjs/standard_fonts'],
  ['node_modules/pdfjs-dist/wasm', 'public/pdfjs/wasm'],
  ['netlify.toml', 'netlify.toml'],
  ['config.json', 'config.json'],
  ['public/manifest.json', 'manifest.json'],
  ['public/res/android', 'public/android'],
  ['public/locales', 'public/locales'],
  ['public/res/stickers', 'public/stickers'],
];
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
};
export const copyStaticAssets = async (root, outDir, assets = staticAssets) => {
  await mkdir(outDir, { recursive: true });
  await Promise.all(
    assets.map(async ([from, to]) => {
      const destination = resolve(outDir, to);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await cp(resolve(root, from), destination, { recursive: true, force: true });
    })
  );
};
export const serveStaticAssets =
  (root, base = '/', assets = staticAssets) =>
  async (req, res, next) => {
    let pathname;
    try {
      const url = new URL(req.url, 'http://localhost');
      // Module imports (e.g. bundled locale JSON) must be transformed by Vite.
      if (url.searchParams.has('import')) {
        next();
        return;
      }
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const prefix = base === '/' ? '' : base.replace(/\/$/, '');
    if (prefix && pathname.startsWith(`${prefix}/`)) pathname = pathname.slice(prefix.length);
    for (const [from, to] of assets) {
      const route = `/${to}`;
      if (pathname !== route && !pathname.startsWith(`${route}/`)) continue;
      const source = resolve(root, from);
      const file = resolve(source, `.${pathname.slice(route.length)}`);
      if (file !== source && !file.startsWith(`${source}${sep}`)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      try {
        const info = await stat(file);
        if (!info.isFile()) {
          next();
          return;
        }
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(await readFile(file));
      } catch (error) {
        if (error.code === 'ENOENT') {
          next();
          return;
        }
        next(error);
      }
      return;
    }
    next();
  };
export const staticAssetsPlugin = () => {
  let root;
  let outDir;
  let base;
  return {
    name: 'cinny-static-assets',
    configResolved(config) {
      root = config.root;
      outDir = resolve(root, config.build.outDir);
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use(serveStaticAssets(root, base));
    },
    async writeBundle() {
      await copyStaticAssets(root, outDir);
    },
  };
};
