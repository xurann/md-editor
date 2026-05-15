import { remark } from 'remark'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import { getDraftTitle } from './documentStorage'

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)

  return cleaned || 'untitled'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getExportHtmlDocument(title: string, html: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f1ea;
      --surface: #fffdfa;
      --text: #302b25;
      --heading: #171411;
      --muted: #7c746b;
      --border: rgba(71, 60, 48, 0.1);
      --border-strong: rgba(71, 60, 48, 0.18);
      --link: #6d5948;
      --code-bg: rgba(53, 42, 32, 0.055);
      --shadow: 0 18px 40px rgba(34, 27, 20, 0.07);
      --sans: Inter, 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mono: 'SFMono-Regular', 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 48px 20px;
      background:
        radial-gradient(circle at top, rgba(124, 110, 93, 0.07), transparent 34%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 32%),
        var(--bg);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.8;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    main {
      width: min(860px, 100%);
      margin: 0 auto;
      padding: 40px 38px 44px;
      border: 1px solid var(--border);
      border-radius: 28px;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    article {
      color: var(--text);
      word-break: break-word;
      font-size: 16px;
      letter-spacing: 0.01em;
    }
    article > *:first-child { margin-top: 0; }
    article > *:last-child { margin-bottom: 0; }
    article h1, article h2, article h3 {
      color: var(--heading);
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    article h1 {
      margin: 0 0 1rem;
      font-size: 2.3rem;
      line-height: 1.12;
    }
    article h2 {
      margin: 2.4rem 0 0.75rem;
      font-size: 1.35rem;
      line-height: 1.28;
    }
    article h3 {
      margin: 2rem 0 0.65rem;
      font-size: 1.05rem;
      line-height: 1.35;
    }
    article p, article ul, article ol, article blockquote, article pre, article table {
      margin: 0 0 1.1rem;
    }
    article ul, article ol { padding-left: 1.2rem; }
    article li + li { margin-top: 0.3rem; }
    article strong {
      color: var(--heading);
      font-weight: 600;
    }
    article em {
      font-style: italic;
      font-synthesis: style;
    }
    article blockquote {
      margin-left: 0;
      padding: 0.2rem 0 0.2rem 0.95rem;
      border-left: 2px solid var(--border-strong);
      color: var(--muted);
      background: rgba(255, 251, 246, 0.72);
      border-radius: 0 12px 12px 0;
    }
    article a {
      color: var(--link);
      text-decoration: none;
    }
    article a:hover { text-decoration: underline; }
    article code {
      padding: 0.14rem 0.38rem;
      background: var(--code-bg);
      border-radius: 7px;
      color: var(--heading);
      font-size: 0.9em;
      font-family: var(--mono);
    }
    article pre {
      padding: 18px 20px;
      overflow: auto;
      border-radius: 16px;
      background: var(--code-bg);
      border: 1px solid var(--border);
    }
    article pre code {
      padding: 0;
      background: transparent;
      color: inherit;
    }
    article hr {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }
    article table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
    }
    article th, article td {
      padding: 0.55rem 0.65rem;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }
    @media (max-width: 720px) {
      body { padding: 24px 14px; }
      main { padding: 26px 22px 30px; }
      article h1 { font-size: 1.85rem; }
    }
  </style>
</head>
<body>
  <main>
    <article>${html}</article>
  </main>
</body>
</html>`
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export function getImportedDraftTitle(fileName: string) {
  return sanitizeFileName(fileName.replace(/\.md$/i, '')) || '未命名'
}

export function exportMarkdownFile(markdown: string, title?: string) {
  const fileName = `${sanitizeFileName(title || getDraftTitle(markdown))}.md`
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  downloadBlob(blob, fileName)
}

export async function exportHtmlFile(markdown: string, title?: string) {
  const safeTitle = title?.trim() || '未命名'
  const fileName = `${sanitizeFileName(safeTitle)}.html`
  const html = String(await remark().use(remarkGfm).use(remarkBreaks).use(remarkHtml).process(markdown))
  const blob = new Blob([getExportHtmlDocument(safeTitle, html)], { type: 'text/html;charset=utf-8' })
  downloadBlob(blob, fileName)
}
