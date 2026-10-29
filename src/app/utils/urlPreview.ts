import { getBlobSafeMimeType, getMediaMimeType } from './mimeTypes';

export type PreviewMedia = { url: string; kind: 'image' | 'video'; loop?: boolean };

export const getHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
};

export const getDirectMedia = (value: unknown, mimeType = ''): PreviewMedia | undefined => {
  const url = getHttpUrl(value);
  if (!url) return undefined;
  const type = getBlobSafeMimeType(getMediaMimeType(new URL(url).pathname, mimeType));
  if (type.startsWith('image/')) return { url, kind: 'image' };
  if (type.startsWith('video/')) return { url, kind: 'video' };
  return undefined;
};

// GIFS.RU's embed includes its animation in static HTML and works without scripts. Resolve the
// provider's share URL locally: Matrix URL previews may be disabled server-side.
// Never use arbitrary page/og:video URLs as iframe sources.
export const getGifProviderEmbed = (value: unknown): string | undefined => {
  const safeUrl = getHttpUrl(value);
  if (!safeUrl) return undefined;
  const url = new URL(safeUrl);
  if (!['gifs.ru', 'www.gifs.ru'].includes(url.hostname) || url.port) return undefined;
  const match = /^\/(?:gifs\/(?:[a-zA-Z0-9-]+-)?|embed\/)([a-zA-Z0-9]{6})\/?$/.exec(url.pathname);
  return match ? `https://gifs.ru/embed/${match[1]}` : undefined;
};

// Resolve known share links to public media endpoints without an API key or
// a Matrix preview server. Keep IDs as strings: modern Tenor IDs exceed 2^53.
export const getProviderMedia = (value: unknown): PreviewMedia | undefined => {
  const safeUrl = getHttpUrl(value);
  if (!safeUrl) return undefined;
  const url = new URL(safeUrl);
  if (url.port) return undefined;
  if (['giphy.com', 'www.giphy.com'].includes(url.hostname)) {
    const match = /^\/(?:gifs|stickers|embed)\/(?:[a-zA-Z0-9-]+-)?([a-zA-Z0-9]{6,64})\/?$/.exec(
      url.pathname
    );
    if (match) return { url: `https://i.giphy.com/media/${match[1]}/giphy.gif`, kind: 'image' };
  }
  if (['tenor.com', 'www.tenor.com'].includes(url.hostname)) {
    let pathname: string;
    try {
      // URL.pathname percent-encodes non-ASCII titles, including Russian share links.
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return undefined;
    }
    // Shared pages may include a locale (e.g. /ru/view/ or /pt-BR/view/).
    const match =
      /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?(?:view|embed)\/(?:[\p{L}\p{M}\p{N}-]+-)?([0-9]{1,20})(?:\.gif)?\/?$/u.exec(
        pathname
      );
    let id = match?.[1];
    const short = /^\/([a-zA-Z0-9]{2,11})\.gif\/?$/.exec(url.pathname);
    if (!id && short) {
      const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      id = Array.from(short[1])
        .reduce((result, char) => result * BigInt(62) + BigInt(alphabet.indexOf(char)), BigInt(0))
        .toString();
    }
    if (id && id !== '0') return { url: `https://tenor.com/view/${id}.gif`, kind: 'image' };
  }
  if (['imgur.com', 'www.imgur.com', 'i.imgur.com'].includes(url.hostname)) {
    const gifv = /^\/([a-zA-Z0-9]{5,7})\.gifv\/?$/.exec(url.pathname);
    if (gifv) return { url: `https://i.imgur.com/${gifv[1]}.mp4`, kind: 'video', loop: true };
    // Album/gallery IDs identify collections, not individual media files.
    const image = /^\/([a-zA-Z0-9]{5,7})\/?$/.exec(url.pathname);
    const reserved = [
      'about',
      'terms',
      'privacy',
      'upload',
      'search',
      'random',
      'signin',
      'logout',
    ];
    if (image && url.hostname !== 'i.imgur.com' && !reserved.includes(image[1]))
      return { url: `https://i.imgur.com/${image[1]}.gif`, kind: 'image' };
  }
  return undefined;
};

// Never embed arbitrary og:video URLs as HTML/iframes. Providers often put a
// player page there instead of a video file; only accept a playable media type.
export const getPreviewMedia = (preview: Record<string, unknown>): PreviewMedia | undefined => {
  const mimeType = typeof preview['og:video:type'] === 'string' ? preview['og:video:type'] : '';
  return ['og:video:secure_url', 'og:video:url', 'og:video']
    .map((key) => getDirectMedia(preview[key], mimeType))
    .find((media) => media?.kind === 'video');
};
