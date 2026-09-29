const { WebClient } = require('@slack/web-api');

// token comes from the environment, never from the repo
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

async function notify(text) {
  if (!process.env.SLACK_BOT_TOKEN) return;
  await web.chat.postMessage({ channel: '#alerts', text });
}

module.exports = { notify };
