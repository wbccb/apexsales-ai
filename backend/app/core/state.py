import json
import os
from typing import Any, Dict, List, Optional, cast
import numpy as np
import logging

# 复用 Uvicorn 的错误日志通道
logger = logging.getLogger("uvicorn.error")

# 运行时内存缓存
utterances_by_session = cast(Dict[str, List[Dict[str, Any]]], {})
prds_by_id = cast(Dict[str, Dict[str, Any]], {})
prds_by_session = cast(Dict[str, str], {})
pocs_by_id = cast(Dict[str, Dict[str, Any]], {})
pocs_by_share = cast(Dict[str, str], {})
contracts_by_id = cast(Dict[str, Dict[str, Any]], {})
voice_embeddings_by_user = cast(Dict[str, np.ndarray], {})
knowledge_documents_by_id = cast(Dict[str, Dict[str, Any]], {})
knowledge_chunks_by_doc = cast(Dict[str, List[Dict[str, Any]]], {})
prd_citations_by_prd = cast(Dict[str, List[Dict[str, Any]]], {})
model_configs_by_stage = cast(Dict[str, Dict[str, str]], {})

# 模型懒加载容器
asr_model = None
faster_whisper_model = None
voice_encoder = None

def get_storage_root_dir() -> str:
    """获取存储根目录"""
    directory = os.path.join(os.path.dirname(__file__), "..", "..", "storage")
    abs_directory = os.path.abspath(directory)
    os.makedirs(abs_directory, exist_ok=True)
    return abs_directory

def get_runtime_state_path() -> str:
    """获取运行时状态文件路径"""
    return os.path.join(get_storage_root_dir(), "runtime_state.json")

def serialize_voice_embeddings() -> Dict[str, List[float]]:
    """序列化声纹向量"""
    payload: Dict[str, List[float]] = {}
    for user_id, embedding in voice_embeddings_by_user.items():
        payload[user_id] = [float(value) for value in embedding.tolist()]
    return payload

def serialize_knowledge_chunks() -> Dict[str, List[Dict[str, Any]]]:
    """序列化知识分片"""
    payload: Dict[str, List[Dict[str, Any]]] = {}
    for document_id, chunks in knowledge_chunks_by_doc.items():
        payload[document_id] = []
        for chunk in chunks:
            payload[document_id].append(
                {
                    "chunk_id": str(chunk.get("chunk_id", "")),
                    "document_id": str(chunk.get("document_id", "")),
                    "chunk_index": int(chunk.get("chunk_index", 0)),
                    "page_no": cast(Optional[int], chunk.get("page_no")),
                    "content": str(chunk.get("content", "")),
                    "token_count": int(chunk.get("token_count", 0)),
                    "embedding": [
                        float(value)
                        for value in cast(np.ndarray, chunk.get("embedding", np.zeros(256, dtype=np.float32))).tolist()
                    ]
                }
            )
    return payload

def save_runtime_state() -> None:
    """持久化内存状态到 JSON"""
    payload = {
        "utterances_by_session": utterances_by_session,
        "prds_by_id": prds_by_id,
        "prds_by_session": prds_by_session,
        "pocs_by_id": pocs_by_id,
        "pocs_by_share": pocs_by_share,
        "contracts_by_id": contracts_by_id,
        "voice_embeddings_by_user": serialize_voice_embeddings(),
        "knowledge_documents_by_id": knowledge_documents_by_id,
        "knowledge_chunks_by_doc": serialize_knowledge_chunks(),
        "prd_citations_by_prd": prd_citations_by_prd,
        "model_configs_by_stage": model_configs_by_stage
    }
    try:
        with open(get_runtime_state_path(), "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save runtime state: {e}")

def load_runtime_state() -> None:
    """从 JSON 加载持久化状态"""
    path = get_runtime_state_path()
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return
    
    utterances_by_session.clear()
    utterances_by_session.update(cast(Dict[str, List[Dict[str, Any]]], payload.get("utterances_by_session", {})))
    prds_by_id.clear()
    prds_by_id.update(cast(Dict[str, Dict[str, Any]], payload.get("prds_by_id", {})))
    prds_by_session.clear()
    prds_by_session.update(cast(Dict[str, str], payload.get("prds_by_session", {})))
    pocs_by_id.clear()
    pocs_by_id.update(cast(Dict[str, Dict[str, Any]], payload.get("pocs_by_id", {})))
    pocs_by_share.clear()
    pocs_by_share.update(cast(Dict[str, str], payload.get("pocs_by_share", {})))
    contracts_by_id.clear()
    contracts_by_id.update(cast(Dict[str, Dict[str, Any]], payload.get("contracts_by_id", {})))
    
    voice_embeddings_by_user.clear()
    raw_voice = cast(Dict[str, List[float]], payload.get("voice_embeddings_by_user", {}))
    for user_id, values in raw_voice.items():
        voice_embeddings_by_user[user_id] = np.array(values, dtype=np.float32)
        
    knowledge_documents_by_id.clear()
    knowledge_documents_by_id.update(
        cast(Dict[str, Dict[str, Any]], payload.get("knowledge_documents_by_id", {}))
    )
    
    knowledge_chunks_by_doc.clear()
    raw_chunks = cast(Dict[str, List[Dict[str, Any]]], payload.get("knowledge_chunks_by_doc", {}))
    for document_id, chunks in raw_chunks.items():
        knowledge_chunks_by_doc[document_id] = []
        for chunk in chunks:
            knowledge_chunks_by_doc[document_id].append(
                {
                    "chunk_id": str(chunk.get("chunk_id", "")),
                    "document_id": str(chunk.get("document_id", "")),
                    "chunk_index": int(chunk.get("chunk_index", 0)),
                    "page_no": cast(Optional[int], chunk.get("page_no")),
                    "content": str(chunk.get("content", "")),
                    "token_count": int(chunk.get("token_count", 0)),
                    "embedding": np.array(cast(List[float], chunk.get("embedding", [])), dtype=np.float32)
                }
            )
            
    prd_citations_by_prd.clear()
    prd_citations_by_prd.update(cast(Dict[str, List[Dict[str, Any]]], payload.get("prd_citations_by_prd", {})))
    model_configs_by_stage.clear()
    model_configs_by_stage.update(
        cast(Dict[str, Dict[str, str]], payload.get("model_configs_by_stage", {}))
    )
