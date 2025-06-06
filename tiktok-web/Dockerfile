# Simple Next.js Dockerfile for debugging
FROM node:18-alpine

# Install libc6-compat for Alpine
RUN apk add --no-cache libc6-compat

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build-time arguments
ARG NEXT_PUBLIC_API_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}

# Build the application with verbose output
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"] 