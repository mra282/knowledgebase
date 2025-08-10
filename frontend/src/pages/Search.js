import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import ArticleCard from '../components/ArticleCard';
import authService from '../services/auth';

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState(null);
  const [filters, setFilters] = useState({
    sortBy: 'relevance',
    tags: [],
    weightScore: 0
  });

  // Available tags for filtering (we'll load these dynamically later)
  const [availableTags, setAvailableTags] = useState([]);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      performSearch(query);
    } else {
      // Load recent/popular articles if no search query
      loadRecentArticles();
    }
  }, [searchParams]);

  const performSearch = async (query, options = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const searchUrl = `/search?q=${encodeURIComponent(query)}&limit=50`;
      const response = await authService.apiCall(searchUrl);
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setArticles(data.articles || []);
        
        // Extract unique tags from results for filtering
        const tags = new Set();
        data.articles?.forEach(article => {
          article.tags?.forEach(tag => tags.add(tag));
        });
        setAvailableTags(Array.from(tags));
      } else {
        throw new Error('Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search articles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentArticles = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await authService.apiCall('/articles?limit=20&sort_by=updated_at');
      
      if (response.ok) {
        const data = await response.json();
        setArticles(data.articles || []);
        setSearchResults(null);
        
        // Extract tags from recent articles
        const tags = new Set();
        data.articles?.forEach(article => {
          article.tags?.forEach(tag => tags.add(tag));
        });
        setAvailableTags(Array.from(tags));
      }
    } catch (err) {
      console.error('Error loading articles:', err);
      setError('Failed to load articles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      setSearchParams({ q: query });
      performSearch(query);
    } else {
      setSearchParams({});
      loadRecentArticles();
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters({ ...filters, ...newFilters });
    // Apply filters to current results
    applyFilters(articles, { ...filters, ...newFilters });
  };

  const applyFilters = (results, currentFilters) => {
    let filtered = [...results];
    
    // Filter by tags
    if (currentFilters.tags && currentFilters.tags.length > 0) {
      filtered = filtered.filter(article =>
        article.tags?.some(tag => currentFilters.tags.includes(tag))
      );
    }
    
    // Filter by weight score
    if (currentFilters.weightScore > 0) {
      filtered = filtered.filter(article => article.weight_score >= currentFilters.weightScore);
    }
    
    // Sort results
    switch (currentFilters.sortBy) {
      case 'weight':
        filtered.sort((a, b) => b.weight_score - a.weight_score);
        break;
      case 'date':
        filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        break;
      case 'views':
        filtered.sort((a, b) => b.view_count - a.view_count);
        break;
      case 'relevance':
      default:
        // Keep search relevance order or default order
        break;
    }
    
    setArticles(filtered);
  };

  const toggleTagFilter = (tag) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag];
    
    handleFilterChange({ tags: newTags });
  };

  const clearFilters = () => {
    const clearedFilters = {
      sortBy: 'relevance',
      tags: [],
      weightScore: 0
    };
    setFilters(clearedFilters);
    
    // Reset to original search results or recent articles
    if (searchQuery && searchResults) {
      setArticles(searchResults.articles || []);
    } else {
      loadRecentArticles();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Search Knowledge Base
          </h1>
          <p className="text-gray-600">
            Find information about North American trains and railroad operations
          </p>
        </div>

        {/* Search Bar */}
        <SearchBar 
          onSearch={handleSearch} 
          loading={loading}
          placeholder="Search trains, routes, equipment, operations..."
        />

        {/* Search Results Summary */}
        {searchResults && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-blue-900">
                  Search Results for "{searchQuery}"
                </h3>
                <p className="text-blue-700">
                  Found {searchResults.total_results} results in {searchResults.search_time_ms}ms
                </p>
              </div>
              <button
                onClick={() => handleSearch('')}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Clear Search
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <div className="lg:w-1/4">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
                {(filters.tags.length > 0 || filters.weightScore > 0) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Sort By */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort By
                </label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange({ sortBy: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="relevance">Relevance</option>
                  <option value="weight">Quality Score</option>
                  <option value="date">Most Recent</option>
                  <option value="views">Most Viewed</option>
                </select>
              </div>

              {/* Weight Score Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Quality Score: {filters.weightScore}
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={filters.weightScore}
                  onChange={(e) => handleFilterChange({ weightScore: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>

              {/* Tags Filter */}
              {availableTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter by Tags
                  </label>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTagFilter(tag)}
                        className={`block w-full text-left px-2 py-1 text-sm rounded transition-colors ${
                          filters.tags.includes(tag)
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        #{tag}
                        {filters.tags.includes(tag) && (
                          <span className="float-right">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:w-3/4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex">
                  <div className="text-red-400">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-lg text-gray-600">Searching...</span>
              </div>
            ) : (
              <>
                {/* Results Count */}
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {searchQuery ? 'Search Results' : 'Recent Articles'} 
                    <span className="text-gray-500 font-normal"> ({articles.length})</span>
                  </h2>
                  
                  {articles.length > 0 && (
                    <div className="text-sm text-gray-500">
                      Showing {articles.length} article{articles.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Article Results */}
                {articles.length > 0 ? (
                  <div className="grid gap-6">
                    {articles.map(article => (
                      <ArticleCard 
                        key={article.id} 
                        article={article}
                        searchQuery={searchQuery}
                        showExcerpt={true}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {searchQuery ? 'No results found' : 'No articles available'}
                    </h3>
                    <p className="text-gray-500 mb-4">
                      {searchQuery 
                        ? `Try different search terms or check your spelling.` 
                        : 'There are no articles to display at the moment.'}
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => handleSearch('')}
                        className="btn-primary"
                      >
                        Browse All Articles
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Search;
