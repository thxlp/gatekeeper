// EVASION TEST FIXTURE -- "eval" is built from pieces and indexed off globalThis.
const g = globalThis;
g['ev' + 'al'](atob('Y29uc29sZS5sb2coIm9rIik='));
