#!/bin/bash

# Production build script with environment variables from .env
set -e

USERNAME="hecatechvn"

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env file not found! Please create one with production variables."
    exit 1
fi

echo "🚀 Building TikTok Application Images for PRODUCTION..."
echo "======================================"
echo "Environment: ${NODE_ENV}"
echo "Frontend Domain: ${FRONTEND_DOMAIN}"
echo "Backend Domain: ${BACKEND_DOMAIN}"
echo "API URL: ${NEXT_PUBLIC_API_URL}"
echo "======================================"

echo "📦 Building NestTiktok backend image (Port: ${BACKEND_PORT})..."
cd NestTiktok
docker build -t ${USERNAME}/nest-tiktok:latest .
cd ..

echo "📦 Building tiktok-web frontend image (Port: ${FRONTEND_PORT})..."
echo "Building with production environment variables..."
cd tiktok-web
docker build \
  --build-arg NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}" \
  --build-arg NEXTAUTH_URL="${NEXTAUTH_URL}" \
  --build-arg NEXTAUTH_SECRET="${NEXTAUTH_SECRET}" \
  -t ${USERNAME}/tiktok-web:latest .
cd ..

echo "🌐 Pushing images to Docker Hub..."
echo "Make sure you are logged in to Docker Hub with: docker login"

docker push ${USERNAME}/nest-tiktok:latest
docker push ${USERNAME}/tiktok-web:latest

echo ""
echo "✅ Production build and push completed successfully!"
echo ""
echo "📋 Built with configuration:"
echo "- Frontend: ${NEXTAUTH_URL}"
echo "- Backend API: ${NEXT_PUBLIC_API_URL}"
echo "- Environment: ${NODE_ENV}"
echo ""
echo "🚀 Deploy with: "
echo "   docker compose -f docker-compose-fe-be.yml down"
echo "   docker compose -f docker-compose-fe-be.yml pull"
echo "   docker compose -f docker-compose-fe-be.yml up -d" 
