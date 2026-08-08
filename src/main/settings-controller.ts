import type { AppSettings } from '../core/settings/index';
import { MutationQueue } from './mutation-queue';

/** 設定の永続化口（実体は SettingsFile）。 */
export interface SettingsGateway {
  save(input: unknown): Promise<AppSettings>;
}

/**
 * アプリ設定の現在値を保持し、保存と「実行中アプリへの反映」を束ねる。
 * 保存に失敗した場合は現在値を更新しない（反映済みと食い違わせない）。
 */
export class SettingsController {
  private readonly mutations = new MutationQueue();

  constructor(
    private readonly file: SettingsGateway,
    private current: AppSettings,
    private readonly apply?: (settings: AppSettings) => void,
  ) {}

  get(): AppSettings {
    return this.current;
  }

  /** 現在値を実行中のアプリへ反映する（起動直後の初期適用用）。 */
  applyNow(): void {
    this.apply?.(this.current);
  }

  async save(input: unknown): Promise<AppSettings> {
    return this.mutations.run(async () => {
      const saved = await this.file.save(input);
      this.current = saved;
      this.apply?.(saved);
      return saved;
    });
  }
}
