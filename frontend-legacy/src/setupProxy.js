// Development only (picked up automatically by react-scripts). When DEV_API_PROXY is
// set, /api/* is forwarded to the local Rust web server, so the dev site can use
// REACT_APP_API_URL=/api/v1 and work from other devices (e.g. over Tailscale)
// without CORS changes.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  if (!process.env.DEV_API_PROXY) return;
  // xfwd passes the browser's host along (X-Forwarded-Host), which Steam sign-in uses.
  app.use("/api", createProxyMiddleware({ target: process.env.DEV_API_PROXY, changeOrigin: true, xfwd: true }));
};
