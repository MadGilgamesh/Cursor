import { experienceToNextLevel, type Character } from '@game/shared';

import { t } from '../i18n';

/** Pasek doświadczenia liczony współdzieloną krzywą z GDD (ta sama formuła co na serwerze). */
export function XpBar({ character }: { character: Character }) {
  const required = experienceToNextLevel(character.level);
  const percent = required > 0 ? Math.min(100, (character.experience / required) * 100) : 100;
  return (
    <div>
      <div
        role="progressbar"
        aria-label={t('resources.experience')}
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={character.experience}
        className="h-1.5 overflow-hidden rounded-full bg-abyss-700"
      >
        <div className="h-full bg-verdigris-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-right text-[0.65rem] text-bone-600">
        {required > 0
          ? t('resources.experienceValue', { value: character.experience, max: required })
          : t('resources.maxLevel')}
      </p>
    </div>
  );
}
