const portEl = document.querySelector("#vite-port");
if (portEl) {
  portEl.textContent = String(window.location.port);
}
