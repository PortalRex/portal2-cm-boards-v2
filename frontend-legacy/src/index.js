import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { loadCatalog } from './api/catalog';

const root = ReactDOM.createRoot(document.getElementById('root'));
// The game and map lists come from the server; render once they're in (or it's unreachable).
loadCatalog().finally(() =>
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);