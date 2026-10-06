# 07 · Diseño de interfaz

**Lienzo interactivo (Claude Design):** https://claude.ai/artifact/PMJaTNQg8HGspG3NddwrF4  *(privado del propietario)*
**Copia de las pantallas:** `docs/design/artboards/*.dc.html` y `docs/design/canvas.json`.
Los `.dc.html` usan el formato "Design Component" del editor de Claude Design (HTML + runtime propio): **sirven como referencia visual y de
estructura, no como código a reutilizar**. La implementación real va en Next.js.

Todo texto entre corchetes (`[TU MARCA]`, `S/ [PRECIO]`, `[N]`, `[HORARIO]`) es **placeholder**: no hay datos reales todavía.

## Dirección visual
**Clara, limpia y con contenido denso** (descartado el estilo oscuro). Inspirada en tiendas del rubro: buscador visible, planes con precio
en la tarjeta, entrega estimada junto al precio, garantías cerca de la decisión de compra, preguntas frecuentes y reseñas reales.

## Tokens
| Token | Valor | Uso |
|---|---|---|
| `bg` | `#F6F7F9` | Fondo de página |
| `surface` | `#FFFFFF` | Tarjetas |
| `ink` | `#101828` | Texto principal, botón oscuro, encabezados |
| `muted` | `#475467` | Texto secundario |
| `line` | `#E4E7EC` / `#EAECF0` / `#D0D5DD` | Bordes y separadores |
| `accent` | `#0A58E0` (variable editable) | Botón primario, enlaces, selección |
| `accent-soft` | `#EAF1FE` (texto `#0A3FA3`) | Fondos de énfasis, franja superior |
| `success` | texto `#067647` / fondo `#DCFAE6` | En stock, entregado, aprobar |
| `warning` | texto `#93370D` / fondo `#FEF0C7` | Pocas unidades, esperando pago, reserva |
| `danger` | texto `#B42318` / fondo `#FEE4E2` | Agotado, rechazar, reportar |
| Tipografía display | **Space Grotesk** 500/700 | Títulos y cifras |
| Tipografía texto | **IBM Plex Sans** 400/500/600 | Interfaz |
| Radios | 10 (botones/inputs) · 12–16 (tarjetas) · 24 (hero) · 999 (chips) | |
| Espaciado | base 4 px; contenedor máx. 1200 px, padding lateral 24 px | |
| Controles | alto mínimo 44–52 px; foco: anillo 3 px `#7DB3FF` | |

Colores de estado siempre acompañados de texto (RNF-USA-04). Contraste verificado por diseño ≥ 4,5:1 en los pares anteriores.

## Componentes reutilizables
Encabezado + franja de anuncio · Tarjeta de producto (ficha de iniciales, categoría, 3 planes con precio, badge de stock, entrega) ·
Chip de filtro (`aria-pressed`) · Selector segmentado (nueva/renovación) · Selector de plan · Badge de estado · Paso numerado ·
Caja de carga de archivo (con `label`) · Cuenta regresiva de reserva · Línea de tiempo vertical · Campo de clave (oculta/mostrar/copiar) ·
Cola + detalle (patrón maestro-detalle) · Barra de stock · Tarjeta de acción del panel · Mensaje de éxito (banner verde).

## Pantallas

