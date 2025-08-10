import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatters } from '../services/api';

const ArticleCard = ({ article, onEdit, onDelete, onVoteHelpful, searchQuery, showExcerpt = false }) => {
  const navigate = useNavigate();
  const weightInfo = formatters.formatWeightScore(article.weight_score);

  const handleVoteHelpful = async (e) => {
    e.stopPropagation(); // Prevent triggering navigation
    try {
      await onVoteHelpful(article.id);
    } catch (error) {
      console.error('Error voting helpful:', error);
    }
  };

  const handleCardClick = () => {
    navigate(`/articles/${article.id}`);
  };

  // Function to highlight search terms in text
  const highlightSearchTerms = (text, query) => {
    if (!query || !text) return text;
    
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) return text;
    
    let highlightedText = text;
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
    });
    
    return highlightedText;
  };

  // Create excerpt with highlighted terms
  const createExcerpt = (content, query, maxLength = 200) => {
    if (!query || !showExcerpt) {
      return formatters.truncateText(content, maxLength);
    }
    
    // Find the first occurrence of any search term
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    if (terms.length === 0) {
      return formatters.truncateText(content, maxLength);
    }
    
    const contentLower = content.toLowerCase();
    let firstMatchIndex = -1;
    
    for (const term of terms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }
    
    if (firstMatchIndex === -1) {
      return formatters.truncateText(content, maxLength);
    }
    
    // Extract excerpt around the first match
    const start = Math.max(0, firstMatchIndex - 100);
    const end = Math.min(content.length, firstMatchIndex + maxLength - 100);
    let excerpt = content.substring(start, end);
    
    // Add ellipsis if needed
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    
    return excerpt;
  };

  const contentPreview = createExcerpt(article.content, searchQuery);
  const highlightedTitle = highlightSearchTerms(article.title, searchQuery);
  const highlightedContent = highlightSearchTerms(contentPreview, searchQuery);

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-gray-200 dark:border-gray-700"
      onClick={handleCardClick}
    >
      <div className="p-6">
        {/* Header with title and weight badge */}
        <div className="flex justify-between items-start mb-3">
          <h3 
            className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1 mr-3"
            dangerouslySetInnerHTML={{ __html: highlightedTitle }}
          />
          <div className={`${weightInfo.class} flex-shrink-0 px-2 py-1 rounded-md text-xs font-medium`}>
            {weightInfo.label}
            <span className="ml-1 opacity-75">
              ({article.weight_score.toFixed(1)})
            </span>
          </div>
        </div>

        {/* Content preview */}
        <p 
          className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-3"
          dangerouslySetInnerHTML={{ __html: highlightedContent }}
        />

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {article.tags.map((tag, index) => (
              <span key={index} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-md">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {article.view_count} views
            </span>
            <span className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L9 6v0m0 0L9 10h3.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 019.263 21h-4.017c-.163 0-.326-.02-.485-.06L1 20V5a2 2 0 012-2h3.5z" />
              </svg>
              {article.helpful_votes} helpful
            </span>
          </div>
          <span className="text-gray-500 dark:text-gray-400">
            Updated {formatters.formatDate(article.updated_at)}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="flex space-x-2">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Edit button clicked for article:', article.id);
                  onEdit(article);
                }}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium flex items-center transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Delete button clicked for article:', article.id);
                  if (window.confirm('Are you sure you want to delete this article?')) {
                    onDelete(article.id);
                  }
                }}
                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium flex items-center transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
          </div>
          
          {onVoteHelpful && (
            <button
              onClick={handleVoteHelpful}
              className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium flex items-center transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L9 6v0" />
              </svg>
              Helpful ({article.helpful_votes})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArticleCard;
