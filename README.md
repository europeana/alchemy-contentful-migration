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
npm run images
```

The sys ID of the asset will be derived from the MD5 hash of the Alchemy picture
UID, and only be stored if it does not already exist, so can be stopped and
resumed without starting over.

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

### Credits

After entries are created, add the credits with:
```
npm run credits
```
