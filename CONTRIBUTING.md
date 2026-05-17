# Contributing to Vault Storage

Thank you for your interest in contributing to Vault Storage! This document provides guidelines for contributing to the project.

## Development Status

**Note:** This project is under active development and not yet production-ready. Please review [docs/gap-analysis.md](docs/gap-analysis.md) to understand the current state and planned features before contributing.

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

# Start development servers (Azurite, API, web)
pnpm dev

# Seed sample data (optional)
pnpm seed
```

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

- [ADR 0001: SDK as Shared Contract](docs/adr/0001-sdk-as-shared-contract.md) - API contract design
- [ADR 0002: Monorepo Layout](docs/adr/0002-monorepo-layout.md) - Project structure
- [ADR 0003: Path as Identifier](docs/adr/0003-path-as-identifier.md) - File identification strategy
- [ADR 0004: Azurite for Local Dev](docs/adr/0004-azurite-for-local-dev.md) - Local development setup
- [ADR 0005: Testing Strategy](docs/adr/0005-testing-strategy.md) - Testing approach

## Important Constraints

**Do not implement the following features until ADR 0003 is revisited:**
- Star/tag/trash features
- Share functionality
- Any metadata persistence

These features depend on migrating from path-based identifiers to opaque IDs. See [ADR 0003](docs/adr/0003-path-as-identifier.md) for details.

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
