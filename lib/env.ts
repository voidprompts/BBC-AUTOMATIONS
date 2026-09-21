import "server-only";

/**
 * Centralized, type-safe access to server environment variables.
 * Throws early with a clear message instead of failing deep inside
 * an API call with a cryptic 401.
 */

type EnvKey = "NVIDIA_API_KEY" | "BLOB_READ_WRITE_TOKEN";

export class MissingEnvError extends Error {
  constructor(key: EnvKey) {
    super(
      `Missing required environment variable "${key}". ` +
        `Copy .env.example to .env.local and fill it in.`
    );
    this.name = "MissingEnvError";
  }
}

function required(key: EnvKey): string {
  const value = process.env[key];
  if (!value || value.trim() === "" || value.includes("xxxxxxxx")) {
    throw new MissingEnvError(key);
  }
  return value;
}

export const env = {
  get nvidiaApiKey(): string {
    return required("NVIDIA_API_KEY");
  },
  get blobToken(): string {
    return required("BLOB_READ_WRITE_TOKEN");
  },
  get nvidiaBaseUrl(): string {
    return process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  },
  get nvidiaTextModel(): string {
    return process.env.NVIDIA_TEXT_MODEL ?? "nvidia/llama-3.1-405b-instruct";
  },
  get nvidiaImageModel(): string {
    return process.env.NVIDIA_IMAGE_MODEL ?? "stabilityai/stable-diffusion-xl";
  },
} as const;
