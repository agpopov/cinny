import NotificationSoundUrl from '../../../public/sound/notification.ogg';
import InviteSoundUrl from '../../../public/sound/invite.ogg';

const audioCache = new Map<string, HTMLAudioElement>();

const playSound = (src: string, volume: number) => {
  let audio = audioCache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = 'auto';
    audioCache.set(src, audio);
  }
  audio.volume = Math.min(Math.max(volume, 0), 100) / 100;
  audio.currentTime = 0;
  audio.play().catch(() => {
    // браузер может запретить автозвук до первого действия пользователя
  });
};

/** Звук нового сообщения; громкость 0–100. */
export const playNotificationSound = (volume: number) => playSound(NotificationSoundUrl, volume);

/** Звук приглашения; громкость 0–100. */
export const playInviteSound = (volume: number) => playSound(InviteSoundUrl, volume);
