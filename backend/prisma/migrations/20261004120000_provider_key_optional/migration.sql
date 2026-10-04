-- Phase 4g: a provider's API key is optional, for local models such as Ollama or vLLM that take
-- none. A provider without a key sends no authorization header.

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "api_key_ciphertext" DROP NOT NULL;
