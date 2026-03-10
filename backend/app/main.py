from datetime import datetime, timezone
import os
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional, cast
from uuid import uuid4

import numpy as np
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess
from pydantic import BaseModel
from resemblyzer import VoiceEncoder, preprocess_wav

from .config import (
    get_asr_device,
    get_asr_model_name,
    get_llm_api_key,
    get_llm_api_url,
    get_llm_model,
    get_llm_temperature,
    get_llm_timeout_seconds,
    get_prd_mode,
    get_prd_prompt_template,
    get_speaker_similarity_threshold
)

app = FastAPI(title="ApexSales AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

utterances_by_session = cast(Dict[str, List[Dict[str, Any]]], {})
prds_by_id = cast(Dict[str, Dict[str, Any]], {})
prds_by_session = cast(Dict[str, str], {})
voice_embeddings_by_user = cast(Dict[str, np.ndarray], {})
asr_model = None
voice_encoder = None


class UtteranceResponse(BaseModel):
    utterance_id: str
    speaker: str
    text: str
    ts: str


class VoiceRegisterResponse(BaseModel):
    user_id: str
    voice_embedding_saved: bool


class VoiceVerifyResponse(BaseModel):
    user_id: str
    similarity: float
    is_sales: bool
    threshold: float


class UtteranceItem(BaseModel):
    id: str
    speaker: str
    text: str
    ts: str


class SessionUtterancesResponse(BaseModel):
    session_id: str
    utterances: List[UtteranceItem]


class SummaryResponse(BaseModel):
    prd_id: str
    markdown: str


class PrdSaveRequest(BaseModel):
    edited_markdown: str


class PrdSaveResponse(BaseModel):
    prd_id: str
    saved: bool


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def get_asr_model():
    global asr_model
    if asr_model is None:
        model_name = get_asr_model_name()
        device = get_asr_device()
        asr_model = AutoModel(
            model=model_name,
            device=device,
            trust_remote_code=True
        )
    return asr_model


def get_voice_encoder():
    global voice_encoder
    if voice_encoder is None:
        voice_encoder = VoiceEncoder()
    return voice_encoder


async def save_upload_to_temp(audio: UploadFile) -> str:
    with NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(await audio.read())
        return temp_file.name


def compute_embedding(file_path: str) -> np.ndarray:
    wav = preprocess_wav(file_path)
    encoder = get_voice_encoder()
    embedding = encoder.embed_utterance(wav)
    return embedding


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def asr_transcribe(file_path: str) -> str:
    model = get_asr_model()
    res = model.generate(
        input=file_path,
        cache={},
        language="auto",
        use_itn=True,
        batch_size_s=60,
        merge_vad=True
    )
    if not res:
        return ""
    text = res[0].get("text", "")
    return rich_transcription_postprocess(text)


def build_transcript(utterances: List[Dict[str, Any]]) -> str:
    lines = []
    for item in utterances:
        speaker = item.get("speaker", "")
        text = item.get("text", "")
        if text:
            lines.append(f"[{speaker}] {text}")
    return "\n".join(lines)


def generate_prd_markdown_rule(transcript: str) -> str:
    lines = [line for line in transcript.splitlines() if line.strip()]
    highlights = lines[:6]
    bullets = "\n".join([f"- {item}" for item in highlights]) or "- 暂无可用逐字稿片段"
    return "\n".join(
        [
            "# 需求概述",
            "",
            "## 需求背景",
            bullets,
            "",
            "## 核心痛点",
            bullets,
            "",
            "## 业务流程",
            "- 待补充",
            "",
            "## 功能清单",
            "- 待补充",
            "",
            "## 交互草图描述",
            "- 待补充",
            "",
            "## 报价建议",
            "- 待补充"
        ]
    )


def generate_prd_markdown_llm(transcript: str) -> str:
    api_url = get_llm_api_url()
    model = get_llm_model()
    if not api_url or not model:
        raise HTTPException(status_code=500, detail="LLM 未配置")
    prompt = get_prd_prompt_template().replace("{{transcript}}", transcript)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    api_key = get_llm_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_llm_timeout_seconds()
        )
    except requests.RequestException:
        raise HTTPException(status_code=500, detail="LLM 请求失败")
    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail="LLM 返回异常")
    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise HTTPException(status_code=500, detail="LLM 返回空内容")
    return content


