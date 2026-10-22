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
  // Images/video initiate no-cors requests. That header guard silently drops
  // Authorization, so the authenticated fetch must use cors mode. Preserve
  // Range/If-Range and the remaining request properties for streaming/seeking.
  // Bearer auth does not need cookies; media elements otherwise use "include",
  // which conflicts with Matrix's Access-Control-Allow-Origin: * response.
  return new Request(request, { headers, mode: 'cors', credentials: 'omit' });
};
