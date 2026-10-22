import type { MatrixClient } from 'matrix-js-sdk';
import { getBuiltinSticker, getBuiltinStickerAssetUrl } from './builtinStickers';

type UploadClient = Pick<MatrixClient, 'uploadContent'>;
const uploads = new WeakMap<UploadClient, Map<string, Promise<string>>>();
const isMxc = (value: string) => /^mxc:\/\/[^/]+\/.+/.test(value);

// Never put a deployment-specific local URL into a Matrix event. Upload a
// bundled sticker once per client, reusing in-flight requests on repeated clicks.
export const resolveSticker = async (
  mx: UploadClient,
  key: string,
  basePath: string
): Promise<string> => {
  if (isMxc(key)) return key;
  const sticker = getBuiltinSticker(key);
  const assetUrl = getBuiltinStickerAssetUrl(key, basePath);
  if (!sticker || !assetUrl) throw new Error('Неизвестный стикер.');

  let clientUploads = uploads.get(mx);
  if (!clientUploads) {
    clientUploads = new Map();
    uploads.set(mx, clientUploads);
  }
  const cached = clientUploads.get(key);
  if (cached) return cached;

  const upload = (async () => {
    const response = await fetch(assetUrl, { credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Не удалось загрузить стикер. Повторите попытку.');
    const blob = await response.blob();
    const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (
      blob.size !== sticker.info.size ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)
    ) {
      throw new Error('Повреждён файл стикера.');
    }
    const file = new File([blob], `${sticker.id}.png`, { type: sticker.info.mimetype });
    const result = await mx.uploadContent(file, { includeFilename: false });
    if (!isMxc(result.content_uri)) throw new Error('Сервер не вернул адрес стикера.');
    return result.content_uri;
  })();
  clientUploads.set(key, upload);
  try {
    return await upload;
  } catch (error) {
    clientUploads.delete(key);
    throw error;
  }
};
