require('dotenv').config();
const lodash = require('lodash');
const fs = require('fs');
const contentfulManagement = require('contentful-management');
const { params } = require('./params');
const { prepareToTranslate } = require('./prepareToTranslate');
const { doTranslations } = require('./translate');
const { prepareToUpdate } = require('./prepareToUpdate');
const { getData } = require('./helpers/get-data');
const _ = require("lodash");

localeMap = {
  'pt': 'Pt',
  'it': '',
  'es': 'Es',
  'de': 'De',
  'fr': 'Fr',
  'ro': 'Ro',
  'pl': 'Pl',
  'cz': 'Cz',
  'se': 'Se',
  'jp': 'Jp',
  'ee': 'Ee',
  'ru': 'Ru'
}

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = params.targetEnv; // typically 'master' unless you've changed it

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function updateEntries({ locale, fieldName, superData, isRichText }) {
  const localizedFieldName = `${fieldName}${localeMap[locale]}`;
  const dataField = 'superContent';
  const memo = { results: { total : 0 } }

  if (localeMap[locale] || locale === 'it') {
    memo.results.data = await getData({ superData, fieldName: localizedFieldName, isLocalized: true, locale, isRichText, memo: memo.results });
  } else {
      await getData({ fieldName });

      // prepareToTranslate({ locale, fieldName, isRichText });

      // await doTranslations({ locale, fieldName });

      prepareToUpdate({ locale, fieldName, isRichText });
  }

  const entriesToUpdate = JSON.parse(fs.readFileSync(`./migrations/data/destination-${locale}.json`, 'utf-8'));

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(environmentId);

  for (const entryToUpdate of entriesToUpdate['items']) {
    const entryId = entryToUpdate?.sys?.id;
    const newValue = entryToUpdate.fields.superData;

    if (!entryId && !newValue) {
      console.log("Err: Nothing to update with")
      return;
    }

    let contentfulLocale = 'en-US'
    if (locale === 'it') contentfulLocale = 'it-IT'

    try {
      let dest = fieldName
      const entry = await environment.getEntry(entryId);
      fs.writeFileSync(`./migrations/data/src-next-${locale}.json`, JSON.stringify(entry, null, 4), 'utf-8');
      const nextEntryFields = _.merge({}, entry.fields, entryToUpdate.fields)
      entry.fields = nextEntryFields
      dest = 'superData'
      fs.writeFileSync(`./migrations/data/next-${locale}.json`, JSON.stringify(entry, null, 4), 'utf-8');
      // await entry.update();
      console.log(`SUCCESS Updated entry ${entryId} on the field ${dest}.`);

    } catch (error) {
      console.error(`Error updating entry ${entryId}:`, error);
    }
  }
}


const updateAll = async () => {
  if(!params.slug) {
    console.log("-------- WARNING: UPDATING ALL CONTENT! ----------\nWaiting 15s for you to be sure......")
    await sleep(2000)
  } else {
    console.log(`-------- UPDATING ${params.slug} CONTENT! ----------\nWaiting 2s for you to be sure......`)
    await sleep(2000)
  }

  for (const locale of params.locale) {
    // update rich texts
    if (params?.richFieldName?.length) {
      const superData = {};
      for (const fieldName of params.richFieldName) {
        await updateEntries({ fieldName, locale, superData, isRichText: true })
      }
    }

    // update other fields
    if (params?.fieldName?.length) {
      const superData = {};
      for (const fieldName of params.fieldName) {
        await updateEntries({ fieldName, locale, superData, isRichText: false })
      }
    }
  }
}
updateAll();
