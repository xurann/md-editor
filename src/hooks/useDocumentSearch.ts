import { useEffect, useMemo, useState } from 'react'
import type { SearchMatch } from '../types/editor'

export function useDocumentSearch(markdown: string) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

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
    if (currentMatchIndex >= searchMatches.length) {
      setCurrentMatchIndex(0)
    }
  }, [currentMatchIndex, searchMatches.length])

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
      return null
    }

    const safeIndex = (nextIndex + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(safeIndex)
    return searchMatches[safeIndex]
  }

  return {
    isSearchOpen,
    searchQuery,
    currentMatchIndex,
    searchMatches,
    setSearchQuery,
    setCurrentMatchIndex,
    openSearch,
    closeSearch,
    goToSearchMatch,
  }
}
