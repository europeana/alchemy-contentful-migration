require('dotenv').config();

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

module.exports = {
  pgClient,
  contentfulClient,
  turndownService
};
