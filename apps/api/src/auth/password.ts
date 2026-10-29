import argon2 from 'argon2';

// Parametry zgodne z rekomendacją OWASP dla Argon2id (19 MiB, 2 iteracje, 1 wątek).
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Wykonuje pełną weryfikację na fikcyjnym skrócie, gdy konto nie istnieje,
 * aby czas odpowiedzi nie zdradzał, które adresy e-mail są zarejestrowane.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('fikcyjne-hasło-do-wyrównania-czasu');
  await verifyPassword(await dummyHash, password);
}
