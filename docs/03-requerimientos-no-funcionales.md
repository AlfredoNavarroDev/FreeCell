# 03 · Requerimientos no funcionales

**Convención:** los valores numéricos marcados *(propuesto)* son un punto de partida razonable para el volumen inicial;
deben validarse con el negocio. **Estado:** ✅ cumplido y probado · 🟡 parcial · ⬜ pendiente.

## RNF-SEG · Seguridad
| ID | Requerimiento | Estado |
|---|---|---|
| RNF-SEG-01 | Las claves de licencia se guardan cifradas con **AES-256-GCM**; la llave (`LICENSE_ENC_KEY`, 32 bytes) vive fuera de la base de datos. | ✅ |
| RNF-SEG-02 | Las claves **nunca** aparecen en logs, errores, respuestas de listados ni en el correo (correo solo lleva enlace, D24). | 🟡 |
| RNF-SEG-03 | Contraseñas con bcrypt (cost ≥ 10); límite de 72 caracteres. | ✅ |
| RNF-SEG-04 | JWT firmado con secreto de entorno, expiración definida (hoy 7 días; evaluar 15 min + refresh). | 🟡 |
| RNF-SEG-05 | Validación estricta de entrada (whitelist de DTOs, rechazo de campos extra). | ✅ |
| RNF-SEG-06 | Control de acceso por rol **y** por propiedad del recurso (IDOR): un cliente no puede leer pedidos, comprobantes ni claves ajenos. | 🟡 |
| RNF-SEG-07 | *Rate limiting* en login, registro, revelado de claves y subida de comprobantes *(propuesto: 5 intentos/min por IP+correo en login)*. | ⬜ |
| RNF-SEG-08 | Cabeceras de seguridad (helmet), CORS restringido a los orígenes del frontend, HTTPS obligatorio. | 🟡 (CORS ✅) |
| RNF-SEG-09 | Comprobantes en almacenamiento **privado** (Cloudflare R2) con URLs firmadas de corta duración; validar tipo MIME real y tamaño. | ⬜ |
| RNF-SEG-10 | Revelado de claves y acciones críticas auditadas (quién, cuándo, IP). | ⬜ |
| RNF-SEG-11 | Rotación de la llave de cifrado soportada: guardar `keyVersion` por licencia y aceptar varias llaves en descifrado. | ⬜ (diferido, D50) |
| RNF-SEG-12 | Secretos solo en variables de entorno; `.env` fuera del repositorio; llaves distintas por entorno. | ✅ |
| RNF-SEG-13 | Contraseña reforzada para cuentas ADMIN; **sin 2FA obligatorio en el MVP** (D36). | ⬜ |
| RNF-SEG-14 | Dependencias auditadas (`npm audit`, Dependabot) y fijadas por `package-lock.json`. | 🟡 |
| RNF-SEG-15 | Principio de mínimo privilegio en la base de datos de producción (usuario de app sin permisos DDL). | ⬜ |

## RNF-INT · Integridad y concurrencia
| ID | Requerimiento | Estado |
|---|---|---|
| RNF-INT-01 | **Una licencia no puede asignarse a dos pedidos**, ni siquiera bajo compras simultáneas (`FOR UPDATE SKIP LOCKED` + restricciones únicas). | ✅ test e2e |
| RNF-INT-02 | Toda operación que cambie stock, pedido y pago se ejecuta en **una transacción**. | ✅ en reserva/liberación |
| RNF-INT-03 | Los trabajos en cola son **idempotentes** (verifican el estado actual antes de actuar). | ✅ |
| RNF-INT-04 | PostgreSQL es la fuente de verdad; Redis puede perderse sin corromper negocio (el barrido repara reservas colgadas). | ✅ |
| RNF-INT-05 | Dinero en enteros (céntimos), nunca en decimales flotantes. | ✅ |
| RNF-INT-06 | Máquinas de estado explícitas con transiciones válidas (ver `04-arquitectura.md`); las inválidas se rechazan. | 🟡 |
| RNF-INT-07 | Los duplicados de licencia se impiden por restricción única sobre el hash. | ✅ |

