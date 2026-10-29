import { t } from '../i18n';
import { Sigil } from '../ui/Sigil';

/** Ekran-zaślepka dla zakładek, których systemy powstaną później. */
export function PlaceholderScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <Sigil className="size-28 opacity-60" />
      <h1 className="mt-4 font-display text-3xl font-bold tracking-wide text-bone-50">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-bone-400 italic">{description}</p>
      <p className="mt-6 rounded-full border border-brass-700 px-3 py-1 text-xs tracking-widest text-brass-300 uppercase">
        {t('soon')}
      </p>
    </div>
  );
}
