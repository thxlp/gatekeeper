// EVASION TEST FIXTURE -- reassembles a Slack-shaped example token at runtime.
const { WebClient } = require('@slack/web-api');

// "xoxb" and the "-..." tail never sit next to each other in source
const prefix = 'xoxb';
const tail = '-000000000000-000000000000-EXAMPLETOKENNOTREAL00';
const token = prefix + tail;

const web = new WebClient(token);
module.exports = { web, token };
