// Which address serves which part. One site is built (vite.config.ts); in production the app and the
// admin panel each have their own address, set in Render's environment (as in VetClinicTracker):
//   VITE_APP_HOST    the app, e.g. lyra.kokoasoft.com
//   VITE_ADMIN_HOST  the platform admin panel, e.g. lyra.admin.kokoasoft.com
// Unset (local development, the laptop preview) both share one address.

const APP_HOST = import.meta.env.VITE_APP_HOST ?? '';
const ADMIN_HOST = import.meta.env.VITE_ADMIN_HOST ?? '';

/** The admin panel's address is open: only the admin's screens and the sign-in show there. */
export const onAdminHost = () => Boolean(ADMIN_HOST) && window.location.hostname === ADMIN_HOST;

/** The app's address is open: the admin panel never shows there. */
export const onAppHost = () => Boolean(ADMIN_HOST) && !onAdminHost();

/** Whether a path belongs to the admin panel. */
export const isAdminPath = (path: string) => path === '/a' || path.startsWith('/a/');

/**
 * Sends the browser to the right address for a path: admin screens to the admin panel's address,
 * everything else (but the sign-in) to the app's. True when it's leaving, so nothing should draw.
 */
export function leaveForOwnHost(path: string): boolean {
    if (onAppHost() && isAdminPath(path)) {
        window.location.replace(`https://${ADMIN_HOST}/#${path}`);
        return true;
    }
    if (onAdminHost() && path !== '/' && !isAdminPath(path)) {
        window.location.replace(APP_HOST ? `https://${APP_HOST}/#${path}` : '/#/');
        return true;
    }
    return false;
}

/** Where the app lives, for links sent to people (invitations always open the app). */
export const appOrigin = () => (APP_HOST ? `https://${APP_HOST}` : window.location.origin);

/** The real site (the app's or the admin panel's address): the prototype and its invented data never show there. */
export const onProductionHost = () => Boolean(APP_HOST || ADMIN_HOST)
    && typeof window !== 'undefined' && [APP_HOST, ADMIN_HOST].includes(window.location.hostname);

/** The prototype's own screens (sample flows with invented people), kept off the real site. */
export const isPrototypePath = (path: string) =>
    /^\/(invite(\/(card|terms|done|minor(\/.*)?|teacher(\/.*)?|director(\/.*)?))?|terms-new|delete-link)$/.test(path);

/** Paths anyone may open signed out on the real site: the sign-in, invitation and password links, and the links that need a sign-in first. */
export const isPublicPath = (path: string) =>
    path === '/' || path === '/legal' || path === '/password/new' || path === '/checkin' || path.startsWith('/invite/') || path.startsWith('/delete-data/');
