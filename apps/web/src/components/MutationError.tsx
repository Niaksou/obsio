/** Message d'une action refusée ou en échec, sous le formulaire concerné. */
export function MutationError({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error.message}
    </p>
  );
}
