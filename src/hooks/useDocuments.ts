import { useEffect, useMemo, useState } from 'react'
import {
  createDraft,
  getInitialDocuments,
  saveDocuments,
} from '../services/documentStorage'
import type { Draft, UndoSnapshot } from '../types/documents'

export function useDocuments() {
  const [documents, setDocuments] = useState(getInitialDocuments)

  const activeDraft = useMemo(
    () => documents.drafts.find((draft) => draft.id === documents.activeDraftId) ?? documents.drafts[0],
    [documents],
  )

  useEffect(() => {
    saveDocuments(documents)
  }, [documents])

  const markdown = activeDraft?.content ?? ''

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

  const addDraft = (draft: Draft) => {
    setDocuments((current) => ({
      version: 2,
      activeDraftId: draft.id,
      drafts: [draft, ...current.drafts],
    }))
  }

  const createAndAddDraft = (content = '', title = '未命名') => {
    const draft = createDraft(content, Date.now(), title)
    addDraft(draft)
    return draft
  }

  const clearActiveDraft = () => {
    updateActiveDraft('')
  }

  const deleteActiveDraft = () => {
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
  }

  const switchDraft = (draftId: string) => {
    setDocuments((current) => ({
      ...current,
      activeDraftId: draftId,
    }))
  }

  const applyUndoSnapshot = (undoSnapshot: UndoSnapshot) => {
    let applied = false

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

      applied = true

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

    return applied
  }

  return {
    documents,
    activeDraft,
    markdown,
    updateActiveDraft,
    updateActiveDraftTitle,
    addDraft,
    createAndAddDraft,
    clearActiveDraft,
    deleteActiveDraft,
    switchDraft,
    applyUndoSnapshot,
  }
}