## RNF-REN · Rendimiento *(propuesto)*
| ID | Requerimiento |
|---|---|
| RNF-REN-01 | Lectura de catálogo: p95 < 300 ms con 100 usuarios concurrentes. |
| RNF-REN-02 | Reserva de licencia: p95 < 500 ms con 50 compras concurrentes sobre el mismo plan. |
| RNF-REN-03 | Listados admin paginados (máx. 50 por página) con índices en `status`, `planId`, `expiresAt`. |
| RNF-REN-04 | Carga de hasta [1 000] licencias por lote en < 10 s. |
| RNF-REN-05 | Frontend: LCP < 2,5 s en 4G; imágenes optimizadas; catálogo con caché corta (ISR/`revalidate`). |
| RNF-REN-06 | La caché del catálogo no puede mostrar "En stock" cuando el plan está agotado más de [30] s *(el stock exacto siempre se valida al reservar)*. |

## RNF-DIS · Disponibilidad y recuperación *(propuesto)*
| ID | Requerimiento |
|---|---|
| RNF-DIS-01 | Disponibilidad objetivo 99 % mensual en la etapa inicial (tiers gratuitos/baratos). |
| RNF-DIS-02 | Copias de seguridad automáticas de PostgreSQL (Neon PITR) con RPO ≤ 24 h y RTO ≤ 4 h. |
| RNF-DIS-03 | Probar al menos una vez la restauración antes de salir a producción. |
| RNF-DIS-04 | API y Redis en Fly.io (D49, D48): sin cold starts de plan gratuito compartido; monitoreo propio de la instancia. |
| RNF-DIS-05 | Si Redis cae, la API sigue vendiendo; las liberaciones se recuperan con el barrido al volver. |
| RNF-DIS-06 | Cierre ordenado (`enableShutdownHooks`) para no perder trabajos en despliegues. |

## RNF-ESC · Escalabilidad
| ID | Requerimiento | Estado |
|---|---|---|
| RNF-ESC-01 | API **sin estado**: puede correr en varias instancias. | ✅ |
| RNF-ESC-02 | El barrido usa un *job scheduler* de BullMQ con ID fijo; varias instancias no lo duplican. | ✅ |
| RNF-ESC-03 | Los *workers* pueden separarse de la API (proceso dedicado) sin cambiar código de negocio. | 🟡 |
| RNF-ESC-04 | El esquema admite varios ítems por pedido y más tipos de producto sin migraciones destructivas. | ✅ |

## RNF-OBS · Observabilidad
| ID | Requerimiento | Estado |
|---|---|---|
| RNF-OBS-01 | Endpoint `/health` (liveness) y `/health/ready` (Postgres + Redis). | 🟡 (liveness ✅) |
| RNF-OBS-02 | Logs estructurados en JSON con *request id* y sin datos sensibles (pino). | ⬜ |
| RNF-OBS-03 | Panel de colas (**Bull Board** en `/admin/queues`, solo ADMIN) y conservación de trabajos fallidos. | ⬜ (los fallidos ya se conservan) |
| RNF-OBS-04 | Reporte de errores (Sentry o similar) en API y frontend. | ⬜ |
| RNF-OBS-05 | Alertas: cola de fallidos > 0, stock bajo, pagos esperando más de [X] min. | ⬜ |

## RNF-MAN · Mantenibilidad y calidad
| ID | Requerimiento | Estado |
|---|---|---|
| RNF-MAN-01 | TypeScript con `strictNullChecks`; sin `any` sin justificar. | ✅ |
| RNF-MAN-02 | Migraciones versionadas; `synchronize` apagado salvo en tests. | ✅ |
| RNF-MAN-03 | Pruebas: unitarias (lógica pura), e2e contra Postgres/Redis reales para flujos críticos. Cada regla de negocio crítica tiene una prueba. | ✅ en Sprint 1 |
| RNF-MAN-04 | CI en GitHub Actions: typecheck + unit + e2e (servicios Postgres/Redis) en cada PR. | ⬜ |
| RNF-MAN-05 | Módulos por dominio (auth, catalog, inventory, orders, payments, claims, notifications, admin). | 🟡 |
| RNF-MAN-06 | Documentar decisiones (ADR) y mantener `docs/` y `CLAUDE.md` al día. | 🟡 |
| RNF-MAN-07 | Versiones de `@nestjs/*` fijadas en las ramas CommonJS (4/11); no subir a v12 (ESM) sin migrar. | ✅ |
| RNF-MAN-08 | Cobertura mínima [70 %] en servicios de dominio *(propuesto)*. | ⬜ |

