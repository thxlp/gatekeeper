// Turns a base64 data URI into a Blob so the browser can preview it.
function base64ToBlob(b64, mime) {
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    buf[i] = bytes.charCodeAt(i);
  }
  return new Blob([buf], { type: mime });
}

export { base64ToBlob };
