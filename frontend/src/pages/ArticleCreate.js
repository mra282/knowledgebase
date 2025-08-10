import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/auth';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const ArticleCreate = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
  summary: '',
    content: '',
    category: 'general',
    tags: [],
    is_public: true
  });

  const [tagInput, setTagInput] = useState('');
  const [dynamicFields, setDynamicFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({}); // { [fieldId]: value | string[] }
  const [fieldErrors, setFieldErrors] = useState({}); // { [fieldId]: error }
  const SUMMARY_LIMIT = 280;

  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const generateSummary = (html) => {
    const text = stripHtml(html);
    if (text.length <= SUMMARY_LIMIT) return text;
    return text.slice(0, SUMMARY_LIMIT) + '…';
  };
  // Taxonomy state
  const [platforms, setPlatforms] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    
    // Check if user is authenticated and has permission to create articles
    if (!authService.isAuthenticated()) {
      navigate('/login');
      return;
    }

    // Fetch dynamic fields (active only) and public taxonomy lists
    const fetchFields = async () => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = authService.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
        const [resp, platformsResp, productsResp] = await Promise.all([
          fetch(`${apiBase}/admin/dynamic-fields`, { headers }),
          fetch(`${apiBase}/platforms`),
          fetch(`${apiBase}/products`),
        ]);
        if (!resp.ok) throw new Error('Failed to load custom fields');
        const fields = await resp.json();
        // Initialize defaults
        const initialValues = {};
        fields.filter(f => f.is_active !== false).forEach(f => {
          if (f.field_type === 'checkbox') initialValues[f.id] = false;
          else if (f.field_type === 'multiselect') initialValues[f.id] = [];
          else initialValues[f.id] = '';
        });
        setDynamicFields(fields.filter(f => f.is_active !== false));
        setFieldValues(initialValues);

        if (platformsResp.ok) {
          const pls = await platformsResp.json();
          setPlatforms(pls || []);
        }
        if (productsResp.ok) {
          const prs = await productsResp.json();
          setProducts(prs || []);
        }
      } catch (e) {
        console.error('Error loading dynamic fields:', e);
      }
    };
    fetchFields();
  }, [navigate]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleContentChange = (html) => {
    setFormData(prev => ({
      ...prev,
      content: html,
      summary: generateSummary(html),
    }));
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.title.trim()) {
      setError('Title is required');
      setLoading(false);
      return;
    }

    if (!formData.summary.trim()) {
      setError('Summary is required');
      setLoading(false);
      return;
    }

    if (!formData.content.trim()) {
      setError('Content is required');
      setLoading(false);
      return;
    }

    // Validate required dynamic fields
    const dfErrors = {};
    dynamicFields.forEach(f => {
      const v = fieldValues[f.id];
      if (f.is_required) {
        if (f.field_type === 'multiselect') {
          if (!Array.isArray(v) || v.length === 0) dfErrors[f.id] = `${f.label} is required`;
        } else if (f.field_type === 'checkbox') {
          // checkbox: required means must be true
          if (!v) dfErrors[f.id] = `${f.label} must be checked`;
        } else {
          if (!v || String(v).trim().length === 0) dfErrors[f.id] = `${f.label} is required`;
        }
      }
      // Simple type checks
      if (v && f.field_type === 'number' && isNaN(Number(v))) dfErrors[f.id] = `${f.label} must be a number`;
      if (v && f.field_type === 'email') {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(String(v))) dfErrors[f.id] = `${f.label} must be a valid email`;
      }
      if (v && f.field_type === 'url') {
        const re = /^https?:\/\/.+/i;
        if (!re.test(String(v))) dfErrors[f.id] = `${f.label} must be a valid URL`;
      }
    });
    setFieldErrors(dfErrors);
    if (Object.keys(dfErrors).length > 0) {
      setLoading(false);
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (authService.isAuthenticated()) {
        headers['Authorization'] = `Bearer ${authService.getToken()}`;
      }

      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const response = await fetch(`${apiBase}/articles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: formData.title.trim(),
          summary: formData.summary.trim(),
          content: formData.content.trim(),
          category: formData.category,
          tags: formData.tags,
          is_public: formData.is_public,
          platform_ids: selectedPlatformIds,
          product_ids: selectedProductIds,
        })
      });

      if (response.ok) {
        const newArticle = await response.json();
        // Submit dynamic field values in batch
        if (dynamicFields.length > 0) {
          const payload = dynamicFields.map(f => {
            let value = fieldValues[f.id];
            if (f.field_type === 'multiselect') value = (value || []).join(',');
            if (f.field_type === 'checkbox') value = value ? 'true' : 'false';
            return { field_id: f.id, value: value ?? '' };
          });
          try {
            await fetch(`${apiBase}/admin/articles/${newArticle.id}/field-values/batch`, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload)
            });
          } catch (e) {
            console.error('Failed to save dynamic field values:', e);
          }
        }
        setSuccess(true);
        
        // Redirect to the new article after a short delay
        setTimeout(() => {
          navigate(`/articles/${newArticle.id}`);
        }, 2000);
      } else {
        const errorData = await response.json();
        setError(`Failed to create article: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
      console.error('Error creating article:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? All changes will be lost.')) {
      navigate('/');
    }
  };

  const handleFieldChange = (field, value) => {
    setFieldValues(prev => ({ ...prev, [field.id]: value }));
    if (fieldErrors[field.id]) {
      setFieldErrors(prev => ({ ...prev, [field.id]: '' }));
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Article</h1>
              <p className="text-sm text-gray-600">Add a new article to the knowledge base</p>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="text-blue-600 hover:text-blue-800"
            >
              ← Back to Knowledge Base
            </button>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-green-800 font-semibold">Article Created Successfully!</h3>
            <p className="text-green-600">Redirecting to the article...</p>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-red-800 font-semibold">Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-6 space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter article title"
                required
              />
            </div>

            {/* Summary (auto-generated from content) */}
            <div>
              <label htmlFor="summary" className="block text-sm font-medium text-gray-700 mb-2">
                Summary (auto-generated)
              </label>
              <textarea
                id="summary"
                name="summary"
                value={formData.summary}
                readOnly
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700"
                placeholder="Summary will be generated from the content"
              />
              <p className="mt-1 text-xs text-gray-500">Summary mirrors the content, truncated to {SUMMARY_LIMIT} characters.</p>
            </div>

            {/* Category and Visibility */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="general">General</option>
                  <option value="troubleshooting">Troubleshooting</option>
                  <option value="how-to">How-to Guide</option>
                  <option value="faq">FAQ</option>
                  <option value="policy">Policy</option>
                  <option value="procedure">Procedure</option>
                </select>
              </div>

              <div className="flex items-center">
                <div className="flex items-center h-5">
                  <input
                    id="is_public"
                    name="is_public"
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="is_public" className="font-medium text-gray-700">
                    Public Article
                  </label>
                  <p className="text-gray-500">Allow non-authenticated users to view this article</p>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag, index) => (
                  <span 
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 text-blue-500 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add a tag"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTag(e);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Content (Rich Text) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content *
              </label>
              <ReactQuill theme="snow" value={formData.content} onChange={handleContentChange} />
              <p className="mt-1 text-sm text-gray-500">Use the editor to format your content. Summary is auto-generated.</p>
            </div>

            {/* Taxonomy selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
                <select
                  multiple
                  value={selectedPlatformIds.map(String)}
                  onChange={(e) => setSelectedPlatformIds(Array.from(e.target.selectedOptions).map(o => Number(o.value)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[120px]"
                >
                  {platforms.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
                <select
                  multiple
                  value={selectedProductIds.map(String)}
                  onChange={(e) => setSelectedProductIds(Array.from(e.target.selectedOptions).map(o => Number(o.value)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[120px]"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple.</p>
              </div>
            </div>

            {/* Custom Fields */}
            {dynamicFields.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Custom Fields</h3>
                <div className="mt-4 space-y-4">
                  {dynamicFields.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}{field.is_required ? ' *' : ''}
                      </label>
                      {field.field_type === 'text' && (
                        <input
                          type="text"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={field.placeholder || ''}
                        />
                      )}
                      {field.field_type === 'textarea' && (
                        <textarea
                          rows={4}
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={field.placeholder || ''}
                        />
                      )}
                      {field.field_type === 'number' && (
                        <input
                          type="number"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                      {field.field_type === 'date' && (
                        <input
                          type="date"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                      {field.field_type === 'email' && (
                        <input
                          type="email"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="name@example.com"
                        />
                      )}
                      {field.field_type === 'url' && (
                        <input
                          type="url"
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="https://example.com"
                        />
                      )}
                      {field.field_type === 'checkbox' && (
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={!!fieldValues[field.id]}
                            onChange={(e) => handleFieldChange(field, e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          {field.help_text && (
                            <span className="ml-2 text-sm text-gray-500">{field.help_text}</span>
                          )}
                        </div>
                      )}
                      {field.field_type === 'select' && (
                        <select
                          value={fieldValues[field.id] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select...</option>
                          {(field.options || []).filter(o => o.is_active).sort((a,b)=>a.sort_order-b.sort_order).map(opt => (
                            <option key={opt.id} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {field.field_type === 'multiselect' && (
                        <select
                          multiple
                          value={fieldValues[field.id] || []}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                            handleFieldChange(field, selected);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {(field.options || []).filter(o => o.is_active).sort((a,b)=>a.sort_order-b.sort_order).map(opt => (
                            <option key={opt.id} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}

                      {fieldErrors[field.id] && (
                        <p className="mt-1 text-sm text-red-600">{fieldErrors[field.id]}</p>
                      )}
                      {field.help_text && !fieldErrors[field.id] && (
                        <p className="mt-1 text-xs text-gray-500">{field.help_text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Article'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

export default ArticleCreate;
