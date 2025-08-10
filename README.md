# Knowledge-Centered Support (KCS) System

A comprehensive knowledge base system built for customer service departments following Knowledge-Centered Support methodology. This system provides article weighting, natural language search capabilities, and a foundation for AI-powered features.

## 🚀 Features

### Current MVP Features
- **Article Management**: Full CRUD operations for knowledge base articles
- **KCS Methodology**: Article weighting system for content quality assessment  
- **Smart Search**: Keyword-based search with ranking by article weight
- **Modern UI**: Responsive React interface with Tailwind CSS
- **RESTful API**: FastAPI backend with automatic OpenAPI documentation
- **Dual Environment Support**: SQLite for development, PostgreSQL for Docker/production

### Planned Features
- **Natural Language Search**: Advanced semantic search capabilities
- **RAG Integration**: AI-powered question answering
- **Analytics Dashboard**: Usage metrics and content performance
- **User Management**: Role-based access control
- **Integration APIs**: Connect with customer service platforms

## 🛠 Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - SQL toolkit and ORM
- **SQLite** - Development database
- **PostgreSQL** - Production database (Docker)
- **Pydantic** - Data validation using Python type annotations

### Frontend  
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework
- **Axios** - HTTP client for API communication
- **React Router** - Client-side routing

### Infrastructure
- **Docker & Docker Compose** - Containerization and orchestration
- **PostgreSQL** - Production database
- **Nginx** - Production web server (in frontend container)

## 🏗 Development Modes

This project supports two development modes:

### 1. 🐳 Docker Mode (Production-like)
- Uses PostgreSQL database
- Full containerized environment
- Ideal for testing production scenarios

### 2. 💻 Local Development Mode (Fast iteration)
- Uses SQLite database
- Direct Python/Node.js execution
- Faster startup and iteration
- Hot-reloading enabled

## 🚀 Quick Start

### Docker Mode
```bash
# Start all services with PostgreSQL
docker-compose up --build

# Access the application
Frontend: http://localhost:3000
Backend API: http://localhost:8001
API Documentation: http://localhost:8001/docs
```

### Local Development Mode
```bash
# One-time setup
./setup-dev.sh

# Start backend (SQLite)
./scripts/dev-backend.sh

# In another terminal, start frontend
./scripts/dev-frontend.sh

# Or start both simultaneously (requires tmux)
./scripts/dev-both.sh
```

## 📁 Project Structure

```
knowledgebase/
├── backend/                    # Python FastAPI backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI application
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── database.py        # Database configuration
│   │   ├── crud.py            # Database operations
│   │   └── search.py          # Search & RAG services
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── SearchBar.js
│   │   │   ├── ArticleCard.js
│   │   │   ├── ArticleForm.js
│   │   │   └── ArticleModal.js
│   │   ├── pages/
│   │   │   └── Home.js        # Main page
│   │   ├── services/
│   │   │   └── api.js         # API client
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css          # Tailwind styles
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## ⚡ Quick Start

### Prerequisites
- **Docker** and **Docker Compose** installed
- **VS Code** (recommended) with Docker extension
- **Git** for version control

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd knowledgebase
```

### 2. Start with Docker Compose
```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

### 3. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs (Swagger UI)
- **Alternative API Docs**: http://localhost:8000/redoc (ReDoc)

### 4. Create Your First Article
1. Open http://localhost:3000
2. Click "New Article" button
3. Fill in the form with title, content, tags, and weight score
4. Save and test the search functionality

## 🔧 Development Setup

### Option 1: Docker Development (Recommended)
The Docker setup includes hot reload for both frontend and backend:

```bash
# Start development environment
docker-compose up --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after dependency changes
docker-compose up --build --force-recreate
```

### Option 2: Local Development

#### Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

## 📊 API Usage Examples

### Create Article
```bash
curl -X POST "http://localhost:8000/articles" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Network Troubleshooting Guide",
    "content": "Step-by-step guide for resolving network connectivity issues...",
    "tags": ["network", "troubleshooting", "connectivity"],
    "weight_score": 8.5
  }'
