import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { keys } from '../queries.js';
import { plural } from '../reserves/status.js';
import { ReserveRow } from './ReservesPage.js';

/** Réserves confiées à l'utilisateur connecté, tous sites confondus, les plus urgentes d'abord. */
export function MyReservesPage() {
  const reserves = useQuery({ queryKey: keys.myReserves, queryFn: api.myReserves });
  const rows = reserves.data ?? [];
  const toFix = rows.filter((r) => r.status !== 'corrigee');
  const done = rows.filter((r) => r.status === 'corrigee');

  return (
    <div className="page page-wide">
      <div className="title-row">
        <h1>Mes réserves</h1>
        {reserves.data && <p className="row-meta">{plural(toFix.length, 'réserve')} à corriger</p>}
      </div>
      {reserves.isPending && <p className="loading">Chargement…</p>}
      {reserves.error && <p className="error">{reserves.error.message}</p>}
      {reserves.data && rows.length === 0 && (
        <p className="empty">Aucune réserve ne vous est confiée pour l’instant.</p>
      )}
      {toFix.length > 0 && <MyList items={toFix} />}
      {done.length > 0 && (
        <>
          <h2>Corrigées, en attente de vérification</h2>
          <MyList items={done} />
        </>
      )}
    </div>
  );
}

function MyList({ items }: { items: Awaited<ReturnType<typeof api.myReserves>> }) {
  return (
    <ul className="rows reserve-rows">
      {items.map((item) => (
        <li key={item.id}>
          <div className="my-reserve">
            <span className="row-meta">{item.siteName}</span>
            <ReserveRow item={item} />
          </div>
        </li>
      ))}
    </ul>
  );
}
