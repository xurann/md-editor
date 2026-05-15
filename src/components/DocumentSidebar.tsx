import { formatDraftUpdatedAt, getDraftTitle } from '../services/documentStorage'
import type { Draft } from '../types/documents'

type DocumentSidebarProps = {
  drafts: Draft[]
  activeDraftId?: string
  activeDraftTitle: string
  saveStatusText: string
  onCreateDraft: () => void
  onSwitchDraft: (draftId: string) => void
}

function DocumentSidebar({
  drafts,
  activeDraftId,
  activeDraftTitle,
  saveStatusText,
  onCreateDraft,
  onSwitchDraft,
}: DocumentSidebarProps) {
  return (
    <aside className="sidebar panel">
      <div className="panel-header sidebar-header">
        <div>
          <h2>我的文档</h2>
          <span className="sidebar-meta">{drafts.length} 篇草稿</span>
        </div>
        <button type="button" className="ghost-button sidebar-create" onClick={onCreateDraft}>
          新建
        </button>
      </div>

      <div className="sidebar-body">
        <div className="sidebar-current-draft">
          <span className="sidebar-current-label">当前文档</span>
          <strong>{activeDraftTitle}</strong>
          <span className="sidebar-meta">{saveStatusText}</span>
        </div>

        <div className="draft-list" aria-label="草稿列表">
          {drafts.map((draft, index) => {
            const draftTitle = draft.title || getDraftTitle(draft.content, index + 1)
            const isActive = draft.id === activeDraftId

            return (
              <button
                key={draft.id}
                type="button"
                className={`draft-list-item ${isActive ? 'draft-list-item-active' : ''}`}
                onClick={() => onSwitchDraft(draft.id)}
              >
                <span className="draft-list-title">{draftTitle}</span>
                <span className="draft-list-meta">{formatDraftUpdatedAt(draft.updatedAt)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export default DocumentSidebar
