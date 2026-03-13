from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class UtteranceResponse(BaseModel):
    """ASR + 声纹二分接口响应模型"""
    utterance_id: str
    speaker: str
    text: str
    ts: str
    asr_engine: str
    asr_fallback: bool


class VoiceRegisterResponse(BaseModel):
    """声纹注册接口响应模型"""
    user_id: str
    voice_embedding_saved: bool


class VoiceVerifyResponse(BaseModel):
    """声纹验证接口响应模型"""
    user_id: str
    similarity: float
    is_sales: bool
    threshold: float


class UtteranceItem(BaseModel):
    """逐字稿片段项模型"""
    id: str
    speaker: str
    text: str
    ts: str
    asr_engine: Optional[str] = None
    asr_fallback: Optional[bool] = None


class SessionUtterancesResponse(BaseModel):
    """会话逐字稿接口响应模型"""
    session_id: str
    utterances: List[UtteranceItem]


class CitationItem(BaseModel):
    """RAG 引用项模型"""
    document_id: str
    chunk_id: str
    score: float
    page_no: Optional[int]
    snippet: str
    content: str = ""


class SummaryResponse(BaseModel):
    """会话总结接口响应模型"""
    prd_id: str
    markdown: str
    citations: List[CitationItem] = []
    rag_used: bool = False
    retrieval_query: str = ""


class SummaryRequest(BaseModel):
    """会话总结接口请求模型"""
    rag_enabled: bool = True
    top_k: int = 5
    business_tag: Optional[str] = None


class PrdSaveRequest(BaseModel):
    """PRD 保存接口请求模型"""
    edited_markdown: str


class PrdSaveResponse(BaseModel):
    """PRD 保存接口响应模型"""
    prd_id: str
    saved: bool


class PocResponse(BaseModel):
    """POC 生成接口响应模型"""
    poc_id: str
    code: str
    share_uuid: str


class PocFetchResponse(BaseModel):
    """POC 获取接口响应模型"""
    poc_id: str
    code: str


class ContractResponse(BaseModel):
    """合同生成接口响应模型"""
    contract_id: str
    pdf_url: str


class KnowledgeUploadResponse(BaseModel):
    """知识库上传接口响应模型"""
    document_id: str
    status: str
    filename: str


class KnowledgeDocumentItem(BaseModel):
    """知识库文档项模型"""
    document_id: str
    filename: str
    status: str
    owner_user_id: Optional[str]
    business_tag: Optional[str]
    created_at: str
    updated_at: str
    chunk_count: int
    error_message: Optional[str]


class KnowledgeDocumentsResponse(BaseModel):
    """知识库列表接口响应模型"""
    total: int
    page: int
    page_size: int
    documents: List[KnowledgeDocumentItem]


class KnowledgeReindexResponse(BaseModel):
    """知识库重建索引响应模型"""
    document_id: str
    status: str


class KnowledgeRetrieveRequest(BaseModel):
    """知识库检索接口请求模型"""
    query: str
    top_k: int = 5
    business_tag: Optional[str] = None


class KnowledgeMatch(BaseModel):
    """知识库检索匹配项模型"""
    document_id: str
    chunk_id: str
    score: float
    page_no: Optional[int]
    content: str


class KnowledgeRetrieveResponse(BaseModel):
    """知识库检索接口响应模型"""
    matches: List[KnowledgeMatch]


class ModelConfigItem(BaseModel):
    """模型配置项模型"""
    stage: str
    base_url: str
    model_name: str
    api_key: str


class ModelConfigListResponse(BaseModel):
    """模型配置列表响应模型"""
    configs: List[ModelConfigItem]


class ModelConfigSaveRequest(BaseModel):
    """模型配置保存请求模型"""
    configs: List[ModelConfigItem]


class ModelConfigSaveResponse(BaseModel):
    """模型配置保存响应模型"""
    saved: bool
    configs: List[ModelConfigItem]
