/**
 * Public slug kit
 * buildPublicSlug: slugified name + '-' + last 4 chars of the id.
 * ensureUniqueSlug: retry helper appending -1, -2, ... then a timestamp.
 */

/**
 * URL-safe slug from a name (algorithm shared with the legacy slugifyList)
 */
export function slugify(name: string | null | undefined): string {
  return (name || 'list')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'list'
}

/**
 * Generate a public URL slug: slugify(name)-<last 4 chars of id>
 */
export function buildPublicSlug(name: string | null | undefined, id: string): string {
  return `${slugify(name)}-${id.slice(-4)}`
}

/**
 * Retry helper: if a candidate slug is already taken, append -1, -2, ... up to
 * maxAttempts, then fall back to a timestamp suffix.
 */
export async function ensureUniqueSlug(
  slug: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxAttempts = 5
): Promise<string> {
  let candidate = slug
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!(await isTaken(candidate))) return candidate
    candidate = `${slug}-${attempt + 1}`
  }
  return `${candidate}-${Date.now()}`
}
