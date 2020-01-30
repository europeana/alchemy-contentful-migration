require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { Client } = require('pg');
const contentful = require('contentful-management');

const pgClient = new Client({
  user: process.env.pgUser,
  host: process.env.pgHost,
  database: process.env.pgDatabase,
  port: process.env.pgPort
});

const contentfulClient = contentful.createClient({
  accessToken: process.env.cAccessToken
});
contentfulClient.connect = async function() {
  const space = await this.getSpace(process.env.cSpaceId);
  const environment = await space.getEnvironment(process.env.cEnvironmentId);
  return environment;
};

const TurndownService = require('turndown');
const turndownService = new TurndownService();

const imageLogPath = path.resolve(__dirname, '../tmp/images.json');
const imageLog = fs.existsSync(imageLogPath) ? JSON.parse(fs.readFileSync(imageLogPath, 'utf8')) : {};

module.exports = {
  pgClient,
  contentfulClient,
  turndownService,
  imageLog
};
