# Frontend — Free Cell

Next.js (App Router) + TypeScript + Tailwind, generado con `create-next-app`. Construido sobre los tokens y pantallas de
`../docs/07-diseno-ui.md`, usando `../docs/design/` (artboards S1–S8 y `cliente-bundle.dc.html`) solo como **referencia
visual**, no como código a reutilizar.

> ⚠️ Next.js 16: hay cambios de ruptura frente a versiones anteriores. Antes de tocar rutas, layouts o data fetching,
> revisa `node_modules/next/dist/docs/` (ver `AGENTS.md` en esta carpeta, lo mantiene el propio `next dev`).

## Cómo levantarlo
```bash
npm install
npm run dev      # http://localhost:3000
```

## Estado
- ✅ Scaffold (`create-next-app`, TypeScript + Tailwind v4 + App Router).
- ✅ S1 (Catálogo): header, hero+buscador, garantías, grilla con filtro por categoría (`aria-pressed`), tarjetas de
  producto con 3 planes y badge de stock (texto + color), FAQ, footer. Datos de ejemplo (`src/lib/mock-catalog.ts`),
  sin conectar a la API todavía.
- ⬜ S2–S11 — por sprint, ver `../docs/08-plan-de-sprints.md`.
- ⬜ Sesión con NextAuth (credentials + Google) — Sprint 2 (D46, D53 en `../docs/09`).

## Convenciones
- Tokens de color/tipografía/espaciado: `../docs/07-diseno-ui.md`.
- Accesibilidad AA: elementos nativos, objetivos ≥ 44px, el color nunca es el único indicador de estado.
- Ver `../CLAUDE.md` para las reglas del proyecto completo (backend + frontend).
