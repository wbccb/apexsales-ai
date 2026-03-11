"use client"

import { SandpackCodeEditor, SandpackLayout, SandpackPreview, SandpackProvider } from "@codesandbox/sandpack-react"
import { MicVAD } from "@ricky0123/vad-web"
import { useCallback, useEffect, useRef, useState } from "react"

type Utterance = {
  id: string
  speaker: string
  text: string
  ts: string
  asr_engine: string
  asr_fallback: boolean
}

type Citation = {
  document_id: string
  chunk_id: string
  score: number
  page_no: number | null
  snippet: string
}

// 后端 API 根地址
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
const SANDBOX_BUNDLER_URL =
  process.env.NEXT_PUBLIC_SANDPACK_BUNDLER_URL ??
  "https://sandpack-bundler.codesandbox.io"
const ASSET_BASE =
  "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/"
const ONNX_BASE =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"

// 将 Float32Array 转换为 16-bit PCM WAV
function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }
  let offset = 0
  writeString(offset, "RIFF")
  offset += 4
  view.setUint32(offset, 36 + samples.length * 2, true)
  offset += 4
  writeString(offset, "WAVE")
  offset += 4
  writeString(offset, "fmt ")
  offset += 4
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * 2, true)
  offset += 4
  view.setUint16(offset, 2, true)
  offset += 2
  view.setUint16(offset, 16, true)
  offset += 2
  writeString(offset, "data")
  offset += 4
  view.setUint32(offset, samples.length * 2, true)
  offset += 4
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

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

