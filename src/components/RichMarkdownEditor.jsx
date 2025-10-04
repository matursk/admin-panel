import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TurndownService from 'turndown'
import { marked } from 'marked'

export default function RichMarkdownEditor({ value, onChange, className = '' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: true,
      }),
      Image.configure({ inline: false, allowBase64: true })
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
    <div className={className + ' border border-base-300 rounded p-2 bg-base-200'}>
      <EditorContent editor={editor} />
    </div>
  )
}


