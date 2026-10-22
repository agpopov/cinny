export const ElementCallIntent = {
  StartCall: 'start_call',
  JoinExisting: 'join_existing',
  StartCallVoice: 'start_call_voice',
  JoinExistingVoice: 'join_existing_voice',
  StartCallDM: 'start_call_dm',
  JoinExistingDM: 'join_existing_dm',
  StartCallDMVoice: 'start_call_dm_voice',
  JoinExistingDMVoice: 'join_existing_dm_voice',
} as const;
export type ElementCallIntent = typeof ElementCallIntent[keyof typeof ElementCallIntent];

export type ElementCallThemeKind = 'light' | 'dark';

export type ElementMediaStatePayload = {
  audio_enabled?: boolean;
  video_enabled?: boolean;
};
export type ElementMediaStateDetail = {
  data?: ElementMediaStatePayload;
};

export const ElementWidgetActions = {
  JoinCall: 'io.element.join',
  HangupCall: 'im.vector.hangup',
  Close: 'io.element.close',
  DeviceMute: 'io.element.device_mute',
} as const;
export type ElementWidgetActions = typeof ElementWidgetActions[keyof typeof ElementWidgetActions];
