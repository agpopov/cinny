const MEDIA_PATHS = ['/_matrix/client/v1/media/download/', '/_matrix/client/v1/media/thumbnail/'];

export const isAuthenticatedMediaUrl = (url: string): boolean => {
  try {
    return MEDIA_PATHS.some((path) => new URL(url).pathname.startsWith(path));
  } catch {
    return false;
  }
};

export const isHomeserverMediaUrl = (url: string, baseUrl: string): boolean => {
  try {
    return new URL(url).origin === new URL(baseUrl).origin && isAuthenticatedMediaUrl(url);
  } catch {
    return false;
  }
};

export const authenticatedMediaRequest = (request: Request, accessToken: string): Request => {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  // Keep Range/If-Range and all other request properties so video can stream/seek.
  return new Request(request, { headers });
};
