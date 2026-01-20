#!/bin/bash

# This script will help identify missing keys in locale files
# comparing them against en.json

echo "Analyzing locale files..."

# Count lines in en.json
EN_LINES=$(wc -l < src/locales/en.json)
echo "en.json has $EN_LINES lines"

# Check all other locale files
for file in src/locales/*.json; do
    if [ "$file" != "src/locales/en.json" ]; then
        LINES=$(wc -l < "$file")
        DIFF=$((EN_LINES - LINES))
        FILENAME=$(basename "$file")
        echo "$FILENAME: $LINES lines (difference: $DIFF)"
    fi
done
