/**
 * Jedno konto gracza lokalnej paczki. Drugie uruchomienie nic nie dopisuje
 * i nie zmienia haseł — ani tego konta, ani żadnego innego.
 * Hasło nie trafia do logów.
 */
import { characterNameSchema, loginIdentifierSchema } from '@game/shared';
import { eq, sql } from 'drizzle-orm';

import { systemActor, writeAudit } from '../audit.js';
import { provisionAccount } from '../auth/provision.js';
import { hashPassword } from '../auth/password.js';
import { createDatabase, type Database } from './client.js';
import { accounts, characters } from './schema.js';
import { uniqueViolationConstraint } from '../errors.js';

export interface LocalAdminSeed {
  login: string;
  password: string;
  characterName: string;
}

export function localAdminSeedFromEnv(env: NodeJS.ProcessEnv = process.env): LocalAdminSeed | null {
  const loginRaw = env.SEED_ADMIN_LOGIN?.trim() ?? '';
  const password = env.SEED_ADMIN_PASSWORD ?? '';
  if (loginRaw.length === 0 && password.length === 0) return null;
  if (loginRaw.length === 0 || password.length === 0) {
    throw new Error('SEED_ADMIN_LOGIN i SEED_ADMIN_PASSWORD ustaw razem');
  }
  const login = loginIdentifierSchema.safeParse(loginRaw);
  const characterName = characterNameSchema.safeParse(loginRaw);
  if (!login.success || !characterName.success) {
    throw new Error('SEED_ADMIN_LOGIN nie nadaje się na login i imię postaci');
  }
  return { login: login.data, password, characterName: characterName.data };
}

export async function seedLocalAdmin(
  db: Database,
  input: LocalAdminSeed,
): Promise<'created' | 'exists'> {
  const login = loginIdentifierSchema.parse(input.login);
  const characterName = characterNameSchema.parse(input.characterName);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: accounts.id, passwordHash: accounts.passwordHash })
        .from(accounts)
        .where(eq(accounts.email, login))
        .limit(1);
      if (existing) return 'exists';
      const [nameTaken] = await tx
        .select({ id: characters.id })
        .from(characters)
        .where(sql`lower(${characters.name}) = ${characterName.toLowerCase()}`)
        .limit(1);
      if (nameTaken) {
        throw new Error('Imię postaci z seeda jest już zajęte przez inne konto');
      }
      const { account, character } = await provisionAccount(tx, new Date(), {
        email: login,
        passwordHash,
        characterName,
      });
      await writeAudit(tx, systemActor(account.id), {
        action: 'account.seed',
        characterId: character.id,
        after: { characterName: character.name },
      });
      return 'created';
    });
  } catch (error) {
    const constraint = uniqueViolationConstraint(error);
    if (constraint === 'accounts_email_unique') return 'exists';
    if (constraint === 'characters_name_lower_unique') {
      throw new Error('Imię postaci z seeda jest już zajęte przez inne konto', { cause: error });
    }
    throw error;
  }
}

export async function seedLocalAdminFromEnv(databaseUrl: string): Promise<void> {
  const spec = localAdminSeedFromEnv();
  delete process.env.SEED_ADMIN_PASSWORD;
  if (!spec) return;
  const password = spec.password;
  spec.password = '';
  const database = createDatabase(databaseUrl, { max: 1 });
  try {
    const result = await seedLocalAdmin(database.db, { ...spec, password });
    console.log(
      result === 'created'
        ? `Konto gry ${spec.login} zostało założone.`
        : `Konto gry ${spec.login} już jest.`,
    );
  } finally {
    await database.close();
  }
}
