document.addEventListener('DOMContentLoaded', async () => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const codeBox = document.getElementById('health-output');

  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (response.ok && data.status === 'ok') {
      dot.className = 'dot online';
      text.textContent = 'API is online and operational';
      codeBox.textContent = JSON.stringify(data, null, 2);
    } else {
      throw new Error(`Unexpected status response: ${response.status}`);
    }
  } catch (err) {
    dot.className = 'dot offline';
    text.textContent = 'Unable to connect to API server';
    codeBox.textContent = JSON.stringify({ error: err.message }, null, 2);
  }
});
