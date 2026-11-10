/** Appareil lisible à partir de l'agent utilisateur : navigateur et système. */
export function device(userAgent: string | null | undefined) {
  if (!userAgent) return 'Appareil inconnu';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Navigateur';
  const system =
    /iPhone|iPad/.exec(userAgent)?.[0] ??
    (/Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null);
  return system ? `${browser} sur ${system}` : browser;
}
