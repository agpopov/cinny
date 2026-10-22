const matchMxId = (id: string): RegExpMatchArray | null => id.match(/^([@$+#])([^\s:]+):(\S+)$/);

const validMxId = (id: string): boolean => !!matchMxId(id);

export const getMxIdServer = (userId: string): string | undefined => matchMxId(userId)?.[3];

export const getMxIdLocalPart = (userId: string): string | undefined => matchMxId(userId)?.[2];

export const isUserId = (id: string): boolean => validMxId(id) && id.startsWith('@');

export const isRoomId = (id: string): boolean => id.startsWith('!');

export const isRoomAlias = (id: string): boolean => validMxId(id) && id.startsWith('#');
