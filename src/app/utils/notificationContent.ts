import { MatrixClient, MatrixEvent, MsgType, Room } from 'matrix-js-sdk';
import { cssColorMXID } from '../../util/colorMXID';
import { downloadMedia, getMxIdLocalPart, mxcUrlToHttp } from './matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from './room';
import { nameInitials } from './common';
import { stripDataUrl } from './desktop';
import { getPollPreviewText } from './poll';
import { getMessagePreviewText } from './messagePreview';

const MAX_BODY = 220;

const truncate = (text: string, max = MAX_BODY) => {
  const flat = text.replace(/[^\S\n]+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const MATRIX_TO_LINK = /https?:\/\/matrix\.to\/#\/([@#!][^\s?/]+)(?:\/\$[^\s?]+)?(?:\?\S*)?/g;
const USER_ID = /@[^\s:@]+:[\w.-]+(?::\d+)?/g;
const ROOM_ID = /![^\s:]+:[\w.-]+(?::\d+)?/g;

/** Сырые Matrix-ID и ссылки matrix.to в теле сообщения → имена; без комнаты ID остаются как есть. */
const resolveMentions = (text: string, room?: Room): string => {
  if (!room) return text;
  return text
    .replace(MATRIX_TO_LINK, '$1')
    .replace(USER_ID, (id) => `@${getMemberDisplayName(room, id) ?? getMxIdLocalPart(id) ?? id}`)
    .replace(ROOM_ID, (id) => {
      const name = room.client.getRoom(id)?.name;
      return name ? `#${name}` : 'ссылка на комнату';
    });
};

/** Короткое описание сообщения для текста уведомления; с `room` упоминания читаемы. */
export const getEventPreviewText = (mEvent: MatrixEvent, room?: Room): string => {
  if (mEvent.isDecryptionFailure()) return 'Зашифрованное сообщение';
  if (mEvent.getType() === 'm.sticker') return '🖼 Стикер';

  const content = mEvent.getContent();
  const pollPreview = getPollPreviewText(content);
  if (pollPreview) return truncate(pollPreview, 120);
  const body = typeof content.body === 'string' ? content.body : '';
  const message = getMessagePreviewText(content);
  switch (content.msgtype) {
    case MsgType.Image:
      return '🖼 Изображение';
    case MsgType.Video:
      return '🎬 Видео';
    case MsgType.Audio:
      return '🎵 Аудио';
    case MsgType.File:
      return body ? `📎 ${truncate(body, 120)}` : '📎 Файл';
    case MsgType.Location:
      return '📍 Местоположение';
    case MsgType.Emote:
      return `* ${truncate(resolveMentions(message, room))}`;
    default:
      break;
  }
  if (content.msgtype === undefined && mEvent.getType() === 'm.room.encrypted') {
    return 'Зашифрованное сообщение';
  }
  const text = truncate(resolveMentions(message, room));
  return text || 'Новое сообщение';
};

export const getSenderName = (room: Room, userId: string): string =>
  getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;

const FALLBACK_COLORS = [
  '#368bd6',
  '#ac3ba8',
  '#03b381',
  '#e64f7a',
  '#ff812d',
  '#2dc2c5',
  '#5c56f5',
  '#74d12c',
];

const fallbackColor = (id: string): string => {
  const cssVar = cssColorMXID(id);
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (value) return value;
  const index = Number(cssVar.split('-').pop() ?? '1') - 1;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

const SIZE = 96;

const drawLetterAvatar = (ctx: CanvasRenderingContext2D, id: string, name: string) => {
  ctx.fillStyle = fallbackColor(id);
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${SIZE * 0.45}px Inter, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameInitials(name).toUpperCase(), SIZE / 2, SIZE / 2 + 2);
};

const avatarCache = new Map<string, Promise<string | undefined>>();

/**
 * Готовит PNG-аватар (base64) для системного уведомления: картинку с сервера
 * или цветной кружок с инициалом, как в интерфейсе Cinny.
 */
export const getNotificationAvatar = (
  mx: MatrixClient,
  useAuthentication: boolean,
  id: string,
  name: string,
  mxc?: string
): Promise<string | undefined> => {
  const key = JSON.stringify([mx.baseUrl, mx.getUserId(), mxc, id, name]);
  const cached = avatarCache.get(key);
  if (cached) {
    avatarCache.delete(key);
    avatarCache.set(key, cached);
    return cached;
  }

  const promise = (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let drawn = false;
    const httpUrl = mxc
      ? mxcUrlToHttp(mx, mxc, useAuthentication, SIZE, SIZE, 'crop') ?? undefined
      : undefined;
    if (httpUrl) {
      try {
        const blob = await downloadMedia(httpUrl);
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
        bitmap.close();
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) drawLetterAvatar(ctx, id, name);
    return stripDataUrl(canvas.toDataURL('image/png'));
  })();

  if (avatarCache.size >= 128) avatarCache.delete(avatarCache.keys().next().value!);
  avatarCache.set(key, promise);
  promise
    .then((value) => {
      if (!value && avatarCache.get(key) === promise) avatarCache.delete(key);
    })
    .catch(() => {
      if (avatarCache.get(key) === promise) avatarCache.delete(key);
    });
  return promise;
};

export const getSenderAvatarMxc = (room: Room, userId: string): string | undefined =>
  getMemberAvatarMxc(room, userId);

/** Рисует бейдж с числом для оверлея на панели задач Windows. */
export const renderUnreadBadge = (count: number, highlight: boolean): string | undefined => {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? '#e53935' : '#1e88e5';
  ctx.fill();

  const label = count > 99 ? '99+' : String(count);
  let fontSize = 20;
  if (label.length === 2) fontSize = 17;
  if (label.length >= 3) fontSize = 13;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${fontSize}px "Segoe UI", Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (count > 0) ctx.fillText(label, size / 2, size / 2 + 1);

  return stripDataUrl(canvas.toDataURL('image/png'));
};