```

### Search Articles
```bash
curl "http://localhost:8000/search?q=network%20troubleshooting&limit=10"
```

### Get All Articles
```bash
curl "http://localhost:8000/articles?limit=20&sort_by=weight_score&order=desc"
```

## 🎯 Key Design Decisions

### 1. KCS Methodology Implementation
- **Weight Score**: 0-10 scale for article quality/reliability
- **Analytics Tracking**: View counts and helpful votes
- **Content-First**: Focus on searchable, actionable content

### 2. Search Architecture
- **Current**: SQL-based keyword matching with weight-based ranking
- **Future**: Vector embeddings for semantic search
- **Extensible**: Pluggable search service design

### 3. Database Choice
- **SQLite**: Perfect for MVP and development
- **Migration Path**: Easy upgrade to PostgreSQL for production
- **Schema**: Designed for future extensions (user roles, categories, etc.)

### 4. Frontend Architecture  
- **Component-Based**: Reusable, modular UI components
- **State Management**: React hooks (future: Redux for complex state)
- **Responsive Design**: Mobile-first with Tailwind CSS

## 🚀 Next Steps & Roadmap

### Phase 1: Core Features ✅
- [x] Article CRUD operations
- [x] Basic search functionality
- [x] Docker containerization
- [x] Responsive UI

### Phase 2: Enhanced Search (Next)
- [ ] Full-text search with SQLite FTS5
- [ ] Search result highlighting
- [ ] Advanced filtering (tags, date ranges, weight score)
- [ ] Search analytics

### Phase 3: AI Integration
- [ ] Vector embeddings for semantic search
- [ ] RAG implementation with OpenAI/Anthropic
- [ ] Auto-tagging with NLP
- [ ] Content suggestions

### Phase 4: Production Features
- [ ] User authentication & authorization
- [ ] Content moderation workflow
- [ ] Analytics dashboard
- [ ] Export/import capabilities
- [ ] Integration APIs for CRM systems

## 🔐 Security Considerations

### Current Status (MVP)
- Input validation with Pydantic
- SQL injection prevention with SQLAlchemy
- CORS configuration for frontend

### Production TODO
- Authentication & authorization (JWT tokens)
- Rate limiting
- Content sanitization
- Audit logging
- HTTPS enforcement

## 📈 Performance & Scalability

### Current Architecture
- SQLite: Suitable for ~100K articles
- Single-container deployment
- Client-side pagination

### Scaling Plan
- **Database**: Migrate to PostgreSQL with read replicas
- **Search**: Implement Elasticsearch cluster
- **Caching**: Redis for frequently accessed content
- **CDN**: Asset delivery optimization
- **Load Balancing**: Multiple backend instances

## 🛠 Troubleshooting

### Common Issues

**Docker Build Fails**
```bash
# Clear Docker cache
docker system prune -a
docker-compose up --build --force-recreate
```

**Frontend Can't Connect to Backend**
```bash
# Check if backend is running
curl http://localhost:8000/health

# Verify network connectivity
docker-compose logs backend
```

**Database Issues**
```bash
# Reset database
docker-compose down -v
docker-compose up --build
```

### Logs
```bash
# View all logs
docker-compose logs

# Follow specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow PEP 8 for Python code
- Use ESLint/Prettier for JavaScript
- Write descriptive commit messages
- Add tests for new features
- Update documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- FastAPI team for the excellent framework
- React and Tailwind communities
- Knowledge-Centered Support methodology pioneers
- Open source contributors

---

**Happy Knowledge Sharing! 📚✨**

For questions or support, please open an issue or contact the development team.

## 📥 Article Import Format

When using the Admin > Data Management > Import Articles tool, provide a JSON array of article objects. Each object can include the following fields:

- title: string (required)
- content: string (required, plain text or HTML)
- tags: string[] (optional)
- is_public: boolean (optional, default true)
- weight_score: number (optional)
- category: string (optional)
- summary: string (optional; if omitted, the system will auto-generate a truncated summary from content)

Example:

[
  {
    "title": "Network Troubleshooting Guide",
    "content": "<h2>Steps</h2><ol><li>Check cables</li><li>Restart router</li></ol>",
    "tags": ["network", "troubleshooting"],
    "is_public": true,
    "weight_score": 8.5,
    "category": "how-to"
  },
  {
    "title": "FAQ: Password Reset",
    "content": "Users can reset their password by clicking the 'Forgot Password' link.",
    "tags": ["faq"],
    "is_public": true
  }
]

Note: Sample test data directories like test_data/ are not tracked in version control (see .gitignore). Bring your own JSON exports when importing.
