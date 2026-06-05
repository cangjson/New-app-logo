export interface LogoConfig {
  width: number;
  height: number;
  url: string;
}

export interface Brand {
  id: string;
  name: string;
  logos: LogoConfig[];
}

export interface ProcessedImage {
  id: string;
  file: File;
  originalWidth: number;
  originalHeight: number;
  status: 'pending' | 'processing' | 'success' | 'skipped' | 'error';
  matchedLogo?: string;
  resultUrl?: string;
  errorMsg?: string;
}
