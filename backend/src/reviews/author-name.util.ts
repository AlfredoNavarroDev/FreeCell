/** D33: nunca se publica el apellido completo ni el correo: «Carlos P.» o «Cliente verificado». */
export function formatAuthorName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'Cliente verificado';
  }
  // Un «nombre» con @ es un correo mal guardado: nunca se publica (D77).
  if (parts[0].includes('@')) {
    return 'Cliente verificado';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const initial = Array.from(parts[parts.length - 1])[0].toLocaleUpperCase(
    'es-PE',
  );
  return `${parts[0]} ${initial}.`;
}
