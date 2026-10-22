/** Navigation and control keys must retain their existing focus target. */
export const shouldFocusMessageField = (
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'altKey' | 'ctrlKey' | 'isComposing' | 'defaultPrevented'
  >
): boolean =>
  !event.defaultPrevented &&
  !event.isComposing &&
  !event.metaKey &&
  !event.altKey &&
  !event.ctrlKey &&
  event.key.length === 1 &&
  event.key !== ' ';
