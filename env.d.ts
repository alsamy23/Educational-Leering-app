interface Window {
  aistudio: {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  };
}

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    [key: string]: string | undefined;
  }
}

interface ImportMetaEnv {
  readonly VITE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}