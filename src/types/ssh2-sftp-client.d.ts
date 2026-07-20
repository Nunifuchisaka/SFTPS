// ssh2-sftp-client は型定義を同梱していないため、
// 実クライアント結線に必要な最小限の宣言のみを与える。
// アダプタ側は SftpClientLike 構造型を用いるため詳細な型は不要。
declare module 'ssh2-sftp-client' {
  export default class SftpClient {
    constructor(name?: string);
  }
}
