function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Ersetzt `<meta name="description" content="…">` — Hero-Subline als SEO-Description. */
export function injectMarketingMetaDescription(html: string, description: string): string {
  const safe = escapeHtmlAttr(description.trim());
  if (!safe) return html;
  return html.replace(
    /(<meta\s[\s\S]*?name\s*=\s*["']description["'][\s\S]*?content\s*=\s*["'])[^"']*(["'][\s\S]*?\/?>)/i,
    `$1${safe}$2`,
  );
}
