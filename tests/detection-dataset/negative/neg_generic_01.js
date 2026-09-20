// every credential is read from the process environment at startup
const config = {
  baseUrl: process.env.API_BASE_URL || 'https://api.example.com',
  apiKey: process.env.API_KEY,
};

if (!config.apiKey) {
  throw new Error('API_KEY is required');
}

module.exports = { config };
