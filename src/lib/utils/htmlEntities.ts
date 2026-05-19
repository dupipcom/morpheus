const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: '\u00A0',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
}
const MAX_DECODE_ITERATIONS = 3
const HTML_ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g

function decodeEntity(entity: string): string {
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const codePoint = Number.parseInt(entity.slice(2), 16)
    if (!Number.isNaN(codePoint) && Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return `&${entity};`
      }
    }
    return `&${entity};`
  }

  if (entity.startsWith('#')) {
    const codePoint = Number.parseInt(entity.slice(1), 10)
    if (!Number.isNaN(codePoint) && Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return `&${entity};`
      }
    }
    return `&${entity};`
  }

  return NAMED_ENTITIES[entity] ?? `&${entity};`
}

export function decodeHtmlEntities(value: string): string {
  let decoded = value

  // Decode repeatedly to handle common double-encoded metadata safely.
  for (let i = 0; i < MAX_DECODE_ITERATIONS; i += 1) {
    const next = decoded.replace(HTML_ENTITY_PATTERN, (_, entity: string) =>
      decodeEntity(entity)
    )

    if (next === decoded) {
      break
    }

    decoded = next
  }

  return decoded
}
