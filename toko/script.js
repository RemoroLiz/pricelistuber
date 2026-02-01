// ===== KONFIGURASI SHEET =====
const SHEET_CONFIG = {
  harga: { gid: "216173443", name: "Harga" },
  runningText: { gid: "1779766141", name: "RunningText" },
  iklan: { gid: "1303897065", name: "Iklan" },
};

const SHEET_BASE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZ4Jrb5j2IVmK72GbEhHoyIzck-H-khwypavvFpGD8yxetAErp-YpE6Krtu8OtuOTMYzUozy-CrAy5/pub";

// ===== STATE APLIKASI =====
const appState = {
  tableData: {
    emas: [],
    antam: [],
    archi: [],
  },
  currentTableType: "emas",
  rotationInterval: null,
  adsData: [],
  currentVideoIndex: 0,
  videoPlayed: false,
  isYouTubeAPILoaded: false,
  youtubePlayer: null,
  userInteracted: false,
  autoplayAttempted: false,
  isVideoMuted: true,
  isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
  runningTexts: [],
  currentRunningTextIndex: 0,
  runningTextInterval: null,
  isLoading: true,

  cache: {
    harga: { data: null, lastFetch: 0, expiration: 5 * 60 * 1000 },
    runningText: { data: null, lastFetch: 0, expiration: 10 * 60 * 1000 },
    iklan: { data: null, lastFetch: 0, expiration: 5 * 60 * 1000 },
  },
};

// ===== HELPER FUNCTIONS =====
function formatCurrency(amount) {
  if (!amount || isNaN(amount) || amount === 0) return "-";

  // SELALU tampilkan angka penuh tanpa singkatan "Jt"
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function isCacheValid(cacheType) {
  const cache = appState.cache[cacheType];
  if (!cache || !cache.data) return false;
  return Date.now() - cache.lastFetch < cache.expiration;
}

function updateCache(cacheType, data) {
  appState.cache[cacheType] = {
    data: data,
    lastFetch: Date.now(),
    expiration: appState.cache[cacheType].expiration,
  };
}

function showLoading() {
  document.getElementById("loadingState").style.display = "flex";
  document.getElementById("cardsContainer").style.display = "none";
  appState.isLoading = true;
}

function hideLoading() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("cardsContainer").style.display = "grid";
  appState.isLoading = false;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);

  return result.map((field) => {
    let trimmed = field.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      trimmed = trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
  });
}

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", function () {
  console.log("📱 Memuat aplikasi harga emas...");

  setupUserInteractionListeners();
  setupNavigation();

  // Load semua data
  loadAllData();

  // Event listeners untuk responsive design
  window.addEventListener("resize", adjustLayout);
  window.addEventListener("orientationchange", adjustLayout);
});

function setupNavigation() {
  const leftBtn = document.querySelector(".left-nav");
  const rightBtn = document.querySelector(".right-nav");

  if (leftBtn && rightBtn) {
    leftBtn.addEventListener("click", () => {
      handleUserInteraction();
      navigateTables("left");
    });

    rightBtn.addEventListener("click", () => {
      handleUserInteraction();
      navigateTables("right");
    });
  }
}

function setupUserInteractionListeners() {
  ["click", "touchstart", "keydown", "mousemove"].forEach((eventType) => {
    document.addEventListener(eventType, handleUserInteraction, {
      once: false,
      passive: true,
    });
  });
}

function handleUserInteraction() {
  if (!appState.userInteracted) {
    console.log("👆 Interaksi pengguna terdeteksi");
    appState.userInteracted = true;
    document.body.classList.add("user-interacted");

    if (
      appState.youtubePlayer &&
      document.getElementById("videoContainer").classList.contains("active")
    ) {
      setTimeout(() => playVideoWithSound(), 500);
    }
  }
}

