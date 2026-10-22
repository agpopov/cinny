import { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useObjectURL } from '../../../hooks/useObjectURL';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [thumbSrcState, loadThumbSrc] = useAsyncCallback(
    useCallback(async () => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      const encInfo = info.thumbnail_file;
      if (typeof thumbMxcUrl !== 'string') {
        throw new Error('Failed to load thumbnail');
      }

      const mediaUrl = mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      if (encInfo) {
        const fileContent = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
          decryptFile(encBuf, thumbInfo?.mimetype ?? FALLBACK_MIMETYPE, encInfo)
        );
        return fileContent;
      }

      return mediaUrl;
    }, [mx, info, useAuthentication])
  );

  const media = thumbSrcState.status === AsyncStatus.Success ? thumbSrcState.data : undefined;
  const objectUrl = useObjectURL(media instanceof Blob ? media : undefined);
  const src = typeof media === 'string' ? media : objectUrl;

  useEffect(() => {
    loadThumbSrc().catch(() => undefined);
  }, [loadThumbSrc]);

  return src ? renderImage(src) : null;
}
