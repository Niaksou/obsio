import { useState } from 'react';

/** Codes de secours, avec copie et téléchargement en fichier texte. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Obsio : codes de secours (chacun ne sert qu'une fois)\n\n${codes.join('\n')}\n`;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'obsio-codes-de-secours.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="backup-codes-box">
      <ul className="backup-codes" aria-label="Codes de secours">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="secondary" onClick={() => void copy()}>
          {copied ? 'Copiés' : 'Copier'}
        </button>
        <button type="button" className="secondary" onClick={download}>
          Télécharger
        </button>
      </div>
    </div>
  );
}
