import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import DocumentSidebar from './components/DocumentSidebar'
import { useDocumentSearch } from './hooks/useDocumentSearch'
import { useDocuments } from './hooks/useDocuments'
import { exportHtmlFile, exportMarkdownFile, getImportedDraftTitle } from './services/documentExport'
import {
  indentSelection,
  prefixSelectedLines,
  toggleLinkSelection,
  toggleWrapSelection,
  unindentSelection,
} from './services/editorTransforms'
import { createDraft, formatDraftUpdatedAt, getDraftTitle } from './services/documentStorage'
import type { EditorTransformResult } from './types/editor'
import type { UndoMode, UndoSnapshot } from './types/documents'
import './App.css'

type Theme = 'mist' | 'ink' | 'lake' | 'clay'

type ThemeOption = {
  value: Theme
  label: string
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'mist', label: '月白' },
  { value: 'ink', label: '玄墨' },
  { value: 'lake', label: '青湖' },
  { value: 'clay', label: '陶砂' },
]

type PanelSizes = {
  sidebar: number
  preview: number
}

type ResizeHandle = 'sidebar' | 'preview'

type CopyStatus = 'idle' | 'success' | 'error'
type AiPolishStatus = 'idle' | 'loading' | 'error'

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

const STORAGE_KEYS = {
  theme: 'md-editor:theme',
  panelSizes: 'md-editor:panel-sizes',
  sidebarOpen: 'md-editor:sidebar-open',
} as const

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'mist'
  }

  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme)
    if (savedTheme === 'mist' || savedTheme === 'ink' || savedTheme === 'lake' || savedTheme === 'clay') {
      return savedTheme
    }

    if (savedTheme === 'light') {
      return 'mist'
    }

    if (savedTheme === 'dark') {
      return 'ink'
    }
  } catch {
    return 'mist'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'ink' : 'mist'
}

function getInitialSidebarOpen() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEYS.sidebarOpen)
    if (saved === '0') {
      return false
    }

    if (saved === '1') {
      return true
    }
  } catch {
    return true
  }

  return true
}