export default function Home() {
  const vadRef = useRef<MicVAD | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [salesId, setSalesId] = useState("")
  const [registerNext, setRegisterNext] = useState(false)
  const [registerResult, setRegisterResult] = useState<string | null>(null)
  const [verifyNext, setVerifyNext] = useState(false)
  const [verifyResult, setVerifyResult] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [ragEnabled, setRagEnabled] = useState(true)
  const [ragTopK, setRagTopK] = useState(5)
  const [ragUsed, setRagUsed] = useState(false)
  const [citations, setCitations] = useState<Citation[]>([])
  const [prdId, setPrdId] = useState<string | null>(null)
  const [prdMarkdown, setPrdMarkdown] = useState<string>("")
  const [editedMarkdown, setEditedMarkdown] = useState<string>("")
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [pocLoading, setPocLoading] = useState(false)
  const [pocError, setPocError] = useState<string | null>(null)
  const [pocCode, setPocCode] = useState<string>("")
  const [pocShareUuid, setPocShareUuid] = useState<string>("")
  const [shareInput, setShareInput] = useState<string>("")
  const [contractLoading, setContractLoading] = useState(false)
  const [contractResult, setContractResult] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState("")
  const [asrEngineStatus, setAsrEngineStatus] = useState("未转写")

  const ensureSessionId = useCallback(() => {
    if (sessionId) {
      return sessionId
    }
    const nextSessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`
    setSessionId(nextSessionId)
    return nextSessionId
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) {
      ensureSessionId()
    }
  }, [ensureSessionId, sessionId])

  const sendAudio = useCallback(
    async (audio: Float32Array, mode: "register" | "verify" | "transcribe") => {
      setIsProcessing(true)
      setError(null)
      try {
        const wavBuffer = encodeWav(audio, 16000)
        const blob = new Blob([wavBuffer], { type: "audio/wav" })
        const formData = new FormData()
        formData.append("audio", blob, `segment-${Date.now()}.wav`)
        if (mode === "register") {
          if (!salesId.trim()) {
            throw new Error("请先填写销售 ID")
          }
          setVerifyResult(null)
          formData.append("user_id", salesId.trim())
          const response = await fetch(`${API_BASE}/voice/register`, {
            method: "POST",
            body: formData
          })
          if (!response.ok) {
            throw new Error(await readErrorMessage(response))
          }
          const data = await response.json()
          setRegisterResult(`已注册销售声纹：${data.user_id}`)
          return
        }
        if (mode === "verify") {
          if (!salesId.trim()) {
            throw new Error("请先填写销售 ID")
          }
          setRegisterResult(null)
          formData.append("user_id", salesId.trim())
          const response = await fetch(`${API_BASE}/voice/verify`, {
            method: "POST",
            body: formData
          })
          if (!response.ok) {
            throw new Error(await readErrorMessage(response))
          }
          const data = await response.json()
          setVerifyResult(
            `相似度 ${Number(data.similarity).toFixed(3)}，阈值 ${Number(
              data.threshold
            ).toFixed(2)}，判定 ${data.is_sales ? "销售" : "客户"}`
          )
          return
        }
        const resolvedSessionId = ensureSessionId()
        formData.append("session_id", resolvedSessionId)
        if (salesId.trim()) {
          formData.append("sales_id", salesId.trim())
        }
        const response = await fetch(`${API_BASE}/asr/transcribe`, {
          method: "POST",
          body: formData
        })
        if (!response.ok) {
          throw new Error(await readErrorMessage(response))
        }
        const data = await response.json()
        const engine = typeof data.asr_engine === "string" && data.asr_engine ? data.asr_engine : "fallback"
        const fallback = Boolean(data.asr_fallback)
        setAsrEngineStatus(fallback ? `${engine} (fallback)` : engine)
        setUtterances((prev: Utterance[]) => [
          ...prev,
          {
            id: data.utterance_id,
            speaker: data.speaker,
            text: data.text,
            ts: data.ts,
            asr_engine: engine,
            asr_fallback: fallback
          }
        ])
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误"
        setError(message)
      } finally {
        setIsProcessing(false)
      }
    },
    [ensureSessionId, salesId]
  )

  const setupVad = useCallback(async () => {
    if (vadRef.current) {
      return vadRef.current
    }
    const vad = await MicVAD.new({
      baseAssetPath: ASSET_BASE,
      onnxWASMBasePath: ONNX_BASE,
      onSpeechStart: () => setIsSpeaking(true),
      onSpeechEnd: (audio: Float32Array) => {
        setIsSpeaking(false)
        if (registerNext) {
          setRegisterNext(false)
          void sendAudio(audio, "register")
          return
        }
        if (verifyNext) {
          setVerifyNext(false)
          void sendAudio(audio, "verify")
          return
        }
        void sendAudio(audio, "transcribe")
      },
      onVADMisfire: () => setIsSpeaking(false)
    })
    vadRef.current = vad
    return vad
  }, [sendAudio])

  const toggleListening = useCallback(async () => {
    if (isListening) {
      vadRef.current?.pause()
      setIsListening(false)
      setIsSpeaking(false)
      return
    }
    const vad = await setupVad()
    await vad.start()
    setIsListening(true)
  }, [isListening, setupVad])

  // 生成 PRD 总结并回填编辑区
  const generateSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)
    setSaveResult(null)
    try {
      const resolvedSessionId = ensureSessionId()
      const response = await fetch(
        `${API_BASE}/session/${resolvedSessionId}/summary`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            rag_enabled: ragEnabled,
            top_k: ragTopK
          })
        }
      )
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      setPrdId(data.prd_id)
      setPrdMarkdown(data.markdown)
      setEditedMarkdown(data.markdown)
      setRagUsed(Boolean(data.rag_used))
      setCitations(Array.isArray(data.citations) ? data.citations : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setSummaryError(message)
    } finally {
      setSummaryLoading(false)
    }
  }, [ensureSessionId, ragEnabled, ragTopK])

  // 保存 PRD 编辑结果
  const savePrd = useCallback(async () => {
    if (!prdId) {
      setSaveResult("请先生成总结")
      return
    }
    setSaveLoading(true)
    setSaveResult(null)
    try {
      const response = await fetch(`${API_BASE}/prd/${prdId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ edited_markdown: editedMarkdown })
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      setSaveResult("已保存 PRD 修改")
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setSaveResult(message)
    } finally {
      setSaveLoading(false)
    }
  }, [editedMarkdown, prdId])

  // 生成 POC 代码并回填 Sandpack
  const generatePoc = useCallback(async () => {
    if (!prdId) {
      setPocError("请先生成 PRD")
      return
    }
    setPocLoading(true)
    setPocError(null)
    try {
      const response = await fetch(`${API_BASE}/prd/${prdId}/poc`, {
        method: "POST"
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      setPocCode(data.code)
      setPocShareUuid(data.share_uuid)
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setPocError(message)
    } finally {
      setPocLoading(false)
    }
  }, [prdId])

  // 通过分享 UUID 拉取 POC 代码
  const loadSharePoc = useCallback(async () => {
    if (!shareInput.trim()) {
      setPocError("请填写分享 UUID")
      return
    }
    setPocLoading(true)
    setPocError(null)
    try {
      const response = await fetch(`${API_BASE}/poc/${shareInput.trim()}`)
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      setPocCode(data.code)
      setPocShareUuid(shareInput.trim())
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setPocError(message)
    } finally {
      setPocLoading(false)
    }
  }, [shareInput])

  // 生成合同并打开 PDF 下载链接
  const generateContract = useCallback(async () => {
    if (!prdId) {
      setContractResult("请先生成 PRD")
      return
    }
    setContractLoading(true)
    setContractResult(null)
    try {
      const response = await fetch(`${API_BASE}/contract/${prdId}`, {
        method: "POST"
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      const data = await response.json()
      const pdfUrl = `${API_BASE}${data.pdf_url}`
      setContractResult(pdfUrl)
      window.open(pdfUrl, "_blank", "noopener,noreferrer")
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误"
      setContractResult(message)
    } finally {
      setContractLoading(false)
    }
  }, [prdId])

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">销售 AI 闭环系统</h1>
        <p className="text-slate-300">
          语音切片、实时对话、PRD 生成、POC 渲染、合同导出
        </p>
      </header>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">语音采集与对话</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              isListening
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-700 text-white"
            }`}
            onClick={toggleListening}
          >
            {isListening ? "停止监听" : "开始监听"}
          </button>
          <input
            value={salesId}
            onChange={(event) => setSalesId(event.target.value)}
            placeholder="销售 ID（用于声纹）"
            className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
          />
          <button
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              registerNext
                ? "bg-amber-400 text-slate-950"
                : "bg-slate-700 text-white"
            }`}
            onClick={() => {
              setRegisterResult(null)
              setVerifyResult(null)
              setRegisterNext(true)
            }}
          >
            下一段注册声纹
          </button>
          <button
            className={`rounded-full px-4 py-2 text-xs font-medium transition ${
              verifyNext
                ? "bg-sky-400 text-slate-950"
                : "bg-slate-700 text-white"
            }`}
            onClick={() => {
              setRegisterResult(null)
              setVerifyResult(null)
              setVerifyNext(true)
            }}
          >
            验证声纹
          </button>
          <div className="text-sm text-slate-300">
            {isListening ? "麦克风已开启" : "麦克风未开启"}
          </div>
          <div className="text-sm text-slate-300">
            {isSpeaking ? "检测到说话" : "等待说话"}
          </div>
          <div className="text-sm text-slate-300">
            {isProcessing ? "转写中..." : "空闲"}
          </div>
        </div>
        {registerResult ? (
          <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {registerResult}
          </div>
        ) : null}
        {verifyResult ? (
          <div className="rounded-lg border border-sky-600/40 bg-sky-500/10 p-3 text-sm text-sky-200">
            {verifyResult}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        <div className="grid gap-3">
          <div className="text-sm text-slate-400">
            当前会话：{sessionId || "待生成"}
          </div>
          <div className="text-sm text-slate-400">
            ASR 当前引擎：{asrEngineStatus}
          </div>
          <div className="grid gap-3">
            {utterances.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                暂无对话片段
              </div>
            ) : (
              utterances.map(item => (
                <div
                  key={item.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{item.speaker}</span>
                    <span>{new Date(item.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    引擎：{item.asr_fallback ? `${item.asr_engine} (fallback)` : item.asr_engine}
                  </div>
                  <div className="mt-2 text-sm text-slate-100">
                    {item.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">阶段一状态</h2>
        <ul className="grid gap-2 text-slate-300">
          <li>语音采集：已接入 VAD</li>
          <li>ASR 转写：{asrEngineStatus}</li>
          <li>声纹判别：Resemblyzer 1v1</li>
          <li>PRD 生成：待接入</li>
          <li>POC 渲染：待接入</li>
        </ul>
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">阶段二：PRD 总结与编辑</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-medium text-white"
            onClick={generateSummary}
            disabled={summaryLoading}
          >
            {summaryLoading ? "生成中..." : "生成总结"}
          </button>
          <button
            className="rounded-full bg-slate-700 px-5 py-2 text-sm font-medium text-white"
            onClick={savePrd}
            disabled={saveLoading}
          >
            {saveLoading ? "保存中..." : "保存 PRD"}
          </button>
          <div className="text-sm text-slate-300">
            {prdId ? `当前 PRD：${prdId}` : "未生成 PRD"}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={(event) => setRagEnabled(event.target.checked)}
            />
            启用 RAG
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={ragTopK}
            onChange={(event) => setRagTopK(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
            className="w-24 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
            placeholder="TopK"
          />
        </div>
        {summaryError ? (
          <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {summaryError}
          </div>
        ) : null}
        {saveResult ? (
          <div className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {saveResult}
          </div>
        ) : null}
        <div className="grid gap-3">
          <div className="text-sm text-slate-400">生成结果</div>
          <textarea
            value={editedMarkdown}
            onChange={(event) => setEditedMarkdown(event.target.value)}
            placeholder="点击生成总结后可编辑 PRD 内容"
            className="min-h-[240px] w-full rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm text-slate-100"
          />
          {prdMarkdown ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
              已生成原始 PRD，可在上方编辑并保存
            </div>
          ) : null}
          {prdMarkdown ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
              {ragUsed ? "本次总结已使用 RAG 检索结果" : "本次总结未命中可用检索结果"}
            </div>
          ) : null}
          {citations.length > 0 ? (
            <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="text-xs text-slate-400">引用来源</div>
              {citations.map((item) => (
                <div key={item.chunk_id} className="rounded border border-slate-800 p-2 text-xs text-slate-300">
                  <div>
                    doc={item.document_id} chunk={item.chunk_id} page={item.page_no ?? "-"} score={Number(item.score).toFixed(4)}
                  </div>
                  <div className="mt-1 text-slate-400">{item.snippet}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">阶段三：POC 生成与预览</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-purple-500 px-5 py-2 text-sm font-medium text-white"
            onClick={generatePoc}
            disabled={pocLoading}
          >
            {pocLoading ? "生成中..." : "生成 POC"}
          </button>
          <input
            value={shareInput}
            onChange={(event) => setShareInput(event.target.value)}
            placeholder="分享 UUID"
            className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
          />
          <button
            className="rounded-full bg-slate-700 px-4 py-2 text-xs font-medium text-white"
            onClick={loadSharePoc}
            disabled={pocLoading}
          >
            打开分享
          </button>
          <div className="text-sm text-slate-300">
            {pocShareUuid ? `当前分享：${pocShareUuid}` : "尚未生成分享"}
          </div>
          {pocShareUuid ? (
            <a
              href={`/share/${pocShareUuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-300 underline"
            >
              打开分享页
            </a>
          ) : null}
        </div>
        {pocError ? (
          <div className="rounded-lg border border-rose-600/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {pocError}
          </div>
        ) : null}
        {/* Sandpack 负责运行 POC 代码并渲染预览 */}
        <SandpackProvider
          template="react-ts"
          files={{
            "/App.tsx": pocCode || "export default function App(){return <div />}"
          }}
          options={{
            visibleFiles: ["/App.tsx"],
            bundlerURL: SANDBOX_BUNDLER_URL
          }}
        >
          <SandpackLayout>
            <SandpackCodeEditor style={{ height: 360 }} />
            <SandpackPreview style={{ height: 360 }} />
          </SandpackLayout>
        </SandpackProvider>
      </section>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">阶段四：合同导出</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950"
            onClick={generateContract}
            disabled={contractLoading}
          >
            {contractLoading ? "导出中..." : "导出合同"}
          </button>
          <div className="text-sm text-slate-300">
            {contractResult ? contractResult : "尚未生成合同"}
          </div>
        </div>
      </section>
    </main>
  )
}
