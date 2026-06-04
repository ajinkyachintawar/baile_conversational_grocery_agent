import os
from functools import lru_cache
from openai import OpenAI

_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5"


@lru_cache(maxsize=1)
def get_nim() -> OpenAI:
    return OpenAI(
        api_key=os.environ["NIM_API_KEY_EMBED"],
        base_url="https://integrate.api.nvidia.com/v1",
    )


def embed(text: str) -> list[float]:
    resp = get_nim().embeddings.create(
        model=_EMBED_MODEL,
        input=[text],
        encoding_format="float",
        extra_body={"input_type": "query", "truncate": "END"},
    )
    return resp.data[0].embedding
