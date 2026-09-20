// Placeholder wiring: the real values arrive from the secret manager
// at boot time, this module only declares their names.
export const AWS_KEY_ID_PLACEHOLDER = '<AWS_ACCESS_KEY_ID>';
export const AWS_SECRET_PLACEHOLDER = '<AWS_SECRET_ACCESS_KEY>';

export function awsConfigFromEnv() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? AWS_KEY_ID_PLACEHOLDER,
    region: process.env.AWS_REGION ?? 'ap-southeast-1',
  };
}
