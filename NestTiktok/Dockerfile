# Stage 1: Build stage
FROM node:20-slim AS build

RUN apt-get update && apt-get install -y python3 make g++ openssl

WORKDIR /app

ENV NODE_OPTIONS="--openssl-legacy-provider"

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Copy service account file vào thư mục build
RUN mkdir -p ./dist/google-sheets
COPY src/google-sheets/service-account.json ./dist/google-sheets/

# Stage 2: Production image
FROM node:20-slim

WORKDIR /app

# Accept build arg for NODE_OPTIONS
ARG NODE_OPTIONS
ENV NODE_OPTIONS="${NODE_OPTIONS} --max-old-space-size=4096"

# Chỉ copy file package.json và package-lock.json để cài dependencies production
COPY package*.json ./

RUN npm ci --production

# Copy build từ stage build vào
COPY --from=build /app/dist ./dist

EXPOSE 8000
ENV PORT=8000

CMD ["node", "dist/main.js"]
