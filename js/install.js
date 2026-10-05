// Instalação como app (PWA).

let deferred = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  window.dispatchEvent(new Event('pauta:render'));
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  window.dispatchEvent(new Event('pauta:render'));
});

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canInstall = () => !!deferred && !isStandalone();
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  window.dispatchEvent(new Event('pauta:render'));
  return outcome === 'accepted';
}
