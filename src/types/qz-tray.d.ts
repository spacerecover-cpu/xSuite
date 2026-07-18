/**
 * Minimal ambient types for the `qz-tray` client — only the subset xSuite uses
 * (connect, printer discovery, config, pixel-PDF print, optional api overrides).
 * `qz-tray` ships no bundled types; this keeps `tsc` at 0 errors without `any`.
 * See https://qz.io/docs and the Pixel / Configs wiki pages.
 */
declare module 'qz-tray' {
  export interface QzConfigOptions {
    size?: { width: number; height: number };
    units?: 'in' | 'cm' | 'mm';
    /** Dots per UNIT — with units:'mm' this is dots/mm (8 ≈ 203 dpi), NOT DPI. */
    density?: number | string;
    scaleContent?: boolean;
    rasterize?: boolean;
    colorType?: 'color' | 'grayscale' | 'blackwhite' | 'default';
    orientation?: 'portrait' | 'landscape' | 'reverse-landscape' | null;
    copies?: number;
    jobName?: string;
    margins?: number | { top: number; right: number; bottom: number; left: number };
  }

  /** Opaque config handle returned by configs.create and passed to print. */
  export type QzConfig = Record<string, unknown>;

  export interface QzPixelData {
    type: 'pixel';
    format: 'pdf' | 'html' | 'image';
    flavor: 'base64' | 'file' | 'plain';
    data: string;
  }

  interface QzApi {
    websocket: {
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      getDefault(): Promise<string>;
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, options?: QzConfigOptions): QzConfig;
    };
    print(config: QzConfig, data: QzPixelData[]): Promise<void>;
    api: {
      setPromiseType(
        fn: (resolver: (resolve: (v?: unknown) => void, reject: (e?: unknown) => void) => void) => Promise<unknown>,
      ): void;
      setSha256Type(fn: (data: string) => string): void;
      setWebSocketType(ws: unknown): void;
    };
    security: {
      setCertificatePromise(fn: unknown): void;
      setSignatureAlgorithm(algo: string): void;
      setSignaturePromise(fn: unknown): void;
    };
  }

  const qz: QzApi;
  export default qz;
}
