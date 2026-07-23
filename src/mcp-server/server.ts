import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppService } from '../main/app-service';
import type { KnownHostsController } from '../main/known-hosts-controller';
import type { HostKeyRejectionTracker } from './host-key-bridge';
import type { HistoryAppendGateway } from './history-bridge';
import { McpHistoryBridge } from './history-bridge';
import { registerProfileTools } from './tools/profiles';
import { registerConnectionTools } from './tools/connection';
import { registerTransferTools } from './tools/transfer';
import { registerBackupTools } from './tools/backups';
import { registerHostKeyTools } from './tools/host-keys';

const SERVER_INFO = { name: 'funabinftp', version: '0.1.0' };

/**
 * MCP ツールが実際に使う AppService のメソッドだけを表す構造型。
 * AppService クラス自体（private フィールドを持つ）を直接使うと、テスト用のフェイク実装が
 * 構造的に代入できなくなるため、公開メソッドのみの Pick 型で受け取る。
 */
export type McpAppService = Pick<
  AppService,
  | 'listProfiles'
  | 'saveProfile'
  | 'deleteProfile'
  | 'testConnection'
  | 'listRemote'
  | 'prepareUpload'
  | 'commitUpload'
  | 'prepareDownload'
  | 'download'
  | 'prepareSync'
  | 'commitSync'
  | 'renameRemote'
  | 'deleteRemote'
  | 'chmodRemote'
  | 'listBackups'
  | 'restoreBackup'
>;

/** MCP ツールが実際に使う KnownHostsController のメソッドだけを表す構造型。 */
export type McpKnownHosts = Pick<KnownHostsController, 'list' | 'lookup' | 'trust' | 'remove'>;

export interface McpServerDeps {
  service: McpAppService;
  knownHosts: McpKnownHosts;
  history: HistoryAppendGateway;
  rejections: HostKeyRejectionTracker;
}

/**
 * FunabinFTP の AppService を MCP ツールとして公開する McpServer インスタンスを組み立てる。
 * 各ツールの実装は tools/ 配下に分割し、ここでは登録のみ行う。
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer(SERVER_INFO);
  const history = new McpHistoryBridge(deps.history);

  registerProfileTools(server, { service: deps.service });
  registerConnectionTools(server, { service: deps.service, rejections: deps.rejections });
  registerTransferTools(server, { service: deps.service, rejections: deps.rejections, history });
  registerBackupTools(server, { service: deps.service, rejections: deps.rejections });
  registerHostKeyTools(server, { knownHosts: deps.knownHosts });

  return server;
}
