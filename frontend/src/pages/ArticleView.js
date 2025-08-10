import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import authService from '../services/auth';
import DOMPurify from 'dompurify';

const ArticleView = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [versions, setVersions] = useState([]);
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';

  const loadArticle = useCallback(async (incrementView = true) => {
    setLoading(true);
    setError(null);
    
    try {
      // Only increment view count for non-authenticated users
      const shouldIncrementView = incrementView && !authService.isAuthenticated();
      const url = shouldIncrementView 
        ? `${apiBase}/articles/${id}`
        : `${apiBase}/articles/${id}?no_count=true`;
        
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setArticle(data);
      } else if (response.status === 404) {
        setError('Article not found');
      } else {
        const errorData = await response.json();
        setError(`Failed to load article: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
      console.error('Error loading article:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setUser(authService.getCurrentUser());
    loadArticle();
    // Load published versions (public endpoint)
    (async () => {
      try {
        const resp = await fetch(`${apiBase}/articles/${id}/versions`);
        if (resp.ok) setVersions(await resp.json());
      } catch (e) {
        console.warn('Failed to load versions', e);
      }
    })();
  }, [loadArticle]);

  const handleVoteHelpful = async () => {
    try {
  const response = await fetch(`${apiBase}/articles/${id}/helpful`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Reload article without incrementing view count
        loadArticle(false);
      } else {
        console.error('Failed to vote helpful');
      }
    } catch (err) {
      console.error('Error voting helpful:', err);
    }
  };

  const handleEdit = () => {
    navigate(`/articles/${id}/edit`);
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this article? This action cannot be undone.')) {
      try {
        const headers = {};
        if (authService.isAuthenticated()) {
          headers['Authorization'] = `Bearer ${authService.getToken()}`;
        }

  const response = await fetch(`${apiBase}/articles/${id}`, {
          method: 'DELETE',
          headers
        });
        
        if (response.ok) {
          navigate('/');
        } else {
          const errorData = await response.json();
          setError(`Failed to delete article: ${errorData.detail || 'Unknown error'}`);
        }
      } catch (err) {
        setError(`Connection error: ${err.message}`);
      }
    }
  };

  const isAuthenticated = authService.isAuthenticated();
  const canEdit = isAuthenticated && user && (user.role === 'admin' || user.role === 'moderator');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 text-xl mb-4">Error</div>
          <p className="text-gray-600 dark:text-gray-300">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300">Article not found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Article header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-6">
            <div className="flex justify-between items-start mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">{article.title}</h1>
              {canEdit && (
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={handleEdit}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    Edit
                  </button>
                  {user && user.role === 'admin' && (
                    <button
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Article metadata */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400 mb-6">
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {article.view_count} views
              </span>
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L9 6v0" />
                </svg>
                {article.helpful_votes} helpful votes
              </span>
              <span>Weight Score: {article.weight_score.toFixed(1)}</span>
              <span>Updated: {new Date(article.updated_at).toLocaleDateString()}</span>
            </div>

            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {article.tags.map((tag, index) => (
                  <span key={index} className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Article content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-6">
            <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed">
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content || '') }}
              />
            </div>
          </div>

          {/* Published Versions */}
          {versions && versions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Published Versions</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {versions.map(v => (
                      <tr key={v.id}>
                        <td className="px-4 py-2">v{v.version_number}</td>
                        <td className="px-4 py-2">{v.published_at ? new Date(v.published_at).toLocaleString() : '-'}</td>
                        <td className="px-4 py-2 truncate">{v.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Article actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate('/')}
                className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                ← Back to Articles
              </button>
              
              <button
                onClick={handleVoteHelpful}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white px-6 py-2 rounded font-medium flex items-center transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L9 6v0" />
                </svg>
                Mark as Helpful ({article.helpful_votes})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleView;
