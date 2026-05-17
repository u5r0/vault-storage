# Vault Storage

A modern file storage and management application built with Vue.js, Hono, and Azure Blob Storage.

## Status

🚧 **Under Active Development**

This project is currently in active development. Core features are functional but some features are still being implemented. See [docs/gap-analysis.md](docs/gap-analysis.md) for detailed project status and roadmap.

## Features

- **File Operations**: Upload, download, rename, and delete files and folders
- **Azure Blob Storage**: Production-ready cloud storage backend
- **Local Development**: Azurite emulator for seamless local development
- **Modern Stack**: Vue 3, TypeScript, Tailwind CSS, Hono
- **Type Safety**: Shared SDK with Zod schemas for API contracts
- **Testing**: Vitest integration tests with Azurite backend

## Tech Stack

- **Frontend**: Vue 3, TypeScript, Tailwind CSS, Vue Router
- **Backend**: Hono (Node.js), TypeScript
- **Storage**: Azure Blob Storage
- **Testing**: Vitest (unit + integration tests with Azurite)
- **SDK**: Shared TypeScript/Zod schemas for API contracts

## Project Structure

```
vault-app/
├── apps/
│   ├── web/          # Vue.js frontend application
│   └── server/       # Hono backend API (+ scripts/seed.ts)
├── packages/sdk/     # Shared SDK with Zod schemas
├── tests/            # Vitest integration tests
└── docs/             # Architecture decisions and documentation
```

## Getting Started

For detailed setup and development instructions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Architecture Decisions (ADRs)](docs/adr/) - Design rationale and technical decisions
- [Gap Analysis](docs/gap-analysis.md) - Project status and roadmap
- [Domain Documentation](docs/agents/domain.md) - Multi-context architecture

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.
