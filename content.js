let isScraping = false;
let allScrapedData = [];


//all bike er jonno link https://dash.packzy.com/admin/fleet/vehicles?vehicle_type=2&


//all coverd van er jonno link https://dash.packzy.com/admin/fleet/vehicles
const BASE_URL = "https://dash.packzy.com/admin/fleet/vehicles";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_SCRAPE") {
    if (isScraping) return;
    isScraping = true;
    allScrapedData = [];
    startScrapingProcess(request.concurrency);
    sendResponse({ status: "started" });
  } 
  else if (request.action === "STOP_SCRAPE") {
    isScraping = false;
    sendResponse({ status: "stopped" });
  }
  return true;
});

function sendLog(message) {
  chrome.runtime.sendMessage({ action: "LOG", message });
}

function updateProgress(totalPages) {
  chrome.runtime.sendMessage({ 
    action: "PROGRESS", 
    pages: totalPages, 
    rows: allScrapedData.length 
  });
}

function updatePreview() {
  chrome.runtime.sendMessage({ action: "PREVIEW", data: allScrapedData.slice(-5) });
}


//page pagination a bike er jonno link change korte hbe ?page=
async function fetchPage(page) {
  const url = `${BASE_URL}page=${page}`;
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    if (html.includes("Sign in") || html.includes("Login")) {
      throw new Error("Session expired. Please refresh the dashboard and try again.");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const rows = [...doc.querySelectorAll("tr[data-fv-row]")];
    
    const pageData = [];
    rows.forEach(tr => {
      let vehicleNo = tr.querySelector(".fv-reg")?.innerText.trim() || "";
      
      let model = "", vehicleId = "";
      const subSpan = tr.querySelector(".fv-c--vehicle .fv-sub");
      if (subSpan) {
        const subText = subSpan.innerText.trim();
        const match = subText.match(/^(.*?)\s*[·•]\s*#(\w+)$/);
        if (match) {
          model = match[1].trim();
          vehicleId = match[2].trim();
        } else {
          const hashIndex = subText.indexOf('#');
          if (hashIndex !== -1) {
            model = subText.substring(0, hashIndex).replace('·', '').trim();
            vehicleId = subText.substring(hashIndex + 1).trim();
          } else {
            model = subText;
          }
        }
      }

      let odometer = tr.querySelector(".fv-c--odo strong")?.innerText.trim() || "";
      let hub = tr.querySelector(".fv-c--hub .fw-semibold")?.innerText.trim() || "";
      
      let supervisor = "Not Assigned";
      const supLink = tr.querySelector(".fv-c--hub .fv-supervisor a");
      if (supLink && supLink.innerText.trim() !== "") {
        supervisor = supLink.innerText.trim();
      }

      if (vehicleNo) {
        pageData.push({ vehicleNo, model, vehicleId, odometer, hub, supervisor });
      }
    });

    return { page, data: pageData, isEmpty: pageData.length === 0 };
  } catch (err) {
    sendLog(`❌ Error on page ${page}: ${err.message}`);
    return { page, data: [], isEmpty: true, error: true };
  }
}

async function startScrapingProcess(concurrency) {
  sendLog(`🚀 Starting auto-pagination from ${BASE_URL}...`);
  let currentPage = 1;
  let hasMoreData = true;
  let totalPagesScraped = 0;

  while (hasMoreData && isScraping) {
    const pagesToFetch = [];
    for (let i = 0; i < concurrency; i++) {
      pagesToFetch.push(currentPage + i);
    }

    sendLog(`Fetching pages: ${pagesToFetch.join(", ")}...`);

    const results = await Promise.all(pagesToFetch.map(p => fetchPage(p)));

    for (let i = 0; i < results.length; i++) {
      if (!isScraping) break;

      const res = results[i];
      
      if (res.isEmpty) {
        sendLog(`🏁 Page ${res.page} is empty. Stopping pagination.`);
        hasMoreData = false;
        break;
      }

      allScrapedData = allScrapedData.concat(res.data);
      totalPagesScraped++;
      
      updateProgress(totalPagesScraped);
      updatePreview();
      sendLog(`✅ Page ${res.page} scraped. Found ${res.data.length} rows. Total: ${allScrapedData.length}`);
    }

    currentPage += concurrency;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  isScraping = false;
  sendLog(`🎉 Scraping finished! Total ${allScrapedData.length} vehicles collected from ${totalPagesScraped} pages.`);
  chrome.runtime.sendMessage({ action: "FINISHED", data: allScrapedData });
}
