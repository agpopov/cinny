export type VideoPreview = {
  provider: string;
  url: string;
  minimumWidth: number;
  minimumHeight: number;
  requiresHttps?: boolean;
};

const timestamp = (value: string | null): number | undefined => {
  if (!value || !/^(?:\d+h)?(?:\d+m)?(?:\d+s?)?$/.test(value)) return undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 604800 ? seconds : undefined;
};

/** Only known provider URLs become players. Never trust server-supplied iframe HTML/og:video. */
export const getVideoPreview = (value: unknown, pageUrl: string): VideoPreview | undefined => {
  if (typeof value !== 'string') return undefined;
  let link: URL;
  try {
    link = new URL(value);
  } catch {
    return undefined;
  }
  if (!['https:', 'http:'].includes(link.protocol) || link.username || link.password || link.port)
    return undefined;
  const host = link.hostname;
  const path = link.pathname;
  const preview = (
    provider: string,
    url: URL,
    minimumWidth = 200,
    minimumHeight = 200
  ): VideoPreview => ({
    provider,
    url: url.href,
    minimumWidth,
    minimumHeight,
  });
  if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
      'youtu.be',
      'www.youtu.be',
    ].includes(host)
  ) {
    let id = /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/.exec(path)?.[1];
    if (host.endsWith('youtu.be')) id = /^\/([\w-]{11})\/?$/.exec(path)?.[1];
    else if (path === '/watch') id = link.searchParams.get('v') ?? undefined;
    if (!id || !/^[\w-]{11}$/.test(id)) return undefined;
    const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    url.searchParams.set('autoplay', '0');
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('hl', 'ru');
    const start = timestamp(link.searchParams.get('t') ?? link.searchParams.get('start'));
    if (start) url.searchParams.set('start', String(start));
    return preview('YouTube', url);
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const match = /^\/(?:video\/)?([0-9]{1,12})(?:\/([a-zA-Z0-9]{6,64}))?\/?$/.exec(path);
    if (!match) return undefined;
    const url = new URL(`https://player.vimeo.com/video/${match[1]}`);
    const hash = match[2] ?? link.searchParams.get('h');
    if (hash && /^[a-zA-Z0-9]{6,64}$/.test(hash)) url.searchParams.set('h', hash);
    url.searchParams.set('autoplay', '0');
    url.searchParams.set('dnt', '1');
    return preview('Vimeo', url);
  }
  if (['rutube.ru', 'www.rutube.ru'].includes(host)) {
    const match = /^\/(?:video\/(?:private\/)?|shorts\/|play\/embed\/)([a-fA-F0-9]{32})\/?$/.exec(
      path
    );
    if (!match) return undefined;
    const url = new URL(`https://rutube.ru/play/embed/${match[1]}/`);
    const key = link.searchParams.get('p');
    if (key && /^[\w-]{1,128}$/.test(key)) url.searchParams.set('p', key);
    const start = timestamp(link.searchParams.get('t'));
    if (start) url.searchParams.set('t', String(start));
    return preview('Rutube', url, 320, 180);
  }
  if (
    [
      'vkvideo.ru',
      'www.vkvideo.ru',
      'm.vkvideo.ru',
      'vk.com',
      'www.vk.com',
      'm.vk.com',
      'vk.ru',
      'www.vk.ru',
      'm.vk.ru',
    ].includes(host)
  ) {
    const match = /^\/video(-?[0-9]{1,20})_([0-9]{1,20})\/?$/.exec(path);
    const owner = match?.[1] ?? (path === '/video_ext.php' ? link.searchParams.get('oid') : null);
    const id = match?.[2] ?? (path === '/video_ext.php' ? link.searchParams.get('id') : null);
    if (!owner || !/^-?[0-9]{1,20}$/.test(owner) || !id || !/^[0-9]{1,20}$/.test(id))
      return undefined;
    const url = new URL('https://vkvideo.ru/video_ext.php');
    url.searchParams.set('oid', owner);
    url.searchParams.set('id', id);
    url.searchParams.set('autoplay', '0');
    const hash = link.searchParams.get('hash');
    if (hash && /^[a-zA-Z0-9]{1,128}$/.test(hash)) url.searchParams.set('hash', hash);
    return preview('VK Видео', url);
  }
  if (['dailymotion.com', 'www.dailymotion.com', 'dai.ly'].includes(host)) {
    const match = (
      host === 'dai.ly'
        ? /^\/([a-zA-Z0-9]{2,16})\/?$/
        : /^\/(?:video|embed\/video)\/([a-zA-Z0-9]{2,16})(?:_[\w-]+)?\/?$/
    ).exec(path);
    if (!match) return undefined;
    const url = new URL(`https://www.dailymotion.com/embed/video/${match[1]}`);
    url.searchParams.set('autoplay', '0');
    return preview('Dailymotion', url);
  }
  if (['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'].includes(host)) {
    const clip =
      host === 'clips.twitch.tv'
        ? /^\/([\w-]{1,100})\/?$/.exec(path)?.[1]
        : /^\/[\w]{1,25}\/clip\/([\w-]{1,100})\/?$/.exec(path)?.[1];
    if (clip === 'embed') return undefined;
    const video = /^\/videos\/([0-9]{1,20})\/?$/.exec(path)?.[1];
    const channel = /^\/([a-zA-Z0-9_]{1,25})\/?$/.exec(path)?.[1];
    const reserved = [
      'directory',
      'downloads',
      'settings',
      'subscriptions',
      'inventory',
      'wallet',
      'login',
      'signup',
      'videos',
      'search',
      'embed',
    ];
    if (
      !clip &&
      !video &&
      (!channel || host === 'clips.twitch.tv' || reserved.includes(channel.toLowerCase()))
    )
      return undefined;
    let parent: URL;
    try {
      parent = new URL(pageUrl);
    } catch {
      return undefined;
    }
    if (!['http:', 'https:'].includes(parent.protocol)) return undefined;
    const url = new URL(clip ? 'https://clips.twitch.tv/embed' : 'https://player.twitch.tv/');
    if (clip) url.searchParams.set('clip', clip);
    else if (video) url.searchParams.set('video', `v${video}`);
    else url.searchParams.set('channel', channel!);
    url.searchParams.set('parent', parent.hostname);
    url.searchParams.set('autoplay', 'false');
    return { ...preview('Twitch', url, 400, 300), requiresHttps: true };
  }
  return undefined;
};
