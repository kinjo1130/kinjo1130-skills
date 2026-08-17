// UAT 録画用オーバーレイ (uat-record skill 用)。
// 1. カーソル可視化: Playwright の録画は OS カーソルを含まないため、
//    mousemove / mousedown を拾って大きな擬似カーソルとクリック波紋を描画する。
// 2. 検証項目ラベル: window.__uatLabel('C-12-02: 保存できる') で画面上部に
//    バナー表示する。sessionStorage で持続するのでページ遷移しても消えない。
//    消すには window.__uatLabel(null)。MCP の browser_evaluate から呼ぶ。
// .mcp.json の --init-script から全ページに注入される。録画専用であり、
// pointer-events: none なので操作・判定には一切干渉しない。
(() => {
  if (window.__uatCursorOverlay) return;
  window.__uatCursorOverlay = true;

  const ensure = () => {
    if (!document.body || document.getElementById('__uat-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__uat-cursor {
        position: fixed; top: 0; left: 0; width: 28px; height: 28px;
        margin: -14px 0 0 -14px; border-radius: 50%;
        background: rgba(255, 64, 64, 0.55); border: 3px solid rgba(255, 0, 0, 0.9);
        pointer-events: none; z-index: 2147483647; transition: transform 40ms linear;
      }
      .__uat-ripple {
        position: fixed; width: 28px; height: 28px; margin: -14px 0 0 -14px;
        border-radius: 50%; border: 4px solid rgba(255, 200, 0, 0.95);
        pointer-events: none; z-index: 2147483646;
        animation: __uat-ripple 600ms ease-out forwards;
      }
      @keyframes __uat-ripple {
        from { transform: scale(1); opacity: 1; }
        to { transform: scale(3.5); opacity: 0; }
      }
      #__uat-label {
        position: fixed; top: 0; left: 50%; transform: translateX(-50%);
        max-width: 90vw; padding: 6px 18px; border-radius: 0 0 10px 10px;
        background: rgba(20, 20, 30, 0.85); color: #fff;
        font: 600 15px/1.4 system-ui, sans-serif; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
        pointer-events: none; z-index: 2147483647;
      }
    `;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__uat-cursor';
    document.body.appendChild(cursor);
    syncLabel();
  };

  const syncLabel = () => {
    if (!document.body) return;
    const text = sessionStorage.getItem('__uat-label');
    let el = document.getElementById('__uat-label');
    if (!text) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = '__uat-label';
      document.body.appendChild(el);
    }
    el.textContent = text;
  };

  window.__uatLabel = (text) => {
    if (text) sessionStorage.setItem('__uat-label', text);
    else sessionStorage.removeItem('__uat-label');
    ensure();
    syncLabel();
  };

  // ページ遷移後の復元 (ensure はマウス移動まで走らないため DOM 構築時にも同期する)
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        ensure();
      },
      { once: true },
    );
  } else {
    ensure();
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      ensure();
      const c = document.getElementById('__uat-cursor');
      if (c) c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'mousedown',
    (e) => {
      ensure();
      const r = document.createElement('div');
      r.className = '__uat-ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
    { capture: true, passive: true },
  );
})();
