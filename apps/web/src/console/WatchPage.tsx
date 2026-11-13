import { Link } from 'react-router';
import { useClients } from './api.js';
import { WATCH_GROUPS, watchItems, type WatchGroup } from './watch.js';
import { Loading } from '../components/Loading.js';

/** Clients qui demandent une action de l'équipe, groupés par raison. */
export function WatchPage() {
  const { data: clients, error, isPending } = useClients();
  if (isPending) return <Loading />;
  if (error) return <p className="error">{error.message}</p>;

  const items = watchItems(clients);
  const groups = (Object.keys(WATCH_GROUPS) as WatchGroup[]).map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  }));

  return (
    <div className="console-page">
      <div className="console-head">
        <h1>À surveiller</h1>
        <p className="hint">
          Échéance sous 30 jours, plus de 30 jours sans connexion, plafond utilisé à 80 %, analyse
          en échec
        </p>
      </div>
      {items.length === 0 ? (
        <p className="empty">
          Rien à signaler : tous les clients sont actifs et dans leurs limites.
        </p>
      ) : (
        <div className="watch-groups">
          {groups.map(({ group, items }) => (
            <section key={group} className="usage-card">
              <h2>
                {WATCH_GROUPS[group]} <span className="count">{items.length}</span>
              </h2>
              {items.length === 0 ? (
                <p className="hint">Aucun client.</p>
              ) : (
                <ul className="watch-list">
                  {items.map((item) => (
                    <li key={item.client.id}>
                      <Link to={`/console/clients/${item.client.id}`}>{item.client.name}</Link>
                      <span className={`watch-reason watch-${group}`}>{item.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
