import React, { useState, useEffect } from 'react';
import { formatters } from '../services/api';

const ArticleForm = ({ article, onSubmit, onCancel, loading = false }) => {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    tags: '',
    weight_score: 1.0
  });

  const [errors, setErrors] = useState({});

  // Initialize form data when article prop changes
  useEffect(() => {
    if (article) {
      setFormData({
        title: article.title || '',
        content: article.content || '',
        tags: formatters.stringifyTags(article.tags) || '',
        weight_score: article.weight_score || 1.0
      });
    } else {
      setFormData({
        title: '',
        content: '',
        tags: '',
        weight_score: 1.0
      });
    }
    setErrors({});
  }, [article]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length > 255) {
      newErrors.title = 'Title must be less than 255 characters';
    }

    if (!formData.content.trim()) {
      newErrors.content = 'Content is required';
    } else if (formData.content.length < 10) {
      newErrors.content = 'Content must be at least 10 characters long';
    }

    if (formData.weight_score < 0 || formData.weight_score > 10) {
      newErrors.weight_score = 'Weight score must be between 0 and 10';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const submitData = {
      title: formData.title.trim(),
      content: formData.content.trim(),
      tags: formatters.parseTags(formData.tags),
      weight_score: parseFloat(formData.weight_score)
    };

    onSubmit(submitData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const getWeightScoreColor = (score) => {
    if (score >= 7) return 'text-success-600';
    if (score >= 4) return 'text-warning-600';
    return 'text-gray-600';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Article Title *
          </label>
          <input
            type="text"
            id="title"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            className={`input-field ${errors.title ? 'border-danger-500 focus:ring-danger-500' : ''}`}
            placeholder="Enter a descriptive title for your article"
            disabled={loading}
          />
          {errors.title && (
            <p className="mt-1 text-sm text-danger-600">{errors.title}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {formData.title.length}/255 characters
          </p>
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
            Article Content *
          </label>
          <textarea
            id="content"
            rows={12}
            value={formData.content}
            onChange={(e) => handleInputChange('content', e.target.value)}
            className={`textarea-field ${errors.content ? 'border-danger-500 focus:ring-danger-500' : ''}`}
            placeholder="Write your article content here. You can include markdown formatting."
            disabled={loading}
          />
          {errors.content && (
            <p className="mt-1 text-sm text-danger-600">{errors.content}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {formData.content.length} characters (minimum 10)
          </p>
        </div>

        {/* Tags and Weight Score Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <input
              type="text"
              id="tags"
              value={formData.tags}
              onChange={(e) => handleInputChange('tags', e.target.value)}
              className="input-field"
              placeholder="troubleshooting, network, software"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Separate tags with commas. Use relevant keywords for better searchability.
            </p>
          </div>

          {/* Weight Score */}
          <div>
            <label htmlFor="weight_score" className="block text-sm font-medium text-gray-700 mb-2">
              Weight Score (KCS)
            </label>
            <div className="relative">
              <input
                type="number"
                id="weight_score"
                min="0"
                max="10"
                step="0.1"
                value={formData.weight_score}
                onChange={(e) => handleInputChange('weight_score', e.target.value)}
                className={`input-field ${errors.weight_score ? 'border-danger-500 focus:ring-danger-500' : ''}`}
                disabled={loading}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <span className={`text-sm font-medium ${getWeightScoreColor(parseFloat(formData.weight_score))}`}>
                  {formatters.formatWeightScore(parseFloat(formData.weight_score)).label}
                </span>
              </div>
            </div>
            {errors.weight_score && (
              <p className="mt-1 text-sm text-danger-600">{errors.weight_score}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Higher scores indicate more trusted/valuable content (0-10 scale)
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {article ? 'Updating...' : 'Creating...'}
              </div>
            ) : (
              article ? 'Update Article' : 'Create Article'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ArticleForm;
