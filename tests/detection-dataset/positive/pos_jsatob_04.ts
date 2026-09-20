// DETECTION TEST FIXTURE -- inert payload, never deploy this file.
export function applyRemoteConfig(encoded: string): void {
  // remote "config" is actually executed
  eval(atob(encoded));
}

applyRemoteConfig('Y29uc29sZS5sb2coImNmZyIp');
