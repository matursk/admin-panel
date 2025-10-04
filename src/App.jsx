import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FormField from './components/FormField.jsx'
import MarkdownTextarea from './components/MarkdownTextarea.jsx'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  doc as fsDoc,
  getCountFromServer,
  deleteDoc,
  getDoc,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'

const ADMIN_UID = 'gTCyoZc6JFclEkueBg7wl2M8uzJ2'
const DEFAULT_QUESTIONS_LECTION_ID = 'CICAgJj7z4EK'

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Simple UTF-8 base64 helpers to tag and move formatted content safely
function encodeB64Utf8(text) {
  try {
    const enc = new TextEncoder().encode(text)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < enc.length; i += chunkSize) {
      const chunk = enc.subarray(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, chunk)
    }
    return 'b64:' + btoa(binary)
  } catch {
    // Fallback
    try { return 'b64:' + btoa(unescape(encodeURIComponent(text))) } catch { return text }
  }
}

function decodeB64Utf8Maybe(text) {
  if (typeof text !== 'string') return ''
  if (!text.startsWith('b64:')) return text
  const raw = text.slice(4)
  try {
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    try { return decodeURIComponent(escape(atob(raw))) } catch { return text }
  }
}

function useAuth() {
  const [user, setUser] = useState(null)
  useEffect(() => {
    const off = onAuthStateChanged(auth, setUser)
    return () => off()
  }, [])
  return user
}

