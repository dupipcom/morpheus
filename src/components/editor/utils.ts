import type { SerializedEditorState } from 'lexical'

/**
 * Converts a Lexical SerializedEditorState to HTML string
 * Useful for storing content in databases or rendering in non-Lexical contexts
 */
export function lexicalToHtml(state: SerializedEditorState | null): string {
  if (!state || !state.root || !state.root.children) {
    return ''
  }

  const convertNode = (node: Record<string, unknown>): string => {
    switch (node.type) {
      case 'root':
        return (node.children as Record<string, unknown>[])
          .map(convertNode)
          .join('')

      case 'paragraph':
        const pContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return pContent ? `<p>${pContent}</p>` : '<p><br /></p>'

      case 'heading':
        const level = (node.tag as string) || 'h1'
        const hContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<${level}>${hContent}</${level}>`

      case 'quote':
        const qContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<blockquote>${qContent}</blockquote>`

      case 'list':
        const listTag = (node.listType as string) === 'number' ? 'ol' : 'ul'
        const listContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<${listTag}>${listContent}</${listTag}>`

      case 'listitem':
        const liContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<li>${liContent}</li>`

      case 'link':
        const url = (node.url as string) || '#'
        const linkContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<a href="${escapeHtmlAttribute(url)}" target="_blank" rel="noopener noreferrer">${linkContent}</a>`

      case 'code':
        const codeContent = (node.children as Record<string, unknown>[])
          ?.map(convertNode)
          .join('') || ''
        return `<pre><code>${codeContent}</code></pre>`

      case 'text':
        let text = escapeHtmlContent((node.text as string) || '')
        const format = (node.format as number) || 0

        // Apply text formatting (format is a bitmask)
        if (format & 1) text = `<strong>${text}</strong>` // bold
        if (format & 2) text = `<em>${text}</em>` // italic
        if (format & 4) text = `<s>${text}</s>` // strikethrough
        if (format & 8) text = `<u>${text}</u>` // underline
        if (format & 16) text = `<code>${text}</code>` // code

        return text

      case 'linebreak':
        return '<br />'

      default:
        // For unknown types, try to process children if they exist
        if (node.children && Array.isArray(node.children)) {
          return (node.children as Record<string, unknown>[])
            .map(convertNode)
            .join('')
        }
        return ''
    }
  }

  return convertNode(state.root as unknown as Record<string, unknown>)
}

/**
 * Index of special characters and their HTML entity equivalents
 * Provides full coverage for HTML escaping scenarios
 * 
 * @public - Export for reuse across the application
 */
export const HTML_ENTITIES = {
  // Critical for XSS prevention - always escape these
  '&': '&amp;',   // Ampersand - must be escaped first to avoid double-escaping
  '<': '&lt;',    // Less than - prevents opening tags
  '>': '&gt;',    // Greater than - prevents closing tags
  
  // Quote characters - context-dependent escaping
  '"': '&quot;',  // Double quote - always escape (used in attributes)
  "'": '&#039;',  // Single quote/apostrophe - escape in attributes only
  
  // Additional human-readable special characters for comprehensive coverage
  '`': '&#96;',   // Backtick - can be used in template literals
  '=': '&#61;',   // Equals - can be problematic in attributes
  
  // Unicode special characters that may cause issues
  '\u00A0': '&nbsp;',  // Non-breaking space
  '\u00A9': '&copy;',  // Copyright symbol
  '\u00AE': '&reg;',   // Registered trademark
  '\u2013': '&ndash;', // En dash
  '\u2014': '&mdash;', // Em dash
  '\u2018': '&lsquo;', // Left single quote
  '\u2019': '&rsquo;', // Right single quote
  '\u201C': '&ldquo;', // Left double quote
  '\u201D': '&rdquo;', // Right double quote
  '\u2026': '&hellip;', // Ellipsis
} as const

/**
 * Escapes HTML entities to prevent XSS in HTML content
 * 
 * Use this for text content within HTML elements where readability matters.
 * Single quotes are NOT escaped to preserve readability of contractions (it's, don't, etc.)
 * 
 * Example: <p>{escapeHtmlContent(userText)}</p>
 */
function escapeHtmlContent(text: string): string {
  return text
    .replace(/&/g, HTML_ENTITIES['&'])
    .replace(/</g, HTML_ENTITIES['<'])
    .replace(/>/g, HTML_ENTITIES['>'])
    .replace(/"/g, HTML_ENTITIES['"'])
    // Note: Single quotes intentionally NOT escaped for readability in content
}

/**
 * Escapes HTML entities for use in HTML attributes
 * 
 * Use this for values that will be placed inside HTML attributes.
 * More conservative - escapes single quotes for maximum security.
 * 
 * Example: <a href="{escapeHtmlAttribute(url)}">Link</a>
 */
function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, HTML_ENTITIES['&'])
    .replace(/</g, HTML_ENTITIES['<'])
    .replace(/>/g, HTML_ENTITIES['>'])
    .replace(/"/g, HTML_ENTITIES['"'])
    .replace(/'/g, HTML_ENTITIES["'"]) // Escape single quotes in attributes
}

/**
 * Escapes all special characters including single quotes
 * 
 * Use this when you need full escaping regardless of context,
 * or when dealing with user input that requires maximum sanitization.
 * 
 * Example: Sanitizing user input before database storage
 */
export function escapeHtmlStrict(text: string): string {
  return text
    .replace(/&/g, HTML_ENTITIES['&'])
    .replace(/</g, HTML_ENTITIES['<'])
    .replace(/>/g, HTML_ENTITIES['>'])
    .replace(/"/g, HTML_ENTITIES['"'])
    .replace(/'/g, HTML_ENTITIES["'"])
    .replace(/`/g, HTML_ENTITIES['`'])
    .replace(/=/g, HTML_ENTITIES['='])
}

/**
 * Extracts plain text from a Lexical SerializedEditorState
 */
export function lexicalToPlainText(state: SerializedEditorState | null): string {
  if (!state || !state.root || !state.root.children) {
    return ''
  }

  const extractText = (node: Record<string, unknown>): string => {
    if (node.type === 'text') {
      return (node.text as string) || ''
    }

    if (node.type === 'linebreak') {
      return '\n'
    }

    if (node.children && Array.isArray(node.children)) {
      const childText = (node.children as Record<string, unknown>[])
        .map(extractText)
        .join('')

      // Add newline after block-level elements
      if (['paragraph', 'heading', 'quote', 'listitem'].includes(node.type as string)) {
        return childText + '\n'
      }
      return childText
    }

    return ''
  }

  return extractText(state.root as unknown as Record<string, unknown>).trim()
}

/**
 * Checks if an editor state is empty
 */
export function isEditorEmpty(state: SerializedEditorState | null): boolean {
  const text = lexicalToPlainText(state)
  return !text || text.trim().length === 0
}

/**
 * Creates an empty Lexical editor state
 */
export function createEmptyState(): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [],
          direction: null,
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}
