const fs = require('fs');
const _ = require('lodash');
const { params } = require('../params');


const reinsertRichField = ({ locale, fieldName }) => {
    // const locale = params.locale
    // const fieldName = params.fieldName
    function updateOriginalWithFilteredData(originalFilePath, filteredDataPath) {
        // Load the original exported JSON file and the filtered data
        const originalData = JSON.parse(fs.readFileSync(originalFilePath, 'utf-8'));
        const filteredData = JSON.parse(fs.readFileSync(filteredDataPath, 'utf-8'));

        function replaceNode(content, path, value) {
            console.log({ path, content })
            // Base case: If the path is empty or the content is undefined, just return.
            if (!path.length || !content) return;

            // Get the next index from the path.
            const nextIndex = path[0];

            // If we've reached the target node (last index in the path), update its value.
            if (path.length === 1 && content[nextIndex] && content[nextIndex].nodeType === 'text') {
                if (content[nextIndex].value === value) return;
                console.log("REPLACED", value)
                content[nextIndex].value = value;
                return;
            }

            // If the current node has further nested content, continue the recursion.
            if (content[nextIndex] && content[nextIndex].content) {
                replaceNode(content[nextIndex].content, path.slice(1), value);
            }
        }

        // For each filtered data item, navigate to the original entry and replace
        const _next = filteredData.map(dataItem => {
            const entry = originalData.items.find(entry => entry.sys.id === dataItem.entryId);
            if (entry && entry.fields) {
                console.log({ entry })
                const nextData =  _.merge({}, entry.fields.superData, { [locale]: { [fieldName]: entry.fields[fieldName] } });
                entry.fields.superData = nextData;
                const memo = entry.fields.superData[locale][fieldName].content
                replaceNode(memo, dataItem.path, dataItem.value);
                entry.fields.superData[locale][fieldName].content = memo
            }
            console.log({ entry, eid: dataItem })
            return entry;
        });

        console.log({ field: _next, filteredData })
        const nextItems = originalData.items.map(item => {
            item.fields = { superData: { ['en-US']: item.fields.superData } }
            return item
        })
        originalData.items = nextItems
        // console.log({ sd: nextItems })

        // Save the updated data back to the original file
        fs.writeFileSync(`./migrations/data/destination-${locale}.json`, JSON.stringify(originalData, null, 4), 'utf-8');
        console.log("Updated the original data with filtered results.");
    }

    updateOriginalWithFilteredData(`./migrations/data/export.json`, `./migrations/data/migration-${locale}.json`);
}

module.exports = {
    reinsertRichField
};
