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
    echo "❌ pnpm not found. Please install pnpm  from https://pnpm.io/installation"
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

# Python setup
echo "🐍 Setting up Python environment..."
if [ ! -d "venv" ]; then
    python3 -m venv /opt/venv
fi

echo "📦 Installing Python dependencies..."
source /opt/venv/bin/activate
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "Happy federated learning! 🌸"