async function loadAllData() {
  showLoading();

  try {
    await Promise.all([loadPriceData(), loadRunningText(), loadAdsData()]);

    console.log("✅ Semua data berhasil dimuat");
    hideLoading();

    // Setup rotasi tabel
    if (!appState.isMobile) {
      startRotationInterval(25000);
    } else {
      startRotationInterval(30000);
    }

    // Setup YouTube API
    loadYouTubeAPI();

    // Adjust layout
    adjustLayout();
  } catch (error) {
    console.error("❌ Gagal memuat data:", error);
    hideLoading();
    showError("Gagal memuat data. Silakan refresh halaman.");
  }
}

function adjustLayout() {
  const width = window.innerWidth;

  // Adjust card layout berdasarkan lebar layar
  if (width <= 768) {
    // Mode mobile/tablet - satu kolom
    const container = document.getElementById("cardsContainer");
    if (container) {
      container.style.gridTemplateColumns = "1fr";
    }

    // Sembunyikan tabel kedua jika tidak ada data
    const tableAntam = document.getElementById("tableAntam");
    if (tableAntam && appState.tableData.antam.length === 0) {
      tableAntam.style.display = "none";
    }
  } else {
    // Mode desktop - dua kolom
    const container = document.getElementById("cardsContainer");
    if (container) {
      container.style.gridTemplateColumns = "1fr 1fr";
    }

    // Tampilkan kembali tabel kedua
    const tableAntam = document.getElementById("tableAntam");
    if (tableAntam) {
      tableAntam.style.display = "flex";
    }
  }

  // Adjust table sizes
  adjustTableSizes();
}

function adjustTableSizes() {
  const tables = document.querySelectorAll(".price-table");
  const isMobile = window.innerWidth <= 480;

  tables.forEach((table) => {
    if (isMobile) {
      table.style.fontSize = "0.75rem";
      const ths = table.querySelectorAll("th");
      const tds = table.querySelectorAll("td");

      ths.forEach((th) => (th.style.padding = "8px 4px"));
      tds.forEach((td) => (td.style.padding = "6px 4px"));
    } else {
      table.style.fontSize = "0.85rem";
      const ths = table.querySelectorAll("th");
      const tds = table.querySelectorAll("td");

      ths.forEach((th) => (th.style.padding = "12px 8px"));
      tds.forEach((td) => (td.style.padding = "10px 8px"));
    }
  });
}

// ===== RUNNING TEXT FUNCTIONS =====
async function loadRunningText() {
  try {
    console.log("📜 Memuat running text...");

    if (isCacheValid("runningText")) {
      const cachedData = appState.cache.runningText.data;
      processRunningTextData(cachedData);
      return;
    }

    const url = `${SHEET_BASE_URL}?gid=${SHEET_CONFIG.runningText.gid}&single=false&output=csv`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    const data = parseRunningTextCSV(csvText);

    updateCache("runningText", data);
    processRunningTextData(data);
  } catch (error) {
    console.error("❌ Error loading running text:", error);
    setDefaultRunningText();
  }
}

function parseRunningTextCSV(csvText) {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];

    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const values = parseCSVLine(line);
        if (values[0] && values[0].trim()) {
          result.push({ teks: values[0].trim() });
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error parsing running text CSV:", error);
    return [];
  }
}

function processRunningTextData(data) {
  if (!data || data.length === 0) {
    console.log("⚠️ Tidak ada data running text");
    setDefaultRunningText();
    return;
  }

  const allTexts = data
    .map((item) => item.teks)
    .filter((text) => text && text.trim().length > 0)
    .filter((text) => !text.toLowerCase().includes("teks"))
    .filter((value, index, self) => self.indexOf(value) === index);

  if (allTexts.length === 0) {
    setDefaultRunningText();
    return;
  }

  appState.runningTexts = allTexts;
  appState.currentRunningTextIndex = 0;

  displayCurrentRunningText();
  startRunningTextRotation();
}

