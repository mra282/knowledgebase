import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import authService from '../services/auth';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const ArticleEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const SUMMARY_LIMIT = 280;
  const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const generateSummary = (html) => {
    const text = stripHtml(html);
    return text.length > SUMMARY_LIMIT ? text.slice(0, SUMMARY_LIMIT) + '…' : text;
  };
  // Taxonomy state
  const [platforms, setPlatforms] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState([]);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  // Versioning state
  const [versions, setVersions] = useState([]);
  const [draftVersion, setDraftVersion] = useState(null);
  // Localization state
  const [languages, setLanguages] = useState([]);
  const [mapping, setMapping] = useState(null); // { id, article_id, language, group }
  const [siblings, setSiblings] = useState([]); // other mappings in same group
  const [selectedLangCode, setSelectedLangCode] = useState('');
  const [groupIdInput, setGroupIdInput] = useState('');
  const [seedFromArticleId, setSeedFromArticleId] = useState('');
  const [articlesForSeed, setArticlesForSeed] = useState([]);
  // Notes state (internal/private)
  const [notes, setNotes] = useState(''); // existing notes
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false); // for admin save
  const [addingNote, setAddingNote] = useState(false); // for agent add
  const [notesMessage, setNotesMessage] = useState('');
  const [newNote, setNewNote] = useState('');
  const currentUser = authService.getCurrentUser();
  const isAdmin = !!currentUser && currentUser.role === 'admin';
  const role = currentUser?.role || '';
  const isModerator = role === 'moderator';
  const isEditor = role === 'editor';
  const canEditArticle = isAdmin || (isModerator && !formData.is_public);
  const canTogglePublic = isAdmin; // only admins can change publish status
  const canDelete = isAdmin;
  const canManageVersions = isAdmin; // drafts, publish, rollback
  const canManageTranslations = isAdmin;

  const loadArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const response = await fetch(`${apiBase}/articles/${id}`);
      if (response.ok) {
        const article = await response.json();
        setFormData({
          title: article.title || '',
          summary: generateSummary(article.content || article.summary || ''),
          content: article.content || '',
          category: article.category || 'general',
          tags: article.tags || [],
          is_public: article.is_public !== undefined ? article.is_public : true
        });
        // Load associations (admin endpoints require auth)
        try {
          const headers = {};
          if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
          const [plAssocResp, prAssocResp, plListResp, prListResp] = await Promise.all([
            fetch(`${apiBase}/admin/articles/${id}/platforms`, { headers }),
            fetch(`${apiBase}/admin/articles/${id}/products`, { headers }),
            fetch(`${apiBase}/platforms`),
            fetch(`${apiBase}/products`),
          ]);
          if (plAssocResp.ok) {
            const assoc = await plAssocResp.json();
            setSelectedPlatformIds((assoc || []).map(a => a.id));
          }
          if (prAssocResp.ok) {
            const assoc = await prAssocResp.json();
            setSelectedProductIds((assoc || []).map(a => a.id));
          }
          if (plListResp.ok) setPlatforms(await plListResp.json());
          if (prListResp.ok) setProducts(await prListResp.json());
        } catch (e) {
          console.warn('Failed to load taxonomy associations:', e);
        }
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
    // Check if user is authenticated and has permission to edit articles
    if (!authService.isAuthenticated()) {
      navigate('/login');
      return;
    }

    loadArticle();
    // Load localization data in parallel
    (async () => {
      try {
        const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
        const langsResp = await fetch(`${apiBase}/languages`);
        if (langsResp.ok) setLanguages(await langsResp.json());
        // Load mapping and siblings via admin (auth required)
        const headers = {};
        if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
        const mapResp = await fetch(`${apiBase}/admin/articles/${id}/translation-mapping`, { headers });
        if (mapResp.ok) {
          const m = await mapResp.json();
          setMapping(m);
          setSelectedLangCode(m.language?.code || '');
          setGroupIdInput(String(m.group?.id || ''));
        }
        const sibResp = await fetch(`${apiBase}/admin/articles/${id}/translations`, { headers });
        if (sibResp.ok) setSiblings(await sibResp.json());
        // For seeding dropdown, load some articles
        const listResp = await fetch(`${apiBase}/articles?limit=1000`);
        if (listResp.ok) {
          const data = await listResp.json();
          setArticlesForSeed(data.articles || []);
        }
        // Load internal notes
        try {
          setNotesLoading(true);
          const headersNotes = {};
          if (authService.isAuthenticated()) headersNotes['Authorization'] = `Bearer ${authService.getToken()}`;
          const notesResp = await fetch(`${apiBase}/admin/articles/${id}/notes`, { headers: headersNotes });
          if (notesResp.ok) {
            const n = await notesResp.json();
            setNotes(n?.notes || '');
          }
        } finally {
          setNotesLoading(false);
        }
      } catch (e) {
        console.warn('Failed to load localization data:', e);
      }
    })();
    // Load versions (admin endpoint preferred)
    (async () => {
      try {
        const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
        let resp;
        const headers = {};
        if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
        // Try admin endpoint for full list (including drafts)
        resp = await fetch(`${apiBase}/admin/articles/${id}/versions`, { headers });
        if (resp.ok) {
          const data = await resp.json();
          setVersions(data || []);
          const draft = (data || []).find(v => v.is_draft);
          setDraftVersion(draft || null);
        } else {
          // Fallback to public published versions
          const pub = await fetch(`${apiBase}/articles/${id}/versions`);
          if (pub.ok) setVersions(await pub.json());
        }
      } catch (e) {
        console.warn('Failed to load versions:', e);
      }
    })();
  }, [navigate, loadArticle]);

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

  // Save full notes (admin only)
  const handleSaveNotes = async () => {
    setNotesSaving(true);
    setNotesMessage('');
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = { 'Content-Type': 'application/json' };
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
      const resp = await fetch(`${apiBase}/admin/articles/${id}/notes`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ notes })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({detail:'Failed to save notes'}));
        throw new Error(err.detail || 'Failed to save notes');
      }
      setNotesMessage('Notes saved');
    } catch (e) {
      setError(e.message || 'Failed to save notes');
    } finally {
      setNotesSaving(false);
      setTimeout(()=>setNotesMessage(''), 2000);
    }
  };

  // Add a single note entry (non-admin path)
  const handleAddNote = async () => {
    if (!newNote.trim()) {
      setNotesMessage('Enter a note first');
      setTimeout(()=>setNotesMessage(''), 1500);
      return;
    }
    setAddingNote(true);
    setNotesMessage('');
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = { 'Content-Type': 'application/json' };
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
      const resp = await fetch(`${apiBase}/admin/articles/${id}/notes`, {
        method: 'PUT',
        headers,
        // Backend will prepend timestamp/name and append to existing
        body: JSON.stringify({ notes: newNote })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({detail:'Failed to add note'}));
        throw new Error(err.detail || 'Failed to add note');
      }
      const data = await resp.json();
      setNotes(data?.notes || ''); // refresh notes
      setNewNote('');
      setNotesMessage('Note added');
    } catch (e) {
      setError(e.message || 'Failed to add note');
    } finally {
      setAddingNote(false);
      setTimeout(()=>setNotesMessage(''), 2000);
    }
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
    setSaving(true);
    setError(null);
    setSuccess(false);

    if (!canEditArticle) {
      setError("You don't have permission to edit this article.");
      setSaving(false);
      return;
    }

    // Validation
    if (!formData.title.trim()) {
      setError('Title is required');
      setSaving(false);
      return;
    }

    if (!formData.summary.trim()) {
      setError('Summary is required');
      setSaving(false);
      return;
    }

    if (!formData.content.trim()) {
      setError('Content is required');
      setSaving(false);
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
    const response = await fetch(`${apiBase}/articles/${id}`, {
        method: 'PUT',
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
        setSuccess(true);
        
        // Redirect to the article after a short delay
        setTimeout(() => {
          navigate(`/articles/${id}`);
        }, 2000);
      } else {
        const errorData = await response.json();
        setError(`Failed to update article: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
      console.error('Error updating article:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel? All changes will be lost.')) {
      navigate(`/articles/${id}`);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) {
      setError("Only admins can delete articles.");
      return;
    }
    if (window.confirm('Are you sure you want to delete this article? This action cannot be undone.')) {
      try {
        const headers = {};
        if (authService.isAuthenticated()) {
          headers['Authorization'] = `Bearer ${authService.getToken()}`;
        }

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
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

  // ===== Versioning actions =====
  const handleSaveDraft = async () => {
  if (!canManageVersions) { setError('Only admins can manage drafts.'); return; }
    setSaving(true);
    setError(null);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = { 'Content-Type': 'application/json' };
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;

      let draft = draftVersion;
      if (!draft) {
        const createResp = await fetch(`${apiBase}/admin/articles/${id}/versions/draft`, { method: 'POST', headers });
        if (!createResp.ok) throw new Error('Failed to create draft');
        draft = await createResp.json();
        setDraftVersion(draft);
      }
      const updateResp = await fetch(`${apiBase}/admin/articles/${id}/versions/${draft.version_number}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          tags: formData.tags,
          is_public: formData.is_public,
          // weight_score not in this form; leave unchanged
        }),
      });
      if (!updateResp.ok) throw new Error('Failed to save draft');
      const updated = await updateResp.json();
      setDraftVersion(updated);
      // Refresh list
      const listResp = await fetch(`${apiBase}/admin/articles/${id}/versions`, { headers });
      if (listResp.ok) setVersions(await listResp.json());
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishDraft = async () => {
  if (!canManageVersions) { setError('Only admins can publish drafts.'); return; }
    if (!draftVersion) return;
    setSaving(true);
    setError(null);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = {};
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
      const resp = await fetch(`${apiBase}/admin/articles/${id}/versions/${draftVersion.version_number}/publish`, {
        method: 'POST',
        headers,
      });
      if (!resp.ok) throw new Error('Failed to publish draft');
      // Refresh article and versions
      await loadArticle();
      const listResp = await fetch(`${apiBase}/admin/articles/${id}/versions`, { headers });
      if (listResp.ok) setVersions(await listResp.json());
      setDraftVersion(null);
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Failed to publish draft');
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (versionNumber) => {
  if (!canManageVersions) { setError('Only admins can rollback versions.'); return; }
    if (!window.confirm(`Rollback to version ${versionNumber}? This will overwrite the live article.`)) return;
    setSaving(true);
    setError(null);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = {};
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
      const resp = await fetch(`${apiBase}/admin/articles/${id}/versions/${versionNumber}/rollback`, {
        method: 'POST',
        headers,
      });
      if (!resp.ok) throw new Error('Failed to rollback');
      await loadArticle();
      const listResp = await fetch(`${apiBase}/admin/articles/${id}/versions`, { headers });
      if (listResp.ok) setVersions(await listResp.json());
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Failed to rollback');
    } finally {
      setSaving(false);
    }
  };

  // ===== Localization actions =====
  const handleAttachTranslation = async (e) => {
    e.preventDefault();
  if (!canManageTranslations) { setError('Only admins can change translation mappings.'); return; }
    if (!selectedLangCode) { setError('Select a language for this article'); return; }
    setSaving(true);
    setError(null);
    try {
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';
      const headers = { 'Content-Type': 'application/json' };
      if (authService.isAuthenticated()) headers['Authorization'] = `Bearer ${authService.getToken()}`;
      const resp = await fetch(`${apiBase}/admin/translations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          article_id: Number(id),
          language_code: selectedLangCode,
          group_id: groupIdInput ? Number(groupIdInput) : null,
          auto_translate_from_article_id: seedFromArticleId ? Number(seedFromArticleId) : null,
        })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(()=>({detail:'Failed to link translation'}));
        throw new Error(err.detail || 'Failed to link translation');
      }
      const m = await resp.json();
      setMapping(m);
      setGroupIdInput(String(m.group?.id || ''));
      // refresh siblings
      const sibResp = await fetch(`${apiBase}/admin/articles/${id}/translations`, { headers });
      if (sibResp.ok) setSiblings(await sibResp.json());
      setSuccess(true);
    } catch (e) {
      setError(e.message || 'Failed to attach translation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  if (error && !formData.title) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Article</h2>
            <p className="text-red-600">{error}</p>
            <button 
              onClick={() => navigate('/')}
              className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Return to Home
            </button>
          </div>
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
              <h1 className="text-2xl font-bold text-gray-900">Edit Article</h1>
              <p className="text-sm text-gray-600">Update article information</p>
              {(!canEditArticle) && (
                <p className="mt-1 text-xs text-amber-700 bg-amber-50 inline-block px-2 py-1 rounded">
                  Read-only: {isEditor ? 'Editors cannot edit articles.' : 'Moderators can edit only non-public articles.'}
                </p>
              )}
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={() => navigate(`/articles/${id}`)}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Article
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-green-800 font-semibold">Article Updated Successfully!</h3>
            <p className="text-green-600">Redirecting to the article...</p>
          </div>
        )}

        {error && formData.title && (
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
                disabled={!canEditArticle}
              />
            </div>

            {/* Summary (auto-generated) */}
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
                placeholder="Summary is generated from content"
              />
              <p className="mt-1 text-xs text-gray-500">Truncated to {SUMMARY_LIMIT} characters.</p>
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
                  disabled={!canEditArticle}
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
                    disabled={!canTogglePublic}
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="is_public" className="font-medium text-gray-700">
                    Public Article
                  </label>
                  <p className="text-gray-500">
                    Allow non-authenticated users to view this article{!canTogglePublic ? ' (admins only can change this)' : ''}
                  </p>
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
                    {canEditArticle && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-blue-500 hover:text-blue-700"
                      >
                        ×
                      </button>
                    )}
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
                  disabled={!canEditArticle}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-300"
                  disabled={!canEditArticle}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Content (Rich Text) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Content *</label>
              <ReactQuill theme="snow" value={formData.content} onChange={handleContentChange} readOnly={!canEditArticle} />
              <p className="mt-1 text-sm text-gray-500">Use the editor to format your content. Summary updates automatically.</p>
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
                  disabled={!canEditArticle}
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
                  disabled={!canEditArticle}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Hold Ctrl/Cmd to select multiple.</p>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex justify-between">
              {canDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                  disabled={saving}
                >
                  Delete Article
                </button>
              ) : <div />}
              <div className="flex space-x-3">
                {/* Draft controls */}
                {canManageVersions && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="px-4 py-2 border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50"
                      disabled={saving}
                    >
                      Save Draft
                    </button>
                    {draftVersion && (
                      <button
                        type="button"
                        onClick={handlePublishDraft}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        disabled={saving}
                      >
                        Publish Draft (v{draftVersion.version_number})
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !canEditArticle}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Versions panel */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Versions</h3>
            <span className="text-sm text-gray-500">{versions.length} versions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {versions.map(v => (
                  <tr key={v.id}>
                    <td className="px-6 py-4 whitespace-nowrap">v{v.version_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded ${v.is_draft ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        {v.is_draft ? 'Draft' : 'Published'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(v.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{v.published_at ? new Date(v.published_at).toLocaleString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {canManageVersions && !v.is_draft && (
                        <button className="text-blue-600 hover:text-blue-800" onClick={() => handleRollback(v.version_number)}>
                          Rollback to this version
                        </button>
                      )}
                      {canManageVersions && v.is_draft && (
                        <button className="text-green-600 hover:text-green-800" onClick={() => handlePublishDraft(v.version_number)}>
                          Publish Draft
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Translations panel */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Translations</h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">This Article's Language</label>
                <select
                  value={selectedLangCode}
                  onChange={(e)=>setSelectedLangCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!canManageTranslations}
                >
                  <option value="">Select language...</option>
                  {languages.map(l => (
                    <option key={l.id} value={l.code}>{l.name} ({l.code})</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Current: {mapping ? `${mapping.language?.name} (${mapping.language?.code})` : 'Not linked'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Translation Group</label>
                <input
                  type="text"
                  value={groupIdInput}
                  onChange={(e)=>setGroupIdInput(e.target.value)}
                  placeholder="Existing group ID or blank to create"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!canManageTranslations}
                />
                <p className="mt-1 text-xs text-gray-500">Group ID will be created if left blank.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Seed From Article (optional)</label>
                <select
                  value={seedFromArticleId}
                  onChange={(e)=>setSeedFromArticleId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!canManageTranslations}
                >
                  <option value="">None (manual)</option>
                  {articlesForSeed.map(a => (
                    <option key={a.id} value={a.id}>{a.id} — {a.title}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">If Azure Translate is configured, content will be translated into a draft version.</p>
              </div>
              <div className="flex items-end">
                {canManageTranslations && (
                  <button
                    type="button"
                    onClick={handleAttachTranslation}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    disabled={saving || !selectedLangCode}
                  >
                    {mapping ? 'Update Mapping' : 'Link Translation'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-md font-semibold text-gray-800 mb-2">Sibling Articles in Group</h4>
              {siblings.length === 0 ? (
                <p className="text-sm text-gray-600">No sibling articles yet.</p>
              ) : (
                <ul className="space-y-2">
                  {siblings.map(s => (
                    <li key={s.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-2">
                      <div>
                        <span className="text-sm text-gray-800">{s.language?.name} ({s.language?.code})</span>
                        <span className="text-xs text-gray-500 ml-2">Article ID: {s.article_id}</span>
                      </div>
                      <button
                        type="button"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        onClick={() => navigate(`/articles/${s.article_id}`)}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Notes panel (internal) */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Internal Notes</h3>
            {notesMessage && <span className="text-sm text-green-600">{notesMessage}</span>}
          </div>
          <div className="p-6 space-y-3">
            {notesLoading ? (
              <p className="text-sm text-gray-500">Loading notes…</p>
            ) : (
              <>
                {isAdmin ? (
                  <>
                    <textarea
                      value={notes}
                      onChange={(e)=>setNotes(e.target.value)}
                      rows={8}
                      placeholder="Edit all internal notes. Not visible publicly."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveNotes}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        disabled={notesSaving}
                      >
                        {notesSaving ? 'Saving…' : 'Save Notes'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Existing Notes</label>
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 min-h-[80px]">{notes || 'No notes yet.'}</pre>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Add Note</label>
                      <textarea
                        value={newNote}
                        onChange={(e)=>setNewNote(e.target.value)}
                        rows={4}
                        placeholder="Type your note. On save it will be timestamped and attributed to you."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <div className="flex justify-end mt-2">
                        <button
                          type="button"
                          onClick={handleAddNote}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          disabled={addingNote}
                        >
                          {addingNote ? 'Adding…' : 'Add Note'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            <p className="text-xs text-gray-500">Notes are retained with the article but not exposed via public APIs.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ArticleEdit;
