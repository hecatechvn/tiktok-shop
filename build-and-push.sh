#!/bin/bash

# Build and push script for Docker images
set -e

USERNAME="hecatechvn"

echo "🚀 Building TikTok Application Images..."
echo "======================================"

echo "📦 Building NestTiktok backend image (Port: 8000)..."
echo "Dependencies: MongoDB, Google Sheets API"
cd NestTiktok
docker build -t ${USERNAME}/nest-tiktok:latest .
cd ..

echo "📦 Building tiktok-web frontend image (Port: 3000)..."
cd tiktok-web
docker build -t ${USERNAME}/tiktok-web:latest .
cd ..

echo "🌐 Pushing images to Docker Hub..."
echo "Make sure you are logged in to Docker Hub with: docker login"

docker push ${USERNAME}/nest-tiktok:latest
docker push ${USERNAME}/tiktok-web:latest

echo ""
echo "✅ Build and push completed successfully!"
echo ""
echo "📋 Services included:"
echo "- Frontend (Next.js): Port 3000"
echo "- Backend (NestJS): Port 8000" 
echo "- MongoDB: Port 27017"
echo "- Google Sheets API integration"
echo ""
echo "🔧 Available deployment options:"
echo "1. Development (with port mapping): docker-compose -f docker-compose.dev.yml up -d"
echo "2. Production (with Traefik): docker-compose -f docker-compose-fe-be.yml up -d"
echo ""
echo "🌍 Access URLs:"
echo "Development:"
echo "- Frontend: http://localhost:3000"
echo "- Backend: http://localhost:8000"
echo "- MongoDB: localhost:27017"
echo ""
echo "Production:"
echo "- Frontend: https://hct-it.vn"
echo "- Backend: https://api.hct-it.vn"
echo ""
echo "📖 See DOCKER-SETUP.md for detailed instructions" 