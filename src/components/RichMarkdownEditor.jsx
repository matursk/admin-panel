import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TurndownService from 'turndown'
import { marked } from 'marked'

export default function RichMarkdownEditor({ value, onChange, className = '' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: true }),
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { style: 'max-height:6em; height:auto; width:auto; display:block; margin:.25rem 0; object-fit:contain;' } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } })
    ],
    content: marked.parse(String(value || '')),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const td = new TurndownService()
      const md = td.turndown(html)
      onChange && onChange({ target: { value: md } })
    },
  })

  useEffect(() => {
    if (!editor) return
    const td = new TurndownService()
    const current = editor.getHTML()
    const desiredHtml = marked.parse(String(value || ''))
    if (current !== desiredHtml) editor.commands.setContent(desiredHtml)
  }, [value, editor])

  return (
    <div className={className + ' border border-base-300 rounded bg-base-200'} style={{ height: '16rem' }}>
      <div className="flex gap-2 p-2 border-b border-base-300">
        <button className="btn btn-xs" onClick={() => editor && editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button className="btn btn-xs" onClick={() => editor && editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button className="btn btn-xs" onClick={() => editor && editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
        <button className="btn btn-xs" onClick={() => editor && editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button className="btn btn-xs" onClick={() => {
          const url = window.prompt('Enter URL (https://...)', 'https://')
          if (!url) return
          editor && editor.chain().focus().setLink({ href: url }).run()
        }}>Link</button>
      </div>
      <div className="p-2" style={{ height: 'calc(16rem - 2.5rem)', overflow: 'auto' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}


