const AUTH_SERVICE_URL = process.env.REACT_APP_AUTH_URL || 'http://192.168.1.117:8000';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

class AuthService {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.user = null;
    
    // Try to load user from localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
      } catch (e) {
        console.error('Error parsing stored user:', e);
        localStorage.removeItem('user');
      }
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Get auth token
  getToken() {
    return this.token;
  }

  // Login with username/password
  async login(username, password) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      this.token = data.access_token;
      this.user = data.user;
      
      // Store token and user
      localStorage.setItem('auth_token', this.token);
      localStorage.setItem('user', JSON.stringify(this.user));

      return { success: true, user: this.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  }

  // Fetch user information using the token
  async fetchUserInfo() {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.user = await response.json();
        localStorage.setItem('user', JSON.stringify(this.user));
      } else {
        throw new Error('Failed to fetch user info');
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      // If we can't get user info, assume token is invalid
      this.logout();
    }
  }

  // Handle OAuth redirect (for future implementation)
  async handleOAuthCallback(code, state) {
    try {
      const response = await fetch(`${AUTH_SERVICE_URL}/auth/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state })
      });

      if (!response.ok) {
        throw new Error('OAuth callback failed');
      }

      const data = await response.json();
      this.token = data.access_token;
      localStorage.setItem('auth_token', this.token);
      
      await this.fetchUserInfo();
      return { success: true, user: this.user };
    } catch (error) {
      console.error('OAuth callback error:', error);
      return { success: false, error: error.message };
    }
  }

  // Logout
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  // Get auth headers for API calls
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  // Make authenticated API calls to our knowledge base backend
  async apiCall(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers || {})
    };

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      
      if (response.status === 401) {
        // Token expired or invalid
        this.logout();
        window.location.href = '/login';
        return null;
      }

      return response;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  }

  // Get articles with authentication context
  async getArticles(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/articles${queryString ? `?${queryString}` : ''}`;
    
    const response = await this.apiCall(endpoint);
    if (response && response.ok) {
      return await response.json();
    }
    return null;
  }

  // Create article (requires authentication)
  async createArticle(articleData) {
    const response = await this.apiCall('/articles', {
      method: 'POST',
      body: JSON.stringify(articleData)
    });
    
    if (response && response.ok) {
      return await response.json();
    }
    return null;
  }

  // Update article (requires authentication)
  async updateArticle(id, articleData) {
    const response = await this.apiCall(`/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(articleData)
    });
    
    if (response && response.ok) {
      return await response.json();
    }
    return null;
  }

  // Delete article (requires authentication)
  async deleteArticle(id) {
    const response = await this.apiCall(`/articles/${id}`, {
      method: 'DELETE'
    });
    
    return response && response.ok;
  }
}

// Create singleton instance
const authService = new AuthService();

export default authService;
