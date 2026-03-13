import re
import requests
import json
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from ..core import state
from ..config import (
    get_llm_temperature,
    get_prd_prompt_template,
    get_poc_prompt_template,
    get_poc_rule_template_path,
    get_contract_prompt_template,
    get_stage_timeout_seconds,
    get_llm_api_url,
    get_llm_model,
    get_llm_api_key,
    get_prd_mode,
    get_poc_mode
)

DEFAULT_POC_RULE_TEMPLATE = (
    '<!DOCTYPE html>\n'
    '<html lang="zh-CN">\n'
    '<head>\n'
    '  <meta charset="UTF-8">\n'
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    '  <title>POC Demo</title>\n'
    '  <script src="https://cdn.tailwindcss.com"></script>\n'
    '</head>\n'
    '<body class="min-h-screen bg-slate-950 text-slate-100 p-8">\n'
    '  <header class="mx-auto max-w-5xl space-y-2">\n'
    '    <h1 class="text-3xl font-semibold">POC Demo</h1>\n'
    '    <p class="text-slate-300">基于 PRD 自动生成的前端原型 (Rule 模式)</p>\n'
    '  </header>\n'
    '  <main class="mx-auto mt-8 grid max-w-5xl gap-6">\n'
    '    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-6">\n'
    '      <h2 class="text-xl font-medium">PRD 内容摘要</h2>\n'
    '      <pre class="mt-4 whitespace-pre-wrap text-sm text-slate-300 font-mono bg-slate-950/50 p-4 rounded-lg">{{prd}}</pre>\n'
    '    </section>\n'
    '  </main>\n'
    '</body>\n'
    '</html>'
)


def normalize_llm_url(base_url: str) -> str:
    """统一 LLM 请求地址，兼容传入 /v1 或 /v1/ 的情况"""
    clean_url = base_url.strip()
    if not clean_url:
        return clean_url
    if clean_url.rstrip("/").endswith("/chat/completions"):
        return clean_url
    if clean_url.rstrip("/").endswith("/v1"):
        return clean_url.rstrip("/") + "/chat/completions"
    return clean_url


def redact_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """遮掩日志中的 Authorization 头部，保护 API Key 安全"""
    safe_headers: Dict[str, str] = {}
    for key, value in headers.items():
        if key.lower() == "authorization":
            safe_headers[key] = "***"
        else:
            safe_headers[key] = value
    return safe_headers


def truncate_log_text(text: Optional[str], max_len: int = 800) -> str:
    """裁剪日志文本"""
    if text is None:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


def strip_think_blocks(text: str) -> str:
    """移除 LLM 输出中的思考标签"""
    if not text:
        return text
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.IGNORECASE | re.DOTALL)
    cleaned = cleaned.replace("<think>", "").replace("</think>", "")
    return cleaned.strip()


def normalize_stage_name(stage: str) -> str:
    """归一化阶段名称"""
    return stage.strip().lower()


def build_model_config(stage: str) -> Dict[str, str]:
    """根据阶段获取对应的 LLM 配置（优先从运行时缓存获取，否则从 config 读取）"""
    from ..config import get_stage_base_url, get_stage_model_name, get_stage_api_key
    normalized = normalize_stage_name(stage)
    stored = state.model_configs_by_stage.get(normalized, {})
    base_url = str(stored.get("base_url") or get_stage_base_url(normalized))
    model_name = str(stored.get("model_name") or get_stage_model_name(normalized))
    api_key = str(stored.get("api_key") or get_stage_api_key(normalized))
    return {
        "stage": normalized,
        "base_url": base_url,
        "model_name": model_name,
        "api_key": api_key
    }


def load_text_template(path: str, fallback: str) -> str:
    """加载文本模板"""
    try:
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
    except OSError:
        return fallback
    if not content.strip():
        return fallback
    return content


