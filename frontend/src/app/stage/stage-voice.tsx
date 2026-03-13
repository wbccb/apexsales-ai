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
  const [hasRegisteredVoiceprint, setHasRegisteredVoiceprint] = useState(false)
  const registerNextRef = useRef(false)
  const verifyNextRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [utterances])

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
          setHasRegisteredVoiceprint(true)
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
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">
            会话 ID: {sessionId ? sessionId.slice(0, 8) : "..."}
          </span>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
            {asrEngineStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={salesId}
            onChange={(e) => setSalesId(e.target.value)}
            placeholder="输入销售 ID"
            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 bg-white">
        {utterances.length === 0 && (
          <div className="mt-10 text-center text-gray-400">
            <p>暂无对话记录</p>
            <p className="text-sm">请输入销售 ID 并开始录音</p>
          </div>
        )}
        {utterances.map((item) => {
          // 简单的判断：如果 speaker 包含 salesId 或者是 "sales"，则认为是销售，显示在右侧
          // 否则显示在左侧
          const isSales =
            (salesId && item.speaker.includes(salesId)) ||
            item.speaker.toLowerCase().includes("sales")
          return (
            <div
              key={item.id}
              className={`flex flex-col ${isSales ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  isSales
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                }`}
              >
                <p>{item.text}</p>
              </div>
              <span className="mt-1 text-xs text-gray-400">
                {item.speaker} • {new Date(item.ts).toLocaleTimeString()}
                {item.asr_fallback ? " (fallback)" : ""}
              </span>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Controls Area */}
      <div className="border-t border-gray-200 bg-gray-50 p-4">
        {(error || registerResult || verifyResult) && (
          <div className="mb-2 text-sm">
            {error && <span className="block text-red-500">{error}</span>}
            {registerResult && (
              <span className="block text-green-600">{registerResult}</span>
            )}
            {verifyResult && (
              <span className="block text-blue-600">{verifyResult}</span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleListening}
                        className={`flex items-center gap-2 rounded-full px-6 py-2 font-medium text-white transition-colors ${
                        isListening
                            ? "bg-red-500 hover:bg-red-600"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                        {isListening ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                </span>
                                停止录音
                            </>
                        ) : (
                            "开始录音"
                        )}
                    </button>
                    <div className="flex items-center gap-2 text-xs text-gray-500 ml-2">
                        {isSpeaking && <span className="font-bold text-green-500">检测到说话...</span>}
                        {isProcessing && <span className="text-blue-500">转写中...</span>}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => {
                        setRegisterNext(!registerNext)
                        setVerifyNext(false)
                        }}
                        className={`rounded px-3 py-1 text-xs border transition-colors ${
                        registerNext
                            ? "bg-amber-100 border-amber-300 text-amber-800"
                            : "bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
                        }`}
                    >
                        {registerNext ? "取消注册模式" : "注册声纹模式"}
                    </button>
                    <button
                        onClick={() => {
                        setVerifyNext(!verifyNext)
                        setRegisterNext(false)
                        }}
                        className={`rounded px-3 py-1 text-xs border transition-colors ${
                        verifyNext
                            ? "bg-sky-100 border-sky-300 text-sky-800"
                            : "bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
                        }`}
                    >
                        {verifyNext ? "取消验证模式" : "验证声纹模式"}
                    </button>
                </div>
            </div>
            
            {!hasRegisteredVoiceprint && (
                 <div className="text-xs text-amber-600">
                    提示：请先输入 Sales ID 并使用“注册声纹模式”录制一段语音以完成声纹注册。
                 </div>
            )}
        </div>
      </div>
    </div>
  )
}
