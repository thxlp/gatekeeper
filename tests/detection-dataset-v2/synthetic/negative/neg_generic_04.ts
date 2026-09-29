// Placeholder values shown in the setup wizard UI. They are rendered as
// greyed-out hints in the input boxes and are never sent anywhere.
export const SETUP_HINTS = {
  api_key: '<paste your API key here>',
  password: '<your database password>',
  token: '<service token from the dashboard>',
};

export function isPlaceholder(value: string): boolean {
  return value.startsWith('<') && value.endsWith('>');
}
