# 09 · Decisiones tomadas y preguntas abiertas

## A. Decisiones ya tomadas (no reabrir sin motivo)

### Decisiones originales (Sprint 1)
| # | Decisión | Razón |
|---|---|---|
| D1 | Se venden **solo claves/licencias** (sin créditos ni saldo). | Alcance del negocio acordado con el socio. |
| D2 | Gestión de licencias **manual** (sin API de proveedor). | El socio compra lotes y los carga. |
| D3 | **BullMQ + Redis** desde el MVP. | Casos reales (reservas con expiración, notificaciones con reintentos) y valor de portafolio. |
| D4 | Reserva de **30 min** con liberación diferida + barrido de respaldo. | Evita vender dos veces y no deja stock bloqueado. |
| D5 | Pago **manual con comprobante** (Yape/Plin/transferencia) aprobado por el operador. | Sin pasarela al inicio; menor fricción de arranque. |
| D6 | Reserva con `SELECT … FOR UPDATE SKIP LOCKED`. | Correctitud bajo concurrencia, probada. |
| D7 | Claves cifradas con AES-256-GCM; llave en variable de entorno. | Un volcado de la base no expone las licencias. |
| D8 | **TypeORM** como ORM. | Nativo en Nest, soporta `SKIP LOCKED`; Prisma no pudo verificarse en el entorno del Sprint 1. *Reabrible si se prefiere Prisma.* |
| D9 | Paquetes `@nestjs/*` en ramas CommonJS (4/11). | Las v12 son solo ESM. |
| D10 | Dinero en céntimos enteros; moneda PEN. | Evita errores de redondeo. |
| D11 | Diseño **claro y limpio, denso en contenido**. | Preferencia del usuario. |
| D12 | Panel admin con cola + detalle y aprobación en un clic. | "Eficiente e intuitivo" para la operación diaria. |
| D13 | Servicio directo de desbloqueo/reparación fuera del MVP. | El foco pasó a licencias. |

### Decisiones del brainstorming Sprint 2–4 (2026-10-05)
Marca comercial confirmada: **Free Cell**. Nombre del repositorio/dominio interno sigue siendo "licencias" por ahora.

