#!/bin/bash

# Start frontend development server
echo "🔧 Starting frontend development server..."
echo "🌐 Server: http://localhost:3000"
echo ""

cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "❌ Node modules not found. Run ./setup-dev.sh first."
    exit 1
fi

# Set development environment variables
export REACT_APP_API_URL="http://localhost:8001"
export REACT_APP_AUTH_URL="http://192.168.1.117:8000"

echo "🚀 Starting React development server..."
npm start
