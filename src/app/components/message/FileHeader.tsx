import { Badge, Box, Icon, IconButton, Icons, Spinner, Text, as, toRem } from 'folds';
import React, { ReactNode, useCallback } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import FileSaver from 'file-saver';
import { streamMediaToDisk } from '../../utils/saveMedia';
import { mimeTypeToExt } from '../../utils/mimeTypes';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../utils/matrix';

const badgeStyles = { maxWidth: toRem(100) };

type FileDownloadButtonProps = {
  filename: string;
  url: string;
  mimeType: string;
  encInfo?: EncryptedAttachmentInfo;
};
export function FileDownloadButton({ filename, url, mimeType, encInfo }: FileDownloadButtonProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [downloadState, download] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Некорректный адрес файла');
      if (!encInfo) {
        const streamed = await streamMediaToDisk(mediaUrl, filename);
        if (streamed === 'cancelled') return 'Сохранение отменено.';
        if (streamed === 'saved') return 'Файл сохранён.';
      }
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      FileSaver.saveAs(fileContent, filename);
      return 'Файл передан для сохранения.';
    }, [mx, url, useAuthentication, mimeType, encInfo, filename])
  );

  const downloading = downloadState.status === AsyncStatus.Loading;
  const hasError = downloadState.status === AsyncStatus.Error;
  let downloadStatus = '';
  if (downloadState.status === AsyncStatus.Error)
    downloadStatus =
      downloadState.error instanceof Error
        ? downloadState.error.message
        : 'Не удалось сохранить файл. Повторите попытку.';
  else if (downloading) downloadStatus = 'Сохранение файла…';
  else if (downloadState.status === AsyncStatus.Success) downloadStatus = downloadState.data;
  return (
    <Box direction="Column" alignItems="Center">
      <IconButton
        aria-label={hasError ? `Повторить скачивание: ${filename}` : `Скачать: ${filename}`}
        title={
          downloadState.status === AsyncStatus.Error
            ? String(downloadState.error)
            : `Скачать ${filename}`
        }
        disabled={downloading}
        onClick={() => download().catch(() => undefined)}
        variant={hasError ? 'Critical' : 'SurfaceVariant'}
        size="300"
        radii="300"
      >
        {downloading ? (
          <Spinner size="100" variant={hasError ? 'Critical' : 'Secondary'} />
        ) : (
          <Icon size="100" src={Icons.Download} />
        )}
      </IconButton>
      <span role={hasError ? 'alert' : 'status'} aria-live="polite">
        {downloadStatus}
      </span>
    </Box>
  );
}

export type FileHeaderProps = {
  body: string;
  mimeType: string;
  after?: ReactNode;
};
export const FileHeader = as<'div', FileHeaderProps>(({ body, mimeType, after, ...props }, ref) => (
  <Box alignItems="Center" gap="200" grow="Yes" {...props} ref={ref}>
    <Box shrink="No">
      <Badge style={badgeStyles} variant="Secondary" radii="Pill">
        <Text size="O400" truncate>
          {mimeTypeToExt(mimeType)}
        </Text>
      </Badge>
    </Box>
    <Box grow="Yes">
      <Text size="T300" truncate>
        {body}
      </Text>
    </Box>
    {after}
  </Box>
));
