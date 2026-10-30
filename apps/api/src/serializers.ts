import type { Character, SessionResponse } from '@game/shared';

import type { AccountRow, CharacterRow } from './db/schema.js';

export function toCharacterDto(character: CharacterRow): Character {
  return {
    id: character.id,
    name: character.name,
    level: character.level,
    experience: character.experience,
    createdAt: character.createdAt.toISOString(),
  };
}

export function toSessionResponse(account: AccountRow, character: CharacterRow): SessionResponse {
  return {
    account: { id: account.id, createdAt: account.createdAt.toISOString() },
    character: toCharacterDto(character),
  };
}
