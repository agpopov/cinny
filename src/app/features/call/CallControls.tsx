import React from 'react';
import { Box, Text } from 'folds';
import { ChatButton, SoundButton } from './Controls';
import { CallEmbed, useCallControlState } from '../../plugins/call';

type CallControlsProps = { callEmbed: CallEmbed };
export function CallControls({ callEmbed }: CallControlsProps) {
  const { sound } = useCallControlState(callEmbed.control);
  return (
    <Box alignItems="Center" gap="200" wrap="Wrap">
      <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
      <ChatButton />
      <Text size="T200">
        Микрофон, камера, выбор устройств и демонстрация экрана — на панели звонка.
      </Text>
    </Box>
  );
}
