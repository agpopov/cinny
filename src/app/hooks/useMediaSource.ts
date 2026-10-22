import { useEffect, useState } from 'react';
import { downloadMedia, needsMediaBlob } from '../utils/media';

export const useMediaSource = (src?: string): string | undefined => {
  const authenticated = !!src && needsMediaBlob(src);
  const [resolved, setResolved] = useState<{
    original: string;
    url: string;
    signal: AbortSignal;
  }>();

  useEffect(() => {
    if (!src || !authenticated) return undefined;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    downloadMedia(src, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved({ original: src, url: objectUrl, signal: controller.signal });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Emit the image element's normal error event without another request.
        setResolved({
          original: src,
          url: 'data:application/octet-stream,',
          signal: controller.signal,
        });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, authenticated]);

  if (!authenticated) return src;
  return resolved && resolved.original === src && !resolved.signal.aborted
    ? resolved.url
    : undefined;
};
