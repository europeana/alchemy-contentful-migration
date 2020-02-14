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

For an overview of the available CLI commands, run:
```
npm run exhibition help
```

### Migrate

To perform a full migration of assets and entries:
```
npm run exhibition migrate
```

### Images

To migrate just the images from Alchemy into Contentful as assets, run:
```
npm run exhibition images
```

The sys ID of the asset will be derived from the MD5 hash of the Alchemy picture
UID, and only be stored if it does not already exist, so can be stopped and
resumed without starting over.

### Create

To create content entries in Contentful for all exhibitions, with translations:
```
npm run exhibition create
```

Or for a single exhibition:
```
npm run exhibition create <urlname>
```

### Credits

After entries are created, add the credits with:
```
npm run exhibition credits
```

### Clean

To delete exhibition content entries and all linked entries:
```
npm run exhibition clean
```
NB: this will not delete the assets created with the `images` script.

### Load

To inspect the data gathered for a given exhibition page from Alchemy:
```
npm run exhibition load <urlname> [locale]
```

### Translate

To analyse the alignment of essences of multilingual Alchemy pages, in order
to establish whether they may be reliably translated:
```
npm run exhibition translate
```
