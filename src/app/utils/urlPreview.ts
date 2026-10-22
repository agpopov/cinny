import { getBlobSafeMimeType, getMediaMimeType } from './mimeTypes';

export type PreviewMedia = { url: string; kind: 'image' | 'video' };

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

// Never embed arbitrary og:video URLs as HTML/iframes. Providers often put a
// player page there instead of a video file; only accept a playable media type.
export const getPreviewMedia = (preview: Record<string, unknown>): PreviewMedia | undefined => {
  const mimeType = typeof preview['og:video:type'] === 'string' ? preview['og:video:type'] : '';
  return ['og:video:secure_url', 'og:video:url', 'og:video']
    .map((key) => getDirectMedia(preview[key], mimeType))
    .find((media) => media?.kind === 'video');
};
