export function HeroSearch() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1200px] px-6 py-16 text-center">
        <h1 className="font-display mx-auto max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
          Licencias para tus herramientas de servicio técnico
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Compra, paga por Yape/Plin o transferencia y recibe tu licencia en minutos.
        </p>
        <form className="mx-auto mt-8 flex max-w-xl items-center gap-2" role="search">
          <label htmlFor="catalog-search" className="sr-only">
            Buscar herramienta
          </label>
          <input
            id="catalog-search"
            type="search"
            placeholder="Busca una herramienta…"
            className="h-[52px] flex-1 rounded-[10px] border border-line-strong bg-surface px-4 text-base text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            className="h-[52px] rounded-[10px] bg-accent px-6 text-base font-medium text-white"
          >
            Buscar
          </button>
        </form>
      </div>
    </section>
  );
}
