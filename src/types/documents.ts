export type Draft = {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export type PersistedDocuments = {
  version: 1 | 2
  activeDraftId: string
  drafts: Draft[]
}

export type UndoMode = 'same-draft' | 'restore-draft'

export type UndoSnapshot = {
  draftId: string
  content: string
  selectionStart: number
  selectionEnd: number
  mode: UndoMode
  removeDraftId?: string
}
