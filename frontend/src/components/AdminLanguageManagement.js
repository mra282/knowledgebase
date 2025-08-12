import React, { useEffect, useState } from 'react';
import authService from '../services/auth';

const AdminLanguageManagement = () => {
  const [langs, setLangs] = useState([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:8001';

  const load = async () => {
    setError(null); setMessage(null);
    try {
      const resp = await authService.apiCall('/admin/languages');
      if (resp.ok) setLangs(await resp.json());
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    try {
      const resp = await authService.apiCall('/admin/languages', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim(), name: name.trim(), is_active: true }),
      });
      if (resp.ok) {
        setCode(''); setName('');
        setMessage('Language added');
        load();
      } else {
        const err = await resp.json();
        setError(err.detail || 'Failed to add language');
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const toggle = async (id, current) => {
    setLoading(true); setError(null);
    try {
      const resp = await authService.apiCall(`/admin/languages/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !current })
      });
      if (resp.ok) {
        load();
      } else {
        const err = await resp.json();
        setError(err.detail || 'Failed to update language');
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this language?')) return;
    setLoading(true); setError(null);
    try {
      const resp = await authService.apiCall(`/admin/languages/${id}`, { method: 'DELETE' });
      if (resp.ok) load(); else setError('Failed to delete language');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Languages</h3>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded">{error}</div>}
      {message && <div className="bg-green-50 text-green-700 px-4 py-2 rounded">{message}</div>}

      <form onSubmit={add} className="bg-white p-4 rounded shadow space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="Code (e.g., en, es-ES)" className="border rounded px-3 py-2" />
          <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Name (English, Spanish)" className="border rounded px-3 py-2" />
          <button type="submit" disabled={loading || !code || !name} className="bg-blue-600 disabled:bg-blue-300 text-white rounded px-4 py-2">Add</button>
        </div>
      </form>

      <div className="bg-white rounded shadow divide-y">
        {langs.length === 0 && <div className="p-4 text-gray-500">No languages yet.</div>}
        {langs.map(l => (
          <div key={l.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{l.name} <span className="text-gray-500 text-sm">({l.code})</span></div>
              <div className="text-sm text-gray-500">{l.is_active ? 'Active' : 'Inactive'}</div>
            </div>
            <div className="space-x-2">
              <button onClick={()=>toggle(l.id, l.is_active)} className="px-3 py-1 rounded border">{l.is_active ? 'Disable' : 'Enable'}</button>
              <button onClick={()=>del(l.id)} className="px-3 py-1 rounded border border-red-600 text-red-600">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminLanguageManagement;
