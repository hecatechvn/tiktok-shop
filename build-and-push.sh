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
echo "Building with production environment variables..."
cd tiktok-web
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.hct-it.vn/api/v1 \
  --build-arg NEXTAUTH_URL=https://hct-it.vn \
  --build-arg NEXTAUTH_SECRET=8e75b45ec20f90d57c36ffc600ec21f70ae5b298c8d13fbe86c886be1653a3da25fe1993f813f934c22150ca585863e4d6779f31b01f87506f58e057e2f1dff1ee3ba1bb32c336a4aae6be780a32711a53d9e5db21498a336118f596a3224e4bcfb00aa113794144b1dd2b1143c997a1598d6fef23a56476f0fd2695cbc5e175fec9c71b3ab654583425b1706b1c4059c7ebade14f52bb495e1a77366aec6791b6337b9b29bfb1e82aeae844a39e2e75f96e6a0371b4efeea5365e312f7200196e9e7ef1f88ab3744f86b715a5f392756fbaee490002abefee9a968531c9ffed9a721e5f9ec5261e821f2338046e8b79ef867e4cb6ec0b4e4c839a5af5f52877 \
  -t ${USERNAME}/tiktok-web:latest .
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