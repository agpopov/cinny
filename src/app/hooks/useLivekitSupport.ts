import { AutoDiscoveryInfo } from '../cs-api';
import { useAutoDiscoveryInfo } from './useAutoDiscoveryInfo';

export const livekitSupport = (autoDiscoveryInfo: AutoDiscoveryInfo): boolean => {
  const rtcFoci = autoDiscoveryInfo['org.matrix.msc4143.rtc_foci'];

  return (
    Array.isArray(rtcFoci) &&
    rtcFoci.some((info) => {
      if (info?.type !== 'livekit' || typeof info.livekit_service_url !== 'string') return false;
      try {
        const url = new URL(info.livekit_service_url);
        return (
          url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        );
      } catch {
        return false;
      }
    })
  );
};

export const useLivekitSupport = (): boolean => {
  const autoDiscoveryInfo = useAutoDiscoveryInfo();

  return livekitSupport(autoDiscoveryInfo);
};
