// Token handling lives entirely in the secret manager. This module only
// knows the env var name and how to redact the value in logs.
export const SLACK_TOKEN_ENV = 'SLACK_BOT_TOKEN';

export function redactSlackToken(input: string): string {
  return input.replace(/xox[baprs]-[0-9A-Za-z-]{10,}/g, 'xox*-REDACTED');
}

export function getSlackToken(): string | undefined {
  return process.env[SLACK_TOKEN_ENV];
}
