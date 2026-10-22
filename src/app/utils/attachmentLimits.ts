/** AES-GCM/SHA processing retains several whole buffers. Bound it before reading. */
export const ENCRYPTED_FILE_LIMIT = 128 * 1024 * 1024;
export const ATTACHMENT_QUEUE_LIMIT = 256 * 1024 * 1024;
export const ATTACHMENT_COUNT_LIMIT = 100;

export const attachmentFileLimit = (serverLimit: unknown, encrypted: boolean): number => {
  const server =
    typeof serverLimit === 'number' && Number.isFinite(serverLimit) && serverLimit > 0
      ? serverLimit
      : Infinity;
  return encrypted ? Math.min(server, ENCRYPTED_FILE_LIMIT) : server;
};
