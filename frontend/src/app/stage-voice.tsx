"use client"

import { MicVAD } from "@ricky0123/vad-web"
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react"

type Utterance = {
  id: string
  speaker: string
  text: string
  ts: string
  asr_engine: string
  asr_fallback: boolean
}

type StageVoiceProps = {
  sessionId: string
  setSessionId: Dispatch<SetStateAction<string>>
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"
const ASSET_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/"
const ONNX_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/"

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

export function StageVoice({ sessionId, setSessionId }: StageVoiceProps) {
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
  const [asrEngineStatus, setAsrEngineStatus] = useState("未转写")
  const registerNextRef = useRef(false)
  const verifyNextRef = useRef(false)

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
  }, [sessionId, setSessionId])

  useEffect(() => {
    if (!sessionId) {
      ensureSessionId()
    }
  }, [ensureSessionId, sessionId])

  useEffect(() => {
    registerNextRef.current = registerNext
  }, [registerNext])

  useEffect(() => {
    verifyNextRef.current = verifyNext
  }, [verifyNext])

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
        setUtterances((prev) => [
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
        if (registerNextRef.current) {
          setRegisterNext(false)
          void sendAudio(audio, "register")
          return
        }
        if (verifyNextRef.current) {
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

  const ensureListening = useCallback(async () => {
    if (isListening) {
      return
    }
    const vad = await setupVad()
    await vad.start()
    setIsListening(true)
  }, [isListening, setupVad])

  return (
    <>
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-medium">语音采集与对话</h2>
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
          <div className="text-sm font-medium text-slate-200">声纹操作指引</div>
          <div className="mt-1 text-xs text-slate-400">
            先填写销售 ID，再点击“下一段用于注册声纹”或“下一段用于验证声纹”，然后说一句话即可触发对应动作。若麦克风未开启，会自动开启监听。
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <label className="grid gap-1 text-sm text-slate-300">
              <span>销售 ID（声纹归属标识）</span>
              <input
                value={salesId}
                onChange={(event) => setSalesId(event.target.value)}
                placeholder="例如：sales_zhangsan"
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                  registerNext
                    ? "bg-amber-400 text-slate-950"
                    : "bg-slate-700 text-white"
                }`}
                onClick={async () => {
                  setRegisterResult(null)
                  setVerifyResult(null)
                  setVerifyNext(false)
                  setRegisterNext(true)
                  await ensureListening()
                }}
              >
                下一段用于注册声纹
              </button>
              <button
                className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                  verifyNext
                    ? "bg-sky-400 text-slate-950"
                    : "bg-slate-700 text-white"
                }`}
                onClick={async () => {
                  setRegisterResult(null)
                  setVerifyResult(null)
                  setRegisterNext(false)
                  setVerifyNext(true)
                  await ensureListening()
                }}
              >
                下一段用于验证声纹
              </button>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            当前待执行动作：
            {registerNext
              ? " 下一段语音将用于注册声纹"
              : verifyNext
                ? " 下一段语音将用于验证声纹"
                : " 未指定（默认进行普通转写）"}
          </div>
        </div>
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
              utterances.map((item) => (
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
    </>
  )
}
