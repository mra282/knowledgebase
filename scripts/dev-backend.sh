#!/bin/bash

# Start backend development server with SQLite
echo "🔧 Starting backend development server..."
echo "📍 Database: SQLite (development)"
echo "🌐 Server: http://localhost:8001"
echo ""

cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Run ./setup-dev.sh first."
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Set development environment variables
export DATABASE_URL="sqlite:///./data/knowledgebase.db"
export ENVIRONMENT="development"
export AUTH_SERVICE_URL="http://192.168.1.117:8000"
export PYTHONPATH="$(pwd)"

# Create data directory if it doesn't exist
mkdir -p data

echo "🚀 Starting FastAPI server with auto-reload..."
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
