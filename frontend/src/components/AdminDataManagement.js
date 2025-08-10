import React, { useState } from 'react';
import authService from '../services/auth';

const AdminDataManagement = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [importData, setImportData] = useState('');
  const [importResults, setImportResults] = useState(null);

  const handleWipeDatabase = async () => {
    if (!window.confirm('⚠️ WARNING: This will permanently delete ALL articles from the database. This action cannot be undone!\n\nAre you absolutely sure you want to proceed?')) {
      return;
    }

    if (!window.confirm('🚨 FINAL WARNING: You are about to wipe the entire knowledge base. Type "DELETE ALL" in the next prompt to confirm.')) {
      return;
    }

    const confirmation = window.prompt('Type "DELETE ALL" to confirm database wipe:');
    if (confirmation !== 'DELETE ALL') {
      setError('Database wipe cancelled - confirmation text did not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authService.apiCall('/admin/database/wipe', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ ${data.message}`);
      } else {
        const errorData = await response.json();
        setError(`Failed to wipe database: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Error wiping database: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportArticles = async () => {
    if (!importData.trim()) {
      setError('Please paste JSON data to import.');
      return;
    }

    let articlesData;
    try {
      articlesData = JSON.parse(importData);
      if (!Array.isArray(articlesData)) {
        throw new Error('JSON must be an array of articles');
      }
    } catch (err) {
      setError(`Invalid JSON data: ${err.message}`);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setImportResults(null);

    try {
      const response = await authService.apiCall('/admin/articles/import', {
        method: 'POST',
        body: JSON.stringify({ articles: articlesData }),
      });

      if (response.ok) {
        const data = await response.json();
        setImportResults(data);
        setMessage(`✅ Import completed: ${data.imported_count}/${data.total_count} articles imported successfully`);
        if (data.failed_count > 0) {
          setError(`⚠️ ${data.failed_count} articles failed to import. Check results below.`);
        }
      } else {
        const errorData = await response.json();
        setError(`Failed to import articles: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setError(`Error importing articles: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadTestData = () => {
    // Load the ESO test data
    fetch('/test_data/eso_articles.json')
      .then(response => response.json())
      .then(data => {
        setImportData(JSON.stringify(data, null, 2));
        setMessage('✅ ESO test data loaded. Review and click "Import Articles" to proceed.');
      })
      .catch(err => {
        setError(`Failed to load test data: ${err.message}`);
      });
  };

  return (
    <div className="space-y-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Database Management</h3>
        
        {/* Messages */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <div className="flex">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {message && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            <div className="flex">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{message}</span>
            </div>
          </div>
        )}

        {/* Wipe Database Section */}
        <div className="mb-8 p-4 border border-red-200 rounded-lg bg-red-50">
          <h4 className="text-md font-semibold text-red-800 mb-2">⚠️ Danger Zone</h4>
          <p className="text-red-700 mb-4">
            This will permanently delete all articles from the database. This action cannot be undone.
          </p>
          <button
            onClick={handleWipeDatabase}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium py-2 px-4 rounded-lg"
          >
            {loading ? 'Wiping...' : 'Wipe All Articles'}
          </button>
        </div>

        {/* Import Articles Section */}
        <div className="space-y-4">
          <h4 className="text-md font-semibold text-gray-800">Import Articles</h4>
          
          <div className="flex space-x-2 mb-4">
            <button
              onClick={loadTestData}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-lg"
            >
              Load ESO Test Data
            </button>
            <button
              onClick={() => setImportData('')}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg"
            >
              Clear
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Article JSON Data
            </label>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="Paste JSON array of articles here..."
              className="w-full h-64 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Expected format: Array of objects with title, content, tags, weight_score, is_public fields
            </p>
          </div>

          <button
            onClick={handleImportArticles}
            disabled={loading || !importData.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-medium py-2 px-4 rounded-lg"
          >
            {loading ? 'Importing...' : 'Import Articles'}
          </button>
        </div>

        {/* Import Results */}
        {importResults && (
          <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <h4 className="text-md font-semibold text-gray-800 mb-2">Import Results</h4>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{importResults.imported_count}</div>
                <div className="text-sm text-gray-600">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{importResults.failed_count}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{importResults.total_count}</div>
                <div className="text-sm text-gray-600">Total</div>
              </div>
            </div>

            {importResults.error_messages.length > 0 && (
              <div>
                <h5 className="font-medium text-red-800 mb-2">Error Messages:</h5>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {importResults.error_messages.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDataManagement;
