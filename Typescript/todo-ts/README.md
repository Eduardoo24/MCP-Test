# TODO List MCP Server (TypeScript)

Servidor MCP que gestiona una lista de tareas en memoria usando el SDK oficial de TypeScript para MCP.

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior (recomendado v22)
- `npm` v9 o superior (incluido con Node.js)

## Instalación

### 1. Instalar dependencias

Dentro de la carpeta del servidor:

```bash
cd todo-ts
npm install
```

### 2. Compilar TypeScript

```bash
npm run build
```

Esto genera la carpeta `build/` con el JavaScript listo para ejecutar.

## Correr el servidor

```bash
node build/index.js
```

El servidor corre sobre **stdio**, listo para conectarse a un cliente MCP (como Claude Desktop).

## Probar con el inspector MCP

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

Abre el inspector en el navegador y podrás llamar las herramientas manualmente.

## Herramientas disponibles

| Herramienta | Descripción | Parámetros |
|---|---|---|
| `TODO-Create` | Crea una nueva tarea | `task: string` |
| `TODO-List` | Lista todas las tareas | — |
| `TODO-Complete` | Marca una tarea como completada | `id: string` |
| `TODO-Update` | Actualiza el texto de una tarea | `id: string`, `task: string` |
| `TODO-Delete` | Elimina una tarea | `id: string` |
| `TODO-ClearCompleted` | Elimina todas las tareas completadas | — |

> Los datos se guardan en memoria — se pierden al reiniciar el servidor.

## Registrar en Claude Code

Asegúrate de haber compilado el proyecto (`npm run build`) antes de registrar el servidor.

Desde dentro de la carpeta `todo-ts/`, ejecuta:

```bash
claude mcp add todo -- node "$(pwd)/build/index.js"
```

Esto guarda la configuración en `.claude/settings.local.json` (solo para tu entorno local, no se comparte con el repo).

**Verificar que quedó registrado:**

```bash
claude mcp list
```

**Eliminar el registro (si necesitas rehacer):**

```bash
claude mcp remove todo
```

## Dependencias

| Paquete | Versión |
|---|---|
| @modelcontextprotocol/sdk | ^1.8.0 |
| zod | ^3.24.2 |
| typescript (dev) | ^5.8.2 |
| @types/node (dev) | ^22.14.0 |
