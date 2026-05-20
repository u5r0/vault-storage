# Vault Storage

A modern file storage and management application built with Vue.js, Hono, Azure Blob Storage, and Cosmos DB.

## Status

🚧 **Under Active Development**

This project is currently in active development. Core features are functional but some features are still being implemented. See [docs/roadmap.md](docs/roadmap.md) for detailed project status and roadmap.

## Features

**Implemented:**
- **Secure File Storage**: Upload, organize, and manage your files
- **Authentication**: Secure access with email/password login, passwordless magic links, and password recovery
- **Cloud-Native Infrastructure**: Built on Azure for reliable, scalable storage
- **Modern User Experience**: Clean, intuitive interface with dark/light theme support
- **Type-Safe Architecture**: Robust API contracts ensuring data integrity


## Tech Stack

- **Frontend**: Vue 3, Vuex, Tailwind CSS, Vue Router, Uppy (file uploads)
- **Backend**: Hono (Node.js), TypeScript
- **Storage**: Azure Blob Storage, Azure Cosmos DB
- **Authentication**: Argon2id password hashing, JWT tokens, magic links
- **Testing**: Vitest (unit + integration tests)
- **SDK**: Shared TypeScript/Zod schemas for API contracts

## Project Structure

```
vault-storage/
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
- [Roadmap](docs/roadmap.md) - Project status and roadmap
- [Domain Documentation](docs/agents/domain.md) - Multi-context architecture

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on contributing to this project.
