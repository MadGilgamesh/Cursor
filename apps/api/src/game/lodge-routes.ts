import {
  DREAM_PATHS,
  ERROR_CODES,
  LODGE_SKILLS,
  type DreamPath,
  type LodgeRole,
  type LodgeSkill,
} from '@game/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppDeps } from '../app.js';
import { playerActor } from '../audit.js';
import { currentAccount, requireAuth } from '../auth/plugin.js';
import type { Executor } from '../db/client.js';
import { characters, type CharacterRow } from '../db/schema.js';
import { AppError } from '../errors.js';
import { idempotent } from '../idempotency.js';
import { openConspiracy } from './lore.js';
import {
  awakeningOf,
  buildCutter,
  buyScroll,
  climbAwakening,
  createLodge,
  donate,
  hallOf,
  inLodge,
  joinLodge,
  learnSkill,
  resolveSummon,
  resolveVoyage,
  setRecruitment,
  setRole,
  settleAwakening,
  signupSummon,
  signupVoyage,
  startDream,
  startVoyage,
  takeMentor,
  wakeDream,
  withdraw,
} from './lodge.js';

const assignable = ['elder', 'treasurer', 'sibling', 'novice'] as const;
const skills = [...LODGE_SKILLS] as [LodgeSkill, ...LodgeSkill[]];
const dreams = [...DREAM_PATHS] as [DreamPath, ...DreamPath[]];

async function characterOf(db: Executor, accountId: string): Promise<CharacterRow> {
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.accountId, accountId))
    .limit(1);
  if (!character) throw new AppError(404, ERROR_CODES.notFound, 'Konto nie ma postaci');
  return character;
}

/** Trasy Etapu 6. Mutacje wymagają Idempotency-Key. */
export function lodgeRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, clock } = deps;
  app.addHook('preHandler', requireAuth(deps));

  const mutate = (
    run: (tx: Executor, character: CharacterRow, request: FastifyRequest) => Promise<unknown>,
  ) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const account = currentAccount(request);
      return idempotent(db, request, reply, account.id, async (tx) => ({
        statusCode: 200,
        body: await run(tx, await characterOf(tx, account.id), request),
      }));
    };
  };

  app.get('/lodges', async (request) =>
    hallOf(db, (await characterOf(db, currentAccount(request).id)).id),
  );
  app.get('/awakening', async (request) =>
    awakeningOf(db, (await characterOf(db, currentAccount(request).id)).id, clock),
  );

  app.post(
    '/lodges',
    mutate((tx, character, request) => {
      const body = z.object({ name: z.string().trim().min(3).max(24) }).parse(request.body);
      return createLodge(tx, playerActor(request, character.accountId), character, body.name);
    }),
  );
  app.post(
    '/lodges/:id/join',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      return joinLodge(tx, character, id);
    }),
  );
  app.post(
    '/lodges/:id/donate',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const silver = z.object({ silver: z.int().min(1).max(1_000_000) }).parse(request.body).silver;
      return donate(tx, character, id, silver);
    }),
  );
  app.post(
    '/lodges/:id/withdraw',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const silver = z.object({ silver: z.int().min(1).max(1_000_000) }).parse(request.body).silver;
      return withdraw(tx, character, id, silver);
    }),
  );
  app.post(
    '/lodges/:id/roles',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const body = z
        .object({ characterId: z.uuid(), role: z.enum(assignable) })
        .parse(request.body);
      return setRole(tx, character, id, body.characterId, body.role satisfies LodgeRole);
    }),
  );
  app.post(
    '/lodges/:id/skills',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const skill = z.object({ skill: z.enum(skills) }).parse(request.body).skill;
      return learnSkill(tx, character, id, skill);
    }),
  );
  app.post(
    '/lodges/:id/recruitment',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const open = z.object({ open: z.boolean() }).parse(request.body).open;
      return setRecruitment(tx, character, id, open);
    }),
  );
  app.post(
    '/lodges/:id/scrolls',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const tier = z.object({ tier: z.int().min(1).max(3) }).parse(request.body).tier;
      return buyScroll(tx, character, clock, id, tier);
    }),
  );
  app.post(
    '/lodges/:id/summons/:summonId/signup',
    mutate((tx, character, request) => {
      const params = z.object({ id: z.uuid(), summonId: z.uuid() }).parse(request.params);
      return signupSummon(tx, character, clock, params.id, params.summonId);
    }),
  );
  app.post(
    '/lodges/:id/summons/:summonId/resolve',
    mutate((tx, _character, request) => {
      const params = z.object({ id: z.uuid(), summonId: z.uuid() }).parse(request.params);
      return resolveSummon(tx, clock, params.id, params.summonId);
    }),
  );
  app.post(
    '/lodges/:id/cutter',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      return buildCutter(tx, character, id);
    }),
  );
  app.post(
    '/lodges/:id/voyages',
    mutate((tx, character, request) => {
      const id = z.object({ id: z.uuid() }).parse(request.params).id;
      return startVoyage(tx, character, clock, id);
    }),
  );
  app.post(
    '/lodges/:id/voyages/:voyageId/signup',
    mutate((tx, character, request) => {
      const params = z.object({ id: z.uuid(), voyageId: z.uuid() }).parse(request.params);
      return signupVoyage(tx, character, params.id, params.voyageId);
    }),
  );
  app.post(
    '/lodges/:id/voyages/:voyageId/resolve',
    mutate((tx, _character, request) => {
      const params = z.object({ id: z.uuid(), voyageId: z.uuid() }).parse(request.params);
      return resolveVoyage(tx, clock, params.id, params.voyageId);
    }),
  );
  app.post(
    '/lodges/conspiracy',
    mutate(async (tx, character, request) => {
      if (!(await inLodge(tx, character.id))) {
        throw new AppError(409, ERROR_CODES.requirement, 'Spisek należy do loży');
      }
      return openConspiracy(tx, playerActor(request, character.accountId), character, clock);
    }),
  );
  app.post(
    '/dreams',
    mutate((tx, character, request) => {
      const path = z.object({ path: z.enum(dreams) }).parse(request.body).path;
      return startDream(tx, character, clock, path);
    }),
  );
  app.post(
    '/dreams/wake',
    mutate((tx, character) => wakeDream(tx, character, clock)),
  );
  app.post(
    '/office/mentor',
    mutate((tx, character, request) => {
      const menteeId = z.object({ menteeId: z.uuid() }).parse(request.body).menteeId;
      return takeMentor(tx, character, menteeId);
    }),
  );
  app.post(
    '/awakening/climb',
    mutate((tx, character) => climbAwakening(tx, character, clock)),
  );
  app.post(
    '/awakening/settle',
    mutate((tx) => settleAwakening(tx, clock)),
  );
}
