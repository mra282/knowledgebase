#!/bin/bash

# Development setup script for Knowledge Base
echo "🚀 Setting up Knowledge Base for local development..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Setup backend virtual environment
echo "📦 Setting up Python virtual environment..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt

echo "✅ Backend dependencies installed"

# Setup frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install

echo "✅ Frontend dependencies installed"

echo ""
echo "🎉 Development setup complete!"
echo ""
echo "To start development:"
echo "1. Backend: cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"
echo "2. Frontend: cd frontend && npm start"
echo ""
echo "Or use the convenience scripts:"
echo "- ./scripts/dev-backend.sh"
echo "- ./scripts/dev-frontend.sh"
echo ""
