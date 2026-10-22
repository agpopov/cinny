// Constant-only application types are test doubles so Node can execute the
// receipt logic without compiling TypeScript enums. SDK models stay real.
export const Membership = {
  Join: 'join',
  Leave: 'leave',
  Invite: 'invite',
  Knock: 'knock',
  Ban: 'ban',
};
export const MessageEvent = {
  RoomMessage: 'm.room.message',
  RoomMessageEncrypted: 'm.room.encrypted',
  Sticker: 'm.sticker',
  RoomRedaction: 'm.room.redaction',
  Reaction: 'm.reaction',
};
export const NotificationType = {
  Default: 'default',
  AllMessages: 'all_messages',
  MentionsAndKeywords: 'mentions_and_keywords',
  Mute: 'mute',
};
export const RoomType = { Space: 'm.space', Call: 'org.matrix.msc3417.call' };
export const StateEvent = {
  RoomCreate: 'm.room.create',
  SpaceChild: 'm.space.child',
  SpaceParent: 'm.space.parent',
  RoomPowerLevels: 'm.room.power_levels',
};
