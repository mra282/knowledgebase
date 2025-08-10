import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/auth';
import ArticleCard from '../components/ArticleCard';
import SearchBar from '../components/SearchBar';

const Home = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = authService.getCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/articles');
      if (!response.ok) {
        throw new Error('Failed to load articles');
      }
      const data = await response.json();
      // Ensure we always set an array
      setArticles(Array.isArray(data.articles) ? data.articles : Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      setArticles([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    if (!query || query.trim() === '') {
      // If empty query, reload all articles
      loadArticles();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8001/search?q=${encodeURIComponent(query.trim())}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      const data = await response.json();
      // Ensure we always set an array
      setArticles(Array.isArray(data.articles) ? data.articles : []);
    } catch (err) {
      setError(`Search error: ${err.message}`);
      setArticles([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleCreateArticle = () => {
    navigate('/articles/create');
  };

  const handleArticleClick = (articleId) => {
    navigate(`/articles/${articleId}`);
  };

  const handleEditArticle = (article) => {
    navigate(`/articles/${article.id}/edit`);
  };

  const handleDeleteArticle = async (articleId) => {
    try {
      const headers = {};
      if (authService.isAuthenticated()) {
        headers['Authorization'] = `Bearer ${authService.getToken()}`;
      }

      const response = await fetch(`http://localhost:8001/articles/${articleId}`, {
        method: 'DELETE',
        headers
      });
      
      if (response.ok) {
        // Reload articles after deletion
        loadArticles();
      } else {
        const errorData = await response.json();
        setError(`Failed to delete article: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Loading articles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Welcome to the Knowledge Base
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            Discover and share knowledge with our community
          </p>
          
          {user && (
            <button
              onClick={handleCreateArticle}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-bold py-2 px-4 rounded mb-6 transition-colors"
            >
              Create Article
            </button>
          )}
        </div>

        <SearchBar onSearch={handleSearch} />

        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Latest Articles ({Array.isArray(articles) ? articles.length : 0})
          </h2>
          
          {!Array.isArray(articles) || articles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-lg">No articles found.</p>
              {user && (
                <button
                  onClick={handleCreateArticle}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                  Create the first article
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.isArray(articles) && articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onClick={() => handleArticleClick(article.id)}
                  onEdit={user && (user.role === 'admin' || user.role === 'moderator') ? handleEditArticle : undefined}
                  onDelete={user && user.role === 'admin' ? handleDeleteArticle : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
