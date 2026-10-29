import argon2 from 'argon2';

/** Te same parametry Argon2id co przy kontach graczy (OWASP: 19 MiB, 2 iteracje). */
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

/** Wyrównuje czas odpowiedzi, gdy konta personelu nie ma. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('fikcyjne-hasło-kancelarii');
  await verifyPassword(await dummyHash, password);
}
