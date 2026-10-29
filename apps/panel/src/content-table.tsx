import { Link } from 'react-router';

import { recordLabel } from './collections.js';

export interface ContentRow {
  id: string;
  name?: string;
  title?: string;
  detail?: string;
}

export function ContentTable({
  rows,
  hrefFor,
}: {
  rows: readonly ContentRow[];
  hrefFor: (id: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-bone-400">W tym dziale nie ma jeszcze wpisów.</p>;
  }
  return (
    <div className="panel overflow-hidden" data-testid="content-list">
      <table className="w-full text-left text-sm">
        <thead className="bg-abyss-900/80 text-xs tracking-[0.16em] text-bone-400 uppercase">
          <tr>
            <th className="px-4 py-3 font-normal">Nazwa</th>
            <th className="px-4 py-3 font-normal">Identyfikator</th>
            <th className="px-4 py-3 font-normal">Szczegół</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-brass-500/15">
              <td className="px-4 py-3">
                <Link className="text-brass-300 hover:text-bone-50" to={hrefFor(row.id)}>
                  {recordLabel(row)}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-bone-400">{row.id}</td>
              <td className="px-4 py-3 text-bone-200">{row.detail ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
