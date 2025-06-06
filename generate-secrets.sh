#!/bin/bash

# Script to generate secure secrets for production

echo "🔐 Generating secure secrets for production..."

# Generate JWT Secret (512 chars)
JWT_SECRET=$(openssl rand -hex 256)

# Generate NextAuth Secret (512 chars)  
NEXTAUTH_SECRET=$(openssl rand -hex 256)

# Generate MongoDB Password (32 chars)
MONGO_PASSWORD=$(openssl rand -hex 16)

echo ""
echo "📋 Generated Secrets (copy to your .env file):"
echo ""
echo "# Generated Secrets - $(date)"
echo "MONGO_PASSWORD=$MONGO_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
echo ""
echo "⚠️  Save these securely! They cannot be recovered if lost."
echo "💡 Update your .env file with these values before deploying to production." 