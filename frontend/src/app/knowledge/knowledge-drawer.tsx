"use client"

import { useCallback, useEffect, useState } from "react"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

async function readErrorMessage(response: Response) {
  try {
    const data = await response.json()
    if (typeof data?.detail === "string" && data.detail) {
      return data.detail
    }
  } catch {
  }
  return `接口返回 ${response.status}`
}

type KnowledgeDrawerProps = {
  open: boolean
  onClose: () => void
}

export function KnowledgeDrawer({ open, onClose }: KnowledgeDrawerProps) {
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [businessTag, setBusinessTag] = useState("")

  const fetchKnowledgeDocs = useCallback(async () => {
    setKnowledgeLoading(true)
    try {
      const response = await fetch(`${API_BASE}/knowledge/documents?page_size=100`)
      if (response.ok) {
        const data = await response.json()
        setKnowledgeDocs(data.documents || [])
      }
    } catch {
    } finally {
      setKnowledgeLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchKnowledgeDocs()
    }
  }, [open, fetchKnowledgeDocs])

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", uploadFile)
      if (businessTag) {
        formData.append("business_tag", businessTag)
      }
      const response = await fetch(`${API_BASE}/knowledge/upload`, {
        method: "POST",
        body: formData
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      setUploadFile(null)
      setBusinessTag("")
      fetchKnowledgeDocs()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败"
      alert(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        className={`absolute inset-0 bg-slate-950/70 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-[400px] border-l border-slate-800 bg-slate-900 p-6 shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">知识库管理</div>
          <button
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <h3 className="text-sm font-medium text-slate-100">上传文档 (PDF)</h3>
          <div className="mt-3 grid gap-3">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-300"
            />
            <input
              type="text"
              value={businessTag}
              onChange={(e) => setBusinessTag(e.target.value)}
              placeholder="业务标签 (可选)"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100"
            />
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
            >
              {uploading ? "上传中..." : "上传并建立索引"}
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-100">文档列表</h3>
            <button
              className="text-xs text-indigo-400 hover:text-indigo-300"
              onClick={fetchKnowledgeDocs}
              disabled={knowledgeLoading}
            >
              刷新
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {knowledgeLoading && knowledgeDocs.length === 0 ? (
              <div className="text-xs text-slate-500">加载中...</div>
            ) : null}
            {!knowledgeLoading && knowledgeDocs.length === 0 ? (
              <div className="text-xs text-slate-500">暂无文档</div>
            ) : null}
            {knowledgeDocs.map((doc) => (
              <div
                key={doc.document_id}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-medium text-slate-200 break-all">
                    {doc.filename}
                  </div>
                  <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                    doc.status === "ready" ? "bg-emerald-500/20 text-emerald-300" :
                    doc.status === "failed" ? "bg-rose-500/20 text-rose-300" :
                    "bg-amber-500/20 text-amber-300"
                  }`}>
                    {doc.status}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <div>切片: {doc.chunk_count}</div>
                  <div>{new Date(doc.created_at).toLocaleString()}</div>
                </div>
                {doc.error_message ? (
                  <div className="mt-2 text-[10px] text-rose-400">
                    {doc.error_message}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
