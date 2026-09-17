// Universal loading spinner - Pinterest-style rotating dots (synced color)
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
      position: relative;
      width: 40px;
      height: 40px;
      animation: rotate 2.4s linear infinite, hue-cycle 3s linear infinite;
    }
    #global-loader .dots-spinner span {
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #e0732a;
    }
    #global-loader .dots-spinner span:nth-child(1) {
      top: 0;
      left: 15px;
    }
    #global-loader .dots-spinner span:nth-child(2) {
      top: 28px;
      left: 28px;
    }
    #global-loader .dots-spinner span:nth-child(3) {
      top: 28px;
      left: 2px;
    }
    @keyframes rotate {
      to { transform: rotate(360deg); }
    }
    @keyframes hue-cycle {
      to { filter: hue-rotate(360deg); }
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
