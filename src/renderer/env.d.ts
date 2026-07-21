import type { FunabinFtpApi } from '../shared/ipc';

declare global {
  interface Window {
    api: FunabinFtpApi;
  }
}

