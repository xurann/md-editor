import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { remark } from 'remark'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import './App.css'

type Theme = 'light' | 'dark'

type Draft = {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

type PersistedDocuments = {
  version: 1 | 2
  activeDraftId: string
  drafts: Draft[]
}

type CopyStatus = 'idle' | 'success' | 'error'

type EditorTransformResult = {
  content: string
  selectionStart: number
  selectionEnd: number
}

type UndoMode = 'same-draft' | 'restore-draft'

type UndoSnapshot = {
  draftId: string
  content: string
  selectionStart: number
  selectionEnd: number
  mode: UndoMode
  removeDraftId?: string
}

type SearchMatch = {
  start: number
  end: number
}

const STORAGE_KEYS = {
  content: 'md-editor:content',
  documents: 'md-editor:documents',
  theme: 'md-editor:theme',
} as const

const DEFAULT_MARKDOWN = `# 极简 Markdown 编辑器

在左侧书写，在右侧即时阅读。

## 为什么它看起来很轻

- 没有复杂工具栏
- 有舒服的留白
- 自动保存到本地
- 支持深色与浅色模式

> 写一点内容，看看预览如何随着文字呼吸。

### 一小段代码

\`\`\`ts
const message = 'Hello, Markdown'
console.log(message)
\`\`\`
`

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme)
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme
    }
  } catch {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createDraft(content = '', timestamp = Date.now(), title = '未命名'): Draft {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function getDraftTitle(content: string, fallbackIndex?: number) {
  const lines = content.split('\n')

  for (const line of lines) {
    const text = line.replace(/^#+\s*/, '').trim()
    if (text) {
      return text
    }
  }

  return fallbackIndex ? `未命名 ${fallbackIndex}` : '未命名'
}

function normalizeDraft(draft: Partial<Draft>, fallbackIndex?: number): Draft {
  const content = typeof draft.content === 'string' ? draft.content : ''
  const createdAt = typeof draft.createdAt === 'number' ? draft.createdAt : Date.now()
  const updatedAt = typeof draft.updatedAt === 'number' ? draft.updatedAt : createdAt

  return {
    id: typeof draft.id === 'string' && draft.id ? draft.id : crypto.randomUUID(),
    title: typeof draft.title === 'string' && draft.title.trim()
      ? draft.title.trim()
      : getDraftTitle(content, fallbackIndex),
    content,
    createdAt,
    updatedAt,
  }
}

function getInitialDocuments(): PersistedDocuments {
  const fallbackDraft = createDraft(DEFAULT_MARKDOWN, Date.now(), '欢迎使用')

  if (typeof window === 'undefined') {
    return {
      version: 2,
      activeDraftId: fallbackDraft.id,
      drafts: [fallbackDraft],
    }
  }

  try {
    const savedDocuments = window.localStorage.getItem(STORAGE_KEYS.documents)
    if (savedDocuments) {
      const parsed = JSON.parse(savedDocuments) as PersistedDocuments
      if (
        (parsed.version === 1 || parsed.version === 2)
        && Array.isArray(parsed.drafts)
        && parsed.drafts.length > 0
      ) {
        const drafts = parsed.drafts.map((draft, index) => normalizeDraft(draft, index + 1))
        const activeDraftId = drafts.some((draft) => draft.id === parsed.activeDraftId)
          ? parsed.activeDraftId
          : drafts[0].id

        return {
          version: 2,
          activeDraftId,
          drafts,
        }
      }
    }

    const legacyContent = window.localStorage.getItem(STORAGE_KEYS.content)
    if (legacyContent) {
      const migratedDraft = createDraft(legacyContent, Date.now(), getDraftTitle(legacyContent))
      return {
        version: 2,
        activeDraftId: migratedDraft.id,
        drafts: [migratedDraft],
      }
    }
  } catch {
    return {
      version: 2,
      activeDraftId: fallbackDraft.id,
      drafts: [fallbackDraft],
    }
  }

  return {
    version: 2,
    activeDraftId: fallbackDraft.id,
    drafts: [fallbackDraft],
  }
}

function getScrollProgress(element: HTMLElement) {
  const maxScrollTop = element.scrollHeight - element.clientHeight

  if (maxScrollTop <= 0) {
    return 0
  }

  return element.scrollTop / maxScrollTop
}

function syncScrollPosition(source: HTMLElement, target: HTMLElement) {
  const targetMaxScrollTop = target.scrollHeight - target.clientHeight

  if (targetMaxScrollTop <= 0) {
    return
  }

  target.scrollTop = getScrollProgress(source) * targetMaxScrollTop
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)

  return cleaned || 'untitled'
}

function getLineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextBreak = value.indexOf('\n', end)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak

  return { lineStart, lineEnd }
}

function getIndentWidth(line: string) {
  if (line.startsWith('\t')) {
    return 1
  }

  if (line.startsWith('  ')) {
    return 2
  }

  if (line.startsWith(' ')) {
    return 1
  }

  return 0
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

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [documents, setDocuments] = useState<PersistedDocuments>(getInitialDocuments)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const activeDraft = useMemo(
    () => documents.drafts.find((draft) => draft.id === documents.activeDraftId) ?? documents.drafts[0],
    [documents],
  )
  const markdown = activeDraft?.content ?? ''

  const searchMatches = useMemo<SearchMatch[]>(() => {
    const query = searchQuery.trim()
    if (!query) {
      return []
    }

    const source = markdown.toLowerCase()
    const keyword = query.toLowerCase()
    const matches: SearchMatch[] = []
    let fromIndex = 0

    while (fromIndex <= source.length) {
      const matchIndex = source.indexOf(keyword, fromIndex)
      if (matchIndex === -1) {
        break
      }

      matches.push({
        start: matchIndex,
        end: matchIndex + keyword.length,
      })
      fromIndex = matchIndex + keyword.length
    }

    return matches
  }, [markdown, searchQuery])

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    try {
      window.localStorage.setItem(STORAGE_KEYS.theme, theme)
    } catch {
      // Ignore storage failures and keep the theme in memory.
    }
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(documents))
    } catch {
      // Ignore storage failures and keep the content in memory.
    }
  }, [documents])

  useEffect(() => {
    if (copyStatus === 'idle') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopyStatus('idle')
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [copyStatus])

  useEffect(() => {
    if (currentMatchIndex >= searchMatches.length) {
      setCurrentMatchIndex(searchMatches.length > 0 ? 0 : 0)
    }
  }, [currentMatchIndex, searchMatches.length])

  useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [isSearchOpen])

  const focusEditorSelection = (selectionStart: number, selectionEnd: number, shouldResetScroll = false) => {
    requestAnimationFrame(() => {
      const editor = document.activeElement instanceof HTMLTextAreaElement
        ? document.activeElement
        : document.querySelector<HTMLTextAreaElement>('.editor-input')

      if (!editor) {
        return
      }

      if (shouldResetScroll) {
        editor.scrollTop = 0
        const preview = document.querySelector<HTMLDivElement>('.preview')
        if (preview) {
          preview.scrollTop = 0
        }
      }

      editor.focus()
      editor.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const focusSearchMatch = (matchIndex: number) => {
    const match = searchMatches[matchIndex]
    if (!match) {
      return
    }

    focusEditorSelection(match.start, match.end)
  }

  const updateActiveDraft = (content: string) => {
    setDocuments((current) => ({
      ...current,
      drafts: current.drafts.map((draft) =>
        draft.id === current.activeDraftId
          ? { ...draft, content, updatedAt: Date.now() }
          : draft,
      ),
    }))
  }

  const updateActiveDraftTitle = (title: string) => {
    setDocuments((current) => ({
      ...current,
      drafts: current.drafts.map((draft) =>
        draft.id === current.activeDraftId
          ? { ...draft, title, updatedAt: Date.now() }
          : draft,
      ),
    }))
  }

  const captureUndoSnapshot = (mode: UndoMode = 'same-draft', removeDraftId?: string) => {
    if (!activeDraft) {
      return
    }

    const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
    const currentValue = editor?.value ?? markdown
    const selectionStart = editor?.selectionStart ?? currentValue.length
    const selectionEnd = editor?.selectionEnd ?? currentValue.length

    setUndoSnapshot({
      draftId: activeDraft.id,
      content: currentValue,
      selectionStart,
      selectionEnd,
      mode,
      removeDraftId,
    })
  }

  const applyEditorTransform = (
    transform: (value: string, selectionStart: number, selectionEnd: number) => EditorTransformResult,
  ) => {
    const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
    if (!editor) {
      return
    }

    const currentValue = editor.value
    captureUndoSnapshot()
    const result = transform(currentValue, editor.selectionStart, editor.selectionEnd)
    updateActiveDraft(result.content)
    focusEditorSelection(result.selectionStart, result.selectionEnd)
  }

  const buildWrappedSelectionResult = (
    value: string,
    selectionStart: number,
    selectionEnd: number,
    prefix: string,
    suffix: string,
    placeholder: string,
  ) => {
    const selectedText = value.slice(selectionStart, selectionEnd)
    const content = selectedText || placeholder
    const replacement = `${prefix}${content}${suffix}`
    const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
    const nextStart = selectionStart + prefix.length
    const nextEnd = nextStart + content.length

    return {
      content: nextValue,
      selectionStart: nextStart,
      selectionEnd: nextEnd,
    }
  }

  const toggleWrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
      const wrappedStart = selectionStart - prefix.length
      const wrappedEnd = selectionEnd + suffix.length
      const hasWrappedSelection = wrappedStart >= 0
        && value.slice(wrappedStart, selectionStart) === prefix
        && value.slice(selectionEnd, wrappedEnd) === suffix

      if (hasWrappedSelection) {
        return {
          content: `${value.slice(0, wrappedStart)}${value.slice(selectionStart, selectionEnd)}${value.slice(wrappedEnd)}`,
          selectionStart: wrappedStart,
          selectionEnd: selectionEnd - prefix.length,
        }
      }

      return buildWrappedSelectionResult(value, selectionStart, selectionEnd, prefix, suffix, placeholder)
    })
  }

  const toggleLinkSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
      const selectedText = value.slice(selectionStart, selectionEnd)
      const hasOpeningBracket = selectionStart > 0 && value.slice(selectionStart - 1, selectionStart) === '['
      const hasLinkDivider = value.slice(selectionEnd, selectionEnd + 2) === ']('

      if (hasOpeningBracket && hasLinkDivider) {
        const closingParenIndex = value.indexOf(')', selectionEnd + 2)
        if (closingParenIndex !== -1) {
          return {
            content: `${value.slice(0, selectionStart - 1)}${selectedText}${value.slice(closingParenIndex + 1)}`,
            selectionStart: selectionStart - 1,
            selectionEnd: selectionEnd - 1,
          }
        }
      }

      const content = selectedText || '链接文本'
      const url = 'https://example.com'
      const replacement = `[${content}](${url})`
      const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`
      const nextStart = selectionStart + 1
      const nextEnd = nextStart + content.length

      return {
        content: nextValue,
        selectionStart: nextStart,
        selectionEnd: nextEnd,
      }
    })
  }

  const prefixSelectedLines = (prefix: string, placeholder: string) => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
      const { lineStart, lineEnd } = getLineBounds(value, selectionStart, selectionEnd)
      const selectedBlock = value.slice(lineStart, lineEnd)
      const source = selectedBlock || placeholder
      const lines = source.split('\n')
      const replacement = lines.map((line) => `${prefix}${line || placeholder}`).join('\n')
      const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`
      const nextSelectionStart = selectionStart + prefix.length
      const nextSelectionEnd = selectionEnd + prefix.length * lines.length

      return {
        content: nextValue,
        selectionStart: nextSelectionStart,
        selectionEnd: nextSelectionEnd,
      }
    })
  }

  const indentSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
      if (selectionStart === selectionEnd) {
        const replacement = '  '
        return {
          content: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
          selectionStart: selectionStart + replacement.length,
          selectionEnd: selectionStart + replacement.length,
        }
      }

      const { lineStart, lineEnd } = getLineBounds(value, selectionStart, selectionEnd)
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      const replacement = lines.map((line) => `  ${line}`).join('\n')

      return {
        content: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
        selectionStart: selectionStart + 2,
        selectionEnd: selectionEnd + lines.length * 2,
      }
    })
  }

  const unindentSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
      const { lineStart, lineEnd } = getLineBounds(value, selectionStart, selectionEnd)
      const block = value.slice(lineStart, lineEnd)
      const lines = block.split('\n')
      const removedByLine = lines.map(getIndentWidth)
      const replacement = lines.map((line, index) => line.slice(removedByLine[index])).join('\n')

      if (selectionStart === selectionEnd) {
        const removed = removedByLine[0] ?? 0
        const nextCaret = Math.max(lineStart, selectionStart - removed)

        return {
          content: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
          selectionStart: nextCaret,
          selectionEnd: nextCaret,
        }
      }

      const removedBeforeSelectionStart = Math.min(removedByLine[0] ?? 0, selectionStart - lineStart)
      const totalRemoved = removedByLine.reduce<number>((total, count) => total + count, 0)

      return {
        content: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
        selectionStart: selectionStart - removedBeforeSelectionStart,
        selectionEnd: selectionEnd - totalRemoved,
      }
    })
  }

  const createNewDraft = () => {
    const draft = createDraft('')
    captureUndoSnapshot('restore-draft', draft.id)

    setDocuments((current) => ({
      version: 2,
      activeDraftId: draft.id,
      drafts: [draft, ...current.drafts],
    }))

    setIsEditingTitle(true)
    focusEditorSelection(0, 0, true)
  }

  const clearActiveDraft = () => {
    captureUndoSnapshot()
    updateActiveDraft('')
    focusEditorSelection(0, 0, true)
  }

  const deleteActiveDraft = () => {
    if (!activeDraft) {
      return
    }

    setDocuments((current) => {
      if (current.drafts.length <= 1) {
        const fallbackDraft = createDraft('', Date.now(), '未命名')
        return {
          version: 2,
          activeDraftId: fallbackDraft.id,
          drafts: [fallbackDraft],
        }
      }

      const currentIndex = current.drafts.findIndex((draft) => draft.id === current.activeDraftId)
      const remainingDrafts = current.drafts.filter((draft) => draft.id !== current.activeDraftId)
      const nextDraft = remainingDrafts[Math.max(0, currentIndex - 1)] ?? remainingDrafts[0]

      return {
        ...current,
        activeDraftId: nextDraft.id,
        drafts: remainingDrafts,
      }
    })

    setIsEditingTitle(false)
    setUndoSnapshot(null)
  }

  const switchDraft = (draftId: string) => {
    setDocuments((current) => ({
      ...current,
      activeDraftId: draftId,
    }))
    setIsEditingTitle(false)

    requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
      const preview = document.querySelector<HTMLDivElement>('.preview')
      if (editor) {
        editor.scrollTop = 0
      }
      if (preview) {
        preview.scrollTop = 0
      }
    })
  }

  const undoLastEdit = () => {
    if (!undoSnapshot) {
      return
    }

    setDocuments((current) => {
      if (undoSnapshot.mode === 'same-draft' && current.activeDraftId !== undoSnapshot.draftId) {
        return current
      }

      let drafts = current.drafts

      if (undoSnapshot.removeDraftId) {
        drafts = drafts.filter((draft) => draft.id !== undoSnapshot.removeDraftId)
      }

      if (!drafts.some((draft) => draft.id === undoSnapshot.draftId)) {
        return current
      }

      return {
        ...current,
        activeDraftId: undoSnapshot.mode === 'restore-draft' ? undoSnapshot.draftId : current.activeDraftId,
        drafts: drafts.map((draft) =>
          draft.id === undoSnapshot.draftId
            ? { ...draft, content: undoSnapshot.content, updatedAt: Date.now() }
            : draft,
        ),
      }
    })

    focusEditorSelection(undoSnapshot.selectionStart, undoSnapshot.selectionEnd, true)
    setUndoSnapshot(null)
  }

  const commitActiveDraftTitle = () => {
    if (!activeDraft) {
      setIsEditingTitle(false)
      return
    }

    const nextTitle = activeDraft.title.trim() || '未命名'
    if (nextTitle !== activeDraft.title) {
      updateActiveDraftTitle(nextTitle)
    }

    setIsEditingTitle(false)
  }

  const startEditingTitle = () => {
    setIsEditingTitle(true)
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
  }

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitActiveDraftTitle()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      if (activeDraft) {
        updateActiveDraftTitle(activeDraft.title.trim() || '未命名')
      }
      setIsEditingTitle(false)
    }
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const content = await file.text()
      const nextTitle = sanitizeFileName(file.name.replace(/\.md$/i, '')) || '未命名'
      const draft = createDraft(content, Date.now(), nextTitle)
      captureUndoSnapshot('restore-draft', draft.id)

      setDocuments((current) => ({
        version: 2,
        activeDraftId: draft.id,
        drafts: [draft, ...current.drafts],
      }))

      setIsEditingTitle(false)
      focusEditorSelection(0, 0, true)
    } finally {
      event.target.value = ''
    }
  }

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus('success')
    } catch {
      setCopyStatus('error')
    }
  }

  const exportMarkdown = () => {
    const fileName = `${sanitizeFileName(activeDraft?.title || getDraftTitle(markdown))}.md`
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = fileName
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }

  const exportHtml = async () => {
    const title = activeDraft?.title?.trim() || '未命名'
    const fileName = `${sanitizeFileName(title)}.html`
    const html = String(await remark().use(remarkGfm).use(remarkBreaks).use(remarkHtml).process(markdown))
    const blob = new Blob([getExportHtmlDocument(title, html)], { type: 'text/html;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = fileName
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  }

  const handleEditorChange = (value: string) => {
    if (undoSnapshot) {
      setUndoSnapshot(null)
    }

    updateActiveDraft(value)
  }

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchQuery('')
    setCurrentMatchIndex(0)
  }

  const goToSearchMatch = (nextIndex: number) => {
    if (searchMatches.length === 0) {
      return
    }

    const safeIndex = (nextIndex + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(safeIndex)
    focusSearchMatch(safeIndex)
  }

  const canUndo = undoSnapshot !== null
    && (undoSnapshot.mode === 'restore-draft' || undoSnapshot.draftId === activeDraft?.id)
  const lineCount = markdown.length === 0 ? 0 : markdown.split('\n').length

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      goToSearchMatch(currentMatchIndex + (event.shiftKey ? -1 : 1))
    }
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const hasModifier = event.metaKey || event.ctrlKey

    if (event.key === 'Tab') {
      event.preventDefault()

      if (event.shiftKey) {
        unindentSelection()
      } else {
        indentSelection()
      }

      return
    }

    if (!hasModifier || event.altKey) {
      return
    }

    const key = event.key.toLowerCase()

    if (key === 'f') {
      event.preventDefault()
      openSearch()
      return
    }

    if (key === 'z' && !event.shiftKey) {
      if (canUndo) {
        event.preventDefault()
        undoLastEdit()
      }
      return
    }

    if (key === 'b') {
      event.preventDefault()
      toggleWrapSelection('**', '**', '粗体文本')
      return
    }

    if (key === 'i') {
      event.preventDefault()
      toggleWrapSelection('*', '*', '斜体文本')
      return
    }

    if (key === 'e') {
      event.preventDefault()
      toggleWrapSelection('`', '`', '代码')
      return
    }

    if (key === 'k') {
      event.preventDefault()
      toggleLinkSelection()
      return
    }

    if (key === 'n' && !event.shiftKey) {
      event.preventDefault()
      createNewDraft()
      return
    }

    if (key === 's') {
      event.preventDefault()
      exportMarkdown()
      return
    }

    if (key === 'c' && event.shiftKey) {
      event.preventDefault()
      void copyMarkdown()
    }
  }

  const syncScroll = (source: 'editor' | 'preview') => {
    if (window.innerWidth <= 960) {
      return
    }

    const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
    const preview = document.querySelector<HTMLDivElement>('.preview')

    if (!editor || !preview) {
      return
    }

    const scrollLock = preview.dataset.scrollLock
    if (scrollLock && scrollLock !== source) {
      return
    }

    preview.dataset.scrollLock = source

    if (source === 'editor') {
      syncScrollPosition(editor, preview)
    } else {
      syncScrollPosition(preview, editor)
    }

    requestAnimationFrame(() => {
      delete preview.dataset.scrollLock
    })
  }

  const isEmpty = markdown.trim().length === 0
  const matchCount = searchMatches.length

  return (
    <div className="app-shell">
      <header className="app-header">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden-file-input"
          onChange={handleFileImport}
        />
        <div>
          <p className="eyebrow">Markdown</p>
          <h1>极简编辑器</h1>
          <p className="subtitle">左边输入，右边实时预览，内容会自动保存在本地。</p>
        </div>

        <div className="header-actions">
          <span className="save-status">已自动保存</span>
          <button type="button" className="ghost-button" onClick={openFilePicker}>
            打开 .md
          </button>
          <button type="button" className="ghost-button" onClick={() => void copyMarkdown()}>
            {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'}
          </button>
          <button type="button" className="ghost-button" onClick={exportMarkdown}>
            导出 .md
          </button>
          <button type="button" className="ghost-button" onClick={() => void exportHtml()}>
            导出 HTML
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? '深色' : '浅色'}
          </button>
        </div>
      </header>

      <main className="editor-layout">
        <section className="panel">
          <div className="panel-header panel-header-stack">
            <div className="panel-header-row">
              <h2>输入</h2>
              <span>{markdown.length} 字符</span>
            </div>
            <div className="draft-controls">
              <div className="draft-main">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    className="draft-title-input"
                    value={activeDraft?.title ?? ''}
                    onChange={(event) => updateActiveDraftTitle(event.target.value)}
                    onBlur={commitActiveDraftTitle}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="输入文档名称"
                  />
                ) : (
                  <button type="button" className="draft-select draft-title-trigger" onClick={startEditingTitle}>
                    {activeDraft?.title?.trim() || '未命名'}
                  </button>
                )}
                <span className="draft-meta">{documents.drafts.length} 篇草稿</span>
              </div>
              <div className="draft-actions">
                <select
                  className="draft-select draft-switcher"
                  value={activeDraft?.id}
                  onChange={(event) => switchDraft(event.target.value)}
                >
                  {documents.drafts.map((draft, index) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.title || getDraftTitle(draft.content, index + 1)}
                    </option>
                  ))}
                </select>
                <button type="button" className="ghost-button" onClick={createNewDraft}>
                  新建
                </button>
                <button type="button" className="ghost-button" onClick={deleteActiveDraft}>
                  删除当前
                </button>
                <button type="button" className="ghost-button" onClick={clearActiveDraft}>
                  清空当前
                </button>
              </div>
            </div>
            {isSearchOpen ? (
              <div className="search-toolbar">
                <input
                  ref={searchInputRef}
                  type="text"
                  className="search-input"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setCurrentMatchIndex(0)
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="查找..."
                />
                <span className="search-meta">
                  {matchCount === 0 || searchQuery.trim() === '' ? '0 / 0' : `${currentMatchIndex + 1} / ${matchCount}`}
                </span>
                <button type="button" className="ghost-button search-button" onClick={() => goToSearchMatch(currentMatchIndex - 1)} disabled={matchCount === 0}>
                  上一个
                </button>
                <button type="button" className="ghost-button search-button" onClick={() => goToSearchMatch(currentMatchIndex + 1)} disabled={matchCount === 0}>
                  下一个
                </button>
                <button type="button" className="ghost-button search-button" onClick={closeSearch}>
                  关闭
                </button>
              </div>
            ) : null}
            <div className="format-toolbar" aria-label="Markdown 快捷格式化工具栏">
              <button type="button" className="ghost-button format-button" onClick={() => toggleWrapSelection('**', '**', '粗体文本')}>
                粗体
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => toggleWrapSelection('*', '*', '斜体文本')}>
                斜体
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => toggleWrapSelection('`', '`', '代码')}>
                代码
              </button>
              <button type="button" className="ghost-button format-button" onClick={toggleLinkSelection}>
                链接
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => prefixSelectedLines('> ', '引用内容')}>
                引用
              </button>
              <button type="button" className="ghost-button format-button" onClick={undoLastEdit} disabled={!canUndo}>
                撤销
              </button>
            </div>
            <p className="shortcut-hint">Cmd/Ctrl+F 查找 · Tab 缩进 · Cmd/Ctrl+B 粗体 · Cmd/Ctrl+K 链接 · Cmd/Ctrl+Z 撤销 · Cmd/Ctrl+S 导出</p>
          </div>
          <textarea
            className="editor-input"
            value={markdown}
            onChange={(event) => handleEditorChange(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            onScroll={() => syncScroll('editor')}
            placeholder="写点什么吧..."
            spellCheck="false"
          />
          <div className="editor-statusbar">
            <span>{markdown.length} 字符</span>
            <span>{lineCount} 行</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header panel-header-minimal">
            <h2>预览</h2>
            <span>{activeDraft?.title?.trim() || '未命名'}</span>
          </div>
          <div
            className={`preview ${isEmpty ? 'preview-empty' : ''}`}
            onScroll={() => syncScroll('preview')}
          >
            {isEmpty ? (
              <p>开始输入后，这里会实时显示排版效果。</p>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{markdown}</ReactMarkdown>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