| # | Decisión | Razón |
|---|---|---|
| D14 | `products.requiresToolUsername` (bool). Pedidos de esos productos añaden estado `PENDING_ACTIVATION` tras aprobar el pago; admin marca "activado". | Algunos productos se activan por cuenta del cliente, no por clave. |
| D15 | Renovaciones requieren el usuario/cuenta existente (mismo mecanismo que D14), no clave independiente. | Renovación aplica sobre cuenta ya activada en la herramienta del proveedor. |
| D16 | Vigencia de la licencia empieza al **entregar** (aprobación de pago / activación admin), no al activar en el dispositivo. | Fecha trazable en BD; evita disputas sobre "cuándo activó" el cliente. |
| D17 | Una licencia sirve para **un solo dispositivo**. Sin `deviceLimit` por ahora. | Simplicidad; coincide con cómo venden las tiendas del rubro (GsmServer y similares). |
| D18 | Tras rechazar un pago, el pedido vuelve a `PENDING_PAYMENT` con plazo extra; máximo **2 reintentos**; luego se cancela. | Tolera errores legítimos (foto borrosa) sin abrir la puerta a abuso indefinido. |
| D19 | SLA de revisión: alerta al operador tras **24 h** en `IN_REVIEW`. La cancelación de un pedido `IN_REVIEW` sigue siendo **siempre manual** (no contradice la regla inviolable #3). | Cubre operador que revisa 1×/día sin dejar pedidos huérfanos. |
| D20 | Conciliación: revisión visual del comprobante + se guarda el **N.º de operación** como campo de texto. | Permite detectar duplicados y referencia futura sin automatizar la verificación bancaria. |
| D21 | Comprobante reutilizado (mismo N.º de operación o mismo hash de imagen) se **bloquea automáticamente**; `payments.operationNumber` único, `payments.proofHash` único. Caso se marca para revisión del operador. | Antifraude sin depender de que el operador lo note a simple vista. |
| D22 | Clientes nuevos: correo verificado obligatorio antes de comprar; monto máximo de primer pedido `[X soles, placeholder]`, sube tras 1–2 compras aprobadas sin reclamo. | Reduce exposición a fraude de cuenta nueva. |
| D23 | Pasarela de pago automática (Culqi/Niubiz/Mercado Pago) queda **fuera del MVP**; se revisa cuando la revisión manual sea cuello de botella (criterio: volumen diario alto, sin umbral numérico fijo aún). | Evita integración prematura sin presión real de volumen. |
| D24 | La clave **nunca** viaja completa por correo: se muestra solo en "Mis pedidos"; el correo trae un enlace. | Menor exposición si el correo se filtra o reenvía. |
| D25 | Ventana de reposición: **7 días** desde la entrega. | Cubre la mayoría de reclamos reales sin ventana indefinida. |
| D26 | Máximo **1 reposición** por pedido. Si no hay stock para reponer, el pedido **espera** el próximo lote (no hay reembolso automático); el operador comunica el plazo. | Evita abuso de reposiciones repetidas; prioriza reponer sobre devolver. |
| D27 | Sí existen reembolsos: manuales, por el mismo medio (Yape/Plin/transferencia), registrados en `audit_logs` con motivo. | Cubre el caso donde el cliente prefiere su dinero a esperar stock. |
| D28 | Modelo del reemplazo: columna nueva `license_items.replacesId` (apunta a la licencia original). `orderItemId` se libera en la original `VOID` y se reasigna a la licencia de reemplazo. | Relación explícita y directa, sin depender de recorrer `claims`. |
| D29 | Catálogo muestra **solo estado** de stock (Disponible / Pocas unidades / Agotado), nunca la cantidad exacta. | No revela volumen de inventario a la competencia. |
| D30 | **Carrito con varias licencias por pedido, desde el MVP** (reabre la propuesta por defecto de "fuera del MVP" en `docs/01`). El esquema ya soporta esto (`order_items` ya es tabla separada de `orders`); cambia la lógica de reserva (reservar N ítems en una transacción), no el esquema. | Decisión explícita del negocio: se quiere vender varias licencias en un solo pedido desde el lanzamiento. |
| D31 | Registro obligatorio; no se permite compra como invitado. | Necesario para "Mis pedidos", reclamos y reposición. |
| D32 | Canales de aviso al cliente: correo (Resend) **+** WhatsApp con enlace `wa.me` (no API oficial). | Cobertura doble sin costo de API de WhatsApp. |
| D33 | Reseñas solo de clientes con pedido `DELIVERED` de ese producto; moderadas por admin (aprobar/ocultar) antes de publicarse. | Evita reseñas falsas; cumple "solo reseñas reales". |
| D34 | Soporte al cliente: **sistema de tickets propio** (además del flujo de `claims` para clave inválida). Entidades nuevas `support_tickets` y `ticket_messages`. | El negocio quiere trazabilidad de soporte general más allá de reclamos de clave. |
| D35 | Un solo rol `ADMIN` al inicio; no se separan roles operador/dueño todavía. | Negocio arranca con un operador; separar roles se evalúa con un segundo operador. |
| D36 | Sin 2FA obligatorio para `ADMIN` en el MVP (queda en backlog). | Contraseña fuerte + rate limiting de login por ahora. |
| D37 | Notificación al operador de comprobante nuevo: correo **+** WhatsApp (`wa.me`). | Operador puede estar revisando el teléfono durante el día. |
| D38 | CRUD completo de catálogo (productos/planes/precios) desde el **panel admin en Sprint 2** (adelanta lo que `docs/08` tenía previsto para Sprint 3). | El socio necesita editar catálogo sin depender de SQL/seed desde el arranque. |
| D39 | ~~Reportes detallados diferidos~~ — **superado por D55** el mismo día: KPIs ya definidos. `admin/summary` (Sprint 2) sigue siendo solo contadores operativos; los reportes con KPIs van en Sprint 3. | Decisión inicial para no bloquear Sprint 2; se resolvió horas después al definir los KPIs reales. |
| D40 | Sin boleta/factura electrónica (SUNAT) en el MVP. | Igual criterio que la pasarela automática: se revisa por volumen/cumplimiento más adelante. |
| D41 | Términos de uso, política de privacidad y de reposición: borrador redactado por el desarrollador (con ayuda de IA) basado en las políticas ya decididas aquí (D25, D26, D27, D43). Se marcan `[PENDIENTE REVISIÓN LEGAL]` hasta que un abogado los revise antes de producción. | El usuario pidió redactarlo directamente en vez de esperar a un abogado para avanzar. |
| D42 | Catálogo muestra el nombre de cada herramienta solo como **texto**, sin usar logos oficiales de terceros. | Evita problema de permisos de marca registrada. |
| D43 | Checkbox obligatorio al pagar: el cliente declara ser propietario o técnico autorizado del equipo. | Respaldo legal mínimo ante uso ilícito de la herramienta, bajo costo de implementación. |
| D44 | Dominio y correo corporativo: placeholder (`freecell.pe` / `freecell.com`) hasta decisión final; no bloquea desarrollo. | Marca confirmada, dominio real pendiente de compra. |
| D45 | Frontend usa **Tailwind + CSS Modules combinados** (Tailwind para utilidades, CSS Modules para componentes complejos puntuales). | Balance entre velocidad (Tailwind, ya en los tokens de `docs/07`) y control fino donde se necesite. |
| D46 | Sesión migra a **NextAuth** (credentials provider contra la API NestJS existente). *Reabre* el mecanismo de sesión del frontend; el backend (JWT, Sprint 1) no cambia. | Decisión explícita del usuario sobre el frontend en Next.js. |
| D47 | Panel admin vive en la **misma app Next.js**, bajo `/admin`, protegido por rol. | Un solo despliegue; coherente con las pantallas S5–S8 ya diseñadas como parte de la misma web. |
| D48 | Redis para BullMQ: **instancia propia en Fly.io** (no Upstash). | Sin límite de comandos; el usuario acepta mantener esa pieza de infraestructura. |
| D49 | API + workers NestJS también se despliegan en **Fly.io** (reemplaza Render). | Evita cold starts de Render; junto a Redis propio en la misma plataforma/red privada. |
| D50 | Rotación de llave de cifrado (`keyVersion`): **más adelante**, no en Sprint 2–4. | Una sola llave activa es suficiente hoy; se agrega si hay necesidad real de rotar. |
| D51 | Se diseña **multi-moneda desde ya**: columna `currency` (default `'PEN'`) en `orders` y `plans`, aunque hoy solo se opere en soles. | Decisión explícita del usuario para no reescribir el modelo de dinero más adelante. |
| D52 | Estrategia de ramas: `main` + ramas de feature → PR → `main`. CI en GitHub Actions (typecheck + unit + e2e) en cada PR. Sin entorno de staging separado. | Simplicidad para un solo desarrollador; staging se agrega si el equipo crece. |

## B. Preguntas abiertas restantes
Ninguna. B5.25 se resolvió como D55 (ver abajo); todas las preguntas de las secciones B1–B7 (ítems 1–38 de la versión original
de este documento) quedaron resueltas como decisiones **D14–D55**.

### Decisiones de la segunda ronda (2026-10-05, mismo día)
| # | Decisión | Razón |
|---|---|---|
| D53 | Login social: **solo Google** (NextAuth + Google provider). Sin Facebook ni otros por ahora. | Técnicos/talleres en Perú casi todos tienen cuenta Google; un solo proveedor reduce superficie de configuración y prueba. |
| D54 | Login con Google marca `users.emailVerifiedAt` automáticamente (Google ya verificó el correo). Solo el registro con correo+contraseña pasa por el flujo de verificación propio (D22). | Evita pedir verificación redundante sin beneficio de seguridad real. |
| D55 | Reemplaza D39 (diferido). Reportes del panel admin, Sprint 3: **ventas por día/semana**, **margen por producto**, **stock valorizado**, **top productos/planes vendidos** (por rango de fechas). | KPIs ya definidos con el usuario; reemplaza la deliberación pendiente de B5.25. |

## C. Riesgos principales
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pérdida de `LICENSE_ENC_KEY` | Claves irrecuperables | Respaldo seguro de la llave; procedimiento documentado |
| Fraude con comprobantes falsos | Pérdida directa | N.º de operación + hash únicos (D20, D21), límites a clientes nuevos (D22) |
| Revisión lenta de pagos | Mala experiencia y stock retenido | SLA 24 h con alerta (D19), notificación doble al operador (D37) |
| Claves inválidas del proveedor | Reclamos y reputación | Reposición ágil con límite (D25, D26), lotes con proveedor trazable |
| Riesgo legal por el tipo de herramientas | Cierre o sanción | Declaración de licitud (D43), términos pendientes de revisión legal (D41) |
| Dependencia de un solo operador | Retrasos | Documentar el proceso; segundo operador cuando crezca |
| Redis caído (ahora autoadministrado en Fly.io, D48) | Reservas no se liberan a tiempo | Barrido al recuperarse; PostgreSQL como fuente de verdad; monitoreo propio de la instancia |
| Rework de sesión (NextAuth, D46) sobre auth ya probada en Sprint 1 | Regresión en login/roles | Backend JWT no cambia; probar NextAuth contra los mismos guards/roles con pruebas e2e existentes como referencia |
