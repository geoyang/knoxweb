#!/bin/bash

# Knox Web Development Docker Script
# This script helps run the Knox web app in development mode

echo "🚀 Starting Knox Web Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Clean up any existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose -f docker-compose.dev.yml down --remove-orphans

# Remove any existing images to force rebuild
echo "🔄 Removing existing images..."
docker rmi knox-web-knox-web-dev 2>/dev/null || true

# Build and run the container
echo "🏗️ Building and starting development container..."
docker-compose -f docker-compose.dev.yml up --build

echo "✅ Development environment is ready!"
echo "🌐 Open http://localhost:3000 in your browser"