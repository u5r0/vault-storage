output "api_url" {
  description = "Public URL of the Container App API"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "cosmos_endpoint" {
  description = "Cosmos DB account endpoint"
  value       = azurerm_cosmosdb_account.main.endpoint
}

output "resource_group" {
  description = "Resource group name"
  value       = azurerm_resource_group.main.name
}

output "container_app_name" {
  description = "Container App name (for az containerapp update)"
  value       = azurerm_container_app.api.name
}

output "managed_identity_principal_id" {
  description = "System-assigned managed identity principal ID"
  value       = azurerm_container_app.api.identity[0].principal_id
}

output "r2_bucket_name" {
  description = "R2 bucket name"
  value       = cloudflare_r2_bucket.vault.name
}

output "pages_project_name" {
  description = "Cloudflare Pages project name"
  value       = cloudflare_pages_project.vault.name
}

output "pages_url" {
  description = "Default Cloudflare Pages URL (*.pages.dev)"
  value       = "https://${cloudflare_pages_project.vault.name}.pages.dev"
}
