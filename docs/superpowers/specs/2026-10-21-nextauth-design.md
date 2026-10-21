# NextAuth (Auth.js v5) sobre API propia — diseño

**Fecha**: 2026-10-21
**Sprint**: 2 (frontend)
**Decisiones relacionadas**: D46 (sesión migra a NextAuth, backend JWT no cambia), D53 (Google provider, solo Google),
D54 (`emailVerifiedAt` automático con Google), D59 (auth propia, Clerk descartado), D75 (account linking Google↔password), D56
(access JWT 15 min + refresh opaco rotativo 30 días, ventana de gracia 30s, reuso revoca familia).

## Contexto

El backend (Sprint 1–2) ya expone `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`, `POST /auth/google` — todos verificados y documentados en `docs/06-api.md`. El frontend (`frontend/`,
Next.js 16 App Router) todavía no tiene sesión: solo existe el scaffold + pantalla S1 con datos de ejemplo
(`src/lib/mock-catalog.ts`). Este spec cubre **solo** la capa de sesión (NextAuth) — no conecta S1 a la API real ni
construye S2–S4/S9/S10 (eso es un sub-proyecto siguiente, ver `docs/08-plan-de-sprints.md`).

El backend es la única fuente de verdad de sesión: tokens, roles, rotación y revocación de familia de refresh token
ya están implementados y probados (e2e) en Sprint 1. NextAuth no debe duplicar esa lógica — solo la envuelve para
dar `session()`/`auth()` idiomático de Next.js y proteger rutas.

## Decisión de versión

**Auth.js v5** (`next-auth@5`, beta). Diseñada para App Router (`auth()` helper, un solo route handler, integración
directa con `proxy.ts`). Next 16 ya tiene cambios de ruptura (`middleware` → `proxy`, `params`/`searchParams` como
`Promise`) por lo que ir con v5 evita boilerplate de v4 pensado para Pages Router.

## Arquitectura

Estrategia de sesión: **JWT** (sin adapter de base de datos). El backend ya persiste la sesión real (`refresh_tokens`
con familia/rotación/revocación, D56); un adapter de NextAuth duplicaría esa tabla y crearía dos fuentes de verdad.
El JWT de NextAuth (cookie cifrada, server-side) es solo una **caché** de los tokens que da el backend.

