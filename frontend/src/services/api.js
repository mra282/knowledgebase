import axios from 'axios';

// Configure axios with base URL and default headers
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    
    // Handle common HTTP errors
    if (error.response?.status === 404) {
      throw new Error('Resource not found');
    } else if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.response?.status === 422) {
      throw new Error('Invalid data provided');
    }
    
    throw error;
  }
);

// Article API functions
export const articlesAPI = {
  // Get paginated articles
  getArticles: async (params = {}) => {
    const { skip = 0, limit = 20, sort_by = 'updated_at', order = 'desc' } = params;
    const response = await api.get('/articles', {
      params: { skip, limit, sort_by, order }
    });
    return response.data;
  },

  // Get single article by ID
  getArticle: async (id) => {
    const response = await api.get(`/articles/${id}`);
    return response.data;
  },

  // Create new article
  createArticle: async (articleData) => {
    const response = await api.post('/articles', articleData);
    return response.data;
  },

  // Update existing article
  updateArticle: async (id, articleData) => {
    const response = await api.put(`/articles/${id}`, articleData);
    return response.data;
  },

  // Delete article (soft delete)
  deleteArticle: async (id) => {
    await api.delete(`/articles/${id}`);
  },

  // Vote article as helpful
  voteHelpful: async (id) => {
    const response = await api.post(`/articles/${id}/helpful`);
    return response.data;
  }
};

// Search API functions
export const searchAPI = {
  // Basic search
  searchArticles: async (query, limit = 20, enhanced = false) => {
    const response = await api.get('/search', {
      params: { q: query, limit, enhanced }
    });
    return response.data;
  },

  // RAG-powered question answering (placeholder)
  askQuestion: async (question) => {
    const response = await api.post('/ask', null, {
      params: { query: question }
    });
    return response.data;
  }
};

// Health check
export const healthAPI = {
  check: async () => {
    const response = await api.get('/health');
    return response.data;
  }
};

// Utility functions
export const formatters = {
  // Format date to readable string
  formatDate: (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // Format weight score for display
  formatWeightScore: (score) => {
    if (score >= 7) return { label: 'High', class: 'weight-high' };
    if (score >= 4) return { label: 'Medium', class: 'weight-medium' };
    return { label: 'Low', class: 'weight-low' };
  },

  // Truncate text with ellipsis
  truncateText: (text, maxLength = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  },

  // Parse tags from comma-separated string
  parseTags: (tagsString) => {
    if (!tagsString) return [];
    return tagsString.split(',').map(tag => tag.trim()).filter(Boolean);
  },

  // Convert tags array to comma-separated string
  stringifyTags: (tagsArray) => {
    if (!Array.isArray(tagsArray)) return '';
    return tagsArray.join(', ');
  }
};

export default api;
