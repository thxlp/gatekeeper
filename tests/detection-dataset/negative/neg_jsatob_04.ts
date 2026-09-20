// Config arrives base64 encoded from the server, is validated against a
// schema, and is only ever treated as data.
import { z } from 'zod';

const ConfigSchema = z.object({
  featureFlags: z.record(z.boolean()),
  apiBaseUrl: z.string().url(),
});

export function parseRemoteConfig(encoded: string) {
  const json = atob(encoded);
  return ConfigSchema.parse(JSON.parse(json));
}