function getInitialPanelSizes(): PanelSizes {
  if (typeof window === 'undefined') {
    return {
      sidebar: 240,
      preview: 380,
    }
  }

  try {
    const savedSizes = window.localStorage.getItem(STORAGE_KEYS.panelSizes)
    if (savedSizes) {
      const parsed = JSON.parse(savedSizes) as Partial<PanelSizes>
      const sidebar = typeof parsed.sidebar === 'number' ? parsed.sidebar : 240
      const preview = typeof parsed.preview === 'number' ? parsed.preview : 380

      return {
        sidebar: Math.min(360, Math.max(220, sidebar)),
        preview: Math.min(560, Math.max(320, preview)),
      }
    }
  } catch {
    return {
      sidebar: 240,
      preview: 380,
    }
  }

  return {
    sidebar: 240,
    preview: 380,
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

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [isSidebarOpen, setIsSidebarOpen] = useState(getInitialSidebarOpen)
  const [panelSizes, setPanelSizes] = useState<PanelSizes>(getInitialPanelSizes)
  const {
    documents,
    activeDraft,
    markdown,
    updateActiveDraft,
    updateActiveDraftTitle,
    addDraft,
    clearActiveDraft: clearDraftContent,
    deleteActiveDraft: removeActiveDraft,
    switchDraft: setActiveDraft,
    applyUndoSnapshot,
  } = useDocuments()
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [aiPolishStatus, setAiPolishStatus] = useState<AiPolishStatus>('idle')
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const {
    isSearchOpen,
    searchQuery,
    currentMatchIndex,
    searchMatches,
    setSearchQuery,
    setCurrentMatchIndex,
    openSearch,
    closeSearch,
    goToSearchMatch,
  } = useDocumentSearch(markdown)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const workspaceRef = useRef<HTMLElement | null>(null)

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
      window.localStorage.setItem(STORAGE_KEYS.sidebarOpen, isSidebarOpen ? '1' : '0')
    } catch {
      // Ignore storage failures and keep the sidebar state in memory.
    }
  }, [isSidebarOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.panelSizes, JSON.stringify(panelSizes))
    } catch {
      // Ignore storage failures and keep the panel sizes in memory.
    }
  }, [panelSizes])

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
    if (aiPolishStatus !== 'error') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setAiPolishStatus('idle')
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [aiPolishStatus])

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

  const moveToSearchMatch = (nextIndex: number) => {
    const match = goToSearchMatch(nextIndex)
    if (!match) {
      return
    }

    focusEditorSelection(match.start, match.end)
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

  const handleToggleWrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    applyEditorTransform((value, selectionStart, selectionEnd) =>
      toggleWrapSelection(value, selectionStart, selectionEnd, prefix, suffix, placeholder),
    )
  }

  const handleToggleLinkSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) =>
      toggleLinkSelection(value, selectionStart, selectionEnd),
    )
  }

  const handlePrefixSelectedLines = (prefix: string, placeholder: string) => {
    applyEditorTransform((value, selectionStart, selectionEnd) =>
      prefixSelectedLines(value, selectionStart, selectionEnd, prefix, placeholder),
    )
  }

  const handleIndentSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) =>
      indentSelection(value, selectionStart, selectionEnd),
    )
  }

  const handleUnindentSelection = () => {
    applyEditorTransform((value, selectionStart, selectionEnd) =>
      unindentSelection(value, selectionStart, selectionEnd),
    )
  }

  const createNewDraft = () => {
    const draft = createDraft('')
    captureUndoSnapshot('restore-draft', draft.id)
    addDraft(draft)

    setIsEditingTitle(true)
    focusEditorSelection(0, 0, true)
  }

  const clearActiveDraft = () => {
    captureUndoSnapshot()
    clearDraftContent()
    focusEditorSelection(0, 0, true)
  }

  const deleteActiveDraft = () => {
    if (!activeDraft) {
      return
    }

    removeActiveDraft()
    setIsEditingTitle(false)
    setUndoSnapshot(null)
  }

  const startResizing = (handle: ResizeHandle) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const workspace = workspaceRef.current
    if (!workspace || window.innerWidth <= 960) {
      return
    }

    event.preventDefault()
    const { left, width } = workspace.getBoundingClientRect()

    const updateSizes = (clientX: number) => {
      if (handle === 'sidebar') {
        const sidebar = Math.min(360, Math.max(220, clientX - left))
        setPanelSizes((current) => ({
          ...current,
          sidebar,
        }))
        return
      }

      const preview = Math.min(560, Math.max(320, left + width - clientX))
      setPanelSizes((current) => ({
        ...current,
        preview,
      }))
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateSizes(moveEvent.clientX)
    }

    const handlePointerUp = () => {
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    document.body.style.userSelect = 'none'
    updateSizes(event.clientX)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const switchDraft = (draftId: string) => {
    setActiveDraft(draftId)
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

    const applied = applyUndoSnapshot(undoSnapshot)
    if (!applied) {
      return
    }

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
      const nextTitle = getImportedDraftTitle(file.name)
      const draft = createDraft(content, Date.now(), nextTitle)
      captureUndoSnapshot('restore-draft', draft.id)
      addDraft(draft)

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

  const preserveEditorSelection = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  const handleAiPolish = async () => {
    if (aiPolishStatus === 'loading' || !activeDraft) {
      return
    }

    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim()
    if (!apiKey) {
      setAiPolishStatus('error')
      return
    }

    const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
    if (!editor) {
      setAiPolishStatus('error')
      return
    }

    const requestContent = editor.value
    const selectionStart = editor.selectionStart
    const selectionEnd = editor.selectionEnd
    const selectedText = requestContent.slice(selectionStart, selectionEnd)

    if (selectionStart === selectionEnd || selectedText.trim() === '') {
      setAiPolishStatus('error')
      return
    }

    const requestDraftId = activeDraft.id
    captureUndoSnapshot()
    setAiPolishStatus('loading')

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: '你是中文写作润色助手。请在尽量不改变原意、不改变作者语气的前提下，对用户提供的文本做轻度润色。\n\n要求：\n- 保留原作者语气、节奏和口语感\n- 不要写得过度完整、过度工整\n- 不要文学化，不要像公众号文章\n- 不要出现明显 AI 腔、模板感、说教感\n- 允许保留一些不那么完美但真实的表达\n- 尽量少改动，能不改就不改\n- 保持原有 Markdown 结构、段落、列表、标题、引用和代码块不变\n- 只返回润色后的文本，不要解释',
            },
            {
              role: 'user',
              content: selectedText,
            },
          ],
          stream: false,
        }),
      })

      const data = await response.json() as DeepSeekChatResponse
      const polishedText = data.choices?.[0]?.message?.content?.trim()

      if (!response.ok || !polishedText) {
        throw new Error(data.error?.message || 'AI polish failed')
      }

      const latestEditor = document.querySelector<HTMLTextAreaElement>('.editor-input')
      const latestContent = latestEditor?.value ?? markdown
      if (documents.activeDraftId !== requestDraftId || latestContent !== requestContent) {
        setAiPolishStatus('idle')
        return
      }

      const nextContent = `${requestContent.slice(0, selectionStart)}${polishedText}${requestContent.slice(selectionEnd)}`
      const nextSelectionEnd = selectionStart + polishedText.length
      updateActiveDraft(nextContent)
      focusEditorSelection(selectionStart, nextSelectionEnd)
      setAiPolishStatus('idle')
    } catch {
      setAiPolishStatus('error')
    }
  }

  const exportMarkdown = () => {
    exportMarkdownFile(markdown, activeDraft?.title || getDraftTitle(markdown))
  }

  const exportHtml = async () => {
    await exportHtmlFile(markdown, activeDraft?.title?.trim() || '未命名')
  }

  const handleEditorChange = (value: string) => {
    if (activeDraft && value !== markdown) {
      const editor = document.querySelector<HTMLTextAreaElement>('.editor-input')
      const nextSelectionStart = editor?.selectionStart ?? value.length
      const nextSelectionEnd = editor?.selectionEnd ?? nextSelectionStart
      const replacedLength = Math.max(0, markdown.length - value.length)
      const previousSelectionStart = Math.max(0, nextSelectionStart - Math.max(0, value.length - markdown.length))
      const previousSelectionEnd = Math.min(markdown.length, nextSelectionEnd + replacedLength)

      setUndoSnapshot({
        draftId: activeDraft.id,
        content: markdown,
        selectionStart: previousSelectionStart,
        selectionEnd: previousSelectionEnd,
        mode: 'same-draft',
      })
    }

    updateActiveDraft(value)
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
      moveToSearchMatch(currentMatchIndex + (event.shiftKey ? -1 : 1))
    }
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const hasModifier = event.metaKey || event.ctrlKey

    if (event.key === 'Tab') {
      event.preventDefault()

      if (event.shiftKey) {
        handleUnindentSelection()
      } else {
        handleIndentSelection()
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
      handleToggleWrapSelection('**', '**', '粗体文本')
      return
    }

    if (key === 'i') {
      event.preventDefault()
      handleToggleWrapSelection('*', '*', '斜体文本')
      return
    }

    if (key === 'e') {
      event.preventDefault()
      handleToggleWrapSelection('`', '`', '代码')
      return
    }

    if (key === 'k') {
      event.preventDefault()
      handleToggleLinkSelection()
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
  const activeDraftTitle = activeDraft?.title?.trim() || '未命名'
  const activeDraftUpdatedAt = activeDraft ? formatDraftUpdatedAt(activeDraft.updatedAt) : '--'
  const saveStatusText = `已自动保存 · ${activeDraftUpdatedAt}`
  const workspaceStyle = {
    '--sidebar-width': `${isSidebarOpen ? panelSizes.sidebar : 0}px`,
    '--preview-width': `${panelSizes.preview}px`,
  } as CSSProperties

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
        <div className="app-header-copy">
          <h1 className="brand-title">虚室</h1>
          <p className="subtitle brand-quote">虚室生白 吉祥止止</p>
        </div>

        <div className="header-actions header-actions-minimal">
          <button type="button" className="header-link header-link-plain" onClick={() => setIsSidebarOpen((current) => !current)}>
            文档
          </button>
          <details className="header-menu">
            <summary className="header-link header-link-plain">文件</summary>
            <div className="header-menu-panel">
              <button type="button" className="header-menu-item" onClick={openFilePicker}>打开 .md</button>
              <button type="button" className="header-menu-item" onClick={exportMarkdown}>导出 .md</button>
              <button type="button" className="header-menu-item" onClick={() => void exportHtml()}>导出 HTML</button>
              <button type="button" className="header-menu-item" onClick={deleteActiveDraft}>删除文档</button>
            </div>
          </details>
          <details className="header-menu">
            <summary className="header-link header-link-plain">{THEME_OPTIONS.find((option) => option.value === theme)?.label ?? '月白'}</summary>
            <div className="header-menu-panel">
              {THEME_OPTIONS.map((option) => (
                <button key={option.value} type="button" className="header-menu-item" onClick={() => setTheme(option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </header>

      <main ref={workspaceRef} className={`workspace-layout ${isSidebarOpen ? '' : 'workspace-layout-sidebar-hidden'}`.trim()} style={workspaceStyle}>
        {isSidebarOpen ? (
          <DocumentSidebar
            drafts={documents.drafts}
            activeDraftId={activeDraft?.id}
            activeDraftTitle={activeDraftTitle}
            saveStatusText={saveStatusText}
            onCreateDraft={createNewDraft}
            onSwitchDraft={switchDraft}
          />
        ) : null}

        {isSidebarOpen ? (
          <div
            className="panel-resizer"
            role="separator"
            aria-label="调整文档侧边栏宽度"
            aria-orientation="vertical"
            onPointerDown={startResizing('sidebar')}
          />
        ) : null}

        <section className="panel editor-panel">
          <div className="panel-header editor-panel-header">
            <div className="editor-heading">
              <span className="editor-label">当前文档</span>
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="draft-title-input editor-title-input"
                  value={activeDraft?.title ?? ''}
                  onChange={(event) => updateActiveDraftTitle(event.target.value)}
                  onBlur={commitActiveDraftTitle}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="输入文档名称"
                />
              ) : (
                <button type="button" className="editor-title-trigger" onClick={startEditingTitle}>
                  {activeDraftTitle}
                </button>
              )}
            </div>

            <div className="editor-panel-tools" aria-label="Markdown 快捷工具条">
              <div className="editor-tool-group" aria-label="格式工具">
                <button type="button" className="ghost-button format-button format-button-symbol" onMouseDown={preserveEditorSelection} onClick={openSearch} aria-label="查找" title="查找">
                  ⌕
                </button>
                <button type="button" className="ghost-button format-button format-button-symbol" onMouseDown={preserveEditorSelection} onClick={() => handleToggleWrapSelection('**', '**', '粗体文本')} aria-label="粗体，可再次点击取消" title="粗体，可再次点击取消">
                  B
                </button>
                <button type="button" className="ghost-button format-button format-button-symbol format-button-italic" onMouseDown={preserveEditorSelection} onClick={() => handleToggleWrapSelection('*', '*', '斜体文本')} aria-label="斜体，可再次点击取消" title="斜体，可再次点击取消">
                  I
                </button>
                <button type="button" className="ghost-button format-button format-button-symbol" onMouseDown={preserveEditorSelection} onClick={() => handleToggleWrapSelection('`', '`', '代码')} aria-label="代码，可再次点击取消" title="代码，可再次点击取消">
                  {'</>'}
                </button>
                <button type="button" className="ghost-button format-button format-button-symbol" onMouseDown={preserveEditorSelection} onClick={handleToggleLinkSelection} aria-label="链接，可再次点击取消" title="链接，可再次点击取消">
                  ⛓
                </button>
                <button type="button" className="ghost-button format-button format-button-symbol" onMouseDown={preserveEditorSelection} onClick={() => handlePrefixSelectedLines('> ', '引用内容')} aria-label="引用，可再次点击取消" title="引用，可再次点击取消">
                  ❝
                </button>
              </div>
              <div className="editor-tool-group editor-tool-group-secondary" aria-label="文档动作">
                <button type="button" className="ghost-button format-button" onMouseDown={preserveEditorSelection} onClick={() => void handleAiPolish()} disabled={aiPolishStatus === 'loading'}>
                  {aiPolishStatus === 'loading' ? '润色中...' : aiPolishStatus === 'error' ? '润色失败' : 'AI 润色'}
                </button>
                <button type="button" className="ghost-button format-button" onMouseDown={preserveEditorSelection} onClick={undoLastEdit} disabled={!canUndo}>
                  撤销
                </button>
                <button type="button" className="ghost-button format-button" onMouseDown={preserveEditorSelection} onClick={clearActiveDraft}>
                  清空
                </button>
                <button type="button" className="ghost-button format-button" onMouseDown={preserveEditorSelection} onClick={() => void copyMarkdown()}>
                  {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制'}
                </button>
              </div>
            </div>
          </div>

          {isSearchOpen ? (
            <div className="search-toolbar editor-search-toolbar">
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
                placeholder="查找当前文档..."
              />
              <span className="search-meta">
                {matchCount === 0 || searchQuery.trim() === '' ? '0 / 0' : `${currentMatchIndex + 1} / ${matchCount}`}
              </span>
              <button type="button" className="ghost-button search-button" onClick={() => moveToSearchMatch(currentMatchIndex - 1)} disabled={matchCount === 0}>
                上一个
              </button>
              <button type="button" className="ghost-button search-button" onClick={() => moveToSearchMatch(currentMatchIndex + 1)} disabled={matchCount === 0}>
                下一个
              </button>
              <button type="button" className="ghost-button search-button" onClick={closeSearch}>
                关闭
              </button>
            </div>
          ) : null}

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
            <span>{saveStatusText}</span>
            <span>{markdown.length} 字符</span>
            <span>{lineCount} 行</span>
            <span className="shortcut-hint">Cmd/Ctrl+F 查找 · Tab 缩进 · Cmd/Ctrl+B 粗体 · Cmd/Ctrl+K 链接 · Cmd/Ctrl+Z 撤销 · Cmd/Ctrl+S 导出</span>
          </div>
        </section>

        <div
          className="panel-resizer"
          role="separator"
          aria-label="调整预览区宽度"
          aria-orientation="vertical"
          onPointerDown={startResizing('preview')}
        />

        <section className="panel preview-panel">
          <div className="panel-header panel-header-minimal preview-panel-header">
            <h2>预览</h2>
            <span>{activeDraftTitle}</span>
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
