# alchemy_contentful_migration
A Node.js script to migrate europeana Alchemy CMS data into contentful.
Based on [this gist](https://gist.github.com/andyjmaclean/99d86abddc366f4c3864124a287a59f0).

## Installing Dependencies

run:

    npm install

## Setup
Set Variable values in .env (copy .env.example) for:

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

## Running the script

comment out the 'clean' commands as per the contentful environment

    run node index.js

The script generates the file log.txt to record:

* publication errors
* missing rights statements
* cropped urls
* unused images
