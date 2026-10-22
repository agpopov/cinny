import { MsgType } from 'matrix-js-sdk';
import type { IContent, MatrixClient } from 'matrix-js-sdk';
import {
  MATRIX_BLUR_HASH_PROPERTY_NAME,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '../../../types/matrix/common';
import type { IThumbnailContent } from '../../../types/matrix/common';
import {
  getImageFileUrl,
  getThumbnail,
  getThumbnailDimensions,
  getVideoFileUrl,
  loadImageElement,
  loadVideoElement,
} from '../../utils/dom';
import { encryptFile, getImageInfo, getThumbnailContent, getVideoInfo } from '../../utils/matrix';
import type { TUploadItem } from '../../state/room/roomInputDrafts';
import { encodeBlurHash } from '../../utils/blurHash';
import { scaleYDimension } from '../../utils/common';

const generateThumbnailContent = async (
  mx: MatrixClient,
  img: HTMLImageElement | HTMLVideoElement,
  dimensions: [number, number],
  encrypt: boolean
): Promise<IThumbnailContent> => {
  const thumbnail = await getThumbnail(img, ...dimensions);
  if (!thumbnail) throw new Error('Can not create thumbnail!');
  const encThumbData = encrypt ? await encryptFile(thumbnail) : undefined;
  const thumbnailFile = encThumbData?.file ?? thumbnail;
  if (!thumbnailFile) throw new Error('Can not create thumbnail!');

  const data = await mx.uploadContent(thumbnailFile);
  const thumbMxc = data?.content_uri;
  if (!thumbMxc) throw new Error('Failed when uploading thumbnail!');
  const thumbnailContent = getThumbnailContent({
    thumbnail,
    encInfo: encThumbData?.encInfo,
    mxc: thumbMxc,
    width: dimensions[0],
    height: dimensions[1],
  });
  return thumbnailContent;
};

export const getImageMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { originalFile, encInfo, metadata } = item;
  const content: IContent = {
    msgtype: MsgType.Image,
    filename: originalFile.name,
    body: originalFile.name,
    info: { mimetype: originalFile.type, size: originalFile.size },
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  const objectUrl = getImageFileUrl(originalFile);
  try {
    const imgEl = await loadImageElement(objectUrl);
    content.info = getImageInfo(imgEl, originalFile);
    // A missing canvas, a huge image, or a failed blurhash must not prevent sending.
    try {
      content.info[MATRIX_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
        imgEl,
        64,
        Math.max(1, Math.min(64, scaleYDimension(imgEl.width, 64, imgEl.height)))
      );
    } catch (error) {
      console.warn(error);
    }
  } catch (error) {
    console.warn(error);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getVideoMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { originalFile, encInfo, metadata } = item;

  const content: IContent = {
    msgtype: MsgType.Video,
    filename: originalFile.name,
    body: originalFile.name,
    info: { mimetype: originalFile.type, size: originalFile.size },
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  const objectUrl = getVideoFileUrl(originalFile);
  let videoEl: HTMLVideoElement | undefined;
  try {
    videoEl = await loadVideoElement(objectUrl);
    content.info = getVideoInfo(videoEl, originalFile);
    try {
      const thumbContent = await generateThumbnailContent(
        mx,
        videoEl,
        getThumbnailDimensions(videoEl.videoWidth, videoEl.videoHeight),
        !!encInfo
      );
      Object.assign(content.info, thumbContent);
      if (thumbContent.thumbnail_info) {
        try {
          thumbContent.thumbnail_info[MATRIX_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
            videoEl,
            64,
            Math.max(1, Math.min(64, scaleYDimension(videoEl.videoWidth, 64, videoEl.videoHeight)))
          );
        } catch (error) {
          console.warn(error);
        }
      }
    } catch (error) {
      console.warn(error);
    }
  } catch (error) {
    console.warn(error);
  } finally {
    if (videoEl) {
      videoEl.removeAttribute('src');
      videoEl.load();
    }
    URL.revokeObjectURL(objectUrl);
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getAudioMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.Audio,
    filename: file.name,
    body: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getFileMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.File,
    body: file.name,
    filename: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};
