# alchemy_contentful_migration
A Node.js script to migrate Europeana exhibitions from Alchemy CMS data into
Contentful.

## Installing Dependencies

Run:
```
npm install
```

## Setup

Set variable values in .env (copy .env.example) for:

* imageServer (include trailing back-slash)
* pgClient
  * user
  * host
  * database
  * port

and the contentful variables:

* cEnvironmentId
* cSpaceId
* accessToken

## Running the scripts

### Images

To migrate just the images from Alchemy into Contentful as assets, run:
```
node images.js
```

It will maintain a log of the images previously migrated in tmp/images.json and
so can be stopped and resumed without starting over.

### Entries

Comment out the 'clean' commands as per the contentful environment, and run:
```
node index.js
```

The script generates the file log.txt to record:

* publication errors
* missing rights statements
* cropped urls
* unused images