## RNF-USA · Usabilidad y accesibilidad
| ID | Requerimiento |
|---|---|
| RNF-USA-01 | Diseño **responsive** desde 360 px; los técnicos usan celular y PC. |
| RNF-USA-02 | WCAG 2.2 nivel AA: contraste ≥ 4,5:1 (3:1 en texto grande), foco visible, uso completo con teclado. |
| RNF-USA-03 | Controles interactivos ≥ 44 × 44 px; elementos nativos (`button`, `a`, `input` + `label`). |
| RNF-USA-04 | El color nunca es el único portador de significado (los estados llevan texto). |
| RNF-USA-05 | Flujo de compra en ≤ 4 pasos desde la ficha hasta el comprobante enviado. |
| RNF-USA-06 | **Panel admin:** aprobar un pago en ≤ 2 clics desde la cola; sin recargas de página; avance automático al siguiente. |
| RNF-USA-07 | Mensajes de error accionables, en español claro, sin códigos técnicos. |
| RNF-USA-08 | Plazos honestos: mostrar siempre entrega estimada y horario de atención. |

## RNF-LEG · Legal y cumplimiento *(verificar con asesor legal)*
| ID | Requerimiento |
|---|---|
| RNF-LEG-01 | Protección de datos personales (Perú, Ley N.º 29733 y su reglamento): política de privacidad, consentimiento en el registro, derechos ARCO, mínimo de datos. |
| RNF-LEG-02 | Términos de uso y política de reposición visibles antes de pagar. |
| RNF-LEG-03 | Comprobantes de pago electrónicos (boleta/factura, SUNAT): **no se emiten en el MVP** (D40); se revisa por volumen/cumplimiento más adelante. |
| RNF-LEG-04 | Cláusula de uso lícito de las herramientas: checkbox obligatorio al pagar, el cliente declara ser titular/autorizado del equipo (D43). |
| RNF-LEG-05 | Retención y borrado de datos: definir plazos para comprobantes subidos y pedidos. |
| RNF-LEG-06 | No usar logos ni marcas de las herramientas sin autorización; usar el nombre solo de forma descriptiva (D42). |
| RNF-LEG-07 | Términos de uso / privacidad / reposición: borrador propio marcado `[PENDIENTE REVISIÓN LEGAL]` hasta validación de un abogado antes de producción (D41). |

## RNF-OPS · Operación, despliegue y costos
| ID | Requerimiento |
|---|---|
| RNF-OPS-01 | Entornos: local (Docker Compose), staging, producción; configuración 100 % por variables de entorno. |
| RNF-OPS-02 | Despliegue: API + workers y Redis en Fly.io (D48, D49), web en Vercel, PostgreSQL en Neon, archivos en Cloudflare R2. |
| RNF-OPS-03 | Migraciones aplicadas en cada despliegue antes de iniciar la nueva versión. |
| RNF-OPS-04 | Costo mensual objetivo en etapa inicial: [US$ X] (priorizar tiers gratuitos). |
| RNF-OPS-05 | Zona horaria de servidor UTC; presentación en America/Lima. |
| RNF-OPS-06 | Procedimiento documentado ante pérdida de `LICENSE_ENC_KEY` (sin la llave, las claves son irrecuperables): respaldo seguro de la llave. |

## RNF-I18N · Localización
- Idioma de la interfaz: español (es-PE). Textos fuera del código para facilitar cambios.
- Moneda: PEN por defecto, formato `S/ 1 234,50` (a validar con el negocio). Fechas en America/Lima.
- Campo `currency` en `plans`/`orders` desde el esquema (D51): el modelo ya soporta otra moneda sin migración destructiva, aunque hoy solo se opere en PEN.
