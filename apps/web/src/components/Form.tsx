import type { FormEvent, ReactNode } from 'react';

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
}

export function Field({ label, name, type = 'text', autoComplete, minLength }: FieldProps) {
  return (
    <label>
      {label}
      <input name={name} type={type} autoComplete={autoComplete} minLength={minLength} required />
    </label>
  );
}

export function field(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}
