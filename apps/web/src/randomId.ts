/** Random opaque identifiers for browser records and multiplayer requests, including HTTP LAN sessions. */
export function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
