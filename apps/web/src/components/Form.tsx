import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

interface FormProps {
  title: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (data: FormData) => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Form({
  title,
  submitLabel,
  pending,
  error,
  onSubmit,
  children,
  footer,
}: FormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h1>{title}</h1>
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Veuillez patienter…' : submitLabel}
      </button>
      {footer && <div className="footer">{footer}</div>}
    </form>
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  /** Précision sous le champ, lue par les lecteurs d'écran avec le libellé. */
  hint?: string;
}

export function Field({ label, name, type = 'text', autoComplete, minLength, hint }: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const [revealed, setRevealed] = useState(false);
  const input = (
    <input
      name={name}
      type={type === 'password' && revealed ? 'text' : type}
      autoComplete={autoComplete}
      minLength={minLength}
      aria-describedby={hintId}
      autoCapitalize={type === 'password' ? 'off' : undefined}
      spellCheck={type === 'password' ? false : undefined}
      required
    />
  );
  return (
    <label>
      {label}
      {type === 'password' ? (
        <span className="password-input">
          {input}
          <button
            type="button"
            className="reveal"
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
          </button>
        </span>
      ) : (
        input
      )}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function field(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}
