import { api } from '../api.js';

// Notifications sur le téléphone (Web Push) : abonnement de cet appareil auprès du service de
// notification du navigateur, puis enregistrement auprès de l'API.

export type PushState =
  /** Navigateur sans notifications (ou page en HTTP hors localhost). */
  | 'unsupported'
  /** iPhone ou iPad : il faut d'abord ajouter Obsio à l'écran d'accueil. */
  | 'install-first'
  /** Refusées dans les réglages du navigateur. */
  | 'denied'
  | 'off'
  | 'on';

/** Téléphone ou tablette (écran tactile comme pointeur principal), pour le libellé. */
export const isHandheld = () => window.matchMedia('(pointer: coarse)').matches;

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Demande l'autorisation (à appeler sur un clic), abonne l'appareil et l'enregistre. */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api.pushPublicKey();
  if (!publicKey) {
    throw new Error('Les notifications ne sont pas encore disponibles sur ce serveur.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { pushManager } = await navigator.serviceWorker.ready;
  const subscription =
    (await pushManager.getSubscription()) ??
    (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }));
  const json = subscription.toJSON();
  await api.addPushSubscription({
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  });
  return 'on';
}

/** Désabonne cet appareil (réglage, ou déconnexion : un autre compte peut s'y connecter). */
export async function disablePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.removePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}
