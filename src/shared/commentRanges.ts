type Range = {
  start: number
  end: number
}

export function findCommentRanges(text: string): Range[] {
  // English comment: lightweight lexer to detect // and /* */ while respecting strings.
  const ranges: Range[] = []
  let i = 0

  let inLine = false
  let inBlock = false
  let inString: "'" | '"' | '`' | null = null
  let escape = false
  let start = 0

  while (i < text.length) {
    const ch = text[i]!
    const next = i + 1 < text.length ? text[i + 1]! : ''

    if (inString) {
      if (escape) {
        escape = false
        i++
        continue
      }
      if (ch === '\\') {
        escape = true
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      i++
      continue
    }

    if (inLine) {
      if (ch === '\n') {
        ranges.push({ start, end: i })
        inLine = false
      }
      i++
      continue
    }

    if (inBlock) {
      if (ch === '*' && next === '/') {
        ranges.push({ start, end: i + 2 })
        inBlock = false
        i += 2
        continue
      }
      i++
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      inLine = true
      start = i
      i += 2
      continue
    }

    if (ch === '/' && next === '*') {
      inBlock = true
      start = i
      i += 2
      continue
    }

    i++
  }

  if (inLine) ranges.push({ start, end: text.length })
  if (inBlock) ranges.push({ start, end: text.length })

  return ranges
}

export function isIndexInRanges(pos: number, ranges: Range[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) return true
  }
  return false
}

