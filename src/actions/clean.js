// TODO: in future, move this to its own Node package
// TODO: check this cleans primayImageOfPage on exhibitionPage

const { contentfulManagement, contentfulPreviewClient } = require('../support/config');
const { padLog } = require('../support/utils');

const contentTypeId = 'exhibitionPage';

const contentfulContentTypeLinkFields = {};

const deleteEntry = async(id, depth = 0) => {
  let entry;
  try {
    entry = await contentfulManagement.environment.getEntry(id);
  } catch {
    entry = undefined;
  }

  if (!entry) {
    padLog('WARNING: no entry; skipping', depth);
    return;
  }

  if (entry.sys.publishedVersion) {
    padLog('- unpublishing', depth);
    try {
      entry = await entry.unpublish();
    } catch (e) {
      padLog('WARNING: failed to unpublish entry', depth + 1);
    }
  }

  padLog('- deleting', depth);
  try {
    entry = await entry.delete();
  } catch (e) {
    padLog('ERROR: failed to delete entry', depth + 1);
    throw e;
  }
};

// Returns true where an entry is linked to exactly once, otherwise false.
async function mayDeleteLinkedEntry(entry, depth = 0) {
  if (!entry || !entry.sys.revision) {
    return false;
  } else if (process.env['EXHIBITION_CLEAN_SKIP_ENTRY_DELETION_LINK_CHECK'] === '1') {
    return true;
  }

  const linksToEntry = await contentfulPreviewClient.getEntries({
    'links_to_entry': entry.sys.id
  })
    .then((response) => {
      return response.items.length;
    })
    .catch(() => {
      padLog(`Failed to get links to entry; skipping: ${entry.sys.id}`, depth);
      return false;
    });
  return linksToEntry === 1;
}

const getEntriesPage = async() => {
  const entries = await contentfulPreviewClient.getEntries({
    'content_type': contentTypeId,
    'include': 10
  })
    .then((response) => {
      return response.items;
    })
    .catch((e) => {
      padLog(`ERROR: Failed to get page of entries: ${contentTypeId}`);
      throw e;
    });
  return entries || [];
};

const clean = async() => {
  let entries;

  while ((entries = await getEntriesPage()).length > 0) {
    for (const entry of entries) {
      await cleanEntry(entry);
    }
  }
};

const cleanEntry = async(entry, depth = 0) => {
  padLog(`${entry.sys.contentType.sys.id}: ${entry.sys.id}`, depth);
  padLog('- cleaning', depth);

  // Clean any linked entries first
  const linkFields = await linkFieldIds(entry.sys.contentType.sys.id);
  for (const linkField of linkFields) {
    for (const linkedEntry of [].concat(entry.fields[linkField])) {
      const deletable = await mayDeleteLinkedEntry(linkedEntry, depth);
      if (deletable) {
        await cleanEntry(linkedEntry, depth + 1);
      }
    }
  }

  // Delete entry itself
  await deleteEntry(entry.sys.id, depth);
};

const isEntryLinkField = (field) => {
  return field.type === 'Link' && field.linkType === 'Entry';
};

const linkFieldIds = async(contentTypeId) => {
  if (!contentfulContentTypeLinkFields[contentTypeId]) {
    contentfulContentTypeLinkFields[contentTypeId] = [];

    const contentType = await contentfulPreviewClient.getContentType(contentTypeId);

    for (const field of contentType.fields) {
      if (isEntryLinkField(field.type) || (field.type === 'Array' && isEntryLinkField(field.items))) {
        contentfulContentTypeLinkFields[contentTypeId].push(field.id);
      }
    }
  }

  return contentfulContentTypeLinkFields[contentTypeId];
};

const cli = async() => {
  await contentfulManagement.connect();
  await clean();
};

module.exports = {
  clean,
  cli
};
