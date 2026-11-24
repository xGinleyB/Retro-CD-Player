// --- MÓDULO NATIVO DE INDEXEDDB ---
const DB_NAME = "RetroCDPlayerDB";
const STORE_NAME = "albums";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAlbumToDB(album) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(album);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllAlbumsFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- VARIABLES GLOBALES DE LA APLICACIÓN ---
let myCollection = [];
const audioPlayer = new Audio();
let currentAlbum = null;
let currentTrackIndex = 0;

// Elementos del DOM
const cdRack = document.getElementById("cdRack");
const dropZone = document.getElementById("dropZone");
const loadedCD = document.getElementById("loadedCD");
const trackTitle = document.getElementById("trackTitle");
const artistName = document.getElementById("artistName");
const tracklist = document.getElementById("tracklist");
const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const progressBar = document.getElementById("progressBar");
const volumeSlider = document.getElementById("volumeSlider");
const toneArm = document.getElementById("toneArm");

// Elementos del Modal
const addCdBtn = document.getElementById("addCdBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalOverlay = document.getElementById("modalOverlay");
const cdForm = document.getElementById("cdForm");
const saveCdBtn = document.getElementById("saveCdBtn");

// --- 1. INICIALIZAR LA APP Y CARGAR DESDE INDEXEDDB ---
async function initApp() {
  try {
    const savedCollection = await getAllAlbumsFromDB();

    if (savedCollection && savedCollection.length > 0) {
      myCollection = savedCollection.map(album => ({
        ...album,
        coverUrl: URL.createObjectURL(album.coverBlob),
        tracks: album.tracks.map(track => ({
          name: track.name,
          src: URL.createObjectURL(track.audioBlob)
        }))
      }));
    }
    renderShelf();
  } catch (error) {
    console.error("Error al cargar desde IndexedDB:", error);
  }
}

// --- 2. RENDERIZAR ESTANTERÍA ---
function renderShelf() {
  cdRack.innerHTML = "";

  myCollection.forEach(album => {
    const cdCase = document.createElement("div");
    cdCase.className = "cd-case";
    cdCase.draggable = true;
    cdCase.id = album.id;

    cdCase.innerHTML = `
      <div class="disc-preview" style="background: url('${album.coverUrl}')"></div>
      <p class="album-title">${album.title}</p>
    `;

    cdCase.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", album.id);
    });

    cdCase.addEventListener("click", () => {
      loadCDToPlayer(album);
    });

    cdRack.appendChild(cdCase);
  });
}

// --- 3. PROCESAR Y GUARDAR EN INDEXEDDB ---
cdForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  saveCdBtn.textContent = "Guardando...";
  saveCdBtn.disabled = true;

  const title = document.getElementById("inputTitle").value;
  const artist = document.getElementById("inputArtist").value;
  const coverFile = document.getElementById("inputCover").files[0];
  const audioFiles = Array.from(document.getElementById("inputAudioFiles").files);

  if (!coverFile || audioFiles.length === 0) {
    saveCdBtn.textContent = "Guardar en Biblioteca";
    saveCdBtn.disabled = false;
    return;
  }

  audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const albumToSave = {
    id: "cd-" + Date.now(),
    title: title,
    artist: artist,
    coverBlob: coverFile,
    tracks: audioFiles.map(file => ({
      name: file.name.replace(/\.[^/.]+$/, "").replace(/^\d+[\s.\-_]*/, ""),
      audioBlob: file
    }))
  };

  try {
    await saveAlbumToDB(albumToSave);

    const runtimeAlbum = {
      ...albumToSave,
      coverUrl: URL.createObjectURL(albumToSave.coverBlob),
      tracks: albumToSave.tracks.map(t => ({
        name: t.name,
        src: URL.createObjectURL(t.audioBlob)
      }))
    };

    myCollection.push(runtimeAlbum);
    renderShelf();

    cdForm.reset();
    modalOverlay.style.display = "none";
  } catch (err) {
    console.error("Error al guardar en la base de datos:", err);
  } finally {
    saveCdBtn.textContent = "Guardar en Biblioteca";
    saveCdBtn.disabled = false;
  }
});

// --- 4. REPRODUCCIÓN DE AUDIO ---
function setPlaybackState(isPlaying) {
  if (isPlaying) {
    loadedCD.classList.add("spinning");
    toneArm.classList.add("active");
    toneArm.style.transform = "rotate(15deg)";
    playBtn.textContent = "⏸";
  } else {
    loadedCD.classList.remove("spinning");
    toneArm.classList.remove("active");
    toneArm.style.transform = "rotate(-35deg)";
    playBtn.textContent = "▶";
  }
}

function loadCDToPlayer(album) {
  currentAlbum = album;
  currentTrackIndex = 0;

  loadedCD.style.display = "flex";
  loadedCD.style.background = `url('${album.coverUrl}')`;

  playTrack(currentTrackIndex);
}

function playTrack(index) {
  if (!currentAlbum || !currentAlbum.tracks[index]) return;

  currentTrackIndex = index;
  const track = currentAlbum.tracks[index];

  audioPlayer.src = track.src;
  audioPlayer.play().then(() => {
    setPlaybackState(true);
  }).catch(err => console.log("Bloqueo de reproducción:", err));

  trackTitle.textContent = `${index + 1}. ${track.name.toUpperCase()}`;
  artistName.textContent = currentAlbum.artist;

  renderTracklist();
}

function renderTracklist() {
  tracklist.innerHTML = "";
  currentAlbum.tracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.textContent = track.name;
    li.style.cursor = "pointer";

    if (index === currentTrackIndex) li.classList.add("active-track");

    li.addEventListener("click", () => playTrack(index));
    tracklist.appendChild(li);
  });
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- EVENTOS DE AUDIO Y CONTROLES ---
audioPlayer.addEventListener("timeupdate", () => {
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  durationEl.textContent = formatTime(audioPlayer.duration);

  if (audioPlayer.duration) {
    const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = progressPercent;
  }
});

progressBar.addEventListener("input", () => {
  if (audioPlayer.duration) {
    const seekTime = (progressBar.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
  }
});

volumeSlider.addEventListener("input", (e) => {
  audioPlayer.volume = e.target.value;
});

audioPlayer.addEventListener("ended", () => {
  if (currentTrackIndex + 1 < currentAlbum.tracks.length) {
    playTrack(currentTrackIndex + 1);
  } else {
    setPlaybackState(false);
  }
});

playBtn.addEventListener("click", () => {
  if (!currentAlbum) return;
  if (audioPlayer.paused) {
    audioPlayer.play();
    setPlaybackState(true);
  } else {
    audioPlayer.pause();
    setPlaybackState(false);
  }
});

nextBtn.addEventListener("click", () => {
  if (currentAlbum && currentTrackIndex + 1 < currentAlbum.tracks.length) {
    playTrack(currentTrackIndex + 1);
  }
});

prevBtn.addEventListener("click", () => {
  if (currentAlbum && currentTrackIndex > 0) {
    playTrack(currentTrackIndex - 1);
  }
});

// Drag and Drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  const cdId = e.dataTransfer.getData("text/plain");
  const albumFound = myCollection.find(album => album.id === cdId);

  if (albumFound) loadCDToPlayer(albumFound);
});

// Eventos del Modal
addCdBtn.addEventListener("click", () => modalOverlay.style.display = "flex");
closeModalBtn.addEventListener("click", () => modalOverlay.style.display = "none");

// Inicializar la aplicación
initApp();