function setDefaultRunningText() {
  const defaultTexts = [
    "Harga emas terkini - Informasi terupdate setiap hari",
    "Pantes CitiMall Garut - Terpercaya sejak 2010",
    "Jual beli emas, logam mulia, dan perhiasan",
    "Harga kompetitif dan transaksi aman",
  ];

  appState.runningTexts = defaultTexts;
  appState.currentRunningTextIndex = 0;
  displayCurrentRunningText();
  startRunningTextRotation();
}

function displayCurrentRunningText() {
  const marqueeElement = document.getElementById("marqueeText");

  if (!marqueeElement || appState.runningTexts.length === 0) return;

  const currentText = appState.runningTexts[appState.currentRunningTextIndex];
  marqueeElement.textContent = currentText;

  // Calculate animation duration based on text length
  const textLength = currentText.length;
  const duration = Math.max(20, textLength / 5);

  // Reset and start new animation
  marqueeElement.style.animation = "none";
  void marqueeElement.offsetWidth;
  marqueeElement.style.animation = `marquee ${duration}s linear infinite`;
}

function startRunningTextRotation() {
  if (appState.runningTextInterval) {
    clearInterval(appState.runningTextInterval);
  }

  appState.runningTextInterval = setInterval(() => {
    appState.currentRunningTextIndex =
      (appState.currentRunningTextIndex + 1) % appState.runningTexts.length;
    displayCurrentRunningText();
  }, 15000);
}

// ===== PRICE DATA FUNCTIONS =====
async function loadPriceData() {
  try {
    console.log("📊 Memuat data harga...");

    if (isCacheValid("harga")) {
      console.log("💾 Menggunakan data harga dari cache");
      const cachedData = appState.cache.harga.data;
      processPriceData(cachedData);
      return;
    }

    const url = `${SHEET_BASE_URL}?gid=${SHEET_CONFIG.harga.gid}&single=false&output=csv`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    const data = parsePriceCSV(csvText);

    updateCache("harga", data);
    processPriceData(data);
  } catch (error) {
    console.error("❌ Error loading price data:", error);

    if (appState.cache.harga.data) {
      console.log("🔄 Menggunakan data cache sebagai fallback");
      processPriceData(appState.cache.harga.data);
    } else {
      showNoData();
    }
  }
}

function parsePriceCSV(csvText) {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.toLowerCase().trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      const row = {};

      headers.forEach((header, index) => {
        if (index < values.length) {
          let value = values[index];

          // Clean numeric values
          if (
            header.includes("harga") ||
            header.includes("buyback") ||
            header.includes("harga_jual")
          ) {
            // Hapus semua karakter non-angka
            const cleaned = value.replace(/[^0-9]/g, "");
            value = cleaned ? parseInt(cleaned) : 0;
          }

          row[header] = value;
        }
      });

      // Only add if it has required data
      if (row.kode && (row.harga_jual || row.buyback)) {
        result.push(row);
      }
    }

    console.log("📈 Data harga yang di-parse:", result);
    return result;
  } catch (error) {
    console.error("Error parsing price CSV:", error);
    return [];
  }
}

function processPriceData(data) {
  if (!data || data.length === 0) {
    console.log("⚠️ Tidak ada data harga");
    showNoData();
    return;
  }

  // Reset data
  appState.tableData = {
    emas: [],
    antam: [],
    archi: [],
  };

  // Group data by type
  data.forEach((item) => {
    const type = item.tipe ? item.tipe.toLowerCase().trim() : "emas";

    if (type === "emas") {
      appState.tableData.emas.push(item);
    } else if (type === "antam") {
      appState.tableData.antam.push(item);
    } else if (type === "archi") {
      appState.tableData.archi.push(item);
    }
  });

  console.log(
    `✅ Data processed: Emas(${appState.tableData.emas.length}), Antam(${appState.tableData.antam.length}), Archi(${appState.tableData.archi.length})`,
  );

  // Display initial table
  displayTables(appState.currentTableType);
  adjustLayout();
}

