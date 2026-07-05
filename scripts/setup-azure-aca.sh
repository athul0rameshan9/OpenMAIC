#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps - Infrastructure Setup for OpenMAIC
# Run this script ONCE to provision the Azure infrastructure.
# Prerequisites: Azure CLI installed & logged in (az login)
# =============================================================================

set -euo pipefail

# ---------- Configuration (edit these) ----------
RESOURCE_GROUP="rg-openmaic-dev"
LOCATION="centralindia"
ENVIRONMENT_NAME="cae-openmaic-dev"
APP_NAME="ca-openmaic"
IMAGE="ghcr.io/athul0rameshan9/openmaic:latest"  # <-- REPLACE with your GitHub username/org

# GitHub Container Registry credentials (for private repos)
GHCR_USERNAME="athul0rameshan9"  # <-- REPLACE
GHCR_PAT="<YOUR_GITHUB_PAT>"           # <-- REPLACE (PAT with read:packages scope)

# ---------- Step 1: Create Resource Group ----------
echo "Creating resource group: $RESOURCE_GROUP in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# ---------- Step 2: Create Container Apps Environment ----------
echo "Creating Container Apps environment: $ENVIRONMENT_NAME..."
az containerapp env create \
  --name "$ENVIRONMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# ---------- Step 3: Create Container App ----------
echo "Creating Container App: $APP_NAME..."
az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$ENVIRONMENT_NAME" \
  --image "$IMAGE" \
  --target-port 3000 \
  --ingress external \
  --cpu 1.0 \
  --memory 2.0Gi \
  --min-replicas 0 \
  --max-replicas 1 \
  --registry-server ghcr.io \
  --registry-username "$GHCR_USERNAME" \
  --registry-password "$GHCR_PAT" \
  --output none

# ---------- Step 4: Configure Secrets & Environment Variables ----------
# Add your secrets here. Example for common OpenMAIC env vars:
echo "Configuring secrets..."

# Uncomment and fill in the secrets you need:
# az containerapp secret set \
#   --name "$APP_NAME" \
#   --resource-group "$RESOURCE_GROUP" \
#   --secrets \
#     openai-api-key="<YOUR_OPENAI_API_KEY>" \
#     anthropic-api-key="<YOUR_ANTHROPIC_API_KEY>" \
#     google-api-key="<YOUR_GOOGLE_API_KEY>" \
#     supabase-url="<YOUR_SUPABASE_URL>" \
#     supabase-anon-key="<YOUR_SUPABASE_ANON_KEY>" \
#     supabase-service-role-key="<YOUR_SUPABASE_SERVICE_ROLE_KEY>"

# az containerapp update \
#   --name "$APP_NAME" \
#   --resource-group "$RESOURCE_GROUP" \
#   --set-env-vars \
#     "OPENAI_API_KEY=secretref:openai-api-key" \
#     "ANTHROPIC_API_KEY=secretref:anthropic-api-key" \
#     "GOOGLE_API_KEY=secretref:google-api-key" \
#     "NEXT_PUBLIC_SUPABASE_URL=secretref:supabase-url" \
#     "NEXT_PUBLIC_SUPABASE_ANON_KEY=secretref:supabase-anon-key" \
#     "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key"

# ---------- Step 5: Set up OIDC for GitHub Actions ----------
echo ""
echo "Setting up federated credentials for GitHub Actions..."
echo "Creating service principal..."

SP_OUTPUT=$(az ad sp create-for-rbac \
  --name "sp-openmaic-deploy" \
  --role Contributor \
  --scopes "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP" \
  --output json)

CLIENT_ID=$(echo "$SP_OUTPUT" | jq -r '.appId')
TENANT_ID=$(echo "$SP_OUTPUT" | jq -r '.tenant')
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo ""
echo "Creating federated credential for GitHub Actions OIDC..."
OBJECT_ID=$(az ad app show --id "$CLIENT_ID" --query id -o tsv)

az rest --method POST \
  --uri "https://graph.microsoft.com/beta/applications/$OBJECT_ID/federatedIdentityCredentials" \
  --body "{
    \"name\": \"github-deploy-main\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:<YOUR_GITHUB_ORG>/<YOUR_REPO_NAME>:ref:refs/heads/main\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" \
  --output none 2>/dev/null || echo "(Federated credential may already exist)"

# ---------- Summary ----------
echo ""
echo "============================================="
echo "  Infrastructure provisioned successfully!"
echo "============================================="
echo ""
echo "Container App FQDN:"
az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv
echo ""
echo "Add these GitHub repository secrets for CI/CD:"
echo "  AZURE_CLIENT_ID=$CLIENT_ID"
echo "  AZURE_TENANT_ID=$TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
echo "  GHCR_PAT=<your GitHub PAT with read:packages scope>"
echo ""
echo "Next steps:"
echo "  1. Replace <YOUR_GITHUB_ORG>/<YOUR_REPO_NAME> in federated credential subject"
echo "  2. Add the GitHub secrets listed above to your repository"
echo "  3. Uncomment and fill in the secrets in Step 4 above, then re-run that section"
echo "  4. Push to main to trigger the first deployment"
