/**
 * UUID v4 dla kluczy żądań w przeglądarce.
 *
 * `crypto.randomUUID` istnieje tylko w bezpiecznym kontekście. Safari na HTTP
 * spoza localhost zostawia je jako `undefined` i rzuca przy wywołaniu.
 * `crypto.getRandomValues` działa także poza bezpiecznym kontekstem.
 */
export function randomUuid(): string {
  const source = cryptoSource();
  if (typeof source.randomUUID === 'function') {
    const created: unknown = Reflect.apply(source.randomUUID, source.self, []);
    if (typeof created !== 'string' || created.length === 0) {
      throw new Error('crypto.randomUUID nie zwróciło klucza');
    }
    return created;
  }
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  const version = bytes[6];
  const variant = bytes[8];
  if (version === undefined || variant === undefined) {
    throw new Error('crypto.getRandomValues zwróciło za krótki bufor');
  }
  bytes[6] = (version & 0x0f) | 0x40;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface CryptoSource {
  self: object;
  randomUUID?: unknown;
  getRandomValues(bytes: Uint8Array): Uint8Array;
}

function cryptoSource(): CryptoSource {
  const host: unknown = globalThis;
  if (typeof host !== 'object' || host === null || !('crypto' in host)) {
    throw new Error('Brak crypto.getRandomValues');
  }
  const source: unknown = host.crypto;
  if (typeof source !== 'object' || source === null || !('getRandomValues' in source)) {
    throw new Error('Brak crypto.getRandomValues');
  }
  const getRandomValues: unknown = source.getRandomValues;
  if (typeof getRandomValues !== 'function') {
    throw new Error('Brak crypto.getRandomValues');
  }
  const randomUUID = 'randomUUID' in source ? source.randomUUID : undefined;
  return {
    self: source,
    randomUUID,
    getRandomValues: (bytes) => {
      const filled: unknown = getRandomValues.call(source, bytes);
      return filled instanceof Uint8Array ? filled : bytes;
    },
  };
}
