import { Direction } from 'matrix-js-sdk';
import type { EventTimeline } from 'matrix-js-sdk';

/** Live forward events belong to sync; the SDK forbids adding them through pagination. */
export const canPaginateTimeline = (timeline: EventTimeline, backwards: boolean): boolean => {
  const token = timeline.getPaginationToken(backwards ? Direction.Backward : Direction.Forward);
  return (
    typeof token === 'string' &&
    token.length > 0 &&
    (backwards || timeline !== timeline.getTimelineSet().getLiveTimeline())
  );
};