### Tienda del cliente
| ID | Pantalla | Contenido clave | Endpoints |
|---|---|---|---|
| **S1** | Catálogo (`Main`) | Franja "Entrega estimada / WhatsApp"; hero con **buscador**; 4 garantías (entrega, pagos, reposición, soporte); **Más vendidos**; catálogo con filtro por categoría y tarjetas con 3 planes y precio; reseñas; preguntas frecuentes; pie. Estados: sin resultados. | `GET /catalog/products`, `/catalog/categories` |
| **S2** | Producto y planes (`Producto`) | Migas; cabecera con ficha, categoría, stock y reseñas; **pestañas** Descripción / Cómo activar / Preguntas; "Qué incluye"; ficha técnica (compatibilidad, tipo, actualizaciones); aviso "datos para activar"; otras herramientas. Panel de compra: **Activación nueva ↔ Renovación**, planes con precio y disponibilidad, total, **Comprar ahora**, entrega estimada, reposición, medios de pago, aviso de reserva 30 min. | `GET /catalog/products/:slug`, `POST /orders` |
| **S3** | Checkout y pago (`Checkout`) | Pasos Resumen → Pago → Entrega; **Tus datos** (correo, usuario de la herramienta opcional); método (Yape/Plin o transferencia) con instrucciones y monto; **subir comprobante**; resumen con **cuenta regresiva** de la reserva; tarjeta de soporte. | `POST /orders/:id/payment/upload-url`, `POST /orders/:id/payment` |
| **S4** | Mis pedidos (`Pedidos`) | Filtros (Todos/Entregados/Pendientes/Cancelados); lista con estado; panel de licencia entregada: clave **oculta + Mostrar + Copiar**, línea de seguimiento, enlace "cómo activar", bloque **Reportar un problema**. | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/license/reveal`, `POST /claims` |
| **S9** | Soporte (`Tickets`) | Lista de tickets del cliente con estado (Abierto/Cerrado); detalle con historial de mensajes y campo para responder (D34). | `GET/POST /support-tickets`, `POST /support-tickets/:id/messages` |

### Panel admin (sidebar fija: Inicio · Pagos · Inventario · Reclamos · Catálogo · Soporte · Ver tienda)
| ID | Pantalla | Contenido clave | Endpoints |
|---|---|---|---|
| **S5** | Inicio "Hoy" (`AdminInicio`) | **Requiere tu atención** (3 tarjetas: pagos por revisar [destacada], reclamos abiertos, stock bajo); resumen del día (ventas, entregas, margen); actividad reciente; acciones rápidas. | `GET /admin/summary` |
| **S6** | Pagos (`AdminPagos`) | **Maestro-detalle:** cola a la izquierda; a la derecha comprobante + monto esperado + método + reserva restante + stock; checklist de verificación; **Aprobar y entregar** (un clic, avanza al siguiente); **Rechazar** con motivos predefinidos (confirmar bloqueado hasta elegir); banner de éxito; estado vacío "Estás al día". | `GET /admin/payments`, `POST …/approve`, `POST …/reject` |
| **S7** | Inventario (`AdminInventario`) | Totales; filtros Todos/Stock bajo/Agotados; fila por plan con barra y badge; panel **Cargar licencias** (plan, costo, pegar claves o CSV, resumen válidas/duplicadas/error). | `GET /admin/inventory`, `POST …/batches/preview`, `POST …/batches` |
| **S8** | Reclamos (`AdminReclamos`) | Maestro-detalle: motivo del cliente, clave entregada (oculta), stock para reponer; **Entregar reemplazo** / **Rechazar** / WhatsApp. | `GET /admin/claims`, `POST …/replace`, `POST …/reject` |
| **S10** | Catálogo (gestión) (`AdminCatalogo`) | CRUD de categorías/productos/planes; toggle `requiresToolUsername`; campo moneda (D38, adelantado a Sprint 2). | `GET/POST/PATCH /admin/products`, `/admin/plans`, `/admin/categories` |
| **S11** | Soporte y reseñas (`AdminSoporte`) | Dos pestañas: cola de tickets (responder/cerrar) y cola de reseñas pendientes (aprobar/ocultar) (D34, D33). | `GET/POST /admin/support-tickets…`, `GET/POST /admin/reviews…` |

## Comportamiento interactivo ya prototipado (replicar)
- Filtro por categoría y búsqueda en el catálogo.
- Selector de plan y de tipo de licencia en la ficha; pestañas de información.
- Cuenta regresiva real de 30 min en checkout.
- Mostrar/ocultar y copiar la clave; filtros de pedidos.
- Aprobar/rechazar pagos y resolver reclamos con **avance automático** al siguiente de la cola.
- Navegación entre pantallas por enlaces reales.

## Propuesta para el frontend (por confirmar)
- Next.js App Router + TypeScript + Tailwind con los tokens de arriba como tema.
- Rutas: `/` · `/p/[slug]` · `/checkout/[orderId]` · `/pedidos` · `/pedidos/[id]` · `/tickets` · `/tickets/[id]` · `/ingresar` · `/registro` · `/admin` · `/admin/pagos` · `/admin/inventario` · `/admin/reclamos` · `/admin/catalogo` · `/admin/soporte`.
- Sesión: **NextAuth**, credentials provider contra la API NestJS (D46).
- Datos: componentes de servidor para lectura; acciones de servidor/handlers para mutaciones; caché corta en catálogo.
- Admin en la misma app bajo rutas protegidas por rol, en `/admin` (D47, sin despliegue aparte).
- Carrito (D30): S2/S3 agregan selector de cantidad/añadir-más-planes antes del checkout; S3 muestra lista de ítems en vez de un plan único.
