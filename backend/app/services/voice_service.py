import os
import numpy as np
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Optional
from fastapi import HTTPException, UploadFile
from resemblyzer import VoiceEncoder, preprocess_wav
from ..core import state
from ..config import (
    get_asr_fallback_text,
    get_asr_device,
    get_asr_faster_whisper_beam_size,
    get_asr_faster_whisper_compute_type,
    get_asr_faster_whisper_device,
    get_asr_faster_whisper_model,
    get_asr_language,
    get_asr_model_name,
    get_asr_provider
)

try:
    from funasr import AutoModel
    from funasr.utils.postprocess_utils import rich_transcription_postprocess
except Exception:
    AutoModel = None
    def rich_transcription_postprocess(text: str) -> str:
        return text

try:
    from faster_whisper import WhisperModel
except Exception:
    WhisperModel = None


def get_asr_model():
    """获取 FunASR 模型（懒加载）"""
    if AutoModel is None:
        raise HTTPException(status_code=503, detail="未安装 funasr，无法使用语音转写功能")
    if state.asr_model is None:
        model_name = get_asr_model_name()
        device = get_asr_device()
        state.asr_model = AutoModel(
            model=model_name,
            device=device,
            trust_remote_code=True
        )
    return state.asr_model


def get_faster_whisper_model():
    """获取 Faster-Whisper 模型（懒加载）"""
    if WhisperModel is None:
        raise HTTPException(status_code=503, detail="未安装 faster-whisper，无法使用 Whisper 转写")
    if state.faster_whisper_model is None:
        state.faster_whisper_model = WhisperModel(
            model_size_or_path=get_asr_faster_whisper_model(),
            device=get_asr_faster_whisper_device(),
            compute_type=get_asr_faster_whisper_compute_type()
        )
    return state.faster_whisper_model


def get_voice_encoder():
    """获取声纹编码器（懒加载）"""
    if state.voice_encoder is None:
        state.voice_encoder = VoiceEncoder()
    return state.voice_encoder


async def save_upload_to_temp(audio: UploadFile) -> str:
    """将上传音频保存到临时文件"""
    with NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(await audio.read())
        return temp_file.name


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """计算余弦相似度"""
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def compute_embedding(file_path: str) -> np.ndarray:
    """提取音频声纹向量"""
    wav = preprocess_wav(file_path)
    encoder = get_voice_encoder()
    embedding = encoder.embed_utterance(wav)
    return embedding


def asr_transcribe_by_funasr(file_path: str) -> Dict[str, Any]:
    """使用 FunASR 进行转写"""
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
        return {"text": "", "asr_engine": "funasr", "asr_fallback": False}
    text = res[0].get("text", "")
    return {
        "text": rich_transcription_postprocess(text),
        "asr_engine": "funasr",
        "asr_fallback": False
    }


def asr_transcribe_by_faster_whisper(file_path: str) -> Dict[str, Any]:
    """使用 Faster-Whisper 进行转写"""
    model = get_faster_whisper_model()
    language = get_asr_language().strip()
    kwargs: Dict[str, Any] = {"beam_size": get_asr_faster_whisper_beam_size()}
    if language:
        kwargs["language"] = language
    segments, _ = model.transcribe(file_path, **kwargs)
    text = "".join(segment.text for segment in segments).strip()
    return {"text": text, "asr_engine": "whisper", "asr_fallback": False}


def asr_transcribe(file_path: str) -> Dict[str, Any]:
    """综合 ASR 转写逻辑（支持 Provider 路由与 Fallback）"""
    provider = get_asr_provider()
    fallback_text = get_asr_fallback_text().strip()
    if provider == "funasr":
        try:
            return asr_transcribe_by_funasr(file_path)
        except Exception as exc:
            if fallback_text:
                return {"text": fallback_text, "asr_engine": "fallback", "asr_fallback": True}
            raise HTTPException(status_code=503, detail=f"ASR 调用失败：{str(exc)}") from exc
    if provider == "faster_whisper":
        try:
            return asr_transcribe_by_faster_whisper(file_path)
        except Exception as exc:
            if fallback_text:
                return {"text": fallback_text, "asr_engine": "fallback", "asr_fallback": True}
            raise HTTPException(status_code=503, detail=f"ASR 调用失败：{str(exc)}") from exc
    
    # 自动切换模式
    funasr_error: Optional[Exception] = None
    try:
        return asr_transcribe_by_funasr(file_path)
    except Exception as exc:
        funasr_error = exc
    try:
        return asr_transcribe_by_faster_whisper(file_path)
    except Exception as whisper_exc:
        if fallback_text:
            return {"text": fallback_text, "asr_engine": "fallback", "asr_fallback": True}
        raise HTTPException(
            status_code=503,
            detail=f"ASR 调用失败：funasr={str(funasr_error)}; faster_whisper={str(whisper_exc)}"
        ) from whisper_exc
