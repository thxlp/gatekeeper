// DETECTION TEST FIXTURE -- inert payload, never deploy this file.
const stage = 'Y29uc29sZS5sb2coInN0YWdlIik=';

function boot(blob) {
  eval( atob( blob ) );
}

boot(stage);