Contenido del JWT de NextAuth (nunca expuesto crudo al cliente):
```
{
  accessToken: string,        // JWT del backend, 15 min
  refreshToken: string,       // opaco, 30 días, rotativo — SOLO server-side
  accessTokenExpiresAt: number, // epoch ms
  user: { id, email, name, role, emailVerifiedAt },
  error?: 'RefreshError'
}
```

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/auth.ts` | Config Auth.js v5: `CredentialsProvider` + `GoogleProvider`, callbacks `jwt`/`session`, export `handlers`/`auth`/`signIn`/`signOut`. |
| `frontend/src/app/api/auth/[...nextauth]/route.ts` | Re-exporta `GET`/`POST` de `handlers` (único route handler que exige Auth.js v5). |
| `frontend/src/lib/api-client.ts` | Fetch wrapper al backend NestJS (`API_URL`, server-side only). Usado por `authorize()` y por el callback `jwt` para `/auth/login`, `/auth/google`, `/auth/refresh`. |
| `frontend/proxy.ts` | Reemplaza `middleware.ts` en Next 16. Protege `/admin/**` (rol `ADMIN`) y rutas de cliente autenticado; redirige a `/login?callbackUrl=`. |
| `frontend/src/app/login/page.tsx` | Formulario credentials + botón "Continuar con Google". No existe todavía; se crea mínimo (sin diseño final de `docs/07`) solo para poder probar el flujo de este spec. |

## Variables de entorno (frontend)

```
AUTH_SECRET=              # openssl rand -base64 32
API_URL=http://localhost:3000       # backend, server-side (api-client.ts)
AUTH_GOOGLE_ID=            # mismo proyecto GCP que GOOGLE_CLIENT_ID del backend
AUTH_GOOGLE_SECRET=
```

`AUTH_GOOGLE_ID` debe ser el **mismo** client ID que `GOOGLE_CLIENT_ID` del backend (el backend verifica el `aud` del
`id_token` contra ese client ID) — no son independientes.

## Flujos

**Credentials**: `authorize({email, password})` → `POST /auth/login` en el backend.
- 401 → `authorize` devuelve `null` (NextAuth muestra error genérico, no hay enumeración de usuarios).
- 200 → devuelve `{accessToken, refreshToken, user}`; el callback `jwt` lo guarda tal cual en el token (primer login,
  `trigger === 'signIn'`).

**Google**: `GoogleProvider` hace la danza OAuth estándar (NextAuth gestiona `code`→`token` con Google). En el
callback `jwt`, cuando `account?.provider === 'google'` y `account.id_token` está presente (solo ocurre en el
login, no en refreshes posteriores del propio `jwt` callback), se llama `POST /auth/google {idToken: account.id_token}`.
La respuesta (mismo shape `{accessToken, refreshToken, user}`) **reemplaza** lo que NextAuth hubiera generado —
Google nunca crea sesión por sí solo; el backend decide find-or-create/link (D75) y verifica el `id_token`
criptográficamente (no se confía en que el frontend ya lo validó, como ya documenta `docs/06-api.md`).
Si el backend responde 401 (correo no verificado por Google, o token inválido), el login falla y NextAuth redirige
a `/login?error=...`.

**Refresh proactivo**: en cada invocación del callback `jwt` (ocurre en cada `getServerSession`/`auth()` que lea el
JWT, Auth.js lo invoca con el token existente cuando no hay `trigger`), si
`Date.now() > accessTokenExpiresAt - 60_000`, se llama `POST /auth/refresh {refreshToken}`. Éxito → se guarda el
nuevo par rotado (el backend rota el refresh token, D56). Fallo (401: familia revocada por reuso fuera de la
ventana de gracia, o refresh vencido) → el token se marca `{ ...token, error: 'RefreshError' }`, sin lanzar
excepción (evita loop de reintentos en cada request).

**Logout**: `signOut()` de NextAuth borra la cookie local. Antes de eso, un `signOut` custom (wrapper en
`src/lib/auth-actions.ts`) debe llamar `POST /auth/logout {refreshToken}` para revocar la familia en el backend —
si no, el refresh token queda vivo 30 días en la base aunque el cliente ya cerró sesión.

**Sesión expuesta al cliente** (callback `session`): `{ user: {id, email, name, role, emailVerifiedAt}, accessToken,
error? }`. `accessToken` sí se expone (lo necesitan Server Components/Client fetches para llamar la API con
`Authorization: Bearer`); `refreshToken` **nunca** sale del JWT server-side de NextAuth.

**Rutas protegidas** (`proxy.ts`): usa `auth()` (helper Auth.js v5, funciona en `proxy.ts` porque corre en Node
runtime, no Edge, dado que `api-client.ts` ya se usa server-side). Sin sesión en `/admin/**` o rutas de cliente
autenticado → redirect a `/login?callbackUrl=<ruta>`. Sesión con `role !== 'ADMIN'` en `/admin/**` → redirect a `/`
(o página 403 simple). `session.error === 'RefreshError'` en cualquier ruta protegida → tratar como sin sesión
(forzar re-login).

## Fuera de alcance (sub-proyectos siguientes del Sprint 2)

- Conectar S1 (catálogo) a la API real.
- Construir S2 (carrito), S3 (checkout), S4, S9 (tickets cliente), S10 (catálogo admin).
- UI de `/login`/`/registro` pulida (este spec solo pide lo mínimo para probar el flujo).
- Verificación de correo en UI (RF-AUT-07 ya tiene backend; falta pantalla).

## Testing

Playwright e2e (`frontend/e2e/`, contra backend real en Docker — mismo patrón que los e2e del backend, sin mocks de
red):
1. Login credentials correcto → sesión con `role` correcto, cookie presente.
2. Login credentials incorrecto → error genérico, sin sesión.
3. Login Google (cuenta de prueba o backend mockeado solo para este caso si Google real no es viable en CI) →
   sesión creada, `emailVerifiedAt` no nulo.
4. Refresh forzado (manipulando `accessTokenExpiresAt` a pasado) → nueva sesión válida sin re-login.
5. Refresh con refresh token revocado → `session.error === 'RefreshError'`, redirect a `/login`.
6. Logout → cookie borrada, refresh token revocado en backend (verificar que un `POST /auth/refresh` posterior con
   ese token da 401).
7. `/admin` con rol `CUSTOMER` → redirect; con rol `ADMIN` → acceso.

No se agregan pruebas unitarias sueltas de los callbacks `jwt`/`session`: su lógica está pegada al ciclo de vida de
NextAuth y se cubre mejor con los e2e de arriba.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Auth.js v5 en beta, puede tener breaking changes menores | Fijar versión exacta en `package.json` (sin `^`), revisar changelog antes de actualizar |
| `proxy.ts` en Node runtime (no Edge) por `api-client.ts` | Next 16 permite runtime Node en proxy; confirmar al implementar que no fuerza Edge por defecto |
| Refresh token nunca debe llegar al cliente | Cubierto por diseño (`session` callback no lo incluye); agregar test explícito que verifique que `/api/auth/session` no devuelve `refreshToken` |
