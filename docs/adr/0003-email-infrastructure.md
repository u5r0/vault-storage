# ADR 0003: Email Infrastructure

**Status:** Accepted
**Date:** 2026-05-20

## Decision

Use Mailpit for development email delivery and configurable SMTP for production.

## Technical Details

**Development:**
- Mailpit Docker service (SMTP on port 1025, Web UI on port 8025)
- SMTP URL: `smtp://localhost:1025`
- Web UI for viewing sent emails during development

**Production:**
- Configurable SMTP service (SendGrid, AWS SES, Resend, etc.)
- Environment variables: `SMTP_URL`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- `APP_URL` for generating verification/reset links

**Email Templates:**
- HTML email templates for verification and password reset
- Consistent branding with application theme
- Responsive design

## Consequences

**Positive:**
- Zero-configuration email testing in development
- Visual email preview via Mailpit web UI
- Production flexibility with any SMTP provider
- No email service dependency during local development

**Negative:**
- Requires running Mailpit Docker container for email features
- Production requires SMTP service configuration
- Email service costs in production

## References

- Mailpit: https://github.com/axllent/mailpit
