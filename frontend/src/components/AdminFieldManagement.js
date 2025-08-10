import React, { useState, useEffect } from 'react';
import authService from '../services/auth';

const AdminFieldManagement = () => {
  const [fields, setFields] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [fieldTypes, setFieldTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state for creating/editing fields
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    field_type: 'text',
    is_required: false,
    is_active: true,
    sort_order: 1,
    placeholder: '',
    help_text: '',
    options: []
  });

  // Options state for select/multiselect fields
  const [optionInput, setOptionInput] = useState({ value: '', label: '' });

  useEffect(() => {
    loadFieldTypes();
    loadFields();
  }, []);

  const loadFieldTypes = async () => {
    try {
  const response = await authService.apiCall('/admin/field-types');
  if (!response || !response.ok) throw new Error('Failed');
  const data = await response.json();
  setFieldTypes(data.field_types);
    } catch (err) {
      setError('Failed to load field types');
    }
  };

  const loadFields = async () => {
    try {
      setLoading(true);
  const response = await authService.apiCall('/admin/dynamic-fields');
  if (!response || !response.ok) throw new Error('Failed');
  const data = await response.json();
  setFields(data);
    } catch (err) {
      setError('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingField) {
        const resp = await authService.apiCall(`/admin/dynamic-fields/${editingField.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        if (!resp || !resp.ok) throw new Error('Failed to update');
      } else {
        const resp = await authService.apiCall('/admin/dynamic-fields', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        if (!resp || !resp.ok) throw new Error('Failed to create');
      }
      
      // Reset form
      setFormData({
        name: '',
        label: '',
        field_type: 'text',
        is_required: false,
        is_active: true,
        sort_order: 1,
        placeholder: '',
        help_text: '',
        options: []
      });
      setShowCreateForm(false);
      setEditingField(null);
      
      // Reload fields
      loadFields();
    } catch (err) {
  setError(err.message || 'Failed to save field');
    }
  };

  const handleDelete = async (fieldId) => {
    if (window.confirm('Are you sure you want to delete this field? This will remove all associated data.')) {
      try {
        const resp = await authService.apiCall(`/admin/dynamic-fields/${fieldId}?hard_delete=true`, {
          method: 'DELETE'
        });
        if (!resp || !resp.ok) throw new Error('Failed to delete');
        loadFields();
      } catch (err) {
        setError('Failed to delete field');
      }
    }
  };

  const handleEdit = (field) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      label: field.label,
      field_type: field.field_type,
      is_required: field.is_required,
      is_active: field.is_active,
      sort_order: field.sort_order,
      placeholder: field.placeholder || '',
      help_text: field.help_text || '',
      options: field.options || []
    });
    setShowCreateForm(true);
  };

  const addOption = () => {
    if (optionInput.value && optionInput.label) {
      setFormData(prev => ({
        ...prev,
        options: [...prev.options, {
          value: optionInput.value,
          label: optionInput.label,
          sort_order: prev.options.length + 1,
          is_active: true
        }]
      }));
      setOptionInput({ value: '', label: '' });
    }
  };

  const removeOption = (index) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const requiresOptions = formData.field_type === 'select' || formData.field_type === 'multiselect';

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dynamic Field Management</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add New Field
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">×</button>
        </div>
      )}

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingField ? 'Edit Field' : 'Create New Field'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Field Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="field_name"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Used for API calls (lowercase, underscores)</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Label *
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Field Label"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Field Type *
                  </label>
                  <select
                    value={formData.field_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, field_type: e.target.value, options: [] }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {fieldTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder Text
                </label>
                <input
                  type="text"
                  value={formData.placeholder}
                  onChange={(e) => setFormData(prev => ({ ...prev, placeholder: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter placeholder text..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Help Text
                </label>
                <textarea
                  value={formData.help_text}
                  onChange={(e) => setFormData(prev => ({ ...prev, help_text: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="2"
                  placeholder="Help text for users..."
                />
              </div>

              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_required}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_required: e.target.checked }))}
                    className="mr-2"
                  />
                  Required Field
                </label>
                
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="mr-2"
                  />
                  Active
                </label>
              </div>

              {/* Options for select/multiselect fields */}
              {requiresOptions && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Options
                  </label>
                  
                  <div className="space-y-2 mb-4">
                    {formData.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded">
                        <span className="flex-1">{option.label} ({option.value})</span>
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Option value"
                      value={optionInput.value}
                      onChange={(e) => setOptionInput(prev => ({ ...prev, value: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded px-3 py-2"
                    />
                    <input
                      type="text"
                      placeholder="Option label"
                      value={optionInput.label}
                      onChange={(e) => setOptionInput(prev => ({ ...prev, label: e.target.value }))}
                      className="flex-1 border border-gray-300 rounded px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={addOption}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingField(null);
                    setFormData({
                      name: '',
                      label: '',
                      field_type: 'text',
                      is_required: false,
                      is_active: true,
                      sort_order: 1,
                      placeholder: '',
                      help_text: '',
                      options: []
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingField ? 'Update' : 'Create'} Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fields List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Existing Fields</h2>
        </div>
        
        {fields.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No dynamic fields created yet. Click "Add New Field" to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Field
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Options
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fields.map((field) => (
                  <tr key={field.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {field.label}
                        </div>
                        <div className="text-sm text-gray-500">
                          {field.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {field.field_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {field.options && field.options.length > 0 ? (
                        <div className="text-sm text-gray-900">
                          {field.options.map(opt => opt.label).join(', ')}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        {field.is_required && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Required
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          field.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {field.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(field)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(field.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminFieldManagement;
