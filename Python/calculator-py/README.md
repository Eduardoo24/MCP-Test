# Calculator MCP Server (Python)

Servidor MCP que expone una herramienta de calculadora básica (suma, resta, multiplicación, división) usando el SDK de Python con FastMCP.

## Requisitos previos

- Sistema operativo: Linux, macOS o Windows (WSL)
- `uv` (gestor de paquetes y entornos de Python)

## Instalación

### 1. Instalar `uv`

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Agrega `uv` al PATH (o reinicia la terminal):

```bash
source ~/.bashrc   # bash
# o
source ~/.zshrc    # zsh
```

### 2. Instalar Python 3.13

```bash
uv python install 3.13
```

### 3. Instalar dependencias del proyecto

Dentro de la carpeta del servidor:

```bash
cd calculator-py
uv sync
```

Esto crea un entorno virtual `.venv` e instala `mcp[cli]>=1.6.0` con todas sus dependencias automáticamente.

## Correr el servidor

```bash
uv run python server.py
```

El servidor corre sobre **stdio**, listo para conectarse a un cliente MCP (como Claude Desktop).

## Probar con el inspector MCP

```bash
npx @modelcontextprotocol/inspector uv run python server.py
```

Abre el inspector en el navegador y podrás llamar la herramienta `calculate` manualmente.

## Herramienta disponible

| Herramienta | Descripción | Parámetros |
|---|---|---|
| `calculate` | Realiza una operación aritmética | `a: float`, `b: float`, `operation: "add" \| "subtract" \| "multiply" \| "divide"` |

## Registrar en Claude Code

Asegúrate de haber completado la instalación (`uv sync`) antes de registrar el servidor.

Desde dentro de la carpeta `calculator-py/`, ejecuta:

```bash
claude mcp add calculator -- uv run --directory "$(pwd)" python server.py
```

Esto guarda la configuración en `.claude/settings.local.json` (solo para tu entorno local, no se comparte con el repo).

**Verificar que quedó registrado:**

```bash
claude mcp list
```

**Eliminar el registro (si necesitas rehacer):**

```bash
claude mcp remove calculator
```

## Dependencias

| Paquete | Versión |
|---|---|
| Python | >=3.13 |
| mcp[cli] | >=1.6.0 |
