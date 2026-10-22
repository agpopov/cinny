import { getFallbackSession } from '../state/sessions';
import { isMobileApp } from './desktop';
import { authenticatedMediaRequest, isHomeserverMediaUrl } from '../../util/mediaRequest';
import { transferAttachment } from './taskQueue';
import { ATTACHMENT_QUEUE_LIMIT } from './attachmentLimits';

export const needsMediaBlob = (src: string): boolean => {
  if (!isMobileApp()) return false;
  const session = getFallbackSession();
  // The existing useMediaAuthentication hook selects these endpoints only when
  // the homeserver supports them. Keep legacy media URLs and browser SW loading.
  return !!session && isHomeserverMediaUrl(src, session.baseUrl);
};

export const fetchMedia = async (src: string, signal?: AbortSignal): Promise<Response> => {
  const session = getFallbackSession();
  let request = new Request(src, { method: 'GET', signal });
  if (session && isHomeserverMediaUrl(src, session.baseUrl)) {
    request = authenticatedMediaRequest(request, session.accessToken);
  }
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Не удалось скачать файл (HTTP ${response.status})`);
  return response;
};

export const downloadMedia = (
  src: string,
  signal?: AbortSignal,
  limit = ATTACHMENT_QUEUE_LIMIT
): Promise<Blob> =>
  transferAttachment(async () => {
    const response = await fetchMedia(src, signal);
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error(
        'Файл слишком велик для загрузки в память. Используйте потоковое сохранение.'
      );
    }
    if (!response.body) return response.blob();
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      for (;;) {
        // Streaming reads are intentionally sequential.
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('Файл превышает доступный лимит памяти (256 МиБ).');
        chunks.push(value as Uint8Array<ArrayBuffer>);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
  });
