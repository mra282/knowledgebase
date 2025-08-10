import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import Header from './components/Header';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import authService from './services/auth';

// Simple fallback component
const SimpleFallback = () => (
  <div className="min-h-screen bg-gray-50 p-8">
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Knowledge Base System</h1>
      <div className="bg-white p-6 rounded-lg shadow">
        <p className="text-green-600 mb-2">✅ Frontend is running successfully</p>
        <p className="text-gray-600 mb-4">System is initializing...</p>
        <button 
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          onClick={() => {
            fetch('http://localhost:8001/')
              .then(r => r.json())
              .then(data => alert('Backend: ' + data.message))
              .catch(err => alert('Backend error: ' + err.message));
          }}
        >
          Test Backend
        </button>
      </div>
    </div>
  </div>
);

// Try to import components safely
let Home, Search, ArticleView, ArticleCreate, ArticleEdit;
try {
  Home = require('./pages/Home').default;
} catch (error) {
  console.error('Failed to load Home component:', error);
  Home = SimpleFallback;
}

try {
  Search = require('./pages/Search').default;
} catch (error) {
  console.error('Failed to load Search component:', error);
  Search = SimpleFallback;
}

try {
  ArticleView = require('./pages/ArticleView').default;
} catch (error) {
  console.error('Failed to load ArticleView component:', error);
  ArticleView = SimpleFallback;
}

try {
  ArticleCreate = require('./pages/ArticleCreate').default;
} catch (error) {
  console.error('Failed to load ArticleCreate component:', error);
  ArticleCreate = SimpleFallback;
}

try {
  ArticleEdit = require('./pages/ArticleEdit').default;
} catch (error) {
  console.error('Failed to load ArticleEdit component:', error);
  ArticleEdit = SimpleFallback;
}

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: window.location }} replace />;
  }
  
  return children;
};

// App content component that uses theme
const AppContent = () => {
  const { darkMode, toggleDarkMode } = useTheme();
  
  return (
    <Router>
      <div className={`App min-h-screen ${darkMode ? 'dark' : ''} bg-white dark:bg-gray-900 transition-colors`}>
        <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/login" element={<Login />} />
            
            {/* Article routes */}
            <Route path="/articles/:id" element={<ArticleView />} />
            <Route 
              path="/articles/create" 
              element={
                <ProtectedRoute>
                  <ArticleCreate />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/articles/:id/edit" 
              element={
                <ProtectedRoute>
                  <ArticleEdit />
                </ProtectedRoute>
              } 
            />
            
            {/* Protected routes - for future features */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            
            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
