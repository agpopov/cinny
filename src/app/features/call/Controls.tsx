import { t } from 'i18next';
import React from 'react';
import { Icon, IconButton, Icons, Line, Text, Tooltip, TooltipProvider } from 'folds';
import { useAtom } from 'jotai';
import * as css from './styles.css';
import { callChatAtom } from '../../state/callEmbed';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

export function ControlDivider() {
  return (
    <Line variant="SurfaceVariant" size="300" direction="Vertical" className={css.ControlDivider} />
  );
}

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
};
export function MicrophoneButton({ enabled, onToggle }: MicrophoneButtonProps) {
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? t('Turn Off Microphone') : t('Turn On Microphone')}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          aria-label={enabled ? 'Выключить микрофон' : 'Включить микрофон'}
          onClick={toggleMic}
          outlined
          disabled={loading}
        >
          <Icon size="400" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? t('Turn Off Sound') : t('Turn On Sound')}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          aria-label={enabled ? 'Выключить звук' : 'Включить звук'}
          onClick={() => onToggle()}
          outlined
        >
          <Icon
            size="400"
            src={enabled ? Icons.Headphone : Icons.HeadphoneMute}
            filled={!enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
};
export function VideoButton({ enabled, onToggle }: VideoButtonProps) {
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? t('Stop Camera') : t('Start Camera')}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          aria-label={enabled ? 'Выключить камеру' : 'Включить камеру'}
          onClick={toggleVideo}
          outlined
          disabled={loading}
        >
          <Icon
            size="400"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function ScreenShareButton({ enabled, onToggle }: ScreenShareButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? t('Stop Screenshare') : t('Start Screenshare')}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          aria-label={enabled ? 'Остановить демонстрацию экрана' : 'Показать экран'}
          onClick={() => onToggle()}
          outlined
        >
          <Icon size="400" src={Icons.ScreenShare} filled={enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function ChatButton() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{chat ? t('Close Chat') : t('Open Chat')}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={chat ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          aria-label={chat ? 'Закрыть чат' : 'Открыть чат'}
          onClick={() => setChat(!chat)}
          outlined
        >
          <Icon size="400" src={Icons.Message} filled={chat} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