def load_json_template(path: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    """加载 JSON 模板"""
    try:
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
    except OSError:
        return fallback
    if not content.strip():
        return fallback
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return fallback
    if isinstance(data, dict):
        merged = fallback.copy()
        merged.update(data)
        return merged
    return fallback


def generate_prd_markdown_llm(transcript: str, rag_context: str) -> str:
    """通过 LLM 生成 PRD Markdown"""
    config = build_model_config("prd")
    api_url = normalize_llm_url(config["base_url"])
    model = config["model_name"]
    if not api_url or not model:
        raise HTTPException(status_code=500, detail="LLM 未配置 (PRD)")
    
    prompt = (
        get_prd_prompt_template()
        .replace("{{transcript}}", transcript)
        .replace("{{rag_context}}", rag_context or "无")
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    if config["api_key"]:
        headers["Authorization"] = f"Bearer {config['api_key']}"
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_stage_timeout_seconds("prd")
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as exc:
        state.logger.error(f"LLM PRD failed: {exc}")
        raise HTTPException(status_code=500, detail=f"LLM 请求失败: {exc}")


def generate_prd_markdown(transcript: str, rag_context: str) -> str:
    """综合 PRD 生成入口（Rule/LLM 切换）"""
    mode = get_prd_mode()
    if mode == "llm":
        return generate_prd_markdown_llm(transcript, rag_context)
    
    # 规则版 PRD 生成逻辑
    lines = [line for line in transcript.splitlines() if line.strip()]
    pain_keywords = ("痛点", "问题", "困难", "慢", "阻塞", "缺少", "无法", "不便", "分散")
    feature_keywords = ("需要", "希望", "功能", "支持", "新增", "增加", "自动", "提醒", "看板", "导出")
    background_candidates = lines[:4]
    pain_points = [line for line in lines if any(keyword in line for keyword in pain_keywords)]
    features = [line for line in lines if any(keyword in line for keyword in feature_keywords)]
    
    background_bullets = "\n".join([f"- {item}" for item in background_candidates]) or "- 暂无可用逐字稿片段"
    pain_bullets = "\n".join([f"- {item}" for item in pain_points]) or "- 待补充"
    feature_bullets = "\n".join([f"- {item}" for item in features]) or "- 待补充"
    rag_bullets = "\n".join([f"- {line}" for line in rag_context.splitlines() if line.strip()]) or "- 暂无检索到的参考资料"
    
    return "\n".join([
        "# 需求概述", "", "## 需求背景", background_bullets, "",
        "## 核心痛点", pain_bullets, "", "## 业务流程", "- 待补充", "",
        "## 功能清单", feature_bullets, "", "## 交互草图描述", "- 待补充", "",
        "## 报价建议", "- 待补充", "", "## 参考资料", rag_bullets
    ])


def generate_poc_code_llm(prd_markdown: str) -> str:
    """通过 LLM 生成 POC 代码"""
    config = build_model_config("poc")
    api_url = normalize_llm_url(config["base_url"])
    model = config["model_name"]
    if not api_url or not model:
        raise HTTPException(status_code=500, detail="LLM 未配置 (POC)")
    
    prd_markdown = strip_think_blocks(prd_markdown)
    prompt = get_poc_prompt_template().replace("{{prd}}", prd_markdown)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    if config["api_key"]:
        headers["Authorization"] = f"Bearer {config['api_key']}"
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_stage_timeout_seconds("poc")
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        content = strip_think_blocks(content).strip()
        # 移除 Markdown 代码块围栏
        if content.startswith("```"):
            first_newline = content.find("\n")
            if first_newline != -1:
                content = content[first_newline + 1:]
            if content.endswith("```"):
                content = content[:-3]
        return content.strip()
    except Exception as exc:
        state.logger.error(f"LLM POC failed: {exc}")
        raise HTTPException(status_code=500, detail=f"LLM 请求失败: {exc}")


def generate_poc_code(prd_markdown: str) -> str:
    """综合 POC 生成入口"""
    mode = get_poc_mode()
    if mode == "llm":
        return generate_poc_code_llm(prd_markdown)
    
    # 规则版 POC 生成逻辑
    safe_prd = prd_markdown.replace("`", "\\`")
    template = load_text_template(get_poc_rule_template_path(), DEFAULT_POC_RULE_TEMPLATE)
    return template.replace("{{prd}}", safe_prd)


def generate_contract_llm(prd_markdown: str, rag_context: str) -> str:
    """通过 LLM 生成合同正文"""
    config = build_model_config("contract")
    api_url = normalize_llm_url(config["base_url"])
    model = config["model_name"]
    if not api_url or not model:
        # 尝试降级到全局 LLM 配置
        api_url = get_llm_api_url()
        model = get_llm_model()
        if not api_url or not model:
            raise HTTPException(status_code=500, detail="LLM 未配置 (Contract)")
        config = {"api_key": get_llm_api_key()}
    
    prompt = (
        get_contract_prompt_template()
        .replace("{{prd}}", prd_markdown)
        .replace("{{rag_context}}", rag_context or "无")
    )
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": get_llm_temperature()
    }
    headers = {"Content-Type": "application/json"}
    if config.get("api_key"):
        headers["Authorization"] = f"Bearer {config['api_key']}"
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=get_stage_timeout_seconds("contract")
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as exc:
        state.logger.error(f"LLM Contract failed: {exc}")
        raise HTTPException(status_code=500, detail=f"LLM 请求失败: {exc}")