function displayTables(type) {
  const data = appState.tableData[type];

  if (!data || data.length === 0) {
    showNoDataForTable(type);
    return;
  }

  updateTableTitles(type);

  if (window.innerWidth <= 768) {
    // Mobile - show all data in one table
    updateTable("priceTableLeft", data, type);
    // Hide second table
    document.getElementById("tableAntam").style.display = "none";
  } else {
    // Desktop - split data between two tables
    const half = Math.ceil(data.length / 2);
    const leftData = data.slice(0, half);
    const rightData = data.slice(half);

    updateTable("priceTableLeft", leftData, type);
    updateTable("priceTableRight", rightData, type);
    document.getElementById("tableAntam").style.display = "flex";
  }
}

function updateTableTitles(type) {
  const titles = {
    emas: "Harga Emas",
    antam: "Harga Antam",
    archi: "Harga Archi",
  };

  const tableTitles = document.querySelectorAll(".card-title");
  const title = titles[type] || "Harga Emas";

  tableTitles[0].textContent = title;
  if (tableTitles[1]) {
    tableTitles[1].textContent = title;
  }
}

function updateTable(elementId, data, type) {
  const tableElement = document.getElementById(elementId);

  if (!data || data.length === 0) {
    tableElement.innerHTML = `
            <div class="no-data">
                <i class="fas fa-database"></i>
                <p>Data ${type} tidak tersedia</p>
            </div>
        `;
    return;
  }

  let tableHTML = `
        <table class="price-table">
            <thead>
                <tr>
                    <th>Kode</th>
                    <th>Harga Jual</th>
                    <th>Harga Beli</th>
                </tr>
            </thead>
            <tbody>
    `;

  data.forEach((item) => {
    const hargaJual = item.harga_jual || 0;
    const buyback = item.buyback || 0;

    tableHTML += `
            <tr>
                <td>${item.kode || "-"}</td>
                <td class="highlight">${formatCurrency(hargaJual)}</td>
                <td class="highlight">${formatCurrency(buyback)}</td>
            </tr>
        `;
  });

  tableHTML += `
            </tbody>
        </table>
    `;

  tableElement.innerHTML = tableHTML;
}

function showNoData() {
  const errorHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Data harga tidak tersedia saat ini.</p>
            <button onclick="location.reload()">Muat Ulang</button>
        </div>
    `;

  document.getElementById("priceTableLeft").innerHTML = errorHTML;
  document.getElementById("priceTableRight").innerHTML = errorHTML;
}

function showNoDataForTable(type) {
  const tableName =
    type === "emas" ? "Emas" : type === "antam" ? "Antam" : "Archi";

  const noDataHTML = `
        <div class="no-data">
            <i class="fas fa-database"></i>
            <p>Data ${tableName} tidak tersedia</p>
        </div>
    `;

  document.getElementById("priceTableLeft").innerHTML = noDataHTML;
  document.getElementById("priceTableRight").innerHTML = noDataHTML;
}

function showError(message) {
  const errorHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message || "Terjadi kesalahan"}</p>
            <button onclick="location.reload()">Muat Ulang</button>
        </div>
    `;

  document.getElementById("priceTableLeft").innerHTML = errorHTML;
  document.getElementById("priceTableRight").innerHTML = errorHTML;
}

// ===== TABLE ROTATION =====
function startRotationInterval(duration = 25000) {
  if (appState.rotationInterval) clearInterval(appState.rotationInterval);
  appState.rotationInterval = setInterval(
    () => navigateTables("right"),
    duration,
  );
}

