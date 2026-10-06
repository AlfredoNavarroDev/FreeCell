import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-6 py-8 text-sm text-muted">
        <p className="font-display font-bold text-ink">Free Cell</p>
        <p className="mt-1">
          Horario de atención: [HORARIO] · Soporte: [wa.me/NÚMERO] · {new Date().getFullYear()}
        </p>
        <p className="mt-3">
          <Link href="/legal/terminos" className="underline">
            Términos de uso
          </Link>{" "}
          ·{" "}
          <Link href="/legal/privacidad" className="underline">
            Política de privacidad
          </Link>{" "}
          ·{" "}
          <Link href="/legal/reposicion" className="underline">
            Política de reposición
          </Link>
        </p>
      </div>
    </footer>
  );
}