def generate_prd_markdown(transcript: str) -> str:
    mode = get_prd_mode()
    if mode == "llm":
        return generate_prd_markdown_llm(transcript)
    return generate_prd_markdown_rule(transcript)


@app.post("/voice/register", response_model=VoiceRegisterResponse)
async def voice_register(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceRegisterResponse:
    temp_path = await save_upload_to_temp(audio)
    try:
        embedding = compute_embedding(temp_path)
        voice_embeddings_by_user[user_id] = embedding
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    return VoiceRegisterResponse(user_id=user_id, voice_embedding_saved=True)


@app.post("/voice/verify", response_model=VoiceVerifyResponse)
async def voice_verify(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceVerifyResponse:
    sales_embedding = voice_embeddings_by_user.get(user_id)
    if sales_embedding is None:
        raise HTTPException(status_code=400, detail="销售声纹未注册")
    temp_path = await save_upload_to_temp(audio)
    try:
        current_embedding = compute_embedding(temp_path)
        similarity = cosine_similarity(current_embedding, sales_embedding)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    threshold = get_speaker_similarity_threshold()
    return VoiceVerifyResponse(
        user_id=user_id,
        similarity=similarity,
        is_sales=similarity >= threshold,
        threshold=threshold
    )


@app.post("/asr/transcribe", response_model=UtteranceResponse)
async def transcribe(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    sales_id: Optional[str] = Form(None)
) -> UtteranceResponse:
    temp_path = await save_upload_to_temp(audio)
    try:
        text = asr_transcribe(temp_path)
        speaker = "客户"
        similarity = None
        if sales_id:
            sales_embedding = voice_embeddings_by_user.get(sales_id)
            if sales_embedding is None:
                raise HTTPException(status_code=400, detail="销售声纹未注册")
            current_embedding = compute_embedding(temp_path)
            similarity = cosine_similarity(current_embedding, sales_embedding)
            threshold = get_speaker_similarity_threshold()
            speaker = "销售" if similarity >= threshold else "客户"
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    ts = datetime.now(timezone.utc).isoformat()
    utterance_id = str(uuid4())
    utterance = {
        "id": utterance_id,
        "speaker": speaker,
        "text": text,
        "ts": ts,
        "audio_filename": audio.filename,
        "similarity": similarity
    }
    utterances_by_session.setdefault(session_id, []).append(utterance)
    return UtteranceResponse(
        utterance_id=utterance_id,
        speaker=speaker,
        text=text,
        ts=ts
    )


@app.get("/session/{session_id}/utterances", response_model=SessionUtterancesResponse)
def get_session_utterances(session_id: str) -> SessionUtterancesResponse:
    utterances = utterances_by_session.get(session_id, [])
    return SessionUtterancesResponse(
        session_id=session_id,
        utterances=[UtteranceItem(**item) for item in utterances]
    )


@app.post("/session/{session_id}/summary", response_model=SummaryResponse)
def session_summary(session_id: str) -> SummaryResponse:
    utterances = utterances_by_session.get(session_id, [])
    if not utterances:
        raise HTTPException(status_code=400, detail="会话暂无逐字稿")
    transcript = build_transcript(utterances)
    markdown = generate_prd_markdown(transcript)
    prd_id = str(uuid4())
    prds_by_id[prd_id] = {
        "id": prd_id,
        "session_id": session_id,
        "markdown": markdown,
        "edited_markdown": None
    }
    prds_by_session[session_id] = prd_id
    return SummaryResponse(prd_id=prd_id, markdown=markdown)


@app.post("/prd/{prd_id}/save", response_model=PrdSaveResponse)
def save_prd(prd_id: str, payload: PrdSaveRequest) -> PrdSaveResponse:
    prd = prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
    prd["edited_markdown"] = payload.edited_markdown
    return PrdSaveResponse(prd_id=prd_id, saved=True)
