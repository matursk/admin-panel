import React, { forwardRef, useEffect, useRef, useState } from 'react'

/**
 * MarkdownTextarea
 * mode: 'inline' | 'plain' (default 'plain')
 */
const MarkdownTextarea = forwardRef(function MarkdownTextarea(
  {
    value,
    onChange,
    placeholder,
    className = '',
    textareaClassName = 'textarea textarea-bordered min-h-60',
    id,
    name,
    required,
    mode = 'plain',
  },
  forwardedRef,
) {
  // Plain mode: no overlay, just a regular textarea
  if (mode !== 'inline') {
    return (
      <textarea
        id={id}
        name={name}
        ref={forwardedRef}
        className={textareaClassName + ' w-full'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
      />
    )
  }

  // Inline mode below
  const localTextareaRef = useRef(null)
  const textareaRef = forwardedRef || localTextareaRef
  const overlayRef = useRef(null)
  const [caretIndex, setCaretIndex] = useState(0)
  const imageRangesRef = useRef([])

  const emitChange = (nextValue, nextCaret) => {
    if (typeof onChange === 'function') {
      onChange({ target: { value: nextValue } })
    }
    const el = textareaRef.current
    if (el && Number.isFinite(nextCaret)) {
      requestAnimationFrame(() => { el.setSelectionRange(nextCaret, nextCaret) })
    }
  }

  const escapeHtml = (text) => String(text)
      .replaceAll(/&/g, '&amp;')
      .replaceAll(/</g, '&lt;')
      .replaceAll(/>/g, '&gt;')
      .replaceAll(/"/g, '&quot;')
      .replaceAll(/'/g, '&#39;')

  const renderInline = (rawText) => {
    let html = escapeHtml(rawText)
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, content) => {
      const level = hashes.length
      const size = Math.max(1, 7 - level)
      return `<span style="color:rgba(255,255,255,.45)">${hashes}&nbsp;</span><span style="font-weight:700;font-size:${size * 0.2 + 0.9}rem">${content}</span>`
    })
    html = html.replace(/\*\*([^\n*][\s\S]*?)\*\*/g, (_m, inner) => `<span style="color:rgba(255,255,255,.45)">**</span><span style="font-weight:700">${inner}</span><span style="color:rgba(255,255,255,.45)">**</span>`)
    html = html.replace(/_(?!\s)([^\n_][\s\S]*?)_/g, (_m, inner) => `<span style="color:rgba(255,255,255,.45)">_</span><span style="font-style:italic">${inner}</span><span style="color:rgba(255,255,255,.45)">_</span>`)
    html = html.replace(/~~([^\n~][\s\S]*?)~~/g, (_m, inner) => `<span style="color:rgba(255,255,255,.45)">~~</span><span style="text-decoration:line-through">${inner}</span><span style="color:rgba(255,255,255,.45)">~~</span>`)
    html = html.replace(/`([^`\n]+)`/g, (_m, code) => `<span style="color:rgba(255,255,255,.45)">\`</span><span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; background:rgba(255,255,255,.06); padding:0 .25rem; border-radius:.25rem">${code}</span><span style="color:rgba(255,255,255,.45)">\`</span>`)
    html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_m, label, url) => {
      const marker = '<span style="color:rgba(255,255,255,.45)">[</span>'
      const marker2 = '<span style="color:rgba(255,255,255,.45)">]</span>'
      const marker3 = '<span style="color:rgba(255,255,255,.45)">(</span>'
      const marker4 = '<span style="color:rgba(255,255,255,.45)">)</span>'
      return `${marker}<span style="text-decoration:underline">${label}</span>${marker2}${marker3}<span style="opacity:.9">${url}</span>${marker4}`
    })
    return html
  }

  useEffect(() => {
    const ranges = []
    const imgRe = /!\[[^\]]*\]\([^\)\s]+\)/g
    for (const m of String(value || '').matchAll(imgRe)) {
      const start = m.index || 0
      const end = start + m[0].length - 1
      ranges.push({ start, end })
    }
    imageRangesRef.current = ranges
  }, [value])

  const findRangeContaining = (pos) => {
    const ranges = imageRangesRef.current
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i]
      if (pos >= r.start && pos <= r.end) return r
    }
    return null
  }

  const snapCaretFrom = (pos, bias = 'forward') => {
    const r = findRangeContaining(pos)
    if (!r) return pos
    return bias === 'backward' ? r.start : r.end + 1
  }

  const highlightMarkdown = (raw) => {
    const imgRe = /!\[([^\]]*)\]\(([^)\s]+)\)/g
    let result = ''
    let last = 0
    for (const m of raw.matchAll(imgRe)) {
      const start = m.index || 0
      const end = start + m[0].length
      if (start > last) result += renderInline(raw.slice(last, start))
      const alt = escapeHtml(m[1] || '')
      const src = escapeHtml(m[2] || '')
      result += `<img src="${src}" alt="${alt}" style="height:1.25em;display:inline-block;vertical-align:text-bottom;margin:0 .25em;border-radius:.125rem;object-fit:contain;" />`
      last = end
    }
    if (last < raw.length) result += renderInline(raw.slice(last))
    if (result.length === 0) result = '\u200b'
    return result
  }

  useEffect(() => {
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ta || !ov) return
    const cs = getComputedStyle(ta)
    const keys = [
      'paddingTop','paddingRight','paddingBottom','paddingLeft',
      'fontSize','fontFamily','fontWeight','lineHeight','letterSpacing','textTransform','textIndent','textAlign','whiteSpace','tabSize'
    ]
    keys.forEach(k => { ov.style[k] = cs[k] })
    ov.style.borderTopWidth = cs.borderTopWidth
    ov.style.borderBottomWidth = cs.borderBottomWidth
    ov.style.borderTopStyle = 'solid'
    ov.style.borderBottomStyle = 'solid'
    ov.style.borderTopColor = 'transparent'
    ov.style.borderBottomColor = 'transparent'
  })

  useEffect(() => {
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ov) return
    ov.innerHTML = highlightMarkdown(String(value || ''))
    if (ta) {
      ov.style.minHeight = ta.scrollHeight + 'px'
    }
  }, [value, caretIndex])

  useEffect(() => {
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ta || !ov) return
    const onScroll = () => {
      ov.scrollTop = ta.scrollTop
      ov.scrollLeft = ta.scrollLeft
    }
    ta.addEventListener('scroll', onScroll)
    return () => ta.removeEventListener('scroll', onScroll)
  }, [])

  const handleSelect = () => {
    const el = textareaRef.current
    if (!el) return
    const next = snapCaretFrom(el.selectionStart ?? 0)
    if (next !== (el.selectionStart ?? 0)) el.setSelectionRange(next, next)
    setCaretIndex(next)
  }

  const handleKeyDown = (e) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start

    if (e.key === 'Backspace' && start === end) {
      const prev = start - 1
      const r = findRangeContaining(prev)
      if (r && prev >= r.start && prev <= r.end) {
        e.preventDefault()
        const nextValue = String(value || '').slice(0, r.start) + String(value || '').slice(r.end + 1)
        emitChange(nextValue, r.start)
        return
      }
    }
    if (e.key === 'Delete' && start === end) {
      const r = findRangeContaining(start)
      if (r) {
        e.preventDefault()
        const nextValue = String(value || '').slice(0, r.start) + String(value || '').slice(r.end + 1)
        emitChange(nextValue, r.start)
        return
      }
    }
    if (e.key === 'Enter') {
      const inside = findRangeContaining(start)
      if (inside) {
        e.preventDefault()
        const pos = inside.end + 1
        const src = String(value || '')
        const next = src.slice(0, pos) + '\n' + src.slice(pos)
        emitChange(next, pos + 1)
        return
      }
    }

    const insideStart = findRangeContaining(start)
    const insideEnd = findRangeContaining(end - 1)
    const overlapsToken = insideStart || insideEnd
    const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']

    if (navigationKeys.includes(e.key)) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const bias = e.key === 'ArrowLeft' ? 'backward' : 'forward'
        const next = snapCaretFrom(start, bias)
        if (next !== start) {
          e.preventDefault()
          el.setSelectionRange(next, next)
          setCaretIndex(next)
        }
      }
      return
    }

    if (overlapsToken) {
      const next = snapCaretFrom(start, 'forward')
      if (next !== start) {
        e.preventDefault()
        el.setSelectionRange(next, next)
        setCaretIndex(next)
      }
    }
  }

  return (
    <div className={`relative w-full ${className}`}>
      <div
        ref={overlayRef}
        aria-hidden="true"
        className="absolute inset-0 overflow-auto rounded markdown-overlay"
        style={{
          color: 'inherit',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          background: 'transparent',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <textarea
        id={id}
        name={name}
        ref={textareaRef}
        className={textareaClassName + ' w-full bg-transparent'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange && onChange(e); setCaretIndex(e.target.selectionStart ?? 0) }}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        required={required}
        style={{ position: 'relative', color: 'transparent', caretColor: '#ffffff', zIndex: 1 }}
      />
    </div>
  )
})

export default MarkdownTextarea


