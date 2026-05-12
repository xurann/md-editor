import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

type Theme = 'light' | 'dark'

type Draft = {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

type PersistedDocuments = {
  version: 1
  activeDraftId: string
  drafts: Draft[]
}

type CopyStatus = 'idle' | 'success' | 'error'

type EditorTransformResult = {
  content: string
  selectionStart: number
  selectionEnd: number
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

function createDraft(content = '', timestamp = Date.now()): Draft {
  return {
    id: crypto.randomUUID(),
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function getInitialDocuments(): PersistedDocuments {
  const fallbackDraft = createDraft(DEFAULT_MARKDOWN)

  if (typeof window === 'undefined') {
    return {
      version: 1,
      activeDraftId: fallbackDraft.id,
      drafts: [fallbackDraft],
    }
  }

  try {
    const savedDocuments = window.localStorage.getItem(STORAGE_KEYS.documents)
    if (savedDocuments) {
      const parsed = JSON.parse(savedDocuments) as PersistedDocuments
      if (
        parsed.version === 1
        && Array.isArray(parsed.drafts)
        && parsed.drafts.length > 0
        && parsed.drafts.some((draft) => draft.id === parsed.activeDraftId)
      ) {
        return parsed
      }
    }

    const legacyContent = window.localStorage.getItem(STORAGE_KEYS.content)
    if (legacyContent) {
      const migratedDraft = createDraft(legacyContent)
      return {
        version: 1,
        activeDraftId: migratedDraft.id,
        drafts: [migratedDraft],
      }
    }
  } catch {
    return {
      version: 1,
      activeDraftId: fallbackDraft.id,
      drafts: [fallbackDraft],
    }
  }

  return {
    version: 1,
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

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [documents, setDocuments] = useState<PersistedDocuments>(getInitialDocuments)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const scrollLockRef = useRef<'editor' | 'preview' | null>(null)

  const activeDraft = useMemo(
    () => documents.drafts.find((draft) => draft.id === documents.activeDraftId) ?? documents.drafts[0],
    [documents],
  )
  const markdown = activeDraft?.content ?? ''

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

  const focusEditorSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) {
        return
      }

      editor.focus()
      editor.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const resetScrollPosition = () => {
    if (editorRef.current) {
      editorRef.current.scrollTop = 0
    }

    if (previewRef.current) {
      previewRef.current.scrollTop = 0
    }
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

  const applyEditorTransform = (
    transform: (value: string, selectionStart: number, selectionEnd: number) => EditorTransformResult,
  ) => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    const result = transform(markdown, editor.selectionStart, editor.selectionEnd)
    updateActiveDraft(result.content)
    focusEditorSelection(result.selectionStart, result.selectionEnd)
  }

  const wrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    applyEditorTransform((value, selectionStart, selectionEnd) => {
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

    setDocuments((current) => ({
      version: 1,
      activeDraftId: draft.id,
      drafts: [draft, ...current.drafts],
    }))

    requestAnimationFrame(() => {
      resetScrollPosition()
      editorRef.current?.focus()
    })
  }

  const clearActiveDraft = () => {
    updateActiveDraft('')
    requestAnimationFrame(() => {
      resetScrollPosition()
      editorRef.current?.focus()
    })
  }

  const switchDraft = (draftId: string) => {
    setDocuments((current) => ({
      ...current,
      activeDraftId: draftId,
    }))

    requestAnimationFrame(() => {
      resetScrollPosition()
    })
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
    const fileName = `${sanitizeFileName(getDraftTitle(markdown))}.md`
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

    if (key === 'b') {
      event.preventDefault()
      wrapSelection('**', '**', '粗体文本')
      return
    }

    if (key === 'i') {
      event.preventDefault()
      wrapSelection('*', '*', '斜体文本')
      return
    }

    if (key === 'e') {
      event.preventDefault()
      wrapSelection('`', '`', '代码')
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

    const editor = editorRef.current
    const preview = previewRef.current

    if (!editor || !preview) {
      return
    }

    if (scrollLockRef.current && scrollLockRef.current !== source) {
      return
    }

    scrollLockRef.current = source

    if (source === 'editor') {
      syncScrollPosition(editor, preview)
    } else {
      syncScrollPosition(preview, editor)
    }

    requestAnimationFrame(() => {
      scrollLockRef.current = null
    })
  }

  const isEmpty = markdown.trim().length === 0

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Markdown</p>
          <h1>极简编辑器</h1>
          <p className="subtitle">左边输入，右边实时预览，内容会自动保存在本地。</p>
        </div>

        <div className="header-actions">
          <span className="save-status">已自动保存</span>
          <button type="button" className="ghost-button" onClick={() => void copyMarkdown()}>
            {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'}
          </button>
          <button type="button" className="ghost-button" onClick={exportMarkdown}>
            导出 .md
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
              <select
                className="draft-select"
                value={activeDraft?.id}
                onChange={(event) => switchDraft(event.target.value)}
              >
                {documents.drafts.map((draft, index) => (
                  <option key={draft.id} value={draft.id}>
                    {getDraftTitle(draft.content, index + 1)}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-button" onClick={createNewDraft}>
                新建
              </button>
              <button type="button" className="ghost-button" onClick={clearActiveDraft}>
                清空当前
              </button>
            </div>
            <div className="format-toolbar" aria-label="Markdown 快捷格式化工具栏">
              <button type="button" className="ghost-button format-button" onClick={() => wrapSelection('**', '**', '粗体文本')}>
                粗体
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => wrapSelection('*', '*', '斜体文本')}>
                斜体
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => wrapSelection('`', '`', '代码')}>
                代码
              </button>
              <button type="button" className="ghost-button format-button" onClick={() => prefixSelectedLines('> ', '引用内容')}>
                引用
              </button>
            </div>
            <p className="shortcut-hint">Tab 缩进 · Shift+Tab 反缩进 · Cmd/Ctrl+B 粗体 · Cmd/Ctrl+E 代码 · Cmd/Ctrl+S 导出</p>
          </div>
          <textarea
            ref={editorRef}
            className="editor-input"
            value={markdown}
            onChange={(event) => updateActiveDraft(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            onScroll={() => syncScroll('editor')}
            placeholder="写点什么吧..."
            spellCheck="false"
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>预览</h2>
            <span>{getDraftTitle(markdown)}</span>
          </div>
          <div
            ref={previewRef}
            className={`preview ${isEmpty ? 'preview-empty' : ''}`}
            onScroll={() => syncScroll('preview')}
          >
            {isEmpty ? (
              <p>开始输入后，这里会实时显示排版效果。</p>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
