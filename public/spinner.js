// Universal loading spinner - include this on every page
(function () {
  // Create spinner element
  const style = document.createElement('style');
  style.textContent = `
    #global-loader {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(255,255,255,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      transition: opacity 0.3s ease;
    }
    #global-loader .spinner {
      border: 6px solid #f3f3f3;
      border-top: 6px solid #333;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  const loader = document.createElement('div');
  loader.id = 'global-loader';
  loader.innerHTML = '<div class="spinner"></div>';
  document.body.prepend(loader);

  window.addEventListener('load', () => {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  });
})();