function navigateTables(direction) {
  const types = ["emas", "antam", "archi"];
  const currentIndex = types.indexOf(appState.currentTableType);
  let nextIndex;

  if (direction === "right") {
    nextIndex = (currentIndex + 1) % types.length;
  } else {
    nextIndex = (currentIndex - 1 + types.length) % types.length;
  }

  // Skip jika tidak ada data untuk tipe tersebut
  if (appState.tableData[types[nextIndex]].length === 0) {
    // Cari tipe berikutnya yang memiliki data
    for (let i = 1; i < types.length; i++) {
      const checkIndex = (nextIndex + i) % types.length;
      if (appState.tableData[types[checkIndex]].length > 0) {
        nextIndex = checkIndex;
        break;
      }
    }
  }

  appState.currentTableType = types[nextIndex];
  displayTables(appState.currentTableType);

  // Jika pindah ke archi dan ada video, tampilkan video
  if (
    appState.currentTableType === "archi" &&
    hasActiveAds() &&
    !appState.videoPlayed
  ) {
    setTimeout(() => showVideo(), 3000);
  }
}

// ===== ADS DATA FUNCTIONS =====
async function loadAdsData() {
  try {
    console.log("🎬 Memuat data iklan...");

    if (isCacheValid("iklan")) {
      appState.adsData = appState.cache.iklan.data;
      return;
    }

    const url = `${SHEET_BASE_URL}?gid=${SHEET_CONFIG.iklan.gid}&single=false&output=csv`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const csvText = await response.text();
    const data = parseAdsCSV(csvText);

    updateCache("iklan", data);
    appState.adsData = data;
  } catch (error) {
    console.error("❌ Error loading ads data:", error);
    appState.adsData = [];
  }
}

function parseAdsCSV(csvText) {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.toLowerCase().trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      const obj = {};

      headers.forEach((header, index) => {
        if (index < values.length) {
          obj[header] = values[index];
        }
      });

      if (
        obj.video_url &&
        obj.video_url.trim() &&
        obj.status &&
        obj.status.toLowerCase() === "active"
      ) {
        result.push(obj);
      }
    }

    return result;
  } catch (error) {
    console.error("Error parsing ads CSV:", error);
    return [];
  }
}

function hasActiveAds() {
  return (
    appState.adsData.filter(
      (ad) =>
        ad.status &&
        ad.status.toLowerCase() === "active" &&
        ad.video_url &&
        isValidYouTubeUrl(ad.video_url),
    ).length > 0
  );
}

function isValidYouTubeUrl(url) {
  if (!url) return false;
  const cleanUrl = url.trim();
  if (!cleanUrl) return false;
  const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+/;
  return youtubePattern.test(cleanUrl);
}

// ===== VIDEO FUNCTIONS =====
function loadYouTubeAPI() {
  if (!appState.isYouTubeAPILoaded) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
    appState.isYouTubeAPILoaded = true;
  }
}

function showVideo() {
  const activeAds = appState.adsData.filter(
    (ad) =>
      ad.status &&
      ad.status.toLowerCase() === "active" &&
      ad.video_url &&
      isValidYouTubeUrl(ad.video_url),
  );

  if (activeAds.length === 0) {
    console.log("📺 Tidak ada iklan aktif");
    appState.videoPlayed = true;
    return;
  }

  if (appState.currentVideoIndex >= activeAds.length)
    appState.currentVideoIndex = 0;

  const selectedAd = activeAds[appState.currentVideoIndex];
  const videoContainer = document.getElementById("videoContainer");
  const videoWrapper = document.querySelector(".video-wrapper");

  console.log(
    `📽️ Menampilkan video ${appState.currentVideoIndex + 1} dari ${activeAds.length}`,
  );

  document.getElementById("tableEmas").style.display = "none";
  document.getElementById("tableAntam").style.display = "none";

  videoWrapper.innerHTML = "";

  const videoContainerDiv = document.createElement("div");
  videoContainerDiv.id = "player";
  videoContainerDiv.style.cssText = `width: 100%; height: 100%; border-radius: 8px; overflow: hidden; position: absolute; top: 0; left: 0;`;

  videoWrapper.appendChild(videoContainerDiv);
  videoContainer.classList.add("active");
  appState.videoPlayed = true;

  setTimeout(() => setupYouTubePlayer(selectedAd.video_url), 500);
}

