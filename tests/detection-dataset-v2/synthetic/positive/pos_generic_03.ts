export interface JwtConfig {
  issuer: string;
  ttlSeconds: number;
}

// session signing material left in the source during a rushed release
const secret = "EXAMPLESESSIONSECRET0000000000";

export const jwtConfig: JwtConfig = { issuer: 'gatekeeper', ttlSeconds: 3600 };

export function signingSecret(): string {
  return secret;
}
