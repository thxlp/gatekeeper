const fetch = require('node-fetch');

const config = {
  baseUrl: 'https://api.example.com',
  api_key: 'EXAMPLEKEY0000000000abcdefgh',
};

async function getUser(id) {
  const res = await fetch(`${config.baseUrl}/users/${id}`, {
    headers: { 'X-Api-Key': config.api_key },
  });
  return res.json();
}

module.exports = { getUser };
