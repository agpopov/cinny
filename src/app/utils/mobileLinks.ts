import { invoke } from '@tauri-apps/api/core';
import { isMobileApp } from './desktop';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export const handleMobileLinkClick = (event: MouseEvent): void => {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.metaKey) return;
  const anchor = event
    .composedPath()
    .find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement);
  if (!anchor?.href || anchor.hasAttribute('download')) return;
  // SSO must return to this WebView: tauri.localhost is only served inside
  // the app, so sending the auth flow to a browser would lose the callback.
  if (anchor.hasAttribute('data-mobile-in-app')) return;
  const url = new URL(anchor.href);
  if (!EXTERNAL_PROTOCOLS.has(url.protocol) || url.origin === window.location.origin) return;

  // WebView does not create browser tabs for target="_blank". Use Android's
  // default application after React has handled internal Matrix links/mentions.
  event.preventDefault();
  invoke<void>('plugin:opener|open_url', { url: url.href }).catch((error) => {
    console.error('Unable to open external link', error);
  });
};

export const installMobileLinks = (): void => {
  if (isMobileApp()) document.addEventListener('click', handleMobileLinkClick);
};
