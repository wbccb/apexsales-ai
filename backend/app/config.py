import os


def load_env_file() -> None:
    env_path = os.getenv(
        "APEXSALES_ENV_PATH",
        os.path.join(os.path.dirname(__file__), "..", ".env")
    )
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as file:
            for line in file:
                cleaned = line.strip()
                if not cleaned or cleaned.startswith("#") or "=" not in cleaned:
                    continue
                key, value = cleaned.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


load_env_file()


def get_asr_model_name() -> str:
    return os.getenv("ASR_MODEL", "iic/SenseVoiceSmall")


def get_asr_provider() -> str:
    return os.getenv("ASR_PROVIDER", "auto").lower()


def get_asr_device() -> str:
    return os.getenv("ASR_DEVICE", "cpu")


def get_asr_language() -> str:
    return os.getenv("ASR_LANGUAGE", "zh")


def get_asr_fallback_text() -> str:
    return os.getenv("ASR_FALLBACK_TEXT", "【ASR 暂不可用，已返回降级转写】")


def get_asr_faster_whisper_model() -> str:
    return os.getenv("ASR_FASTER_WHISPER_MODEL", "small")


def get_asr_faster_whisper_device() -> str:
    return os.getenv("ASR_FASTER_WHISPER_DEVICE", "cpu")


def get_asr_faster_whisper_compute_type() -> str:
    return os.getenv("ASR_FASTER_WHISPER_COMPUTE_TYPE", "int8")


def get_asr_faster_whisper_beam_size() -> int:
    value = os.getenv("ASR_FASTER_WHISPER_BEAM_SIZE", "3")
    try:
        return max(1, int(value))
    except ValueError:
        return 3


def get_speaker_similarity_threshold() -> float:
    value = os.getenv("SPEAKER_SIM_THRESHOLD", "0.8")
    try:
        return float(value)
    except ValueError:
        return 0.8


def get_prd_mode() -> str:
    return os.getenv("PRD_MODE", "llm").lower()


def get_llm_api_url() -> str:
    return os.getenv("LLM_API_URL", "")


def get_llm_api_key() -> str:
    return os.getenv("LLM_API_KEY", "")


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "")


def get_stage_env_prefix(stage: str) -> str:
    mapping = {
        "voice": "VOICE",
        "prd": "PRD",
        "poc": "POC",
        "contract": "CONTRACT"
    }
    return mapping.get(stage.strip().lower(), "")


def get_stage_env_value(stage: str, key: str) -> str:
    prefix = get_stage_env_prefix(stage)
    if not prefix:
        return ""
    return os.getenv(f"{prefix}_{key}", "")


def get_stage_base_url(stage: str) -> str:
    return get_stage_env_value(stage, "BASE_URL") or get_llm_api_url()


def get_stage_model_name(stage: str) -> str:
    return get_stage_env_value(stage, "MODEL_NAME") or get_llm_model()


def get_stage_api_key(stage: str) -> str:
    return get_stage_env_value(stage, "API_KEY") or get_llm_api_key()


def get_llm_temperature() -> float:
    value = os.getenv("LLM_TEMPERATURE", "0.2")
    try:
        return float(value)
    except ValueError:
        return 0.2


def get_llm_timeout_seconds() -> int:
    value = os.getenv("LLM_TIMEOUT_SECONDS", "60")
    try:
        return int(value)
    except ValueError:
        return 60


def get_stage_timeout_seconds(stage: str) -> int:
    value = get_stage_env_value(stage, "TIMEOUT_SECONDS")
    if value:
        try:
            return max(1, int(value))
        except ValueError:
            return get_llm_timeout_seconds()
    return get_llm_timeout_seconds()


def get_prd_prompt_template() -> str:
    return (
        "你是资深售前产品经理。\n"
        "请先完成意图识别与关键信息抽取，再生成结构化 PRD，输出 Markdown。\n"
        "输出必须包含以下模块，并将识别结果填入标准需求文档：\n"
        "1. 意图识别摘要（客户目标、关键问题、成功指标）\n"
        "2. 需求背景\n"
        "3. 核心痛点\n"
        "4. 业务流程\n"
        "5. 功能清单\n"
        "6. 交互草图描述\n"
        "7. 报价建议\n"
        "8. 参考资料（从 RAG 内容提炼结论）\n"
        "要求：条目化、可执行、避免编造，仅使用逐字稿和 RAG 内容。\n"
        "会议逐字稿：\n"
        "{{transcript}}\n"
        "\n"
        "RAG 参考内容：\n"
        "{{rag_context}}\n"
    )


def get_contract_prompt_template() -> str:
    return (
        "你是资深法务专家。\n"
        "请根据以下需求文档（PRD）和参考资料（RAG），起草一份标准的商业合同。\n"
        "要求：\n"
        "1. 格式专业，包含：合同标题、甲乙双方、合作背景、服务内容、报价条款、交付标准、验收方式、知识产权、保密条款、违约责任、争议解决。\n"
        "2. 必须包含结构化的报价列表（基于 PRD 中的报价建议）。\n"
        "3. 输出为 Markdown 格式。\n"
        "\n"
        "PRD 内容：\n"
        "{{prd}}\n"
        "\n"
        "参考资料：\n"
        "{{rag_context}}\n"
    )


def get_poc_mode() -> str:
    return os.getenv("POC_MODE", "rule").lower()


def get_poc_prompt_template() -> str:
    return (
        "你是资深前端工程师。\n"
        "请根据以下 PRD 需求，编写一个单文件 HTML5 页面作为 POC 演示原型（High-Fidelity Prototype）。\n"
        "目标：让用户能直接体验产品功能，而不是阅读文档。\n"
        "要求：\n"
        "1. **技术栈**：单文件 HTML，使用 Tailwind CSS (CDN)，交互逻辑使用 Vue 3 (CDN) 或原生 JS。\n"
        "2. **设计**：采用现代化的移动端 App 风格（Mobile-First），UI 精美，布局合理。\n"
        "3. **功能实现**：根据 PRD 描述的核心流程，实现关键界面和交互（例如：若是 CRM 则展示列表与详情；若是聊天则展示对话框）。\n"
        "4. **交互细节**：按钮必须可点击（要有反馈），Tab 可切换，表单可提交（Mock 提示），模拟真实 App 体验。\n"
        "5. **数据**：使用逼真的 Mock 数据填充界面，严禁使用“测试数据123”等占位符。\n"
        "6. **禁止项**：严禁直接展示 PRD 文本！严禁生成文档阅读器！必须生成真正的 App 界面！\n"
        "7. **输出**：只输出最终的 HTML 代码，不要包含 Markdown 标记。\n"
        "\n"
        "PRD 内容：\n"
        "{{prd}}\n"
    )


def get_contract_title() -> str:
    return os.getenv("CONTRACT_TITLE", "销售 AI 项目合作合同")


def get_poc_rule_template_path() -> str:
    return os.getenv(
        "POC_RULE_TEMPLATE_PATH",
        os.path.join(os.path.dirname(__file__), "templates", "poc_rule_template.html")
    )


def get_contract_template_path() -> str:
    return os.getenv(
        "CONTRACT_TEMPLATE_PATH",
        os.path.join(os.path.dirname(__file__), "templates", "contract_template.txt")
    )


def get_contract_style_path() -> str:
    return os.getenv(
        "CONTRACT_STYLE_PATH",
        os.path.join(os.path.dirname(__file__), "templates", "contract_style.json")
    )
