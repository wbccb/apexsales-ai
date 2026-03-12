"use client"

import { useEffect, useState } from "react"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"

export default function SharePage({ params }: { params: { uuid: string } }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string>("")

  useEffect(() => {
    let active = true
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_BASE}/poc/${params.uuid}`)
        if (!response.ok) {
          throw new Error(`接口返回 ${response.status}`)
        }
        const data = await response.json()
        if (!active) {
          return
        }
        setCode(data.code || "")
      } catch (err) {
        if (!active) {
          return
        }
        setError(err instanceof Error ? err.message : "未知错误")
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [params.uuid])

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">POC 分享页</h1>
          <div className="text-sm text-slate-400">UUID: {params.uuid}</div>
        </div>
      </div>
      
      {loading ? <div className="text-slate-300">加载中...</div> : null}
      {error ? <div className="text-rose-300">{error}</div> : null}
      
      {!loading && !error ? (
        <div className="flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-white h-[800px]">
          <iframe
            srcDoc={code}
            className="flex-1 border-0 w-full"
            title="POC Preview"
            sandbox="allow-scripts allow-modals"
          />
        </div>
      ) : null}
    </main>
  )
}
