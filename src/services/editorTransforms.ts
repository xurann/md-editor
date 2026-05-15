import type { EditorTransformResult } from '../types/editor'

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

function buildWrappedSelectionResult(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): EditorTransformResult {
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

export function toggleWrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder: string,
): EditorTransformResult {
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
}

export function toggleLinkSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): EditorTransformResult {
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
}

export function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  placeholder: string,
): EditorTransformResult {
  const { lineStart, lineEnd } = getLineBounds(value, selectionStart, selectionEnd)
  const selectedBlock = value.slice(lineStart, lineEnd)
  const source = selectedBlock || placeholder
  const lines = source.split('\n')
  const canUnprefix = selectedBlock.length > 0 && lines.every((line) => line.startsWith(prefix))

  if (canUnprefix) {
    const replacement = lines.map((line) => line.slice(prefix.length)).join('\n')
    const removedBeforeSelectionStart = Math.min(prefix.length, selectionStart - lineStart)
    const removedByLines = lines.reduce((total, line, index) => {
      if (index === 0) {
        return total
      }

      return total + Math.min(prefix.length, line.length)
    }, 0)

    return {
      content: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
      selectionStart: selectionStart - removedBeforeSelectionStart,
      selectionEnd: selectionEnd - removedByLines - removedBeforeSelectionStart,
    }
  }

  const replacement = lines.map((line) => `${prefix}${line || placeholder}`).join('\n')
  const nextValue = `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`
  const nextSelectionStart = selectionStart + prefix.length
  const nextSelectionEnd = selectionEnd + prefix.length * lines.length

  return {
    content: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  }
}

export function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): EditorTransformResult {
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
}

export function unindentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): EditorTransformResult {
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
}
