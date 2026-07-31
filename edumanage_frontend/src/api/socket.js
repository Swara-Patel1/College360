/**
 * Real-time socket integration — DISABLED.
 *
 * The standalone Socket.io server (formerly `../../../realtime`, port 3001) has
 * been removed. These are no-op stubs that preserve this module's public API
 * (`initSocket` / `disconnectSocket` / `getSocket`) so existing callers keep
 * working without change.
 *
 * Live-push features are therefore inactive: the app fetches data on page load
 * and after user actions instead of receiving server pushes. The `socket:*`
 * window CustomEvents that a few components still listen for simply never fire,
 * which is harmless.
 *
 * To re-enable real-time, restore a Socket.io server and reinstate the
 * `socket.io-client` connection here.
 */

let socket = null;

export const getSocket = () => socket;

export const initSocket = () => null;

export const disconnectSocket = () => {
  socket = null;
};
