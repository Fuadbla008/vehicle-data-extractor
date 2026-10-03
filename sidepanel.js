let scrapedData = [];
let isScraping = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const concurrencyInput = document.getElementById('concurrency');
const progressBar = document.getElementById('progressBar');
const pageCountEl = document.getElementById('pageCount');
const rowCountEl = document.getElementById('rowCount');
const consoleBox = document.getElementById('console');
const previewBody = document.getElementById('previewBody');
const downloadBtn = document.getElementById('downloadBtn');

function logToConsole(msg) {
  const time = new Date().toLocaleTimeString();
  consoleBox.innerHTML += `<div>[${time}] ${msg}</div>`;
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

function resetUI() {
  scrapedData = [];
  progressBar.style.width = '100%';
  progressBar.style.animation = 'pulse 1.5s infinite';
  pageCountEl.innerText = 'Pages: 0';
  rowCountEl.innerText = 'Rows: 0';
  previewBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No data yet</td></tr>';
  downloadBtn.disabled = true;
  consoleBox.innerHTML = '';
}

startBtn.addEventListener('click', async () => {
  if (isScraping) return;
  
  const concurrency = parseInt(concurrencyInput.value) || 3;
  if (concurrency < 1 || concurrency > 5) {
    alert("Concurrency must be between 1 and 5");
    return;
  }
  
  resetUI();
  isScraping = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { 
    action: "START_SCRAPE", 
    concurrency: concurrency
  });
});

stopBtn.addEventListener('click', async () => {
  if (!isScraping) return;
  isScraping = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  progressBar.style.animation = 'none';
  logToConsole("⏹ Stopping process...");
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: "STOP_SCRAPE" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "LOG") {
    logToConsole(request.message);
  }
  
  if (request.action === "PROGRESS") {
    pageCountEl.innerText = `Pages: ${request.pages}`;
    rowCountEl.innerText = `Rows: ${request.rows}`;
  }
  
  if (request.action === "PREVIEW") {
    if (request.data && request.data.length > 0) {
      previewBody.innerHTML = request.data.map(r => `
        <tr>
          <td>${r.vehicleNo}</td>
          <td>${r.model}</td>
          <td>${r.hub}</td>
        </tr>
      `).join('');
    }
  }
  
  if (request.action === "FINISHED") {
    isScraping = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    progressBar.style.animation = 'none';
    scrapedData = request.data || [];
    
    if (scrapedData.length > 0) {
      downloadBtn.disabled = false;
      logToConsole(`✅ Done! Total ${scrapedData.length} vehicles collected.`);
    } else {
      logToConsole(`⚠️ Done, but 0 data collected. Check Network tab.`);
    }
  }
});

downloadBtn.addEventListener('click', () => {
  const headers = ["Vehicle No", "Model", "Vehicle ID", "Odometer", "Operating Hub", "Supervisor Person"];
  const csvRows = scrapedData.map(r => 
    [r.vehicleNo, r.model, r.vehicleId, r.odometer, r.hub, r.supervisor]
    .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vehicles_data_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});