# MCP Servers

Colección de servidores MCP (Model Context Protocol) de ejemplo, implementados en Python y TypeScript.

## Servidores disponibles

| Servidor | Lenguaje | Descripción |
|---|---|---|
| [calculator-py](STDIO/Python/calculator-py/) | Python | Calculadora básica: suma, resta, multiplicación y división |
| [todo-ts](STDIO/Typescript/todo-ts/) | TypeScript | Gestión de lista de tareas en memoria |

---

## Instalación rápida

### 1. Calculator (Python)

**Requisitos:** [`uv`](https://docs.astral.sh/uv/)

```bash
# Instalar uv si no lo tienes
curl -LsSf https://astral.sh/uv/install.sh | sh

# Instalar dependencias
cd Python/calculator-py
uv sync

# Registrar en Claude Code (ejecutar desde dentro de calculator-py/)
claude mcp add calculator -- uv run --directory "$(pwd)" python server.py
```

### 2. Todo List (TypeScript)

**Requisitos:** [Node.js](https://nodejs.org/) v18 o superior

```bash
# Instalar dependencias y compilar
cd Typescript/todo-ts
npm install
npm run build

# Registrar en Claude Code (ejecutar desde dentro de todo-ts/)
claude mcp add todo -- node "$(pwd)/build/index.js"
```

---

## Verificar los servidores registrados

```bash
claude mcp list
```

## Probar sin Claude (MCP Inspector)

```bash
# Calculator
npx @modelcontextprotocol/inspector uv run --directory Python/calculator-py python server.py

# Todo
npx @modelcontextprotocol/inspector node Typescript/todo-ts/build/index.js
```

---

## Estructura del proyecto

```
MCP_SERVERS/
├── Python/
│   └── calculator-py/      # Servidor MCP en Python (FastMCP)
│       ├── server.py
│       ├── pyproject.toml
│       └── README.md
└── Typescript/
    └── todo-ts/            # Servidor MCP en TypeScript
        ├── src/
        ├── build/
        ├── package.json
        └── README.md
```

---

> Los servidores usan transporte **stdio** — Claude Code los lanza automáticamente como subprocesos al conectarse.
