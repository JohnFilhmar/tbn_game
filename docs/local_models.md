# Local models

Any server that speaks the OpenAI chat completions API can be a provider: Ollama, vLLM, LM
Studio and llama.cpp's server all do. Add it on the desk under Providers with the format
**OpenAI chat completions**, its `/v1` address as the base URL, and no API key unless the server
asks for one. A provider without a key sends no authorization header.

## Reaching the server

The worker runs in a container, so `127.0.0.1` there is the container itself.

- **On the same machine:** use `http://host.docker.internal:<port>/v1`. Both compose files map
  that name to the host. The model server must listen on an address the containers reach, such
  as `0.0.0.0`, not only on `127.0.0.1`.
- **On the LAN or the VPN:** use its address, such as `http://10.0.0.5:8000/v1`.
- **Never** a name of the stack's own services (`postgres`, `web`, `worker`, `sandbox`,
  `egress_proxy`, `searxng`, `prometheus`, `grafana`). The server refuses such a base URL, since
  it would receive the provider's key.

## What the agents need from the model

- **Tool calling.** Agents work through tools, so the model and the server must support them.
  Prefer models trained for it, such as the Qwen, Llama 3.1 or later, and Mistral instruct
  families.
- **A large context window.** Set the model's context window on the desk to what the server
  really gives it; the session is summarised at the context budget preference (60,000 tokens by
  default) or 60 percent of that window, whichever is smaller. A window under 16,000 tokens
  leaves little room for an agent's tools and instructions.
- **Time.** A slow model may need a longer request timeout than the default five minutes:
  raise `PROVIDER_TIMEOUT_MS` in the stack's environment.
- **Prices.** Leave the prices empty: usage is still counted in tokens, and its cost reads 0.

## Ollama

- Listen beyond loopback: `OLLAMA_HOST=0.0.0.0`.
- Set the context length on the server with `OLLAMA_CONTEXT_LENGTH`, for example `32768`. The
  OpenAI endpoint ignores a per-request context size, and Ollama's own default is small (4,096
  tokens on a GPU under 24 GB), which would cut an agent's prompt short.
- Base URL `http://host.docker.internal:11434/v1`; the model id is the Ollama tag, such as
  `qwen2.5:14b`.

## vLLM

- Start it with tool calling on: `--enable-auto-tool-choice --tool-call-parser <parser>`, the
  parser matching the model family (`hermes` for Qwen, `llama3_json` for Llama 3.1, `mistral`
  for Mistral).
- Set the context with `--max-model-len`.
- Base URL `http://<host>:8000/v1`; the model id is the served model name. Start it with
  `--api-key` only if the provider is given the same key.

## LM Studio and llama.cpp

- **LM Studio:** start its server with network serving on; base URL
  `http://host.docker.internal:1234/v1`.
- **llama.cpp's `llama-server`:** pass `--jinja` so it applies the model's chat template with
  tools, `-c` for the context size, and `--host 0.0.0.0`; base URL `http://<host>:8080/v1`.

## Checking it works

Recruit an agent on the new provider and give it a small task. Its run shows each model call,
and the provider's usage panel counts its tokens. A server that answers without usage figures
counts as 0 tokens.
