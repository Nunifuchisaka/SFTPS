import type { HistoryInput } from '../core/history/index';

/** 履歴への書き込み口（実体は main/bootstrap.ts の MainHistoryController）。 */
export interface HistoryAppendGateway {
  append(input: HistoryInput): void;
}

/** MCP 経由の転送履歴 id を採番する（テストで固定するため注入可能）。 */
export type IdFactory = () => string;

function defaultIdFactory(): string {
  return `mcp${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * MCP 経由の upload/download/sync は TransferQueue を経由しないため、
 * TerminalTaskRecorder（main/history-recorder.ts）の対象外になる。
 * この橋渡しが結果を直接 history.append() で記録し、GUI の転送履歴からも
 * MCP 経由の操作を追えるようにする。
 */
export class McpHistoryBridge {
  constructor(
    private readonly history: HistoryAppendGateway,
    private readonly genId: IdFactory = defaultIdFactory,
  ) {}

  recordSuccess(kind: 'upload' | 'download' | 'sync', profileId: string, path: string): void {
    this.history.append({ id: this.genId(), kind, profileId, path, status: 'success' });
  }

  recordFailure(kind: 'upload' | 'download' | 'sync', profileId: string, path: string, error: unknown): void {
    this.history.append({
      id: this.genId(),
      kind,
      profileId,
      path,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * action を実行し、終了結果（成功/失敗）を履歴へ記録してから返す（失敗時は元の例外を再送出する）。
   */
  async run<T>(
    kind: 'upload' | 'download' | 'sync',
    profileId: string,
    path: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await action();
      this.recordSuccess(kind, profileId, path);
      return result;
    } catch (err) {
      this.recordFailure(kind, profileId, path, err);
      throw err;
    }
  }
}
