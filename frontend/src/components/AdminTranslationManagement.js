import React, { useEffect, useState } from 'react';
import authService from '../services/auth';

const AdminTranslationManagement = () => {
  const [articles, setArticles] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [selectedLangCode, setSelectedLangCode] = useState('');
  const [groupId, setGroupId] = useState('');
  const [sourceArticleId, setSourceArticleId] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';

  const load = async () => {
    setError(null); setMessage(null);
    try {
      const [a, l] = await Promise.all([
        fetch(`${apiBase}/articles?limit=1000`).then(r=>r.json()),
        fetch(`${apiBase}/languages`).then(r=>r.json()),
      ]);
      setArticles(a.articles || []);
      setLanguages(l || []);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  const attach = async (e) => {
    e.preventDefault();
    if (!selectedArticleId || !selectedLangCode) { setError('Select article and language'); return; }
    setLoading(true); setError(null); setMessage(null);
    try {
      const resp = await authService.apiCall('/admin/translations', {
        method: 'POST',
        body: JSON.stringify({
          article_id: Number(selectedArticleId),
          language_code: selectedLangCode,
          group_id: groupId ? Number(groupId) : null,
          auto_translate_from_article_id: sourceArticleId ? Number(sourceArticleId) : null,
        }),
      });
      if (resp.ok) {
        setMessage('Translation sibling linked');
        setGroupId(''); setSourceArticleId('');
      } else {
        const err = await resp.json();
        setError(err.detail || 'Failed to link translation');
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">Translations</h3>
      {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 px-4 py-2 rounded">{message}</div>}

      <form onSubmit={attach} className="bg-white p-4 rounded shadow space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Article</label>
            <select value={selectedArticleId} onChange={(e)=>setSelectedArticleId(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select article...</option>
              {articles.map(a=> <option key={a.id} value={a.id}>{a.id} — {a.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select value={selectedLangCode} onChange={(e)=>setSelectedLangCode(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Select language...</option>
              {languages.map(l=> <option key={l.id} value={l.code}>{l.name} ({l.code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Translation Group (optional)</label>
            <input value={groupId} onChange={(e)=>setGroupId(e.target.value)} placeholder="Join existing group ID (or leave blank to create)" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seed from Article (optional)</label>
            <select value={sourceArticleId} onChange={(e)=>setSourceArticleId(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">None (manual)</option>
              {articles.map(a=> <option key={a.id} value={a.id}>{a.id} — {a.title}</option>)}
            </select>
            <p className="text-sm text-gray-500 mt-1">If Azure Translate is configured, title/content will be auto-translated into a draft version of the target article; otherwise content is copied.</p>
          </div>
        </div>
        <div>
          <button type="submit" disabled={loading || !selectedArticleId || !selectedLangCode} className="bg-blue-600 disabled:bg-blue-300 text-white rounded px-4 py-2">Link Sibling</button>
        </div>
      </form>
    </div>
  );
};

export default AdminTranslationManagement;