function Topbar({ user, onSignOut }) {
  return (
    <div className="sticky top-0 z-10 bg-base-100/80 backdrop-blur border-b border-base-300">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/assets/app_icon.png" alt="Logo" className="w-7 h-7 rounded" />
          <h1 className="text-lg font-semibold">Admin Console</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-base-content/60">
            {user ? `${user.displayName || user.email} (${user.uid})` : 'Not signed in'}
          </span>
          {user && (
            <button className="btn btn-sm btn-outline btn-error" onClick={onSignOut}>Sign out</button>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionTabs({ active, setActive }) {
  const tabs = [
    { id: 'lections', label: 'Lections' },
    { id: 'questions', label: 'Questions' },
    { id: 'version', label: 'Version' },
  ]
  return (
    <div role="tablist" className="tabs tabs-bordered mt-4">
      {tabs.map(t => (
        <button key={t.id} role="tab" className={cn('tab', active === t.id && 'tab-active')}
                onClick={() => setActive(t.id)}>{t.label}</button>
      ))}
    </div>
  )
}

function LectionsSection({ user }) {
  const [collectionName, setCollectionName] = useState('lections')
  const [env, setEnv] = useState('')
  const [status, setStatus] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [lections, setLections] = useState([])
  const titleRef = useRef(null)
  const contentRef = useRef(null)
  const editContentRef = useRef(null)
  const [contentText, setContentText] = useState('')
  const [editModal, setEditModal] = useState(null) // { id, title, content }
  const [linkDialog, setLinkDialog] = useState(null) // { target: 'create'|'edit', text, url, start, end }
  const [imageDialog, setImageDialog] = useState(null) // { target: 'create'|'edit' }

  const colRef = useMemo(() => collection(db, collectionName), [collectionName])

  const safePosition = (val) => {
    const num = Number(val)
    return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY
  }

  const loadLections = async () => {
    try {
      setOrderStatus('Loading...')
      let snap = await getDocs(query(colRef, orderBy('position', 'asc')))
      let items = []
      snap.forEach(docSnap => {
        const data = docSnap.data()
        items.push({ id: docSnap.id, title: data.title, position: safePosition(data.position), locked: !!data.locked })
      })
      if (items.length === 0) {
        try {
          snap = await getDocs(query(colRef, orderBy('createdAt', 'asc')))
          items = []
          snap.forEach(docSnap => {
            const data = docSnap.data()
            items.push({ id: docSnap.id, title: data.title, position: safePosition(data.position), locked: !!data.locked })
          })
        } catch {
          snap = await getDocs(colRef)
          items = []
          snap.forEach(docSnap => {
            const data = docSnap.data()
            items.push({ id: docSnap.id, title: data.title, position: safePosition(data.position), locked: !!data.locked })
          })
        }
      }
      items.sort((a, b) => safePosition(a.position) - safePosition(b.position))
      setLections(items)
      setOrderStatus(`Loaded ${items.length} items`)
    } catch (e) {
      setOrderStatus(`Failed to load: ${e.message || e}`)
    }
  }

  useEffect(() => { loadLections() }, [collectionName])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!user) { setStatus('Please sign in first'); return }
    if (user.uid !== ADMIN_UID) { setStatus('Only the admin account can upload'); return }

    const title = (titleRef.current?.value || '').trim()
    const rawText = contentText || ''
    if (!title || !rawText.trim()) { setStatus('Fill in all fields'); return }
    try {
      setStatus('Preparing content...')
      const content = encodeB64Utf8(rawText)
      // next position
      let nextPosition = 0
      try {
        const lastQ = query(colRef, orderBy('position', 'desc'), limit(1))
        const lastSnap = await getDocs(lastQ)
        if (!lastSnap.empty) {
          const top = lastSnap.docs[0].data()
          const topPos = Number(top.position)
          nextPosition = Number.isFinite(topPos) ? topPos + 1 : 0
        } else {
          try {
            const countSnap = await getCountFromServer(colRef)
            nextPosition = countSnap.data().count || 0
          } catch {}
        }
      } catch {}

      setStatus('Uploading...')
      await addDoc(colRef, {
        title,
        content,
        contentLength: rawText.length,
        createdAt: serverTimestamp(),
        createdByUid: user.uid,
        env: (env || null),
        active: true,
        position: nextPosition,
        locked: false,
      })
      setStatus('Uploaded successfully')
      titleRef.current.value = ''
      setContentText('')
      loadLections()
    } catch (e) {
      setStatus(`Upload failed: ${e.message || e}`)
    }
  }

  const reorder = (from, to) => {
    if (from === to) return
    const copy = [...lections]
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    setLections(copy)
    setOrderStatus('Reordered (not saved)')
  }

  const saveOrder = async () => {
    try {
      setOrderStatus('Saving...')
      const batch = writeBatch(db)
      lections.forEach((item, idx) => {
        const ref = fsDoc(colRef, item.id)
        batch.update(ref, { position: idx })
      })
      await batch.commit()
      setOrderStatus('Order saved')
    } catch (e) {
      setOrderStatus(`Failed to save order: ${e.message || e}`)
    }
  }

  const toggleLock = async (item) => {
    try {
      setOrderStatus(item.locked ? 'Unlocking...' : 'Locking...')
      const ref = fsDoc(colRef, item.id)
      await updateDoc(ref, { locked: !item.locked })
      setLections(prev => prev.map(x => x.id === item.id ? { ...x, locked: !x.locked } : x))
      setOrderStatus(item.locked ? 'Unlocked' : 'Locked')
    } catch (e) { setOrderStatus(`Failed to toggle: ${e.message || e}`) }
  }

  const del = async (item) => {
    if (!confirm(`Delete lection "${item.title || item.id}"? This cannot be undone.`)) return
    try {
      setOrderStatus('Deleting...')
      await deleteDoc(fsDoc(colRef, item.id))
      setOrderStatus('Deleted')
      loadLections()
    } catch (e) { setOrderStatus(`Failed to delete: ${e.message || e}`) }
  }

  // Removed legacy rename flow; title is edited inside the edit modal now.

  const [preview, setPreview] = useState(null)
  const openLection = async (id) => {
    try {
      setOrderStatus('Opening...')
      const snap = await getDoc(fsDoc(colRef, id))
      if (!snap.exists()) { setOrderStatus('Lection not found'); return }
      const d = snap.data()
      const raw = String(d.content || '')
      setPreview({ id, title: d.title || '(untitled)', content: decodeB64Utf8Maybe(raw) })
      setOrderStatus('Opened')
    } catch (e) { setOrderStatus(`Failed to open: ${e.message || e}`) }
  }

  const editLection = async (id) => {
    try {
      setOrderStatus('Opening for edit...')
      const snap = await getDoc(fsDoc(colRef, id))
      if (!snap.exists()) { setOrderStatus('Lection not found'); return }
      const d = snap.data()
      setEditModal({ id, title: d.title || '', content: decodeB64Utf8Maybe(String(d.content || '')) })
      setOrderStatus('Opened')
    } catch (e) { setOrderStatus(`Failed to open: ${e.message || e}`) }
  }

  const saveEditLection = async () => {
    if (!editModal) return
    const { id, title, content } = editModal
    const trimmedTitle = String(title || '').trim()
    if (!trimmedTitle) { setOrderStatus('Title cannot be empty'); return }
    try {
      setOrderStatus('Saving edits...')
      const ref = fsDoc(colRef, id)
      await updateDoc(ref, { title: trimmedTitle, content: encodeB64Utf8(String(content || '')) })
      setLections(prev => prev.map(x => x.id === id ? { ...x, title: trimmedTitle } : x))
      setEditModal(null)
      setOrderStatus('Saved')
    } catch (e) { setOrderStatus(`Save failed: ${e.message || e}`) }
  }

  const wrapSelection = (syntaxLeft, syntaxRight = syntaxLeft) => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const text = contentText
    const before = text.slice(0, start)
    const selected = text.slice(start, end)
    const after = text.slice(end)
    const next = before + syntaxLeft + (selected || '') + syntaxRight + after
    setContentText(next)
    const cursor = start + syntaxLeft.length + (selected ? selected.length : 0) + syntaxRight.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const wrapSelectionEdit = (syntaxLeft, syntaxRight = syntaxLeft) => {
    const el = editContentRef.current
    if (!el || !editModal) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const text = String(editModal.content || '')
    const before = text.slice(0, start)
    const selected = text.slice(start, end)
    const after = text.slice(end)
    const next = before + syntaxLeft + (selected || '') + syntaxRight + after
    setEditModal(m => ({ ...m, content: next }))
    const cursor = start + syntaxLeft.length + (selected ? selected.length : 0) + syntaxRight.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const openLinkDialog = (target) => {
    const el = target === 'edit' ? editContentRef.current : contentRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const source = target === 'edit' ? String(editModal?.content || '') : String(contentText || '')
    const sel = source.slice(start, end)
    setLinkDialog({ target, text: sel || '', url: 'https://', start, end })
  }

  const confirmLinkInsert = () => {
    if (!linkDialog) return
    const { target, text, url, start, end } = linkDialog
    const safeText = (text && text.trim()) ? text.trim() : 'text'
    const safeUrl = (url && url.trim()) ? url.trim() : 'https://'
    const md = `[${safeText}](${safeUrl})`
    if (target === 'edit') {
      const el = editContentRef.current
      const src = String(editModal?.content || '')
      const before = src.slice(0, start)
      const after = src.slice(end)
      const next = before + md + after
      setEditModal(m => ({ ...m, content: next }))
      requestAnimationFrame(() => { el?.focus(); const pos = (before + md).length; el?.setSelectionRange(pos, pos) })
    } else {
      const el = contentRef.current
      const src = String(contentText || '')
      const before = src.slice(0, start)
      const after = src.slice(end)
      const next = before + md + after
      setContentText(next)
      requestAnimationFrame(() => { el?.focus(); const pos = (before + md).length; el?.setSelectionRange(pos, pos) })
    }
    setLinkDialog(null)
  }

  const openImageDialog = (target) => setImageDialog({ target })

  const confirmImageUpload = async (file) => {
    try {
      if (!file) return
      const form = new FormData()
      form.append('file', file)
      const resp = await fetch('/api/upload-image', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(`Upload failed (${resp.status})`)
      const data = await resp.json()
      const md = `![](${data.url})`
      if (imageDialog?.target === 'edit') {
        const el = editContentRef.current
        const src = String(editModal?.content || '')
        const pos = el?.selectionStart ?? src.length
        const before = src.slice(0, pos)
        const after = src.slice(pos)
        // Ensure there is a blank line after the image token so caret sits below the preview
        const needed = '\n\n\n\n\n\n' // approximate 6 lines to clear preview height
        const spacer = after.startsWith('\n') ? needed : ('\n' + needed)
        const next = `${before}${md}${spacer}${after}`
        setEditModal(m => ({ ...m, content: next }))
        requestAnimationFrame(() => {
          if (!el) return
          el.focus()
          const np = (before + md + spacer).length
          el.setSelectionRange(np, np)
          try { el.dispatchEvent(new Event('select', { bubbles: true })) } catch {}
        })
      } else {
        const el = contentRef.current
        const src = String(contentText || '')
        const pos = el?.selectionStart ?? src.length
        const before = src.slice(0, pos)
        const after = src.slice(pos)
        const needed = '\n\n\n\n\n\n'
        const spacer = after.startsWith('\n') ? needed : ('\n' + needed)
        const next = `${before}${md}${spacer}${after}`
        setContentText(next)
        requestAnimationFrame(() => {
          if (!el) return
          el.focus()
          const np = (before + md + spacer).length
          el.setSelectionRange(np, np)
          try { el.dispatchEvent(new Event('select', { bubbles: true })) } catch {}
        })
      }
    } finally {
      setImageDialog(null)
    }
  }

  return (
    <div className="grid md:grid-cols-[2fr_1fr] gap-4 items-start mt-4">
      <div>
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Create lection</h3>
            <form className="grid md:grid-cols-2 gap-3" onSubmit={handleUpload}>
              <FormField title="Title">
                <input ref={titleRef} className="input input-bordered" required />
              </FormField>
              <FormField className="md:col-span-2" title="Content (Markdown)" helper="Use toolbar for bold, italic, links; classic text input.">
                <div className="flex flex-wrap gap-2 mb-2">
                  <button type="button" className="btn btn-xs" onClick={() => wrapSelection('**')}>Bold</button>
                  <button type="button" className="btn btn-xs" onClick={() => wrapSelection('_')}>Italic</button>
                  <button type="button" className="btn btn-xs" onClick={() => openLinkDialog('create')}>Link</button>
                </div>
                <MarkdownTextarea
                  ref={contentRef}
                  value={contentText}
                  onChange={e=>setContentText(e.target.value)}
                  placeholder="Type Markdown text here..."
                  required
                  mode="inline"
                />
              </FormField>
              <div className="flex items-end gap-3 md:col-span-2">
                <button className="btn btn-primary" type="submit">Upload</button>
                <span className="text-base-content/60">{status}</span>
              </div>
            </form>
          </div>
        </div>

        <div className="card bg-base-200 mt-4">
          <div className="card-body">
            <h3 className="card-title">Order lections</h3>
            <p className="text-base-content/60">Reorder items and click Save order. New uploads go to the end.</p>
            <div className="flex gap-2 mb-2">
              <button className="btn btn-outline" onClick={loadLections}>Refresh</button>
              <button className="btn btn-primary" onClick={saveOrder}>Save order</button>
              <span className="text-base-content/60">{orderStatus}</span>
            </div>
            <ol className="pl-5">
              {lections.map((item, index) => (
                <li key={item.id} className="flex items-center justify-between py-2">
                  <div className="cursor-pointer" onClick={() => openLection(item.id)}>
                    {index + 1}. {item.title || '(untitled)'} <span className="text-sm text-base-content/50">#{item.id}</span> {item.locked ? '🔒' : ''}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn btn-sm" disabled={index===0} onClick={() => reorder(index, index-1)} title="Move up" aria-label="Move up">↑</button>
                    <button className="btn btn-sm" disabled={index===lections.length-1} onClick={() => reorder(index, index+1)} title="Move down" aria-label="Move down">↓</button>
                    <button className="btn btn-sm" onClick={() => editLection(item.id)} title="Edit" aria-label="Edit">Edit</button>
                    <button className="btn btn-sm" onClick={() => toggleLock(item)} title={item.locked ? 'Unlock' : 'Lock'} aria-label={item.locked ? 'Unlock' : 'Lock'}>
                      {item.locked ? '🔓' : '🔒'}
                    </button>
                    <button className="btn btn-sm btn-error" onClick={() => del(item)} title="Delete" aria-label="Delete">🗑️</button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title">Settings</h3>
            <p className="text-base-content/60">Requires Firebase Auth. Only the admin account can upload.</p>
            <FormField title="Collection name">
              <input className="input input-bordered" value={collectionName} onChange={e=>setCollectionName(e.target.value)} />
            </FormField>
            <FormField title="Environment" helper="prod/dev (optional)">
              <input className="input input-bordered" value={env} onChange={e=>setEnv(e.target.value)} placeholder="prod/dev (optional)" />
            </FormField>
          </div>
        </div>

        <DebugAccess />
      </div>

      {preview && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="flex items-center justify-between">
              <strong>{preview.title}</strong>
              <form method="dialog"><button className="btn btn-sm" onClick={()=>setPreview(null)}>Close</button></form>
            </div>
            <div className="mt-2 text-sm text-base-content/70">ID: {preview.id}</div>
            <pre className="mt-3 whitespace-pre-wrap bg-base-300 rounded p-3 overflow-auto max-h-[60vh]">
{preview.content}
            </pre>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={()=>setPreview(null)}>close</button></form>
        </dialog>
      )}

      {editModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="flex items-center justify-between">
              <strong>Edit lection</strong>
              <form method="dialog"><button className="btn btn-sm" onClick={()=>setEditModal(null)}>Close</button></form>
            </div>
            <div className="mt-2 text-sm text-base-content/70">ID: {editModal.id}</div>
            <div className="mt-3 space-y-3">
              <FormField title="Title">
                <input className="input input-bordered" value={editModal.title} onChange={e=>setEditModal(m=>({...m, title: e.target.value}))} />
              </FormField>
              <FormField title="Content (Markdown)" helper="Use toolbar for bold, italic, links; classic text input.">
                <div className="flex flex-wrap gap-2 mb-2">
                  <button type="button" className="btn btn-xs" onClick={() => wrapSelectionEdit('**')}>Bold</button>
                  <button type="button" className="btn btn-xs" onClick={() => wrapSelectionEdit('_')}>Italic</button>
                  <button type="button" className="btn btn-xs" onClick={() => openLinkDialog('edit')}>Link</button>
                </div>
                <MarkdownTextarea
                  ref={editContentRef}
                  value={editModal.content}
                  onChange={e=>setEditModal(m=>({...m, content: e.target.value}))}
                  mode="inline"
                />
              </FormField>
              <div className="flex gap-2 items-center">
                <button className="btn btn-primary" onClick={saveEditLection}>Save</button>
                <span className="text-base-content/60">{orderStatus}</span>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={()=>setEditModal(null)}>close</button></form>
        </dialog>
      )}

      {linkDialog && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">Insert link</h3>
            <div className="mt-3 space-y-3">
              <FormField title="Text">
                <input className="input input-bordered w-full" value={linkDialog.text}
                       onChange={e=>setLinkDialog(d=>({...d, text: e.target.value}))} />
              </FormField>
              <FormField title="URL" helper="Include protocol, e.g. https://example.com">
                <input className="input input-bordered w-full" value={linkDialog.url}
                       onChange={e=>setLinkDialog(d=>({...d, url: e.target.value}))} placeholder="https://" />
              </FormField>
              <div className="flex gap-2 justify-end">
                <form method="dialog"><button className="btn" onClick={()=>setLinkDialog(null)}>Cancel</button></form>
                <button className="btn btn-primary" onClick={confirmLinkInsert}>Insert</button>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={()=>setLinkDialog(null)}>close</button></form>
        </dialog>
      )}

      {imageDialog && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">Insert image</h3>
            <div className="mt-3 space-y-3">
              <div className="form-control">
                <input type="file" accept="image/*"
                       className="file-input file-input-bordered w-full"
                       onChange={e=>confirmImageUpload(e.target.files?.[0] || null)} />
              </div>
              <div className="text-xs text-base-content/60">Images are uploaded to Firebase Storage and inserted as Markdown: <code>![](url)</code>.</div>
              <div className="flex gap-2 justify-end">
                <form method="dialog"><button className="btn" onClick={()=>setImageDialog(null)}>Cancel</button></form>
              </div>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={()=>setImageDialog(null)}>close</button></form>
        </dialog>
      )}
    </div>
  )
}

function DebugAccess() {
  const [status, setStatus] = useState('')
  const [info, setInfo] = useState('')
  const user = useAuth()
  const checkAccess = async () => {
    if (!user) { setStatus('Not signed in'); setInfo(''); return }
    try {
      const tokenResult = await user.getIdTokenResult(true)
      const summary = {
        email: user.email,
        emailVerified: user.emailVerified,
        uid: user.uid,
        claimsEmail: tokenResult.claims?.email || null,
        claimsEmailVerified: tokenResult.claims?.email_verified || null,
      }
      let text = JSON.stringify(summary, null, 2)
      // test writes in lections/questions
      try {
        const col = collection(db, 'lections')
        const docRef = await addDoc(col, { _test: true, t: Date.now(), by: user.email || user.uid })
        const snap = await getDoc(docRef)
        text += '\n' + JSON.stringify({ testWriteLections: { id: docRef.id, path: docRef.path, exists: snap.exists(), data: snap.data() || null } }, null, 2)
        await deleteDoc(docRef)
      } catch (err) { setStatus(`Lections test write/delete failed: ${err?.code || err?.message || String(err)}`) }
      try {
        const colQ = collection(db, 'questions')
        const docRefQ = await addDoc(colQ, { _test: true, t: Date.now(), by: user.email || user.uid })
        const snapQ = await getDoc(docRefQ)
        text += '\n' + JSON.stringify({ testWriteQuestions: { id: docRefQ.id, path: docRefQ.path, exists: snapQ.exists(), data: snapQ.data() || null } }, null, 2)
        await deleteDoc(docRefQ)
      } catch (err) { setStatus(`Questions test write/delete failed: ${err?.code || err?.message || String(err)}`) }
      setInfo(text)
      if (!status) setStatus('Token claims loaded')
    } catch (e) { setStatus(`Failed to get token claims: ${e.message || e}`) }
  }
  return (
    <div className="card bg-base-200">
      <div className="card-body">
        <h3 className="card-title">Debug access</h3>
        <p className="text-base-content/60">User and token claims; tests a write with current rules.</p>
        <div className="flex gap-2 items-center">
          <button className="btn btn-outline" onClick={checkAccess}>Check admin access</button>
          <span className="text-base-content/60">{status}</span>
        </div>
        <pre className="mt-3 text-xs whitespace-pre-wrap max-h-48 overflow-auto text-base-content/60">{info}</pre>
      </div>
    </div>
  )
}

function QuestionsSection() {
  const [lectionId, setLectionId] = useState('')
  const [lections, setLections] = useState([])
  const [status, setStatus] = useState('')
  const [draft, setDraft] = useState([])

  const safePosition = (val) => {
    const num = Number(val)
    return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY
  }

  const loadLectionsForSelect = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'lections'), orderBy('position', 'asc')))
      const opts = []
      snap.forEach(d => {
        const data = d.data()
        if ((data.active ?? false) === true) opts.push({ id: d.id, title: data.title, position: safePosition(data.position) })
      })
      opts.sort((a, b) => a.position - b.position)
      setLections(opts)
      const preferred = opts.find(o => o.id === DEFAULT_QUESTIONS_LECTION_ID) || opts[0]
      if (preferred) { setLectionId(preferred.id); await loadQuestions(preferred.id) } else { setStatus('No active lections found') }
    } catch (e) { setStatus(`Failed to load lections: ${e.message || e}`) }
  }

  const loadQuestions = async (id) => {
    try {
      setStatus('Loading questions...')
      const qSnap = await getDocs(query(collection(db, 'questions'), where('lectionId', '==', id), orderBy('createdAt', 'asc')))
      const loaded = []
      qSnap.forEach(doc => {
        const d = doc.data()
        loaded.push({ id: doc.id, type: Number(d.type) === 2 ? 2 : 4, text: String(d.questionText || ''), options: Array.isArray(d.options) ? d.options.map(String) : [], correct: Number(d.correct) || 0 })
      })
      setDraft(loaded)
      setStatus(`Loaded ${loaded.length} questions`)
    } catch (e) { setStatus(`Failed to load questions: ${e.message || e}`) }
  }

  useEffect(() => { loadLectionsForSelect() }, [])

  const addQuestion = (type) => {
    setDraft(prev => [...prev, { type, text: '', options: type === 2 ? ['', ''] : ['', '', '', ''], correct: 0 }])
  }

  const save = async () => {
    try {
      setStatus('Saving...')
      if (!lectionId) { setStatus('Select a lection first'); return }
      if (!draft.length) { setStatus('Nothing to save'); return }
      try {
        const cntSnap = await getCountFromServer(query(collection(db, 'questions'), where('lectionId', '==', lectionId)))
        const existingCount = cntSnap.data().count || 0
        const newCount = draft.filter(q => !q.id).length
        if (existingCount + newCount > 50) { setStatus(`Limit 50 prekročený: existuje ${existingCount}, nových ${newCount}.`); return }
      } catch {}
      const batch = writeBatch(db)
      draft.forEach(q => {
        const payload = {
          lectionId,
          type: q.type,
          questionText: q.text || '',
          options: (q.options || []).map(String),
          correct: Number(q.correct) || 0,
          active: true,
          createdAt: serverTimestamp(),
        }
        if (q.id) batch.set(fsDoc(collection(db, 'questions'), q.id), payload, { merge: true })
        else batch.set(fsDoc(collection(db, 'questions')), payload)
      })
      await batch.commit()
      setStatus('Saved')
      await loadQuestions(lectionId)
    } catch (e) { setStatus(`Failed to save: ${e.message || e}`) }
  }

  const remove = async (idx) => {
    const q = draft[idx]
    if (!q) return
    if (!confirm('Delete this question?')) return
    try {
      if (q.id) await deleteDoc(fsDoc(collection(db, 'questions'), q.id))
      setDraft(prev => prev.filter((_, i) => i !== idx))
      setStatus('Question deleted')
    } catch (e) { setStatus(`Delete failed: ${e.message || e}`) }
  }

  return (
    <div className="mt-4">
      <div className="card bg-base-200">
        <div className="card-body">
          <h3 className="card-title">Questions</h3>
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <FormField title="Select lection">
              <select className="select select-bordered" value={lectionId} onChange={e=>{ setLectionId(e.target.value); loadQuestions(e.target.value) }}>
                {lections.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </FormField>
            <div className="flex gap-2">
              <button className="btn btn-outline" onClick={() => addQuestion(2)}>Add A/B</button>
              <button className="btn btn-outline" onClick={() => addQuestion(4)}>Add A/B/C/D</button>
              <button className="btn btn-outline" onClick={() => lectionId && loadQuestions(lectionId)}>Reload</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
              <span className="self-center text-base-content/60">{status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {draft.length === 0 && (
          <div className="card bg-base-200"><div className="card-body text-base-content/60">No questions yet. Use Add buttons to create questions.</div></div>
        )}
        {draft.map((q, idx) => (
          <div className="card bg-base-200" key={idx}>
            <div className="card-body">
              <div className="flex items-center justify-between">
                <strong>Question {idx + 1} ({q.type === 2 ? 'A/B' : 'A/B/C/D'})</strong>
                <div className="flex gap-2">
                  <button className="btn btn-outline btn-sm" onClick={() => setDraft(d => { const c = JSON.parse(JSON.stringify(d[idx])); delete c.id; const arr = d.slice(); arr.splice(idx+1,0,c); return arr })}>Duplicate</button>
                  <button className="btn btn-error btn-sm" onClick={() => remove(idx)}>Delete</button>
                </div>
              </div>
              <textarea className="textarea textarea-bordered min-h-24" placeholder="Question text (line breaks preserved)" value={q.text} onChange={e=> setDraft(d => { const c = d.slice(); c[idx] = { ...c[idx], text: e.target.value }; return c })} />
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: q.type === 2 ? 2 : 4 }).map((_, i) => (
                  <FormField key={i} title={`Option ${['A','B','C','D'][i]}`} className={cn('p-3 rounded border', q.correct === i && 'bg-success/10 border-success/40')}>
                    <div className="flex items-center gap-2">
                      <input type="radio" className="radio" checked={q.correct === i} onChange={()=> setDraft(d => { const c = d.slice(); c[idx] = { ...c[idx], correct: i }; return c })} />
                      <input className="input input-bordered flex-1" value={q.options[i] || ''} onChange={e=> setDraft(d => { const c = d.slice(); const opts = (c[idx].options || []).slice(); opts[i] = e.target.value; c[idx] = { ...c[idx], options: opts }; return c })} />
                    </div>
                  </FormField>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VersionSection() {
  const [channel, setChannel] = useState('main')
  const [minCode, setMinCode] = useState('1')
  const [updateUrl, setUpdateUrl] = useState('')
  const [minName, setMinName] = useState('')
  const [whatsNew, setWhatsNew] = useState('')
  const [force, setForce] = useState('false')
  const [status, setStatus] = useState('')

  const load = async () => {
    try {
      setStatus('Loading...')
      const snap = await getDoc(fsDoc(collection(db, 'config'), `app_${channel}`))
      if (snap.exists()) {
        const d = snap.data() || {}
        setMinCode(String(d.minVersionCodeAndroid ?? ''))
        setUpdateUrl(d.updateUrlAndroid ?? '')
        setMinName(d.minVersionNameAndroid ?? '')
        setForce(String(Boolean(d.force)))
        setWhatsNew(d.whatsNew ?? d.whatsNewAndroid ?? '')
        setStatus('Loaded')
      } else {
        setMinCode('1'); setUpdateUrl(''); setMinName(''); setForce('false'); setWhatsNew(''); setStatus('No config yet. Enter values and click Save.')
      }
    } catch (e) {
      setMinCode('1'); setUpdateUrl(''); setMinName(''); setForce('false'); setWhatsNew('')
      setStatus(`Failed to load: ${e.message || e}`)
    }
  }

  const save = async () => {
    try {
      setStatus('Saving...')
      const ref = fsDoc(collection(db, 'config'), `app_${channel}`)
      const payload = {
        minVersionCodeAndroid: Number(minCode) || 0,
        updateUrlAndroid: updateUrl || '',
        minVersionNameAndroid: (minName || '').trim(),
        force: force === 'true',
        whatsNew: (whatsNew || '').trim(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(ref, payload, { merge: true })
      setStatus('Saved')
    } catch (e) { setStatus(`Failed: ${e.message || e}`) }
  }

  useEffect(() => { load() }, [channel])

  return (
    <div className="mt-4 card bg-base-200">
      <div className="card-body">
        <h3 className="card-title">App version config</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <FormField className="md:col-span-2" title="Channel" helper="Each channel has its own config">
            <select className="select select-bordered" value={channel} onChange={e=>setChannel(e.target.value)}>
              {['dev','alpha','beta-c','beta-o','preview','main'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <FormField title="Min version code (Android)" helper="Minimum required Android versionCode">
            <input className="input input-bordered" value={minCode} onChange={e=>setMinCode(e.target.value)} type="number" />
          </FormField>
          <FormField title="Update URL (Android)" helper="Play Store URL used for updates">
            <input className="input input-bordered" value={updateUrl} onChange={e=>setUpdateUrl(e.target.value)} placeholder="https://play.google.com/..." />
          </FormField>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <FormField title="Min version name (Android)" helper="Human‑readable minimum version name">
            <input className="input input-bordered" value={minName} onChange={e=>setMinName(e.target.value)} placeholder="e.g. 0.2.0-dev" />
          </FormField>
          <FormField title="What's New" helper="Shown once per app version">
            <textarea className="textarea textarea-bordered min-h-28" value={whatsNew} onChange={e=>setWhatsNew(e.target.value)} placeholder="Enter release notes..." />
          </FormField>
        </div>
        <div className="mt-3">
          <FormField className="w-56" title="Force update" helper="If enabled, users must update to continue">
            <select className="select select-bordered" value={force} onChange={e=>setForce(e.target.value)}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </FormField>
        </div>
        <div className="flex gap-2 items-center mt-3">
          <button className="btn btn-outline" onClick={load}>Load</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
          <span className="text-base-content/60">{status}</span>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const user = useAuth()
  const [active, setActive] = useState('lections')
  useEffect(() => {
    // Force DaisyUI theme
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  const [loginMsg, setLoginMsg] = useState('')
  const emailRef = useRef(null)
  const passRef = useRef(null)

  const doLogin = async () => {
    try {
      const email = (emailRef.current?.value || '').trim().toLowerCase()
      const password = passRef.current?.value || ''
      await signInWithEmailAndPassword(auth, email, password)
      if (passRef.current) passRef.current.value = ''
      setLoginMsg('')
    } catch (e) { setLoginMsg(`Sign-in failed: ${e.message || e}`) }
  }

  const doSignOut = async () => {
    try { await signOut(auth) } catch (e) { /* ignore */ }
  }

  const isAdmin = user && user.uid === ADMIN_UID

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <Topbar user={user} onSignOut={doSignOut} />
      <main className="max-w-screen-xl mx-auto px-4 py-6">
        {!isAdmin ? (
          <div className="card bg-base-200">
            <div className="card-body">
              <h3 className="card-title">Admin sign in</h3>
              <p className="text-base-content/60">Only the admin account can access this uploader.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="form-control">
                  <div className="label"><span className="label-text">Email</span></div>
                  <input ref={emailRef} className="input input-bordered" type="email" placeholder="admin@matur.sk" />
                </label>
                <label className="form-control">
                  <div className="label"><span className="label-text">Password</span></div>
                  <input ref={passRef} className="input input-bordered" type="password" placeholder="Password" />
                </label>
              </div>
              <div className="flex gap-3 items-center mt-2">
                <button className="btn btn-primary" onClick={doLogin}>Sign in</button>
                <span className="text-error text-sm">{loginMsg}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <SectionTabs active={active} setActive={setActive} />
            {active === 'lections' && <LectionsSection user={user} />}
            {active === 'questions' && <QuestionsSection />}
            {active === 'version' && <VersionSection />}
          </>
        )}
      </main>
    </div>
  )
}


