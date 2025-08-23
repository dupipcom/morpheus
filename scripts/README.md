# Translation Maintenance Scripts

This directory contains scripts for maintaining and checking translations across all language files.

## Scripts

### `translation-status.js`

A comprehensive status checker that:
- Verifies all language files have the same keys as the English reference file
- Identifies English text that may need translation
- Provides a summary report of translation completeness

**Usage:**
```bash
node scripts/translation-status.js
```

**Output:**
- Lists each language with missing keys (if any)
- Shows English text found in translations
- Provides summary statistics
- Gives recommendations for improvement

## Translation Status Summary

As of the last check:
- ✅ **29/29 languages (100%)** have all required keys
- ⚠️ **1,843 English texts** found across all languages (reduced from 2,112)
- 📊 **Average of 64 English texts per language** (reduced from 73)
- 🎯 **2 languages (AR, JA, ZH)** have no English text remaining

## Languages Supported

The application supports 29 languages:
- Arabic (ar)
- Bengali (bn)
- Catalan (ca)
- Czech (cs)
- Danish (da)
- German (de)
- Greek (el)
- Estonian (et)
- Basque (eu)
- Finnish (fi)
- French (fr)
- Galician (gl)
- Hebrew (he)
- Hindi (hi)
- Hungarian (hu)
- Italian (it)
- Japanese (ja)
- Korean (ko)
- Malay (ms)
- Dutch (nl)
- Punjabi (pa)
- Polish (pl)
- Portuguese (pt)
- Romanian (ro)
- Russian (ru)
- Swedish (sv)
- Turkish (tr)
- Chinese (zh)

## Best Practices

### When Adding New Keys

1. Always add new keys to `src/locales/en.json` first
2. Run `translation-status.js` to identify missing keys in other languages
3. Add appropriate translations for all languages
4. Consider using a translation service for consistency

### When Reviewing English Text

English text in translations may be intentional for:
- **Technical terms** that should remain in English (e.g., "Dashboard", "API")
- **Brand names** or proper nouns
- **Placeholder text** that needs translation
- **UI elements** that are commonly left in English
- **Weekly action descriptions** that are more complex to translate
- **Financial terms** that may be standardized across languages

### Translation Guidelines

1. **Consistency**: Use consistent terminology across the application
2. **Context**: Consider the context when translating (e.g., "Settings" vs "Configuration")
3. **Cultural Sensitivity**: Be aware of cultural differences in expressions
4. **Length**: Consider UI space constraints when translating
5. **Variables**: Preserve interpolation variables like `{date}`, `{count}`, etc.

## Maintenance Workflow

1. **Regular Checks**: Run `translation-status.js` weekly to catch missing keys
2. **New Features**: Always check translations when adding new features
3. **Quality Review**: Periodically review English text to identify translation opportunities
4. **User Feedback**: Consider user feedback about translation quality

## Files Structure

```
src/locales/
├── en.json          # Reference file (English)
├── ar.json          # Arabic
├── bn.json          # Bengali
├── ca.json          # Catalan
├── cs.json          # Czech
├── da.json          # Danish
├── de.json          # German
├── el.json          # Greek
├── et.json          # Estonian
├── eu.json          # Basque
├── fi.json          # Finnish
├── fr.json          # French
├── gl.json          # Galician
├── he.json          # Hebrew
├── hi.json          # Hindi
├── hu.json          # Hungarian
├── it.json          # Italian
├── ja.json          # Japanese
├── ko.json          # Korean
├── ms.json          # Malay
├── nl.json          # Dutch
├── pa.json          # Punjabi
├── pl.json          # Polish
├── pt.json          # Portuguese
├── ro.json          # Romanian
├── ru.json          # Russian
├── sv.json          # Swedish
├── tr.json          # Turkish
└── zh.json          # Chinese
```

## Troubleshooting

### Common Issues

1. **Missing Keys**: If a language is missing keys, they will be automatically added with English placeholders
2. **JSON Syntax Errors**: Check for trailing commas or missing brackets
3. **Encoding Issues**: Ensure files are saved in UTF-8 encoding

### Getting Help

- Check the console output for specific error messages
- Verify JSON syntax with a JSON validator
- Compare with the English reference file for structure 