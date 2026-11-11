# Procedencia de esta base — Rato al Sol

Preparación: 2026-10-30. Referencia principal: **BuildApp**, por petición expresa de Tony. MTM se consulta solo para lecciones generales, no para trasladar su sistema de trading.

## Aprovechado de BuildApp

- Fuente canónica de instrucciones y copias sincronizadas para distintas IAs.
- `.memory/architecture.md`, `decisions.md`, `todo.md` y `glossary.md`; lectura selectiva y promoción de hallazgos durables.
- Alcance/estado antes de editar, cambios pequeños, reutilización y ausencia de abstracciones o dependencias especulativas.
- Producto útil antes que fachada de marketing; tipografía, claridad, accesibilidad, rendimiento y QA de navegador.
- Planificación por aceptación, implementación incremental y revisión por corrección, privacidad, contratos, pruebas, rendimiento y sencillez.
- Scripts de sincronización/comprobación adaptados al repo de una sola app. Conservan nombres familiares, pero no ejecutan borrados recursivos ni sincronizan skills de otros proyectos.

## Complementos generales tomados de MTM

- Separar información disponible, estimación e incertidumbre; comprobar relojes, unidades y consumidores reales.
- Conservar negativos y decisiones; recuperar contexto por demanda, sin transcripciones ni historias duplicadas.
- No asumir que una prueba parcial o un campo declarado están aplicados en el recorrido real.
- Trabajar dentro de WSL y usar archivos de script al transportar órdenes complejas desde Windows, para evitar expansión de variables.

## Adaptación deliberada

- Se sigue el patrón de instrucciones de **BuildApp**, con canon y verificador, frente al patrón de un solo fichero de MTM.
- No se copian infraestructura, datos, credenciales, cuentas, bots, reglas financieras, release móvil, herramientas de mercado, cuotas de modelos ni proveedores de pago.
- No se fijan stack, modelo IA, red o sandbox de máquina. Auto Review conserva la preferencia explícita de Tony.
- Beads y memorias externas quedan opcionales hasta estar realmente configuradas; `.memory/todo.md` es la lista inicial y NOTES solo el índice.
- No hacen falta rutas absolutas a los repos de referencia para trabajar en esta app. Las rutas siguientes documentan la procedencia de lectura, no son imports ni dependencias.

## Fuentes locales revisadas

| Referencia local | SHA-256 |
|---|---|
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/AI_SHARED_INSTRUCTIONS.md` | `eac4b67233216050f2074bae81770e90feb782522206788522dc6fc2e0e2fd3f` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/apps/web/AI_SHARED_INSTRUCTIONS.md` | `4ecf2283b8968e876685cf2c21f5415319228f4694bc66aa8feb9859df3b762f` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/apps/pro/AI_SHARED_INSTRUCTIONS.md` | `940dcd2cc0eae5471d364fb25f2e383710fb2692d53101bbded728e02ba292f4` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/.agents/skills/buildapp-agent/references/operational-workflow.md` | `79a482bd6c72604c126a29e829031642eef808cfcf8519c57683722753e0a14e` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/.agents/skills/buildapp-plan/SKILL.md` | `433f38d77230e874b82316bf207371f83bfd57d6015f8fc7f040420c781edc9a` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/.agents/skills/buildapp-implement/SKILL.md` | `03777e516e7b4c2c69018d127e9416994aa392b9cfad03f62c2fda611147bb1d` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/.agents/skills/buildapp-frontend/SKILL.md` | `7e322fa51b05c1f3289f9001542432a153526085f63f1390a85b4f904e2af13a` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/.agents/skills/buildapp-review/SKILL.md` | `a76b314128980bf8324c2683c4f6ddacea10dfc5f0ff417b2576a5417a463074` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/scripts/sync-ai-instructions.sh` | `fa2515b94c672634dad3b98bd5dc17bcafd69a71a10a4078f003ee366817fe6e` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo/scripts/check-ai-instructions.sh` | `7e8d29e43234a47456bc69212017411fe8b00c1bfb4056e7c852086d3d24ed60` |
| `/home/tonirod/code/Trading/MTM_Trading/AGENTS.md` | `56a2bcadd2faf13269984d18828c971d3d7468fda797a523f9c41d6ed19e3b8c` |
| `/home/tonirod/code/Trading/MTM_Trading/docs/lessons_from_mlfx.md` | `cb061914d132ef67d40a83ab2a1b0ea0dc60264fb471ce23d6265e2afddfe83a` |
| `/home/tonirod/code/Trading/MTM_Trading/docs/ADAPTIVE_EXPERT_OPERATING_SYSTEM.md` | `cf1c3ac9fd025cfa004649786815c5d5ecbde6d37637a8caa57c5e2dec6bea5b` |
| `/home/tonirod/code/BuildApp/BuildApp_monorepo-entregas-verificables/AGENTS.md` (contraste de instrucciones de la rama reciente) | `eac4b67233216050f2074bae81770e90feb782522206788522dc6fc2e0e2fd3f` |

## Referencias de configuración

- [Instrucciones AGENTS.md de Codex](https://developers.openai.com/codex/guides/agents-md)
- [Configuración de Codex y Auto Review](https://developers.openai.com/codex/config-reference)

Los hashes identifican el texto local revisado; no acreditan por sí solos la calidad de la política. Una referencia no se convierte automáticamente en una obligación aplicable al producto.
