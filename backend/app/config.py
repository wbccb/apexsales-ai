import os


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
    return os.getenv("PRD_MODE", "rule").lower()


def get_llm_api_url() -> str:
    return os.getenv("LLM_API_URL", "")


def get_llm_api_key() -> str:
    return os.getenv("LLM_API_KEY", "")


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "")


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


def get_prd_prompt_template() -> str:
    return (
        "你是资深售前产品经理。\n"
        "请基于以下会议逐字稿生成结构化 PRD，输出 Markdown：\n"
        "1. 需求背景\n"
        "2. 核心痛点\n"
        "3. 业务流程\n"
        "4. 功能清单\n"
        "5. 交互草图描述\n"
        "6. 报价建议\n"
        "要求：条目化、可执行、避免编造。\n"
        "会议逐字稿：\n"
        "{{transcript}}\n"
    )


def get_poc_mode() -> str:
    return os.getenv("POC_MODE", "rule").lower()


def get_poc_prompt_template() -> str:
    return (
        "你是资深前端工程师。\n"
        "请将以下 PRD 转换为单页面 React 应用代码：\n"
        "1. 使用 Tailwind CSS\n"
        "2. 必须包含假数据\n"
        "3. 不要写任何后端请求\n"
        "4. 只输出代码\n"
        "PRD：\n"
        "{{prd}}\n"
    )


def get_contract_title() -> str:
    return os.getenv("CONTRACT_TITLE", "销售 AI 项目合作合同")


def get_poc_rule_template_path() -> str:
    return os.getenv(
        "POC_RULE_TEMPLATE_PATH",
        os.path.join(os.path.dirname(__file__), "templates", "poc_rule_template.txt")
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
