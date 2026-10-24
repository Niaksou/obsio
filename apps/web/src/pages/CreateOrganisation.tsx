import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { useSubmit } from '../components/useSubmit.js';

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'organisation'}-${crypto.randomUUID().slice(0, 8)}`;
}

export function CreateOrganisation() {
  const { pending, error, run } = useSubmit();

  async function submit(data: FormData) {
    const name = field(data, 'name');
    // Better Auth rend la nouvelle organisation active : les hooks de session se mettent à jour.
    await run(() => authClient.organization.create({ name, slug: slugify(name) }));
  }

  return (
    <Form
      title="Créer votre organisation"
      submitLabel="Créer"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <p>
        L'organisation regroupe vos sites et vos collaborateurs. Vous en serez l'administrateur.
      </p>
      <Field label="Nom de l'entreprise" name="name" autoComplete="organization" />
    </Form>
  );
}
