/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASR_ENDPOINT?: string;
  readonly VITE_OCR_ENDPOINT?: string;
  readonly VITE_IMAGE_VISION_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
