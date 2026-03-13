import os
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from ..models.schemas import (
    VoiceRegisterResponse,
    VoiceVerifyResponse,
    UtteranceResponse
)
from ..core import state
from ..services.voice_service import (
    save_upload_to_temp,
    compute_embedding,
    cosine_similarity,
    asr_transcribe
)
from ..config import get_speaker_similarity_threshold


router = APIRouter(tags=["Voice & ASR"])


@router.post("/voice/register", response_model=VoiceRegisterResponse)
async def voice_register(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceRegisterResponse:
    """注册用户声纹"""
    temp_path = await save_upload_to_temp(audio)
    try:
        embedding = compute_embedding(temp_path)
        state.voice_embeddings_by_user[user_id] = embedding
        state.save_runtime_state()
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
    return VoiceRegisterResponse(user_id=user_id, voice_embedding_saved=True)


@router.post("/voice/verify", response_model=VoiceVerifyResponse)
async def voice_verify(
    user_id: str = Form(...),
    audio: UploadFile = File(...)
) -> VoiceVerifyResponse:
    """验证音频声纹是否匹配特定用户"""
    sales_embedding = state.voice_embeddings_by_user.get(user_id)
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


@router.post("/asr/transcribe", response_model=UtteranceResponse)
async def transcribe(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
    sales_id: Optional[str] = Form(None)
) -> UtteranceResponse:
    """ASR 转写音频，并可选进行声纹识别"""
    temp_path = await save_upload_to_temp(audio)
    try:
        asr_result = asr_transcribe(temp_path)
        text = str(asr_result.get("text", ""))
        asr_engine = str(asr_result.get("asr_engine", "fallback"))
        asr_fallback = bool(asr_result.get("asr_fallback", False))
        
        speaker = "客户"
        similarity = None
        if sales_id:
            sales_embedding = state.voice_embeddings_by_user.get(sales_id)
            if sales_embedding is None:
                raise HTTPException(status_code=400, detail="销售声纹未注册")
            current_embedding = compute_embedding(temp_path)
            similarity = cosine_similarity(current_embedding, sales_embedding)
            threshold = get_speaker_similarity_threshold()
            speaker = "销售" if similarity >= threshold else "客户"
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"语音处理失败：{str(exc)}") from exc
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
        "asr_engine": asr_engine,
        "asr_fallback": asr_fallback,
        "audio_filename": audio.filename,
        "similarity": similarity
    }
    state.utterances_by_session.setdefault(session_id, []).append(utterance)
    state.save_runtime_state()
    
    return UtteranceResponse(
        utterance_id=utterance_id,
        speaker=speaker,
        text=text,
        ts=ts,
        asr_engine=asr_engine,
        asr_fallback=asr_fallback
    )
