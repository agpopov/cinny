import {
  getDirectRoomPath,
  getHomeRoomPath,
  getSpaceLobbyPath,
  getSpacePath,
  getSpaceRoomPath,
  getSpaceSearchPath,
} from './pathUtils';

type MatrixRouteParams = {
  spaceIdOrAlias?: string;
  roomIdOrAlias?: string;
  eventId?: string;
};

const decodeOnce = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const repairLegacyIdentifier = (value?: string): string | undefined => {
  if (!value || /^[!#].*:.+/.test(value)) return value;
  // Router params have already been decoded once. Older Cinny generatePath
  // callers encoded them twice. Only repair an otherwise malformed Matrix ID;
  // preserve literal percent sequences in valid IDs and serverless room IDs.
  const decoded = decodeOnce(value);
  return /^[!#].+:.+/.test(decoded) ? decoded : value;
};

/** Redirect URLs produced by the old double-encoding callers, preserving search/hash. */
export const getCanonicalMatrixPath = (
  pathname: string,
  params: MatrixRouteParams
): string | undefined => {
  const space = repairLegacyIdentifier(params.spaceIdOrAlias);
  const room = repairLegacyIdentifier(params.roomIdOrAlias);
  if (space === params.spaceIdOrAlias && room === params.roomIdOrAlias) return undefined;
  // The legacy generator encoded every parameter, including an optional event.
  const event = params.eventId ? decodeOnce(params.eventId) : undefined;
  if (space && room) return getSpaceRoomPath(space, room, event);
  if (room) {
    return pathname.startsWith('/direct/')
      ? getDirectRoomPath(room, event)
      : getHomeRoomPath(room, event);
  }
  if (space) {
    if (/\/lobby\/?$/.test(pathname)) return getSpaceLobbyPath(space);
    if (/\/search\/?$/.test(pathname)) return getSpaceSearchPath(space);
    return getSpacePath(space);
  }
  return undefined;
};
