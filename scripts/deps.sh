#!/bin/bash

# Flower Testbed Quick Start Script
# This script automates the initial setup process

set -e

echo "🌸 Flower Testbed - Quick Start"
echo "================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Installing pnpm..."
    npm install -g pnpm
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop from https://docker.com/products/docker-desktop"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.9+ from https://python.org/"
    exit 1
fi

echo "✅ All prerequisites installed"
echo ""

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install

# Set up environment file
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local file..."
    cp .env.example .env.local
fi

## Start Docker containers
#echo "🐳 Starting PostgreSQL database..."
#docker compose up -d
#
## Wait for PostgreSQL to be ready
#echo "⏳ Waiting for database to be ready..."
#sleep 5
#
## Push database schema
#echo "📊 Setting up database schema..."
#pnpm db:push

# Python setup
echo "🐍 Setting up Python environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

echo "📦 Installing Python dependencies..."
source venv/bin/activate
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the development server:"
echo "  pnpm dev"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:3000/testbed/dashboard"
echo ""
echo "Happy federated learning! 🌸"