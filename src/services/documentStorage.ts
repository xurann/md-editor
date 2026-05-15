import type { Draft, PersistedDocuments } from '../types/documents'

export const DOCUMENT_STORAGE_KEYS = {
  content: 'md-editor:content',
  documents: 'md-editor:documents',
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

export function createDraft(content = '', timestamp = Date.now(), title = '未命名'): Draft {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function getDraftTitle(content: string, fallbackIndex?: number) {
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

function createFallbackDocuments() {
  const fallbackDraft = createDraft(DEFAULT_MARKDOWN, Date.now(), '欢迎使用')

  return {
    version: 2 as const,
    activeDraftId: fallbackDraft.id,
    drafts: [fallbackDraft],
  }
}

export function getInitialDocuments(): PersistedDocuments {
  const fallbackDocuments = createFallbackDocuments()

  if (typeof window === 'undefined') {
    return fallbackDocuments
  }

  try {
    const savedDocuments = window.localStorage.getItem(DOCUMENT_STORAGE_KEYS.documents)
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

    const legacyContent = window.localStorage.getItem(DOCUMENT_STORAGE_KEYS.content)
    if (legacyContent) {
      const migratedDraft = createDraft(legacyContent, Date.now(), getDraftTitle(legacyContent))
      return {
        version: 2,
        activeDraftId: migratedDraft.id,
        drafts: [migratedDraft],
      }
    }
  } catch {
    return fallbackDocuments
  }

  return fallbackDocuments
}

export function saveDocuments(documents: PersistedDocuments) {
  try {
    window.localStorage.setItem(DOCUMENT_STORAGE_KEYS.documents, JSON.stringify(documents))
  } catch {
    // Ignore storage failures and keep the documents in memory.
  }
}

export function formatDraftUpdatedAt(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天'
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}
