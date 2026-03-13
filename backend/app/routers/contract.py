import os
import re
from datetime import datetime
from uuid import uuid4
from typing import Any, Dict, List, Optional, cast
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from ..models.schemas import ContractResponse
from ..core import state
from ..core.storage import get_contract_storage_dir
from .session import build_rag_context, build_citation_models
from ..services.knowledge_service import search_knowledge_matches
from ..services.llm_service import (
    generate_contract_llm,
    load_text_template,
    load_json_template,
    strip_think_blocks
)
from ..services.pdf_service import wrap_contract_text
from ..config import (
    get_contract_prompt_template,
    get_contract_style_path,
    get_contract_template_path,
    get_contract_title
)

router = APIRouter(tags=["Contract Generation"])

DEFAULT_CONTRACT_TEMPLATE = (
    "签署日期：{{date}}\n"
    "\n"
    "{{prd_markdown}}\n"
)

DEFAULT_CONTRACT_STYLE: Dict[str, Any] = {
    "title": "销售 AI 项目合作合同",
    "render_title": True,
    "title_font": "STSong-Light",
    "title_size": 16,
    "body_font": "STSong-Light",
    "body_size": 11,
    "margin_left": 40,
    "margin_top": 40,
    "margin_bottom": 40,
    "line_height": 16,
    "title_spacing": 20,
    "max_chars": 80
}

def strip_contract_think_content(text: str) -> str:
    """清理 LLM 合同输出中的思考标签"""
    return re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)

def strip_contract_markdown_fences(text: str) -> str:
    """去除 Markdown 代码块包裹"""
    return re.sub(r"```(?:\w+)?\s*([\s\S]*?)```", r"\1", text)

def remove_contract_reference_section(text: str) -> str:
    """过滤 “来源依据/参考资料” 段落"""
    lines = text.splitlines()
    cleaned_lines: List[str] = []
    skip_reference = False
    for line in lines:
        normalized = re.sub(r"^#{1,6}\s*", "", line).strip()
        if normalized.startswith("来源依据") or normalized.startswith("参考资料"):
            skip_reference = True
        if skip_reference:
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines)

def normalize_contract_line(line: str) -> str:
    """清理单行中的 Markdown 结构标记"""
    normalized = re.sub(r"^#{1,6}\s*", "", line).strip()
    normalized = re.sub(r"^\d+\.\s*", "", normalized)
    normalized = re.sub(r"^[-*]\s*", "", normalized)
    normalized = re.sub(r"^>\s*", "", normalized)
    normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
    normalized = re.sub(r"[*_`]+", "", normalized)
    normalized = re.sub(r"\s{2,}", " ", normalized).strip()
    return normalized

def clean_contract_text(text: str) -> str:
    """合同正文清洗入口"""
    without_think = strip_contract_think_content(text)
    without_fences = strip_contract_markdown_fences(without_think)
    without_references = remove_contract_reference_section(without_fences)
    cleaned_lines = [normalize_contract_line(line) for line in without_references.splitlines()]
    return "\n".join(cleaned_lines).strip()

def clean_prd_for_contract(text: str) -> str:
    """PRD 内容清洗，用于合同生成上下文"""
    return clean_contract_text(text)

def ensure_contract_fonts(style: Dict[str, Any]) -> Dict[str, Any]:
    """确保中文字体可用"""
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    except Exception:
        return style
    updated = style.copy()
    fallback_fonts = {"Helvetica", "Helvetica-Bold", "Times-Roman", "Times-Bold", "Courier", "Courier-Bold"}
    title_font = str(updated.get("title_font") or "")
    body_font = str(updated.get("body_font") or "")
    if not title_font or title_font in fallback_fonts:
        updated["title_font"] = "STSong-Light"
    if not body_font or body_font in fallback_fonts:
        updated["body_font"] = "STSong-Light"
    return updated

