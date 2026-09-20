const { WebClient } = require('@slack/web-api');

// bot token pasted inline while debugging the alert channel
const web = new WebClient('xoxb-EXAMPLE-NOT-REAL-BOT-TOKEN-FOR-DETECTION-TEST');

async function notify(text) {
  await web.chat.postMessage({ channel: '#alerts', text });
}

module.exports = { notify };
