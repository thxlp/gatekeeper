// Decoding a base64url JWT payload for display. Nothing is executed.
function decodeJwtPayload(token) {
  const part = token.split('.')[1] || '';
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}

module.exports = { decodeJwtPayload };