def extract_quote_payload(markdown: str) -> Optional[Dict[str, Any]]:
    """从 Markdown 文本中提取结构化报价"""
    items: List[Dict[str, Any]] = []
    for line in markdown.splitlines():
        if ("价格" not in line) and ("报价" not in line) and ("price" not in line.lower()):
            continue
        values = re.findall(r"\d+(?:\.\d+)?", line)
        if not values:
            continue
        unit_price = float(values[0])
        quantity = float(values[1]) if len(values) > 1 else 1.0
        tax_rate = float(values[2]) if len(values) > 2 else 0.0
        subtotal = unit_price * quantity
        total = subtotal * (1.0 + tax_rate / 100.0)
        items.append({
            "name": line.strip()[:80],
            "unit_price": unit_price,
            "quantity": quantity,
            "tax_rate": tax_rate,
            "subtotal": round(subtotal, 2),
            "total": round(total, 2)
        })
    if not items:
        return None
    grand_total = round(sum(float(item["total"]) for item in items), 2)
    return {
        "items": items,
        "grand_total": grand_total,
        "payment_terms": "50% 预付款，50% 交付后支付"
    }

def render_contract_pdf(prd_markdown: str, file_path: str) -> None:
    """渲染合同 PDF"""
    style = load_json_template(get_contract_style_path(), DEFAULT_CONTRACT_STYLE)
    style = ensure_contract_fonts(style)
    title = style.get("title") or get_contract_title()
    template = load_text_template(get_contract_template_path(), DEFAULT_CONTRACT_TEMPLATE)
    
    rendered = (
        template.replace("{{title}}", title)
        .replace("{{date}}", datetime.now().strftime("%Y-%m-%d"))
        .replace("{{prd_markdown}}", prd_markdown)
    )
    
    pdf = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4
    margin_left = float(style.get("margin_left", 40))
    margin_top = float(style.get("margin_top", 40))
    margin_bottom = float(style.get("margin_bottom", 40))
    line_height = float(style.get("line_height", 16))
    max_width = max(0.0, width - margin_left * 2)
    y = height - margin_top
    
    if bool(style.get("render_title", True)):
        pdf.setFont(str(style.get("title_font", "Helvetica-Bold")), float(style.get("title_size", 16)))
        pdf.drawString(margin_left, y, title)
        y -= float(style.get("title_spacing", 20))
        
    body_font = str(style.get("body_font", "Helvetica"))
    body_size = float(style.get("body_size", 11))
    pdf.setFont(body_font, body_size)
    
    for line in wrap_contract_text(rendered, body_font, body_size, max_width):
        if y < margin_bottom:
            pdf.showPage()
            y = height - margin_top
            pdf.setFont(body_font, body_size)
        pdf.drawString(margin_left, y, line)
        y -= line_height
    pdf.save()

@router.post("/contract/{prd_id}", response_model=ContractResponse)
def generate_contract(prd_id: str) -> ContractResponse:
    """基于 PRD 生成正式合同 PDF"""
    prd = state.prds_by_id.get(prd_id)
    if prd is None:
        raise HTTPException(status_code=404, detail="PRD 不存在")
        
    markdown = prd.get("edited_markdown") or prd.get("markdown") or ""
    cleaned_prd = clean_prd_for_contract(markdown)
    query = cleaned_prd[:500].replace("\n", " ")
    
    retrieved = search_knowledge_matches(query=query, top_k=5, business_tag=None)
    # 引用 RAG 上下文构建
    rag_context = build_rag_context(retrieved)
    
    contract_body_raw = generate_contract_llm(cleaned_prd, rag_context)
    contract_body = clean_contract_text(contract_body_raw)
    
    if not contract_body:
        contract_body = clean_contract_text(cleaned_prd)
        
    quote_payload = extract_quote_payload(contract_body)
    if not quote_payload:
        quote_payload = extract_quote_payload(cleaned_prd)
        
    contract_id = str(uuid4())
    contract_dir = get_contract_storage_dir()
    file_path = os.path.join(contract_dir, f"{contract_id}.pdf")
    
    render_contract_pdf(contract_body, file_path)
    
    state.contracts_by_id[contract_id] = {
        "id": contract_id,
        "prd_id": prd_id,
        "pdf_path": file_path,
        "quote_payload": quote_payload
    }
    state.save_runtime_state()
    
    pdf_url = f"/contract/{contract_id}/download"
    return ContractResponse(contract_id=contract_id, pdf_url=pdf_url)

@router.get("/contract/{contract_id}/download")
def download_contract(contract_id: str):
    """下载合同 PDF 文件"""
    contract = state.contracts_by_id.get(contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    pdf_path = contract.get("pdf_path")
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="合同文件不存在")
    return FileResponse(pdf_path, filename=f"contract-{contract_id}.pdf")
