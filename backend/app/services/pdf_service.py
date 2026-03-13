from typing import List
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


def extract_pdf_pages(file_path: str) -> List[str]:
    """提取 PDF 每页的文本内容"""
    reader = PdfReader(file_path)
    pages: List[str] = []
    for page in reader.pages:
        pages.append((page.extract_text() or "").strip())
    return pages


def wrap_contract_text(
    text: str,
    font_name: str,
    font_size: float,
    max_width: float
) -> List[str]:
    """根据页面宽度对合同文本进行自动换行处理"""
    lines: List[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        buffer = ""
        for char in line:
            candidate = f"{buffer}{char}"
            if pdfmetrics.stringWidth(candidate, font_name, font_size) <= max_width:
                buffer = candidate
                continue
            if buffer:
                lines.append(buffer)
            buffer = char
        if buffer:
            lines.append(buffer)
    return lines
