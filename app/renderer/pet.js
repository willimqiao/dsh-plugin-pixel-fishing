/* Desktop-window glue: drag, mode switch, pin, close. */
(function () {
  const api = window.pet;
  if (!api) return;

  const body = document.body;
  const appEl = document.getElementById('app');
  const btnPin = document.getElementById('btnPin');
  const btnMode = document.getElementById('btnMode');
  const btnClose = document.getElementById('btnClose');

  let mode = 'full';
  let pinned = true;
  let drag = null;

  function apply(next) {
    if (!next) return;
    mode = next.mode;
    pinned = next.pinned;
    body.classList.toggle('pet', mode === 'pet');
    btnMode.textContent = mode === 'pet' ? '↗' : '—';
    btnMode.title = mode === 'pet' ? '展开面板' : '收起为桌面宠物';
    btnPin.classList.toggle('active', pinned);
    btnPin.title = pinned ? '取消置顶' : '总在最前';
  }

  api.getState().then(apply);
  api.onState(apply);

  btnMode.addEventListener('click', () => {
    api.setMode(mode === 'pet' ? 'full' : 'pet');
  });
  btnPin.addEventListener('click', () => {
    api.setPinned(!pinned);
  });
  btnClose.addEventListener('click', () => {
    api.close();
  });

  /* Manual window drag. Native -webkit-app-region drag swallows clicks on the
     overlay buttons in this transparent frameless window, so the window is moved
     from the renderer instead: any empty pixel in pet mode, the title bar in
     panel mode. Buttons keep normal click behaviour. */
  async function onPointerDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest('button')) return;
    const inTitlebar = Boolean(event.target.closest('#titlebar'));
    if (mode !== 'pet' && !inTitlebar) return;

    const current = { id: event.pointerId, sx: event.screenX, sy: event.screenY, wx: 0, wy: 0, ready: false, moved: false };
    drag = current;
    try {
      appEl.setPointerCapture(event.pointerId);
    } catch (err) {
      /* pointer capture is best effort */
    }
    event.preventDefault();

    const bounds = await api.getBounds();
    if (drag !== current || !bounds) return;
    current.wx = bounds.x;
    current.wy = bounds.y;
    current.ready = true;
  }

  function onPointerMove(event) {
    if (!drag || drag.id !== event.pointerId || !drag.ready) return;
    const dx = event.screenX - drag.sx;
    const dy = event.screenY - drag.sy;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      body.classList.add('dragging');
    }
    api.moveTo(drag.wx + dx, drag.wy + dy);
  }

  function endDrag(event) {
    if (!drag) return;
    const id = drag.id;
    drag = null;
    body.classList.remove('dragging');
    try {
      appEl.releasePointerCapture(id);
    } catch (err) {
      /* ignore */
    }
  }

  appEl.addEventListener('pointerdown', onPointerDown);
  appEl.addEventListener('pointermove', onPointerMove);
  appEl.addEventListener('pointerup', endDrag);
  appEl.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') api.setMode('pet');
  });
})();
