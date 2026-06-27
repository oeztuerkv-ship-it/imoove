import type { LegalPageDto, LegalPageSlug } from "../db/legalPagesData";

const BASE_STYLES = `
    body { margin: 0; font-family: "DM Sans", system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 8px 24px rgba(15,23,42,0.05); }
    h1 { margin: 0 0 24px; font-size: 1.7rem; }
    h2 { margin: 32px 0 8px; font-size: 1.1rem; color: #1e293b; border-top: 1px solid #f1f5f9; padding-top: 20px; }
    h3 { margin: 16px 0 6px; font-size: 0.95rem; color: #334155; }
    p { margin: 0 0 10px; line-height: 1.7; }
    ul { margin: 0 0 10px; padding-left: 20px; line-height: 1.7; }
    a { color: #be123c; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .links { margin-top: 24px; display: flex; gap: 14px; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.9rem; }
    th { background: #f8fafc; text-align: left; padding: 8px 12px; border: 1px solid #e2e8f0; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: top; }
`;

const TITLE_SUFFIX: Record<LegalPageSlug, string> = {
  agb: "AGB",
  datenschutz: "Datenschutz",
  impressum: "Impressum",
};

export function renderLegalPageHtml(page: LegalPageDto): string {
  const browserTitle = page.pageTitle?.trim() || TITLE_SUFFIX[page.slug];
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(browserTitle)} | ONRODA</title>
  <link rel="stylesheet" href="/onroda-brand.css" />
  <style>${BASE_STYLES}
  </style>
</head>
<body>
  <main class="wrap">
    <article class="card">
${page.bodyHtml}
    </article>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
