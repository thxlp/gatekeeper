// EVASION TEST FIXTURE -- eval/atob reached through aliases; payload -> console.log("ok")
const d = atob;
const e = eval;
e(d('Y29uc29sZS5sb2coIm9rIik='));
