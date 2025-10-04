import React, { forwardRef, useEffect, useRef } from 'react'

/**
 * MarkdownTextarea
 * A single-field textarea that shows inline Markdown formatting while typing,
 * Discord-style. It renders a highlighted layer behind a transparent textarea,
 * grays out formatting markers (**, _, ~~) and styles the inner text.
 */
const MarkdownTextarea = forwardRef(function MarkdownTextarea(
  {
    value,
    onChange,
    placeholder,
    className = '',
    textareaClassName = 'textarea textarea-bordered min-h-60 bg-transparent',
    id,
    name,
    required,
  },
  forwardedRef,
) {
  const localTextareaRef = useRef(null)
  const textareaRef = forwardedRef || localTextareaRef
  const overlayRef = useRef(null)

  // Escape HTML to safely inject highlighted HTML
  const escapeHtml = (text) => {
    return String(text)
      .replaceAll(/&/g, '&amp;')
      .replaceAll(/</g, '&lt;')
      .replaceAll(/>/g, '&gt;')
  }

  const highlightMarkdown = (raw) => {
    const text = escapeHtml(raw)

    // Headings: at line start, 1-6 # followed by a space
    let html = text.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, content) => {
      const level = hashes.length
      const size = Math.max(1, 7 - level)
      return `<span style="color:rgba(255,255,255,.45)">${hashes}&nbsp;</span><span style="font-weight:700;font-size:${size * 0.2 + 0.9}rem">${content}</span>`
    })

    // Bold: **text**
    html = html.replace(/\*\*([^\n*][\s\S]*?)\*\*/g, (_m, inner) => {
      return `<span style="color:rgba(255,255,255,.45)">**</span><span style="font-weight:700">${inner}</span><span style="color:rgba(255,255,255,.45)">**</span>`
    })

    // Italic: _text_
    html = html.replace(/_(?!\s)([^\n_][\s\S]*?)_/g, (_m, inner) => {
      return `<span style="color:rgba(255,255,255,.45)">_</span><span style="font-style:italic">${inner}</span><span style="color:rgba(255,255,255,.45)">_</span>`
    })

    // Strikethrough: ~~text~~
    html = html.replace(/~~([^\n~][\s\S]*?)~~/g, (_m, inner) => {
      return `<span style="color:rgba(255,255,255,.45)">~~</span><span style="text-decoration:line-through">${inner}</span><span style="color:rgba(255,255,255,.45)">~~</span>`
    })

    // Inline code: `code`
    html = html.replace(/`([^`\n]+)`/g, (_m, code) => {
      return `<span style="color:rgba(255,255,255,.45)">\`</span><span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; background:rgba(255,255,255,.06); padding:0 .25rem; border-radius:.25rem">${code}</span><span style="color:rgba(255,255,255,.45)">\`</span>`
    })

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_m, label, url) => {
      const marker = '<span style="color:rgba(255,255,255,.45)">' + '[' + '</span>'
      const marker2 = '<span style="color:rgba(255,255,255,.45)">]</span>'
      const marker3 = '<span style="color:rgba(255,255,255,.45)">(</span>'
      const marker4 = '<span style="color:rgba(255,255,255,.45)">)</span>'
      return `${marker}<span style="text-decoration:underline">${label}</span>${marker2}${marker3}<span style="opacity:.9">${url}</span>${marker4}`
    })

    // Make sure empty lines render a line height
    if (html.length === 0) html = '\u200b'
    // Preserve trailing newline height
    if (!html.endsWith('\n')) html += '\n'
    return html
  }

  // Sync overlay typography with the textarea so text aligns closely
  useEffect(() => {
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ta || !ov) return
    const cs = getComputedStyle(ta)
    const keys = [
      'paddingTop','paddingRight','paddingBottom','paddingLeft',
      'fontSize','fontFamily','fontWeight','lineHeight','letterSpacing','textTransform','textIndent','textAlign','whiteSpace'
    ]
    keys.forEach(k => { ov.style[k] = cs[k] })
  })

  // Update overlay HTML on value changes
  useEffect(() => {
    const ov = overlayRef.current
    if (!ov) return
    ov.innerHTML = highlightMarkdown(value || '')
  }, [value])

  // Scroll sync
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
          // Match DaisyUI textarea background a bit darker for contrast
          background: 'transparent',
          pointerEvents: 'none',
        }}
      />
      <textarea
        id={id}
        name={name}
        ref={textareaRef}
        className={textareaClassName + ' w-full'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        style={{ position: 'relative', color: 'transparent', caretColor: 'inherit', background: 'transparent' }}
      />
    </div>
  )
})

export default MarkdownTextarea


