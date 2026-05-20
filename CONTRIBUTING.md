# Contributing to Vault Storage

Thank you for your interest in contributing to Vault Storage! This document provides guidelines for contributing to the project.

## Development Status

**Note:** This project is under active development and not yet production-ready. Please review [docs/roadmap.md](docs/roadmap.md) to understand the current state and planned features before contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/vault-storage.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Setting Up Local Development

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development servers (Azurite, Cosmos DB Emulator, API, web)
pnpm dev

# Seed sample data (optional)
pnpm seed

**Demo credentials created by seed:**
- Email: `demo@vault.app`
- Password: `demo123456`

The seed script creates a demo user and populates the storage with sample folders (Movies, Documents, Music) and files.
```

**Prerequisites:**
- **Azure Cosmos DB Emulator** for local development (Docker-based). The emulator provides the full Cosmos DB feature set without requiring cloud resources. It runs alongside Azurite in the development environment.
- **Azure Blob Storage** credentials (or Azurite for local emulation)

### Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Watch mode for development
pnpm test:watch
```

## Code Style

- Use TypeScript for all new code
- Follow existing code style and patterns
- Write meaningful commit messages
- Add tests for new features and bug fixes

## Project Structure

- `apps/web/` - Vue.js frontend application
- `apps/server/` - Hono backend API (with `scripts/seed.ts`)
- `packages/sdk/` - Shared SDK with Zod schemas (API contract)
- `tests/` - Integration tests
- `docs/` - Architecture decisions and documentation

## Architecture Decisions

Before making significant changes, please review the Architecture Decision Records (ADRs) in `docs/adr/`:

- [ADR 0001: Authentication System](docs/adr/0001-authentication.md) - Email/password login, magic links, JWT tokens
- [ADR 0002: Password Requirements](docs/adr/0002-password-requirements.md) - Password strength and validation rules
- [ADR 0003: Email Infrastructure](docs/adr/0003-email-infrastructure.md) - Email delivery via Mailpit/SMTP
- [ADR 0004: Testing Strategy](docs/adr/0004-testing-strategy.md) - Vitest integration tests with Azurite
- [ADR 0005: SDK as Shared Contract](docs/adr/0005-sdk-as-shared-contract.md) - API contract design
- [ADR 0006: Cosmos DB and ID-Based Routing](docs/adr/0006-cosmos-db-and-id-based-routing.md) - Database and routing architecture
- [ADR 0007: Monorepo Layout](docs/adr/0007-monorepo-layout.md) - Project structure

## Important Constraints

**ID-based routing is implemented** (ADR 0006). The following features are now available for implementation:
- Star/tag/trash features (metadata persistence via Cosmos DB)
- Share functionality
- Rich metadata support

See the [roadmap](docs/roadmap.md) for current priorities and upcoming features.

## Submitting Changes

1. Ensure all tests pass: `pnpm test`
2. Commit your changes with clear messages
3. Push to your fork: `git push origin feature/your-feature-name`
4. Open a pull request with a description of your changes

## Pull Request Guidelines

- Describe what your PR does and why
- Reference related issues (if any)
- Include screenshots for UI changes (if applicable)
- Ensure all tests pass
- Update documentation as needed

## Security

**Never commit secrets or sensitive information:**
- API keys
- Connection strings
- Passwords
- Personal tokens

Use environment variables (see `.env.example`) for configuration.

## Questions?

Feel free to open an issue for questions or discussions about potential contributions.
