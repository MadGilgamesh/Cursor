declare module 'http_ece' {
  import type { ECDH } from 'node:crypto';

  interface DecryptParams {
    version: 'aes128gcm';
    privateKey: ECDH;
    authSecret: string;
  }

  const ece: { decrypt(buffer: Buffer, params: DecryptParams): Buffer };
  export default ece;
}
