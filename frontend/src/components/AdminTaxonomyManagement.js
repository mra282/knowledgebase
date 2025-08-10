import React, { useEffect, useState } from 'react';
import authService from '../services/auth';

const AdminTaxonomyManagement = () => {
  const [activeSubTab, setActiveSubTab] = useState('platforms');
  const [platforms, setPlatforms] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', slug: '', description: '', is_active: true });

  const isPlatforms = activeSubTab === 'platforms';

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plResp, prResp] = await Promise.all([
        authService.apiCall('/admin/platforms?include_inactive=true'),
        authService.apiCall('/admin/products?include_inactive=true'),
      ]);
      if (!plResp?.ok) throw new Error('Failed to load platforms');
      if (!prResp?.ok) throw new Error('Failed to load products');
      const [pl, pr] = await Promise.all([plResp.json(), prResp.json()]);
      setPlatforms(pl);
      setProducts(pr);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: '', slug: '', description: '', is_active: true });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      slug: item.slug || '',
      description: item.description || '',
      is_active: item.is_active !== false,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const endpointBase = isPlatforms ? '/admin/platforms' : '/admin/products';
      const payload = { ...formData };
      let resp;
      if (editingItem) {
        resp = await authService.apiCall(`${endpointBase}/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        resp = await authService.apiCall(endpointBase, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      if (!resp?.ok) {
        const errText = await resp.text();
        throw new Error(errText || 'Save failed');
      }
      setModalOpen(false);
      setEditingItem(null);
      await loadAll();
    } catch (e) {
      setError(e.message || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    try {
      const endpointBase = isPlatforms ? '/admin/platforms' : '/admin/products';
      const resp = await authService.apiCall(`${endpointBase}/${id}`, { method: 'DELETE' });
      if (!resp?.ok) throw new Error('Delete failed');
      await loadAll();
    } catch (e) {
      setError(e.message || 'Failed to delete');
    }
  };

  const list = isPlatforms ? platforms : products;
  const title = isPlatforms ? 'Platforms' : 'Products';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex space-x-4">
          <button
            className={`px-4 py-2 rounded ${isPlatforms ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setActiveSubTab('platforms')}
          >
            Platforms
          </button>
          <button
            className={`px-4 py-2 rounded ${!isPlatforms ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setActiveSubTab('products')}
          >
            Products
          </button>
        </div>
        <button
          onClick={openCreate}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          Add {isPlatforms ? 'Platform' : 'Product'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        {loading ? (
          <div className="p-6">Loading...</div>
        ) : list.length === 0 ? (
          <div className="p-6 text-gray-500">No {title.toLowerCase()} yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {list.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500 max-w-xl truncate">{item.description || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.slug || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                      <button className="text-blue-600 hover:text-blue-900" onClick={() => openEdit(item)}>Edit</button>
                      <button className="text-red-600 hover:text-red-900" onClick={() => handleDelete(item.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">{editingItem ? 'Edit' : 'Create'} {isPlatforms ? 'Platform' : 'Product'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData((p) => ({ ...p, slug: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="optional-url-slug"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  id="is_active"
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTaxonomyManagement;
