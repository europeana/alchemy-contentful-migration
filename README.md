# exhibitions-alchemy-contentful-migration
A Node.js script to migrate Europeana exhibitions from Alchemy CMS data into
Contentful.

## Installation

Run:
```
npm install
```

## Configuration

Copy .env.example to .env and set environment variables for Contentful,
PostgreSQL and Alchemy.

## Usage

For an overview of the available CLI commands, run:
```
npm run exhibition help
```

### Migrate

To perform a full migration of assets and entries:
```
npm run exhibition migrate
```
This is equivalent to running:
```
npm run exhibition images
npm run exhibition assets cache
npm run exhibition create
npm run exhibition credits
```

### Images

To migrate just the images from Alchemy into Contentful as assets, run:
```
npm run exhibition images
```

The sys ID of the asset will be derived from the MD5 hash of the Alchemy picture
UID, and only be stored if it does not already exist, so can be stopped and
resumed without starting over.

### Assets

To write a cache of the available asset IDs in the Contentful environment to
tmp/assetIds.json, for later use by other scripts, speeding up their run time:
```
npm run assets cache
```

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
NB: this does not include translations. To include them, use `translate`.

### Translate

To analyse the alignment of essences of multilingual Alchemy pages, in order
to establish whether they may be reliably translated:
```
npm run exhibition translate
```
Or to output the full metadata with translations for one exhibition:
```
npm run exhibition translate <urlname>
```

## License

Licensed under the EUPL v1.2.

For full details, see [LICENSE.md](LICENSE.md).
