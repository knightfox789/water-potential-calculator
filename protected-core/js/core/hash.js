export async function sha256Hex(arrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser does not provide the Web Crypto API required for source fingerprinting.');
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
