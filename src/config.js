require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { Client } = require('pg');
const contentfulManagement = require('contentful-management');
const contentful = require('contentful');

const pgClient = new Client({
  connectionString: process.env['PG_URL']
});

const contentfulManagementClient = {
  connect: async function() {
    const client = await contentfulManagement.createClient({
      accessToken: process.env['CTF_CMA_ACCESS_TOKEN']
    });
    const space = await client.getSpace(process.env['CTF_SPACE_ID']);
    const environment = await space.getEnvironment(process.env['CTF_ENVIRONMENT_ID']);
    return environment;
  }
};

const contentfulPreviewClient = contentful.createClient({
  accessToken: process.env['CTF_CPA_ACCESS_TOKEN'],
  space: process.env['CTF_SPACE_ID'],
  environment: process.env['CTF_ENVIRONMENT_ID'],
  host: 'preview.contentful.com'
});

const TurndownService = require('turndown');
const turndownService = new TurndownService();

module.exports = {
  pgClient,
  contentfulManagementClient,
  contentfulPreviewClient,
  turndownService
};
