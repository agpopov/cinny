import { matchPath } from 'react-router-dom';
import { getSpacePath } from '../pages/pathUtils';
import { DIRECT_PATH, EXPLORE_PATH, HOME_PATH, INBOX_PATH, SPACE_PATH } from '../pages/paths';

export const getBackPath = (pathname: string): string | undefined => {
  const path = [HOME_PATH, DIRECT_PATH, EXPLORE_PATH, INBOX_PATH].find((root) =>
    matchPath({ path: root, caseSensitive: true, end: false }, pathname)
  );
  if (path) return matchPath({ path, end: true }, pathname) ? undefined : path;
  const match = matchPath({ path: SPACE_PATH, caseSensitive: true, end: false }, pathname);
  const encoded = match?.params.spaceIdOrAlias;
  if (!encoded) return undefined;
  try {
    const space = decodeURIComponent(encoded);
    if (!space.startsWith('!') && !space.startsWith('#')) return undefined;
    const parent = getSpacePath(space);
    return matchPath({ path: SPACE_PATH, end: true }, pathname) ? undefined : parent;
  } catch {
    return undefined;
  }
};
