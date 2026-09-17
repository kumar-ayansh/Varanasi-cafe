// Universal loading spinner - dots style (Pinterest-like)
// Include this on every page via <script src="spinner.js"></script>

(function () {
  const style = document.createElement('style');
  style.textContent = `
    #global-loader {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    #global-loader .dots-spinner {
      display: flex;
      gap: 8px;
    }
    #global-loader .dots-spinner span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d4a656;
      animation: dot-bounce 1s infinite ease-in-out;
    }
    #global-loader .dots-spinner span:nth-child(2) {
      animation-delay: 0.15s;
    }
    #global-loader .dots-spinner span:nth-child(3) {
      animation-delay: 0.3s;
    }
    @keyframes dot-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  const loader = document.createElement('div');
  loader.id = 'global-loader';
  loader.innerHTML = `
    <div class="dots-spinner">
      <span></span><span></span><span></span>
    </div>
  `;
  document.body.prepend(loader);

  window.addEventListener('load', () => {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  });
})();