function setupYouTubePlayer(videoUrl) {
  const videoId = extractVideoId(videoUrl);

  if (!videoId) {
    console.error("❌ Tidak dapat mengekstrak Video ID:", videoUrl);
    showVideoFallback();
    return;
  }

  appState.autoplayAttempted = false;
  appState.isVideoMuted = true;

  const playerVars = {
    autoplay: 1,
    mute: 1,
    enablejsapi: 1,
    rel: 0,
    playsinline: 1,
    controls: 1,
    modestbranding: 1,
    showinfo: 0,
    iv_load_policy: 3,
  };

  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    playerVars.playsinline = 1;
    playerVars.fs = 0;
  }

  appState.youtubePlayer = new YT.Player("player", {
    width: "100%",
    height: "100%",
    videoId: videoId,
    playerVars: playerVars,
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}

function extractVideoId(url) {
  const regExp =
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : null;
}

function onPlayerReady(event) {
  console.log("✅ YouTube Player siap");
  attemptSmartAutoplay(event.target);
}

function attemptSmartAutoplay(player) {
  if (appState.autoplayAttempted) return;
  appState.autoplayAttempted = true;

  if (appState.userInteracted) {
    try {
      player.unMute();
      player.playVideo();
      appState.isVideoMuted = false;
      console.log("🎬 Video diputar dengan suara");
      return;
    } catch (error) {
      console.log("⚠️ Gagal play dengan suara:", error);
    }
  }

  try {
    player.mute();
    player.playVideo();
    appState.isVideoMuted = true;
    console.log("🔇 Muted autoplay berhasil");
    showUnmuteButton(player);
  } catch (error) {
    console.log("❌ Muted autoplay diblokir:", error);
    showInteractivePlayButton(player);
  }
}

function playVideoWithSound() {
  if (appState.youtubePlayer && appState.youtubePlayer.playVideo) {
    try {
      if (appState.isVideoMuted) {
        appState.youtubePlayer.unMute();
        appState.isVideoMuted = false;
        console.log("🔊 Video di-unmute");
      }

      if (appState.youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
        appState.youtubePlayer.playVideo();
        console.log("▶️ Video diputar");
      }

      const unmuteBtn = document.querySelector(".unmute-btn");
      if (unmuteBtn) unmuteBtn.style.display = "none";
    } catch (error) {
      console.log("⚠️ Gagal memutar video dengan suara:", error);
    }
  }
}

function onPlayerStateChange(event) {
  console.log("📊 Status Player:", event.data);

  if (event.data === YT.PlayerState.ENDED) {
    console.log("🎬 Video selesai");
    playNextVideo();
  }

  if (
    event.data === YT.PlayerState.PLAYING &&
    appState.userInteracted &&
    appState.isVideoMuted
  ) {
    setTimeout(() => {
      try {
        event.target.unMute();
        appState.isVideoMuted = false;
        console.log("🔊 Video di-unmute otomatis");

        const unmuteBtn = document.querySelector(".unmute-btn");
        if (unmuteBtn) unmuteBtn.style.display = "none";
      } catch (error) {
        console.log("⚠️ Tidak bisa unmute:", error);
      }
    }, 1000);
  }
}

function onPlayerError(event) {
  console.error("❌ Error YouTube Player:", event.data);
  showVideoFallback();
}

function showUnmuteButton(player) {
  const videoWrapper = document.querySelector(".video-wrapper");
  const existingBtn = videoWrapper.querySelector(".unmute-btn");
  if (existingBtn) existingBtn.remove();

  const unmuteBtn = document.createElement("button");
  unmuteBtn.className = "unmute-btn";
  unmuteBtn.innerHTML = `<i class="fas fa-volume-mute"></i><span>Nyalakan Suara</span>`;
  unmuteBtn.onclick = function () {
    handleUserInteraction();
    playVideoWithSound();
  };

  videoWrapper.appendChild(unmuteBtn);
}

function showInteractivePlayButton(player) {
  const videoWrapper = document.querySelector(".video-wrapper");
  const existingBtn = videoWrapper.querySelector(".play-btn");
  if (existingBtn) existingBtn.remove();

  const playBtn = document.createElement("button");
  playBtn.className = "play-btn";
  playBtn.innerHTML = `<i class="fas fa-play"></i><span>Putar Video</span>`;
  playBtn.onclick = function () {
    handleUserInteraction();
    playVideoWithSound();
  };

  videoWrapper.appendChild(playBtn);
}

function showVideoFallback() {
  console.log("🔄 Menampilkan fallback");
  const videoWrapper = document.querySelector(".video-wrapper");

  videoWrapper.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); color: white; padding: 20px; text-align: center; border-radius: 8px;">
            <i class="fas fa-video-slash" style="font-size: 48px; margin-bottom: 15px; color: var(--primary);"></i>
            <h3 style="margin-bottom: 10px; font-size: 1.2rem;">Video Tidak Dapat Diputar</h3>
            <p style="margin-bottom: 20px; opacity: 0.8; font-size: 0.9rem;">Video iklan sedang tidak tersedia</p>
            <button onclick="hideVideo()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 0.9rem; transition: all 0.3s ease;">
                Lanjutkan Ke Harga Emas
            </button>
        </div>
    `;
}

function playNextVideo() {
  console.log("⏭️ Memainkan video berikutnya");

  appState.currentVideoIndex++;
  const activeAds = appState.adsData.filter(
    (ad) =>
      ad.status &&
      ad.status.toLowerCase() === "active" &&
      ad.video_url &&
      isValidYouTubeUrl(ad.video_url),
  );

  if (appState.currentVideoIndex < activeAds.length) {
    showVideo();
  } else {
    appState.currentVideoIndex = 0;
    hideVideo();
  }
}

function hideVideo() {
  const videoContainer = document.getElementById("videoContainer");
  const videoWrapper = document.querySelector(".video-wrapper");

  console.log("⏹️ Menyembunyikan video");

  if (appState.youtubePlayer) {
    try {
      appState.youtubePlayer.stopVideo();
      appState.youtubePlayer.destroy();
    } catch (error) {
      console.log("⚠️ Tidak dapat menghentikan video:", error);
    }
    appState.youtubePlayer = null;
  }

  appState.videoPlayed = false;
  appState.autoplayAttempted = false;
  appState.isVideoMuted = true;

  videoWrapper.innerHTML = "";
  videoContainer.classList.remove("active");

  document.getElementById("tableEmas").style.display = "flex";
  document.getElementById("tableAntam").style.display = "flex";

  setTimeout(adjustLayout, 100);
}

// ===== GLOBAL CALLBACKS =====
window.onYouTubeIframeAPIReady = function () {
  console.log("✅ YouTube API Ready");
};

// ===== PAGE VISIBILITY HANDLING =====
document.addEventListener("visibilitychange", function () {
  if (document.hidden) {
    console.log("⏸️ Halaman tidak aktif");
    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    if (appState.runningTextInterval)
      clearInterval(appState.runningTextInterval);
  } else {
    console.log("▶️ Halaman aktif");
    if (appState.isMobile) {
      startRotationInterval(30000);
    } else {
      startRotationInterval(25000);
    }
    startRunningTextRotation();
  }
});

// ===== PERIODIC REFRESH =====
setInterval(
  () => {
    console.log("🔄 Memperbarui data dari server...");
    loadPriceData();
    loadRunningText();
    loadAdsData();
  },
  5 * 60 * 1000,
);

// ===== GLOBAL FUNCTIONS =====
window.refreshData = function () {
  showLoading();
  loadAllData();
};

// ===== CLEANUP =====
window.addEventListener("beforeunload", function () {
  if (appState.youtubePlayer) {
    try {
      appState.youtubePlayer.stopVideo();
    } catch (error) {}
  }
});
