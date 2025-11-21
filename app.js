let ASSETS_PATH = ""; // Will be filled dynamically
let activePcTimers = {}; // To track running timers
let activeTimerTargets = {}; // Keeps "End Time" of timers in memory (Persistent)
let currentEditorTmp = null; // Live copy of the button currently being edited


let currentTranslations = {}; // Holds the loaded language file
let currentLang = 'en'; // Default language
const DEFAULT_LANG = 'en';


// --- NEW: DYNAMIC PLUGIN API BRIDGE (UPDATED) ---

/**
 * Helper function for API: Updates the text and icon of a button element
 * (sidebar or grid).
 */
function updateElementVisuals(btnEl, newLabel, newIcon, btnData = {}) {
    // Update text
    if (newLabel !== null) {
        // Sidebar button uses 'span', grid button uses 'div.label'
        const span = btnEl.querySelector('span') || btnEl.querySelector('.label');
        if (span) span.textContent = newLabel;
    }

    // Update icon
    if (newIcon !== null) {
        // Sidebar button uses 'img'/'i', grid button uses 'img.icon-img'/'i.icon-img'
        const img = btnEl.querySelector('img') || btnEl.querySelector('img.icon-img');
        const iEl = btnEl.querySelector('i') || btnEl.querySelector('i.icon-img');
        const iconUrl = getIconUrl(newIcon);

        if (iconUrl) {
            const isRawImage = iconUrl.startsWith('data:') || iconUrl.startsWith('file:');

            if (isRawImage) {
                if (img) {
                    img.src = iconUrl;
                    img.style.display = 'block';
                    if (iEl) iEl.style.display = 'none';
                }
            } else {
                if (iEl) {
                    iEl.style.display = 'block';

                    // If grid button, get colors from btnData, otherwise (sidebar) leave white
                    // (Assuming btnData is populated for the main grid button)
                    let iconColor = btnData.iconColor || null;

                    // If toggle and active, get active color
                    if (btnData.type === 'toggle' && btnData.toggleState === true) {
                        iconColor = btnData.toggleData?.onIconColor || '#ffffff';
                    }

                    // Default white if no color setting
                    if (!iconColor) {
                        iconColor = '#ffffff';
                    }

                    iEl.style.backgroundColor = iconColor;
                    iEl.style.webkitMaskImage = `url("${iconUrl}")`;
                    iEl.style.maskImage = `url("${iconUrl}")`;
                    iEl.style.backgroundImage = 'none';
                    if (img) img.style.display = 'none';
                }
            }
        } else {
            if (img) img.style.display = 'none';
            if (iEl) iEl.style.display = 'block'; // Revert to default star (sidebar) or empty (grid)
        }
    }
}

window.SmartDeckAPI = {
    /**
     * Updates all relevant buttons in the plugin panel AND the main grid.
     * @param {string} pluginId - 'meta.id' value of the plugin (e.g. "spotify")
     * @param {number} buttonIndex - Button order in the plugin's .json file (starts from 0)
     * @param {string | null} newLabel - New text (unchanged if null)
     * @param {string | null} newIcon - New icon URL (unchanged if null)
     */
    updatePluginButton: (pluginId, buttonIndex, newLabel, newIcon) => {
        if (!cfg) return;
        try {
            // 1. Find and update sidebar button
            const sidebarBtnEl = document.querySelector(`.plugin-btn-drag[data-plugin-id="${pluginId}"][data-button-index="${buttonIndex}"]`);
            if (sidebarBtnEl) {
                // btnData is empty for sidebar buttons, only icon/label is updated
                updateElementVisuals(sidebarBtnEl, newLabel, newIcon, {});
            }

            // 2. Find and update buttons in Main Grid
            let gridChanged = false; // Track if cfg has changed
            let saveNeeded = false; // Track if saving is needed

            cfg.pages.forEach((page, pageIdx) => {
                page.forEach((btn, btnIdx) => {
                    // Is this button a copy of the plugin button that needs updating?
                    if (btn && btn._pluginId === pluginId && btn._buttonIndex === buttonIndex) {

                        // Update cfg data
                        if (newLabel !== null && btn.label !== newLabel) {
                            btn.label = newLabel;
                            saveNeeded = true;
                        }
                        if (newIcon !== null && btn.icon !== newIcon) {
                            btn.icon = newIcon;
                            saveNeeded = true;
                        }

                        // If this button is on the current active page, update DOM (visual) as well
                        if (pageIdx === currentPage) {
                            const gridBtnContainer = document.querySelector(`.cell[data-index="${btnIdx}"] .btn`);
                            if (gridBtnContainer) {
                                // Send full button data (btn) when updating visual
                                updateElementVisuals(gridBtnContainer, newLabel, newIcon, btn);
                            }
                            gridChanged = true;
                        }
                    }
                });
            });

            // If we changed cfg, save (but don't add to history)
            if (saveNeeded) {
                saveConfig(false);
            }

        } catch (e) {
            console.error("SmartDeckAPI Error:", e);
        }
    }
};
/**
 * Translation engine. 
 * Example: t('header.title') -> "SmartDeck"
 * Example: t('device.frame.page', { pageNum: 1 }) -> "Page 1"
 */
function t(key, replacements = {}) {
    let text = key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined) ? obj[k] : null, currentTranslations);

    if (text === null) {
        console.warn(`[i18n] Missing key: ${key}`);
        return key; // Return key as is
    }

    // Fill variables (e.g. {pageNum})
    Object.keys(replacements).forEach(rKey => {
        text = text.replace(`{${rKey}}`, replacements[rKey]);
    });

    return text;
}




/**
 * Arayüzdeki tüm [data-i18n] etiketli elementleri günceller.
 */
// app.js
/**
 * Updates all elements with [data-i18n] tag in the interface.
 */
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translation = t(key);
        if (translation !== key) {
            // Using innerText or textContent prevents HTML injection
            el.textContent = translation;
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        const translation = t(key);
        if (translation !== key) {
            el.title = translation;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        const translation = t(key);
        if (translation !== key) {
            el.placeholder = translation;
        }
    });

    // --- FIX (PROBLEM 1) ---
    // Device Name: Removed data-i18n tag, now managing manually.
    const webTitleEl = el('#web-title-text');
    if (webTitleEl) {
        // Use name in cfg (saved) first, if empty use translation.
        webTitleEl.textContent = (cfg && cfg.deviceName) ? cfg.deviceName : t('device.frame.title');
    }
    // --- FIX END ---

    // We also need to redraw UIs dynamically created by JavaScript.
    if (cfg) {
        drawGrid();
        renderPageBar();
        populateGridControls();

        // --- FIX (PROBLEM 2) ---
        // Retranslate connection status based on current state
        updateConnectionUI(!!connectedSerialPort, connectedSerialPort ? (el('#connStatus').textContent.split(': ')[1] || '') : '');
    }
}

/**
 * Loads the JSON file for the specified language code and updates the interface.
 */
// app.js

async function loadLanguage(langCode = 'en') {
    try {
        const response = await fetch(`locales/${langCode}.json?v=${Date.now()}`);
        if (!response.ok) {
            if (langCode !== DEFAULT_LANG) {
                console.warn(`'${langCode}.json' bulunamadı. Varsayılan (en) yükleniyor.`);
                await loadLanguage(DEFAULT_LANG); // Wait for error to finish
            } else {
                console.error("Varsayılan dil dosyası 'en.json' yüklenemedi!");
            }
            return;
        }

        currentTranslations = await response.json();
        currentLang = langCode;

        if (!cfg.appSettings) cfg.appSettings = {};
        cfg.appSettings.language = langCode;

        // --- FIX (PROBLEM 3 - SIDE EFFECT) ---
        // Prevent saving to history by using saveConfig(false) instead of saveConfig()
        saveConfig(false);
        // --- FIX END ---

        document.documentElement.lang = langCode;
        applyTranslations();

    } catch (error) {
        console.error(`Dil dosyası yüklenirken hata oluştu (${langCode}):`, error);
    }
}

// --- CROP LOGIC VARIABLES ---
let cropState = {
    imgWidth: 0,
    imgHeight: 0,
    scale: 1,
    x: 0,
    y: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};
let cropImgEl = null; // Will be assigned when DOM loads
// --- NEW: Auto-Connect Variables ---
let autoConnectTimer = null;
const AUTO_CONNECT_INTERVAL = 10000; // 10 Seconds
let isAutoConnecting = false;
let isAutoConnected = false;


if (window.electronAPI) {
    const shell = window.electronAPI.shell;
    const path = window.electronAPI.path;
    const child_process = window.electronAPI.child_process;
    // ... other codes
} else {
    console.error('Electron API not found! Make sure you are running in Electron and preload script is loaded.');
}

const TOGGLE_PRESETS = [
    { name: "--- System Audio ---", val: "" },
    { name: "System Unmute", val: "nircmd.exe mutesysvolume 1" },
    { name: "System Mute", val: "nircmd.exe mutesysvolume 0" },

    { name: "--- Application Audio ---", val: "" },
    { name: "Chrome: Mute", val: "nircmd.exe muteappvolume chrome.exe 1" },
    { name: "Chrome: Unmute", val: "nircmd.exe muteappvolume chrome.exe 0" },
    { name: "Opera: Mute", val: "nircmd.exe muteappvolume opera.exe 1" },
    { name: "Opera: Unmute", val: "nircmd.exe muteappvolume opera.exe 0" },
    { name: "Edge: Mute", val: "nircmd.exe muteappvolume msedge.exe 1" },
    { name: "Edge: Unmute", val: "nircmd.exe muteappvolume msedge.exe 0" },
    { name: "Spotify: Mute", val: "nircmd.exe muteappvolume spotify.exe 1" },
    { name: "Spotify: Unmute", val: "nircmd.exe muteappvolume spotify.exe 0" },
    { name: "Discord: Mute", val: "nircmd.exe muteappvolume discord.exe 1" },
    { name: "Discord: Unmute", val: "nircmd.exe muteappvolume discord.exe 0" },
    { name: "Firefox: Mute", val: "nircmd.exe muteappvolume firefox.exe 1" },
    { name: "Firefox: Unmute", val: "nircmd.exe muteappvolume firefox.exe 0" },

    { name: "--- Monitor / Power ---", val: "" },
    { name: "Monitor OFF", val: "nircmd.exe monitor off" },
    { name: "Monitor ON", val: "nircmd.exe monitor on" },
    { name: "Screensaver", val: "nircmd.exe screensaver" },

    { name: "--- Generic Keys ---", val: "" },
    { name: "Play/Pause (Key)", val: "AUDIO_PLAY" },
    { name: "Mute (Toggle Key)", val: "AUDIO_MUTE" }
];

const MAX_HISTORY = 10;
let historyStack = [];
let historyIndex = -1; // Index of the currently displayed configuration
let isRestoringHistory = false; // NEW: To prevent saveHistory while restoring History
let saveDebounceTimer = null;

function debounceSave() {
    clearTimeout(saveDebounceTimer);
    // Save to history as a single step
    saveDebounceTimer = setTimeout(() => {
        saveConfig(); // This function calls saveHistory()
    }, 500);
}




// 1. Cleanup Function (Stops visual loop only, does not delete data)
function clearAllActiveTimers() {
    for (const key in activePcTimers) {
        if (activePcTimers.hasOwnProperty(key)) {
            clearInterval(activePcTimers[key]);
        }
    }
    activePcTimers = {};

    if (typeof mousePosInterval !== 'undefined' && mousePosInterval) {
        clearInterval(mousePosInterval);
        mousePosInterval = null;
    }
}

// 2. New Smart Timer Function
function handlePcTimer(btnIndex, state, remainingSeconds) {
    const timerKey = `${currentPage}_${btnIndex}`; // Which button of which page?

    // Clear existing visual loop first
    if (activePcTimers[btnIndex]) {
        clearInterval(activePcTimers[btnIndex]);
        delete activePcTimers[btnIndex];
    }

    const cellDiv = document.querySelector(`.cell[data-index="${btnIndex}"]`);
    if (!cellDiv) return;
    const labelEl = cellDiv.querySelector('.label');
    if (!labelEl) return;

    // STATE 2 (RESET) or 0 (PAUSE) -> Delete from memory too
    if (state === 2 || state === 0) {
        delete activeTimerTargets[timerKey]; // No longer track

        const min = Math.floor(remainingSeconds / 60);
        const sec = remainingSeconds % 60;
        labelEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        labelEl.style.color = '';
        return;
    }

    // STATE 1 (RUN) -> Save to memory and start visual
    if (state === 1) {
        // Calculate End Time: Now + Remaining Seconds
        // Note: If already in memory and keeping time, keep it (prevents sync drift), otherwise create new.
        if (!activeTimerTargets[timerKey]) {
            activeTimerTargets[timerKey] = Date.now() + (remainingSeconds * 1000);
        }

        startVisualTimer(btnIndex, activeTimerTargets[timerKey]);
    }
}

// 3. Helper Function Starting Visual Counter
function startVisualTimer(btnIndex, targetTime) {
    const cellDiv = document.querySelector(`.cell[data-index="${btnIndex}"]`);
    if (!cellDiv) return; // Do not start if button is not on screen

    const labelEl = cellDiv.querySelector('.label');

    const updateDisplay = () => {
        // Calculate real time difference
        const now = Date.now();
        const diff = Math.ceil((targetTime - now) / 1000);

        if (diff <= 0) {
            // Time up (Visually)
            labelEl.textContent = "00:00";
            labelEl.style.color = "#ff4444";
            clearInterval(activePcTimers[btnIndex]);
            delete activePcTimers[btnIndex];
            // Note: We don't delete targetKey, it gets deleted when TIMER_DONE comes from serial or on reset.
            return;
        }

        const min = Math.floor(diff / 60);
        const sec = diff % 60;
        labelEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    updateDisplay(); // Do the first one immediately
    activePcTimers[btnIndex] = setInterval(updateDisplay, 1000); // Start loop
}


// Creates SHA-1 hash from file content
async function calculateBlobHash(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

const MANIFEST_STORAGE_KEY = 'smartDeckFileManifest';


function saveHistory() {
    if (!cfg || isRestoringHistory) return; // NEW CHECK ADDED HERE

    // Clear invalid future history (If undo was performed)
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    // Add new configuration
    const newConfig = JSON.stringify(cfg);

    // If last saved config is same, do not save again
    if (historyStack.length > 0 && historyStack[historyStack.length - 1] === newConfig) {
        return;
    }

    historyStack.push(newConfig);

    // Maintain maximum history count
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift(); // Remove oldest
    }

    historyIndex = historyStack.length - 1;
    updateUndoRedoButtons();
}


// app.js (Add to global scope or next to other helper functions)

/**
 * Executes Undo action.
 */
function undoAction() {
    if (historyIndex > 0) {
        historyIndex--;
        applyHistoryState(historyIndex);
    }
}

/**
 * Executes Redo action.
 */
function redoAction() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        applyHistoryState(historyIndex);
    }
}

/**
 * Loads a specific configuration from history stack.
 */
function applyHistoryState(index) {
    if (index >= 0 && index < historyStack.length) {
        isRestoringHistory = true; // History restore starting

        try {
            // Load config from History
            const historicalConfig = JSON.parse(historyStack[index]);

            // Replace current config with historicalConfig
            cfg = ensureDefaults(historicalConfig);

            // Redraw UI
            applyDeviceProfile(cfg.device.resolution);
            applyTheme(); // CRITICAL: This line MUST BE ADDED to apply the theme.
            renderPageBar();

            // Save to LocalStorage (won't save to history thanks to isRestoringHistory)
            saveConfig(false);

            // Update buttons
            updateUndoRedoButtons();
        } finally {
            isRestoringHistory = false; // History restore finished
        }
    }
}

/**
 * Updates status of Undo and Redo buttons.
 */
function updateUndoRedoButtons() {
    const undoBtn = el('#undoBtn');
    const redoBtn = el('#redoBtn');

    if (undoBtn) {
        // Is there a step to go back? (Must have at least 2 steps to go back 1)
        undoBtn.disabled = historyIndex <= 0;
    }
    if (redoBtn) {
        // Is there a step to go forward?
        redoBtn.disabled = historyIndex >= historyStack.length - 1;
    }
}


function openEditor(idx, btn) {
    let tmp = Object.assign({}, emptyBtn(), btn);

    // --- BRIDGE FUNCTION (For Crop) ---
    window.updateCurrentButtonIcon = (url) => {
        console.log("[Bridge] Icon received:", url);
        tmp.icon = url;
        const iconInput = document.getElementById('iconPath');
        if (iconInput) {
            const fileName = url.split(/[\\/]/).pop().split('?')[0];
            iconInput.value = fileName;
        }
        tmp.iconColor = '';
        const colorInput = document.getElementById('iconColor');
        if (colorInput) {
            colorInput.value = '#ffffff';
            colorInput.classList.add('unset');
        }
        updatePreviewEl(tmp);
    };
    // ---------------------------------------

    currentEditorTmp = tmp; // Reference global variable
    const editorDialog = el('#editor');

    // ----- LANGUAGE CHANGE HERE -----
    el('#editorTitle').textContent = t('editor.title', { cellNum: idx + 1 });
    // ---------------------------------

    const parseNum = (val) => parseInt(val, 10) || 0;

    // 2. Define Panels
    const panels = {
        key: el('#rowKeyMods'),
        goto: el('#rowGotoPages'),
        text: el('#rowTextMacro'),
        app: el('#rowApp'),
        timer: el('#rowTimer'),
        script: el('#rowScript'),
        website: el('#rowWebsite'),
        media: el('#rowMedia'),
        mouse: el('#rowMouse'),
        sound: el('#rowSound'),
        counter: el('#rowCounter'),
        toggle: el('#rowToggle')
    };

    const timerMinutes = el('#timerMinutes');
    const timerSeconds = el('#timerSeconds');
    const labelText = el('#labelText');
    const iconPathInput = el('#iconPath');

    // --- Timer List Filling ---
    const ITEM_HEIGHT = 38;
    const MANUAL_SCROLL_OFFSET = 38;
    const MAX_MIN = 99;
    const MAX_SEC = 59;
    let minCenterIndex, secCenterIndex;

    if (timerMinutes.children.length === 0) {
        const createItem = (txt = '') => {
            const div = document.createElement('div');
            div.textContent = txt;
            return div;
        };
        const fillList = (listEl, maxVal) => {
            listEl.innerHTML = '';
            listEl.appendChild(createItem());
            listEl.appendChild(createItem());
            for (let i = maxVal; i >= 1; i--) {
                listEl.appendChild(createItem(String(i).padStart(2, '0')));
            }
            listEl.appendChild(createItem("00"));
            const centerIndex = listEl.children.length - 1;
            for (let i = 1; i <= maxVal; i++) {
                listEl.appendChild(createItem(String(i).padStart(2, '0')));
            }
            listEl.appendChild(createItem());
            listEl.appendChild(createItem());
            return centerIndex;
        };
        minCenterIndex = fillList(timerMinutes, MAX_MIN);
        secCenterIndex = fillList(timerSeconds, MAX_SEC);
    } else {
        minCenterIndex = 2 + MAX_MIN;
        secCenterIndex = 2 + MAX_SEC;
    }

    let minScrollTimer = null;
    let secScrollTimer = null;
    const handleWheelScroll = (e) => {
        e.preventDefault();
        const listEl = e.currentTarget;
        const scrollAmount = (e.deltaY > 0) ? ITEM_HEIGHT : -ITEM_HEIGHT;
        listEl.scrollTo({
            top: listEl.scrollTop + scrollAmount,
            behavior: 'auto'
        });
    };
    const onScrollStop = () => {
        const minIndex = Math.round((timerMinutes.scrollTop - MANUAL_SCROLL_OFFSET) / ITEM_HEIGHT) + 2;
        const secIndex = Math.round((timerSeconds.scrollTop - MANUAL_SCROLL_OFFSET) / ITEM_HEIGHT) + 2;
        const minSnapTop = (minIndex - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        const secSnapTop = (secIndex - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        if (timerMinutes.scrollTop !== minSnapTop) {
            timerMinutes.scrollTo({ top: minSnapTop, behavior: 'instant' });
        }
        if (timerSeconds.scrollTop !== secSnapTop) {
            timerSeconds.scrollTo({ top: secSnapTop, behavior: 'instant' });
        }
        const minVal = Math.min(MAX_MIN, Math.abs(minIndex - minCenterIndex));
        const secVal = Math.min(MAX_SEC, Math.abs(secIndex - secCenterIndex));
        tmp.timerDuration = (minVal * 60) + secVal;
        const formattedTime = `${String(minVal).padStart(2, '0')}:${String(secVal).padStart(2, '0')}`;
        labelText.value = formattedTime;
        tmp.label = formattedTime;
        updatePreviewEl(tmp);
    };
    const setTimerScrollPosition = (totalSeconds) => {
        const currentMinutes = Math.floor(totalSeconds / 60);
        const currentSeconds = totalSeconds % 60;
        const minTop = (minCenterIndex + currentMinutes - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        const secTop = (secCenterIndex + currentSeconds - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        const formattedTime = `${String(currentMinutes).padStart(2, '0')}:${String(currentSeconds).padStart(2, '0')}`;
        labelText.value = formattedTime;
        tmp.label = formattedTime;
        setTimeout(() => {
            timerMinutes.scrollTo({ top: minTop, behavior: 'instant' });
            timerSeconds.scrollTo({ top: secTop, behavior: 'instant' });
        }, 50);
    };

    let mousePosInterval = null;

    // 3. Main Action Change Function
    function showActionPanel(actionType) {
        // Timer Cleanup
        if (tmp.type === 'timer' && actionType !== 'timer') {
            tmp.label = ""; labelText.value = ""; updatePreviewEl(tmp);
        }
        if (actionType === 'timer' && tmp.type !== 'timer') {
            tmp.timerDuration = 0; tmp.label = "00:00";
        }

        // Counter Cleanup
        if (tmp.type === 'counter' && actionType !== 'counter') {
            tmp.label = ""; labelText.value = "";
            tmp.icon = ""; iconPathInput.value = "";
            tmp.counterStartValue = 0; el('#counterStartValue').value = 0;
            updatePreviewEl(tmp);
        }
        if (actionType === 'counter' && tmp.type !== 'counter') {
            const defaultIconPath = 'online:akar-icons:circle';
            if (!tmp.icon) {
                iconPathInput.value = defaultIconPath;
                tmp.icon = defaultIconPath;
                iconPathInput.dispatchEvent(new Event('input'));
            }
            el('#counterStartValue').value = 0; tmp.counterStartValue = 0;
            labelText.value = "0"; tmp.label = "0";
            updatePreviewEl(tmp);
        }

        tmp.type = actionType;
        for (const [key, panel] of Object.entries(panels)) {
            if (panel) panel.style.display = (key === actionType) ? 'flex' : 'none';
        }
        document.querySelectorAll('.seg-btn[data-act]').forEach(b => {
            b.classList.toggle('active', b.dataset.act === actionType);
        });
        labelText.readOnly = (actionType === 'timer');

        clearInterval(mousePosInterval);
        const mousePosEl = el('#mouseRealtimePos');
        if (actionType === 'mouse') {
            mousePosInterval = setInterval(async () => {
                if (window.electronAPI && window.electronAPI.robot) {
                    const pos = await window.electronAPI.robot.getMousePos();
                    if (pos.success) {
                        mousePosEl.textContent = `Current: X: ${pos.x}, Y: ${pos.y}`;
                    }
                }
            }, 100);
        }

        if (actionType === 'timer') {
            setTimerScrollPosition(tmp.timerDuration);
            timerMinutes.onscroll = () => { clearTimeout(minScrollTimer); minScrollTimer = setTimeout(onScrollStop, 150); };
            timerSeconds.onscroll = () => { clearTimeout(secScrollTimer); secScrollTimer = setTimeout(onScrollStop, 150); };
            timerMinutes.onwheel = handleWheelScroll;
            timerSeconds.onwheel = handleWheelScroll;
        } else {
            timerMinutes.onscroll = null; timerSeconds.onscroll = null;
            timerMinutes.onwheel = null; timerSeconds.onwheel = null;
        }
    }

    // --- Form Listeners ---
    const inlineResults = el('#inlineIconResults');
    const iconColorInput = el('#iconColor');
    let editorSearchTimer = null;

    // Main Icon Search
    iconPathInput.oninput = () => {
        const val = iconPathInput.value;
        tmp.icon = val;
        if (val.startsWith('online:') && val.split(':').length >= 3) {
            autoSetIconColor(val, tmp, iconColorInput);
        }
        updatePreviewEl(tmp);
        clearTimeout(editorSearchTimer);
        editorSearchTimer = setTimeout(() => {
            searchOnlineInline(val, inlineResults, iconPathInput, () => {
                tmp.icon = iconPathInput.value;
                autoSetIconColor(tmp.icon, tmp, iconColorInput);
                updatePreviewEl(tmp);
            });
        }, 300);
    };

    // Standard form elements
    const rawIcon = tmp.icon || '';
    if (rawIcon.startsWith('file:')) {
        iconPathInput.value = rawIcon.split(/[\\/]/).pop().split('?')[0];
    } else {
        iconPathInput.value = rawIcon;
    }
    labelText.value = tmp.label || '';
    el('#labelColor').value = tmp.labelColor || '#ffffff';


    const btnBgColorInput = el('#btnBgColor');
    if (tmp.btnBgColor) {
        btnBgColorInput.value = tmp.btnBgColor;
        btnBgColorInput.classList.remove('unset');
    } else {
        btnBgColorInput.value = '#000000';
        btnBgColorInput.classList.add('unset');
    }
    if (tmp.iconColor) {
        iconColorInput.value = tmp.iconColor;
        iconColorInput.classList.remove('unset');
    } else {
        iconColorInput.value = '#ffffff';
        iconColorInput.classList.add('unset');
    }
    const safeSize = Math.min(Math.max(10, tmp.labelSize || 18), 28);
    el('#labelSizeRange').value = safeSize;
    el('#labelSize').value = safeSize;
    const safeScale = Math.min(Math.max(-100, tmp.iconScale || 0), 100);
    el('#iconScale').value = safeScale;
    el('#iconScaleRange').value = safeScale;

    // Slider/Input Listeners
    el('#iconScaleRange').oninput = () => { el('#iconScale').value = el('#iconScaleRange').value; tmp.iconScale = Number(el('#iconScaleRange').value); updatePreviewEl(tmp); };
    el('#iconScale').oninput = () => { let val = Math.min(Math.max(-100, Number(el('#iconScale').value)), 100); if (isNaN(val)) val = 0; el('#iconScale').value = val; el('#iconScaleRange').value = val; tmp.iconScale = val; updatePreviewEl(tmp); };

    document.querySelectorAll('[data-val]').forEach(b => { b.classList.toggle('active', b.dataset.val === tmp.labelV); b.onclick = () => { document.querySelectorAll('[data-val]').forEach(x => x.classList.remove('active')); b.classList.add('active'); tmp.labelV = b.dataset.val; updatePreviewEl(tmp); }; });
    document.querySelectorAll('.seg-btn[data-act]').forEach(b => { b.onclick = () => showActionPanel(b.dataset.act); });

    // Show initial panel
    showActionPanel(tmp.type || null);

    labelText.oninput = () => { tmp.label = labelText.value; updatePreviewEl(tmp); };
    el('#labelColor').oninput = () => { tmp.labelColor = el('#labelColor').value; updatePreviewEl(tmp); };
    el('#labelColorClear').onclick = () => { el('#labelColor').value = '#ffffff'; tmp.labelColor = ''; updatePreviewEl(tmp); };
    el('#labelSizeRange').oninput = () => { el('#labelSize').value = el('#labelSizeRange').value; tmp.labelSize = Number(el('#labelSize').value); updatePreviewEl(tmp); };
    el('#labelSize').oninput = () => { el('#labelSizeRange').value = el('#labelSize').value; tmp.labelSize = Number(el('#labelSize').value); updatePreviewEl(tmp); };
    btnBgColorInput.oninput = () => { tmp.btnBgColor = btnBgColorInput.value; btnBgColorInput.classList.remove('unset'); updatePreviewEl(tmp); };
    el('#btnBgColorClear').onclick = () => { tmp.btnBgColor = ''; btnBgColorInput.value = '#000000'; btnBgColorInput.classList.add('unset'); updatePreviewEl(tmp); };
    iconColorInput.oninput = () => { tmp.iconColor = iconColorInput.value; iconColorInput.classList.remove('unset'); updatePreviewEl(tmp); };
    el('#iconColorClear').onclick = () => { tmp.iconColor = ''; iconColorInput.value = '#ffffff'; iconColorInput.classList.add('unset'); updatePreviewEl(tmp); };

    const combo = el('#combo');
    combo.value = tmp.combo || '';
    combo.readOnly = false;
    const addKeyToCombo = (key) => { const cv = combo.value.trim(); if (cv.length === 0) { combo.value = key; } else if (cv.endsWith('+')) { combo.value += key; } else { combo.value += '+' + key; } combo.focus(); };
    document.querySelectorAll('.mod[data-mod]').forEach(b => { b.onclick = () => addKeyToCombo(b.dataset.mod); });
    el('#addEnterKey').onclick = () => addKeyToCombo('ENTER');

    let isCapturing = false;
    const captureBtn = el('#captureToggle');
    captureBtn.style.display = 'inline-block';

    function stopCapture() {
        if (!isCapturing) return;
        isCapturing = false;
        captureBtn.textContent = 'Capture';
        captureBtn.classList.remove('capturing');
        editorDialog.onkeydown = null;
    }

    captureBtn.onclick = () => {
        if (isCapturing) { stopCapture(); } else {
            isCapturing = true; captureBtn.textContent = 'Listening... (ESC)'; captureBtn.classList.add('capturing'); combo.value = 'Press keys...';
            editorDialog.focus();
            editorDialog.onkeydown = (e) => {
                e.preventDefault(); e.stopPropagation(); const key = e.key.toUpperCase();
                if (key === 'ESCAPE') { combo.value = tmp.combo || ''; stopCapture(); return; }
                if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') { let tempCombo = ''; if (e.ctrlKey) tempCombo += 'CTRL+'; if (e.altKey) tempCombo += 'ALT+'; if (e.shiftKey) tempCombo += 'SHIFT+'; if (e.metaKey) tempCombo += 'GUI+'; combo.value = tempCombo; return; }
                let comboStr = ''; if (e.ctrlKey) comboStr += 'CTRL+'; if (e.altKey) comboStr += 'ALT+'; if (e.shiftKey) comboStr += 'SHIFT+'; if (e.metaKey) tempCombo += 'GUI+';
                if (key === ' ') comboStr += 'SPACE';
                else if (key.length === 1) comboStr += key;
                else comboStr += key;
                combo.value = comboStr; stopCapture();
            };
        }
    };

    // --- TOGGLE BUTTON LOGIC (COMPACT & WITH PRESETS) ---
    const toggleOffInput = el('#toggleOffCombo');
    const toggleOnInput = el('#toggleOnCombo');
    const toggleColorInput = el('#toggleOnColor');         // Active BG Color
    const toggleIconColorInput = el('#toggleOnIconColor'); // NEW: Active Icon Color

    const toggleOnIconInput = el('#toggleOnIconPath');
    const toggleOnIconResults = el('#toggleOnIconResults');
    const toggleOnIconPreview = el('#toggleOnIconPreview');
    const toggleOnIconBox = el('#toggleOnIconPreviewBox');
    const toggleSoundCheckbox = el('#toggleUseDefaultSound');

    // NEW: Preset Dropdowns
    const toggleOffPreset = el('#toggleOffPreset');
    const toggleOnPreset = el('#toggleOnPreset');

    // Load Data
    tmp.toggleData = tmp.toggleData || { offCombo: '', onCombo: '', onColor: '#2ecc71', iconOn: '', useSound: false };

    toggleOffInput.value = tmp.toggleData.offCombo || '';
    toggleOnInput.value = tmp.toggleData.onCombo || '';
    toggleColorInput.value = tmp.toggleData.onColor || '#2ecc71';
    toggleIconColorInput.value = tmp.toggleData.onIconColor || '#ffffff';
    toggleOnIconInput.value = tmp.toggleData.iconOn || '';
    toggleSoundCheckbox.checked = tmp.toggleData.useSound || false;



    const fillPresets = (selectEl, targetInput) => {
        selectEl.innerHTML = '<option value="">Presets...</option>';
        TOGGLE_PRESETS.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.val;
            opt.textContent = p.name;
            if (p.val === "") {
                opt.disabled = true; // Disable header line
                opt.style.fontWeight = "bold";
                opt.style.color = "#aaa";
            }
            selectEl.appendChild(opt);
        });
        // Write to input when selection is made
        selectEl.onchange = () => {
            if (selectEl.value) {
                targetInput.value = selectEl.value;
                // Update state (based on Off or On input)
                if (targetInput === toggleOffInput) tmp.toggleData.offCombo = selectEl.value;
                else tmp.toggleData.onCombo = selectEl.value;
                selectEl.value = ""; // Reset selection
            }
        };
    };

    fillPresets(toggleOffPreset, toggleOffInput);
    fillPresets(toggleOnPreset, toggleOnInput);
    // ---------------------------------------

    // NEW: State B Icon Preview Function
    const updateToggleOnPreview = () => {
        const val = toggleOnIconInput.value;
        tmp.toggleData.iconOn = val;

        // 1. Set box background color (Active BG Color)
        toggleOnIconBox.style.backgroundColor = toggleColorInput.value;

        const url = getIconUrl(val);
        if (url) {
            toggleOnIconPreview.style.display = 'block';

            // 2. Set icon color (Active Icon Color)
            const activeIconColor = toggleIconColorInput.value;

            // Cleanup
            toggleOnIconPreview.style.backgroundImage = 'none';
            toggleOnIconPreview.style.webkitMaskImage = 'none';
            toggleOnIconPreview.style.maskImage = 'none';
            toggleOnIconPreview.style.backgroundColor = 'transparent';

            // Masking (Coloring) Logic
            if (activeIconColor && !url.startsWith('data:')) {
                toggleOnIconPreview.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Transparent
                toggleOnIconPreview.style.backgroundColor = activeIconColor; // Color the icon with this color
                toggleOnIconPreview.style.webkitMaskImage = `url("${url}")`;
                toggleOnIconPreview.style.maskImage = `url("${url}")`;
                toggleOnIconPreview.style.webkitMaskSize = 'contain';
                toggleOnIconPreview.style.maskSize = 'contain';
                toggleOnIconPreview.style.webkitMaskPosition = 'center';
                toggleOnIconPreview.style.maskPosition = 'center';
                toggleOnIconPreview.style.webkitMaskRepeat = 'no-repeat';
                toggleOnIconPreview.style.maskRepeat = 'no-repeat';
            } else {
                // Normal Mode (Colorless or local image)
                toggleOnIconPreview.src = url;
            }
        } else {
            toggleOnIconPreview.style.display = 'none';
            toggleOnIconPreview.src = '';
        }
    };
    updateToggleOnPreview();

    // Listeners
    toggleColorInput.oninput = () => {
        tmp.toggleData.onColor = toggleColorInput.value;
        updateToggleOnPreview(); // Update small box
    };

    toggleIconColorInput.oninput = () => {
        tmp.toggleData.onIconColor = toggleIconColorInput.value;
        updateToggleOnPreview(); // Update icon color
    };

    toggleSoundCheckbox.onchange = () => {
        tmp.toggleData.useSound = toggleSoundCheckbox.checked;
    };

    let toggleSearchTimer = null;
    toggleOnIconInput.oninput = () => {
        updateToggleOnPreview();
        clearTimeout(toggleSearchTimer);
        toggleSearchTimer = setTimeout(() => {
            searchOnlineInline(toggleOnIconInput.value, toggleOnIconResults, toggleOnIconInput, () => {
                tmp.toggleData.iconOn = toggleOnIconInput.value;
                updateToggleOnPreview();
            });
        }, 300);
    };

    // Click outside
    editorDialog.onclick = (e) => {
        if (inlineResults.style.display !== 'none' && !iconPathInput.contains(e.target) && !inlineResults.contains(e.target)) {
            inlineResults.style.display = 'none';
        }
        if (toggleOnIconResults.style.display !== 'none' && !toggleOnIconInput.contains(e.target) && !toggleOnIconResults.contains(e.target)) {
            toggleOnIconResults.style.display = 'none';
        }
    };

    // Capture Logic (Same)
    let activeCaptureTarget = null;
    const startToggleCapture = (targetId) => {
        if (isCapturing) stopCapture();
        const targetInput = el('#' + targetId);
        activeCaptureTarget = targetInput;
        isCapturing = true;
        captureBtn.textContent = 'Listening... (ESC)';
        captureBtn.classList.add('capturing');
        targetInput.classList.add('capturing-input');
        targetInput.value = 'Press keys...';

        editorDialog.focus();
        editorDialog.onkeydown = (e) => {
            e.preventDefault(); e.stopPropagation();
            const key = e.key.toUpperCase();
            if (key === 'ESCAPE') {
                targetInput.value = (targetId === 'toggleOffCombo' ? tmp.toggleData.offCombo : tmp.toggleData.onCombo);
                stopToggleCapture(); return;
            }
            let comboStr = '';
            if (e.ctrlKey) comboStr += 'CTRL+'; if (e.altKey) comboStr += 'ALT+'; if (e.shiftKey) comboStr += 'SHIFT+'; if (e.metaKey) comboStr += 'GUI+';
            if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') { targetInput.value = comboStr; return; }
            if (key === ' ') comboStr += 'SPACE';
            else if (key.length === 1) comboStr += key;
            else comboStr += key;

            targetInput.value = comboStr;
            if (targetId === 'toggleOffCombo') tmp.toggleData.offCombo = comboStr;
            else tmp.toggleData.onCombo = comboStr;
            stopToggleCapture();
        };
    };

    const stopToggleCapture = () => {
        if (activeCaptureTarget) activeCaptureTarget.classList.remove('capturing-input');
        activeCaptureTarget = null;
        isCapturing = false;
        captureBtn.textContent = 'Capture';
        captureBtn.classList.remove('capturing');
        editorDialog.onkeydown = null;
    };

    document.querySelectorAll('.small-capture-btn').forEach(btn => btn.onclick = () => startToggleCapture(btn.dataset.target));
    document.querySelectorAll('.small-clear-btn').forEach(btn => btn.onclick = () => {
        const id = btn.dataset.target;
        el('#' + id).value = '';
        if (id === 'toggleOffCombo') tmp.toggleData.offCombo = '';
        else tmp.toggleData.onCombo = '';
    });
    // --- TOGGLE LOGIC END ---


    const presetActionsSelect = el('#presetActionsSelect');
    if (presetActionsSelect.options.length <= 1) {
        for (const [category, actions] of Object.entries(PRESET_ACTIONS)) {
            if (typeof actions === 'object') {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                for (const [name, comboVal] of Object.entries(actions)) {
                    const option = document.createElement('option');
                    option.value = comboVal;
                    option.textContent = name;
                    optgroup.appendChild(option);
                }
                presetActionsSelect.appendChild(optgroup);
            } else {
                const option = document.createElement('option');
                option.value = actions;
                option.textContent = category;
                presetActionsSelect.appendChild(option);
            }
        }
    }
    presetActionsSelect.value = "";
    presetActionsSelect.onchange = () => {
        const selectedCombo = presetActionsSelect.value;
        if (selectedCombo) {
            combo.value = selectedCombo;
            tmp.combo = selectedCombo;
            presetActionsSelect.selectedIndex = 0;
        }
    };

    const pageChooser = el('#gotoPages');
    pageChooser.innerHTML = '';
    for (let i = 0; i < cfg.pageCount; i++) { const b = document.createElement('button'); b.type = 'button'; b.className = 'page-pill'; const pageName = cfg.pageNames[i]; b.textContent = (pageName || `Page ${i + 1}`); b.classList.toggle('active', i === tmp.gotoPage); b.onclick = () => { tmp.gotoPage = i; pageChooser.querySelectorAll('.page-pill').forEach(pb => pb.classList.remove('active')); b.classList.add('active'); }; pageChooser.appendChild(b); }

    el('#textMacro').value = tmp.textMacro || '';
    el('#textMacro').oninput = () => { tmp.textMacro = el('#textMacro').value; };

    const textMacroInput = el('#textMacro');
    const simulateCheckbox = el('#simulateTypingCheckbox');
    textMacroInput.value = tmp.textMacro || '';
    simulateCheckbox.checked = tmp.textSimulateTyping || false;
    textMacroInput.oninput = () => { tmp.textMacro = textMacroInput.value; };
    simulateCheckbox.onchange = () => { tmp.textSimulateTyping = simulateCheckbox.checked; };

    const customScriptText = el('#customScript');
    customScriptText.value = tmp.customScript || '';
    customScriptText.oninput = () => { tmp.customScript = customScriptText.value; };

    el('#websiteUrl').value = tmp.websiteUrl || '';
    el('#websiteUrl').oninput = () => { tmp.websiteUrl = el('#websiteUrl').value; };

    const mediaButtons = el('#rowMedia').querySelectorAll('.seg-btn[data-media]');
    mediaButtons.forEach(b => {
        b.classList.toggle('active', b.dataset.media === tmp.mediaAction);
        b.onclick = () => {
            mediaButtons.forEach(other => other.classList.remove('active'));
            b.classList.add('active');
            tmp.mediaAction = b.dataset.media;
        };
    });

    const soundPathInput = el('#soundPath');
    const soundVolumeInput = el('#soundVolume');
    const soundVolLabel = el('#soundVolLabel');
    const hiddenSoundInput = el('#hiddenSoundInput');

    soundPathInput.value = tmp.soundPath || '';
    soundVolumeInput.value = (tmp.soundVolume !== undefined) ? tmp.soundVolume : 100;
    soundVolLabel.textContent = soundVolumeInput.value + '%';
    el('#browseSoundBtn').onclick = () => {
        hiddenSoundInput.value = null;
        hiddenSoundInput.onchange = (e) => { const file = e.target.files[0]; if (file && file.path) { tmp.soundPath = file.path; soundPathInput.value = file.path; } };
        hiddenSoundInput.click();
    };
    soundVolumeInput.oninput = () => { tmp.soundVolume = Number(soundVolumeInput.value); soundVolLabel.textContent = tmp.soundVolume + '%'; };

    const presetScriptSelect = el('#presetScriptSelect');
    if (presetScriptSelect.options.length <= 1) {
        for (const [category, actions] of Object.entries(PRESET_SCRIPTS)) {
            if (typeof actions === 'object') {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                for (const [name, script] of Object.entries(actions)) {
                    const option = document.createElement('option');
                    option.value = script;
                    option.textContent = name;
                    optgroup.appendChild(option);
                }
                presetScriptSelect.appendChild(optgroup);
            } else {
                const option = document.createElement('option');
                option.value = actions;
                option.textContent = category;
                presetScriptSelect.appendChild(option);
            }
        }
    }
    presetScriptSelect.value = "";
    presetScriptSelect.onchange = () => { const selectedScript = presetScriptSelect.value; if (selectedScript) { const currentText = customScriptText.value; const newText = (currentText ? currentText + '\n' : '') + selectedScript; customScriptText.value = newText; tmp.customScript = newText; presetScriptSelect.selectedIndex = 0; } };

    const mouseEventSelect = el('#mouseEventSelect');
    const mouseButtonSelectDiv = el('#mouseButtonSelectDiv');
    const mouseButtonSelect = el('#mouseButtonSelect');
    const mouseMoveOptions = el('#mouseMoveOptions');
    const mouseDragOptions = el('#mouseDragOptions');
    const mouseX1 = el('#mouseX1');
    const mouseY1 = el('#mouseY1');
    const mouseDragX1 = el('#mouseDragX1');
    const mouseDragY1 = el('#mouseDragY1');
    const mouseDragX2 = el('#mouseDragX2');
    const mouseDragY2 = el('#mouseDragY2');

    const mCfg = tmp.mouseConfig || emptyBtn().mouseConfig;
    mouseEventSelect.value = mCfg.event;
    mouseButtonSelect.value = mCfg.button;
    mouseX1.value = mCfg.x1;
    mouseY1.value = mCfg.y1;
    mouseDragX1.value = mCfg.x1;
    mouseDragY1.value = mCfg.y1;
    mouseDragX2.value = mCfg.x2;
    mouseDragY2.value = mCfg.y2;

    const updateMousePanels = () => {
        const event = mouseEventSelect.value;
        mouseMoveOptions.classList.toggle('active', event === 'click' || event === 'double_click' || event === 'move');
        mouseDragOptions.classList.toggle('active', event === 'drag');
        mouseButtonSelectDiv.style.display = (event === 'click' || event === 'double_click' || event === 'drag') ? 'block' : 'none';
        tmp.mouseConfig.event = event;
    };
    updateMousePanels();

    mouseEventSelect.onchange = updateMousePanels;
    mouseButtonSelect.onchange = () => tmp.mouseConfig.button = mouseButtonSelect.value;
    mouseX1.oninput = () => tmp.mouseConfig.x1 = parseNum(mouseX1.value);
    mouseY1.oninput = () => tmp.mouseConfig.y1 = parseNum(mouseY1.value);
    mouseDragX1.oninput = () => tmp.mouseConfig.x1 = parseNum(mouseDragX1.value);
    mouseDragY1.oninput = () => tmp.mouseConfig.y1 = parseNum(mouseDragY1.value);
    mouseDragX2.oninput = () => tmp.mouseConfig.x2 = parseNum(mouseDragX2.value);
    mouseDragY2.oninput = () => tmp.mouseConfig.y2 = parseNum(mouseDragY2.value);

    const counterStartInput = el('#counterStartValue');
    const counterActionSeg = el('#counterActionSeg');
    counterStartInput.value = tmp.counterStartValue || 0;
    counterStartInput.oninput = () => {
        const newVal = parseNum(counterStartInput.value);
        tmp.counterStartValue = newVal;
        const labelInput = el('#labelText');
        labelInput.value = String(newVal);
        tmp.label = String(newVal);
        updatePreviewEl(tmp);
        counterStartInput.value = newVal;
    };
    const defaultAction = tmp.counterAction || 'increment';
    counterActionSeg.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.val === defaultAction);
        b.onclick = () => {
            counterActionSeg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            tmp.counterAction = b.dataset.val;
        };
    });

    const mouseCapture = async (xInput, yInput) => {
        if (!window.electronAPI || !window.electronAPI.robot) return;
        await window.electronAPI.robot.enterCaptureMode();
        document.body.classList.add('in-capture-mode');
        const captureClickListener = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.removeEventListener('click', captureClickListener, { capture: true });
            document.body.classList.remove('in-capture-mode');
            const pos = await window.electronAPI.robot.getMousePos();
            await window.electronAPI.robot.exitCaptureMode();
            if (pos.success) {
                xInput.value = pos.x;
                yInput.value = pos.y;
                xInput.dispatchEvent(new Event('input'));
                yInput.dispatchEvent(new Event('input'));
            }
        };
        document.addEventListener('click', captureClickListener, { capture: true, once: true });
    };

    el('#mouseCaptureBtnStart').onclick = () => mouseCapture(mouseX1, mouseY1);
    el('#mouseCaptureBtnDragStart').onclick = () => mouseCapture(mouseDragX1, mouseDragY1);
    el('#mouseCaptureBtnDragEnd').onclick = () => mouseCapture(mouseDragX2, mouseDragY2);

    const appPathInput = el('#appPath');
    const hiddenAppInput = el('#hiddenAppInput');
    const appQuickSelect = el('#appQuickSelect');
    appPathInput.value = tmp.appPath || '';
    loadInstalledApps();
    appQuickSelect.onchange = () => { if (appQuickSelect.value) { appPathInput.value = appQuickSelect.value; tmp.appPath = appQuickSelect.value; } };
    appPathInput.oninput = () => { tmp.appPath = appPathInput.value; };
    el('#browseAppBtn').onclick = () => { hiddenAppInput.value = null; hiddenAppInput.click(); };
    hiddenAppInput.onchange = (e) => { const file = e.target.files[0]; if (file && file.path) { tmp.appPath = file.path; appPathInput.value = file.path; appQuickSelect.value = ""; } };

    const closeEditor = () => {
        stopCapture();
        stopToggleCapture();
        clearInterval(mousePosInterval);
        inlineResults.style.display = 'none';
        editorDialog.close();
    };

    el('#clearBtn').onclick = () => {
        tmp = emptyBtn();
        iconPathInput.value = ''; inlineResults.style.display = 'none'; labelText.value = ''; el('#labelColor').value = '#ffffff'; btnBgColorInput.value = '#000000'; btnBgColorInput.classList.add('unset'); iconColorInput.value = '#ffffff'; iconColorInput.classList.add('unset'); el('#labelSizeRange').value = 18; el('#labelSize').value = 18; el('#iconScale').value = 0; el('#iconScaleRange').value = 0; document.querySelectorAll('[data-val]').forEach(b => { b.classList.toggle('active', b.dataset.val === 'middle'); });
        showActionPanel(null);
        el('#combo').value = ''; pageChooser.querySelectorAll('.page-pill').forEach(pb => pb.classList.remove('active')); el('#textMacro').value = ''; appPathInput.value = ''; appQuickSelect.value = '';

        el('#customScript').value = '';
        el('#websiteUrl').value = '';
        mediaButtons.forEach(b => b.classList.remove('active'));
        presetActionsSelect.value = "";
        presetScriptSelect.value = "";

        mouseEventSelect.value = 'click';
        mouseButtonSelect.value = 'left';
        mouseX1.value = 0; mouseY1.value = 0;
        mouseDragX1.value = 0; mouseDragY1.value = 0;
        mouseDragX2.value = 0; mouseDragY2.value = 0;
        updateMousePanels();

        counterStartInput.value = 0;
        counterActionSeg.querySelectorAll('.seg-btn').forEach(b => { b.classList.remove('active'); });
        counterActionSeg.querySelector('[data-val="increment"]').classList.add('active');

        // Toggle Reset
        toggleOffInput.value = '';
        toggleOnInput.value = '';
        toggleColorInput.value = '#2ecc71';
        toggleOnIconInput.value = '';
        toggleIconColorInput.value = '#ffffff';
        toggleSoundCheckbox.checked = false;
        updateToggleOnPreview();

        const minTop = (minCenterIndex - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        const secTop = (secCenterIndex - 2) * ITEM_HEIGHT + MANUAL_SCROLL_OFFSET;
        timerMinutes.scrollTo({ top: minTop, behavior: 'instant' });
        timerSeconds.scrollTo({ top: secTop, behavior: 'instant' });
        labelText.value = "00:00";
        tmp.label = "00:00";

        updatePreviewEl(tmp);
    };

    el('#cancel').onclick = closeEditor;
    el('#editorCloseBtn').onclick = closeEditor;

    el('#copyBtn').onclick = () => { clipboardButton = Object.assign({}, tmp, { combo: combo.value }); el('#pasteBtn').classList.add('primary'); el('#pasteBtn').disabled = false; };
    el('#pasteBtn').onclick = () => { if (!clipboardButton) { alert("Clipboard empty."); return; } closeEditor(); openEditor(idx, clipboardButton); };
    el('#pasteBtn').classList.toggle('primary', !!clipboardButton);
    el('#pasteBtn').disabled = !clipboardButton;

    el('#apply').onclick = (e) => {
        e.preventDefault();
        const finalCombo = combo.value;

        if (tmp.type === 'timer') {
            const minIndex = Math.round((timerMinutes.scrollTop - MANUAL_SCROLL_OFFSET) / ITEM_HEIGHT) + 2;
            const secIndex = Math.round((timerSeconds.scrollTop - MANUAL_SCROLL_OFFSET) / ITEM_HEIGHT) + 2;
            const minVal = Math.min(MAX_MIN, Math.abs(minIndex - minCenterIndex));
            const secVal = Math.min(MAX_SEC, Math.abs(secIndex - secCenterIndex));
            tmp.timerDuration = (minVal * 60) + secVal;
            tmp.label = `${String(minVal).padStart(2, '0')}:${String(secVal).padStart(2, '0')}`;
        }

        cfg.pages[currentPage][idx] = Object.assign(emptyBtn(), tmp, {
            combo: finalCombo,
            timerDuration: tmp.timerDuration,
            label: tmp.label,
            customScript: tmp.customScript,
            websiteUrl: tmp.websiteUrl,
            mediaAction: tmp.mediaAction,
            mouseConfig: tmp.mouseConfig,
            counterStartValue: tmp.counterStartValue,
            counterAction: tmp.counterAction,
            // Save Toggle Data
            toggleData: tmp.toggleData,
            toggleState: tmp.toggleState // State preserved
        });

        drawGrid();
        closeEditor();
        saveConfig();
    };

    updatePreviewEl(tmp);
    editorDialog.showModal();
}

// app.js (dosyanın üst kısımları)

// ...

// UPDATED: Preset Actions List
const PRESET_ACTIONS = {
    "--- Select Preset ---": "",
    "Editing": { // From Screenshot_24.png
        "Cut": "CTRL+X",
        "Copy": "CTRL+C",
        "Paste": "CTRL+V",
        "Undo": "CTRL+Z",
        "Redo": "CTRL+Y",
        "Save": "CTRL+S",
        "Find": "CTRL+F", // NEWLY ADDED
        "Select All": "CTRL+A",
        "Print": "CTRL+P"
    },
    "Window Management": {
        "Switch App (Forward)": "ALT+TAB",
        "Switch App (Backward)": "ALT+SHIFT+TAB",
        "Snap Window Left": "GUI+LEFT",
        "Snap Window Right": "GUI+RIGHT",
        "Minimize Window": "GUI+DOWN",
        "Maximize Window": "GUI+UP",
        "Minimize all Windows": "GUI+M",
        "Restore all Windows": "GUI+SHIFT+M"
    },
    "Virtual Desktops (Win)": { // NEW CATEGORY
        "New Desktop": "CTRL+GUI+D",
        "Switch to Next Desktop": "CTRL+GUI+RIGHT",
        "Switch to Prev Desktop": "CTRL+GUI+LEFT",
        "Close Current Desktop": "CTRL+GUI+F4"
    },
    "General (Windows)": {
        "Open File Explorer": "GUI+E",
        "Open Settings": "GUI+I",
        "Open Run dialog": "GUI+R",
        "Open Task Manager": "CTRL+SHIFT+ESC",
        // "Lock Screen": "GUI+L", // REMOVED (Not working)
        "Emoji Picker": "GUI+.",
        "Clipboard History": "GUI+V", // NEWLY ADDED
        "Connect (Project) Menu": "GUI+K" // NEWLY ADDED
    },
    "Screenshots": {
        "Snip & Sketch": "GUI+SHIFT+S",
        "Screenshot (to clipboard)": "PRINT_SCREEN",
        "Screenshot (save to file)": "GUI+PRINT_SCREEN",
        "Open Game Bar (Capture)": "GUI+G"
    },
    "Browser / Tabs": {
        "New Tab": "CTRL+T",
        "Close Tab": "CTRL+W",
        "Re-open Closed Tab": "CTRL+SHIFT+T",
        "Next Tab": "CTRL+TAB",
        "Previous Tab": "CTRL+SHIFT+TAB",
        "New Window": "CTRL+N" // NEWLY ADDED
    }
};


// app.js (dosyanın üst kısımları)

// ... (PRESET_ACTIONS sabitinden sonra) ...

// app.js (dosyanın üst kısımları)

// ... (PRESET_ACTIONS sabitinden sonra) ...

// UPDATED: Preset Scripts List
const PRESET_SCRIPTS = {
    "--- Select Preset Script ---": "",
    "Task Management": {
        "Kill Chrome": "taskkill /f /im chrome.exe",
        "Kill Spotify": "taskkill /f /im Spotify.exe",
        "Kill Teams": "taskkill /f /im msteams.exe",
        "Kill Discord": "taskkill /f /im Discord.exe", // NEWLY ADDED
        "Open Task Manager": "taskmgr"
    },
    "System Tools": {
        "Open Notepad": "notepad",
        "Open Calculator": "calc",
        "Open Control Panel": "control",
        "Open Command Prompt": "cmd", // NEWLY ADDED
        "Open Explorer": "explorer", // NEWLY ADDED
        "Open Snipping Tool": "snippingtool" // NEWLY ADDED
    },
    "Audio Control (Requires NirCmd)": {
        "Mute System": "nircmd.exe mutesysvolume 1",
        "Unmute System": "nircmd.exe mutesysvolume 0",
        "Toggle Mute System": "nircmd.exe mutesysvolume 2",
        "Volume Up (+10%)": "nircmd.exe changesysvolume 6553", // NEWLY ADDED
        "Volume Down (-10%)": "nircmd.exe changesysvolume -6553", // NEWLY ADDED
        "Set System Volume to 50%": "nircmd.exe setsysvolume 32768",
        "--- App Specific Audio (NirCmd) ---": "", // NEW CATEGORY
        "Mute Chrome": "nircmd.exe setappvolume chrome.exe 0",
        "Unmute Chrome": "nircmd.exe setappvolume chrome.exe 1",
        "Toggle Mute Chrome": "nircmd.exe setappvolume chrome.exe 2", // NEWLY ADDED
        "Mute Spotify": "nircmd.exe setappvolume spotify.exe 0", // NEWLY ADDED
        "Unmute Spotify": "nircmd.exe setappvolume spotify.exe 1", // NEWLY ADDED
        "Mute Discord": "nircmd.exe setappvolume discord.exe 0", // NEWLY ADDED
        "Unmute Discord": "nircmd.exe setappvolume discord.exe 1" // NEWLY ADDED
    },
    "Power Options": {
        "Sleep": "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
        "Restart PC (Force)": "shutdown /r /f /t 0", // NEWLY ADDED
        "Shutdown PC (Force)": "shutdown /s /f /t 0", // NEWLY ADDED
        "Lock Screen": "rundll32.exe user32.dll,LockWorkStation"
    }
};

// ... (kodun geri kalanı)

// ... (kodun geri kalanı)


// ... (kodun geri kalanı)

// ... (kodun geri kalanı)

// We can keep ICON_MAP only for very special cases or caching but
// let it stay as an empty Map for now so old codes don't break.
let ICON_MAP = new Map();
// ...
let availableSerialPorts = []; // This line already exists


// --- NEW: Global Port Management ---
let connectedSerialPort = null; // Holds the actively connected port
let portReader = null;          // Holds the 'reader' object listening to the port
let textDecoder = new TextDecoderStream(); // To convert incoming data to text
let isListening = false;        // Flag to prevent double listeners
// --- NEW END ---

// Icon sets that should remain colored (won't be painted white)
// ...
// NEW/UPDATED: Auto-Connection Status

let scanRetryTimer = null; // Must be defined in global scope

// Icon sets that should remain colored (won't be painted white)
const COLORED_ICON_SETS = [
    'logos', 'noto', 'twemoji', 'emojione', 'flat-color-icons',
    'vscode-icons', 'circle-flags', 'openmoji', 'fxemoji', 'skill-icons',
    'devicon', 'devicon-plain', 'skill-icons', 'logos', 'streamline-color', 'material-icon-theme'// NEW ONES ADDED
];

/**
 * Shows a custom, theme-compliant confirmation window.
 * @param {string} message - Main message to show to the user.
 * @param {string} [title='Confirmation'] - Window title.
 * @param {string} [okText='OK'] - Confirmation button text.
 * @param {string} [cancelText='Cancel'] - Cancel button text.
 * @returns {Promise<boolean>} - Returns true if user clicks 'OK', false if 'Cancel'.
 */
function showCustomConfirm(message, title = 'Onay', okText = 'OK', cancelText = 'İptal') {
    return new Promise((resolve) => {
        const dialog = el('#customConfirm');
        const titleEl = el('#confirmTitle');
        const messageEl = el('#confirmMessage');
        const okBtn = el('#confirmOkBtn');
        const cancelBtn = el('#confirmCancelBtn');

        // Set texts
        titleEl.textContent = title;
        // Convert \n (newline) characters in message to <br> tags
        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        // Determine what happens when buttons are clicked
        // Clone and replace to clear previous listeners (safer)
        const newOkBtn = okBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        // Assign new listeners
        newOkBtn.onclick = () => {
            dialog.close();
            resolve(true); // Confirmed
        };

        newCancelBtn.onclick = () => {
            dialog.close();
            resolve(false); // Cancelled
        };

        // Count closing with 'Escape' key as 'cancel' too
        dialog.onclose = () => resolve(false);

        // Show window
        dialog.showModal();
    });
}



// app.js
function executeButtonAction(pageIdx, btnIdx) {
    if (!cfg || !cfg.pages[pageIdx]) return;
    const btn = cfg.pages[pageIdx][btnIdx];
    if (!btn) return;
    console.log(`[ACTION] Executing button ${pageIdx}:${btnIdx} -> Type: ${btn.type}`);

    if (!window.electronAPI) {
        console.error("ElectronAPI is not available!");
        return;
    }

    // --- TOGGLE BUTTON ---
    if (btn.type === 'toggle') {
        const currentState = btn.toggleState || false;
        const tData = btn.toggleData || {};

        // 1. Play Sound
        if (tData.useSound) {
            const soundUrl = getToggleSoundPath();
            const audio = new Audio(soundUrl);
            audio.volume = 0.5;
            audio.play().catch(e => console.error("Switch sound error:", e));
        }

        // 2. Execute Command
        let actionToRun = '';
        if (currentState) { // If state is ON, run OFF (onCombo) command
            actionToRun = tData.onCombo;
            console.log(`  -> Toggle: Switching to OFF state.`);
        } else { // If state is OFF, run ON (offCombo) command
            actionToRun = tData.offCombo;
            console.log(`  -> Toggle: Switching to ON state.`);
        }

        if (actionToRun) {
            const cmd = actionToRun.trim();
            // Is it a command containing Nircmd or .exe, or a keyboard shortcut?
            const isScript = cmd.toLowerCase().includes("nircmd") || cmd.toLowerCase().includes(".exe") || (cmd.includes(" ") && !cmd.includes("+"));

            if (isScript) {
                // --- FIX: runCommand USED ---
                const nircmdPath = `"${ASSETS_PATH}/nircmd.exe"`;
                let finalCmd = cmd.replace(/nircmd(\.exe)?/gi, nircmdPath);
                console.log(`  -> Toggle Executing Script: ${finalCmd}`);

                if (window.electronAPI.system && window.electronAPI.system.runCommand) {
                    window.electronAPI.system.runCommand(finalCmd)
                        .catch(err => {
                            console.error("Toggle Script Exec Error:", err);
                        });
                }
                // --- FIX END ---
            } else {
                // This is a keyboard shortcut (e.g. "AUDIO_PLAY")
                parseAndExecuteKeyCombo(cmd);
            }
        }

        // 3. Change State
        btn.toggleState = !currentState;
        updateButtonVisuals(btnIdx); // Refresh only this button
        saveConfig(false);
    }

    // --- SOUND (SOUND EFFECT) ---
    else if (btn.type === 'sound' && btn.soundPath) {
        console.log(`  -> Playing sound: ${btn.soundPath} (Vol: ${btn.soundVolume})`);
        let fileUrl = btn.soundPath.replace(/\\/g, '/');
        if (!fileUrl.startsWith('file:') && !fileUrl.startsWith('http')) {
            fileUrl = 'file:///' + fileUrl;
        }
        try {
            const audio = new Audio(fileUrl);
            const vol = (btn.soundVolume !== undefined ? btn.soundVolume : 100) / 100;
            audio.volume = Math.min(Math.max(vol, 0), 1);
            audio.play().catch(e => console.error("Audio playback failed:", e));
        } catch (e) { console.error("Error creating Audio object:", e); }
    }

    // --- APP LAUNCH ---
    else if (btn.type === 'app' && btn.appPath) {
        console.log("  -> Launching app:", btn.appPath);
        if (window.electronAPI.shell) {
            window.electronAPI.shell.openPath(btn.appPath);
        }
    }

    // --- HOTKEY ---
    else if (btn.type === 'key' && btn.combo) {
        parseAndExecuteKeyCombo(btn.combo);
    }

    // --- GOTO PAGE ---
    else if (btn.type === 'goto') {
        console.log(`  -> Switching view to Page ${btn.gotoPage}`);
        currentPage = btn.gotoPage;
        drawGrid();
        renderPageBar();
        saveConfig(false);
    }

    // --- SCRIPT ---
    else if (btn.type === 'script' && btn.customScript) {
        let cmd = btn.customScript.trim();
        console.log(`  -> Executing custom script: ${cmd}`);

        // --- FIX: NIRCMD PATH ADDED ---
        // If Nircmd is used, correct its path to assets folder
        if (cmd.toLowerCase().includes("nircmd")) {
            const nircmdPath = `"${ASSETS_PATH}/nircmd.exe"`;
            cmd = cmd.replace(/nircmd(\.exe)?/gi, nircmdPath);
            console.log(`     -> Path resolved to: ${cmd}`);
        }
        // --- FIX END ---

        // Run via main.js
        if (window.electronAPI.system && window.electronAPI.system.runCommand) {
            window.electronAPI.system.runCommand(cmd)
                .then(res => {
                    if (res && res.success === false) {
                        console.warn("Script run error:", res.error);
                    }
                })
                .catch(err => {
                    console.error("Script Exec Error:", err);
                });
        }
    }


    // --- WEBSITE ---
    else if (btn.type === 'website' && btn.websiteUrl) {
        let url = btn.websiteUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) { url = 'http://' + url; }
        console.log(`  -> Opening website: ${url}`);
        if (window.electronAPI.shell) { window.electronAPI.shell.openPath(url); }
    }

    // --- COUNTER ---
    else if (btn.type === 'counter') {
        const startVal = btn.counterStartValue || 0;
        const action = btn.counterAction || 'increment';
        const command = `COUNTER:${pageIdx}:${btnIdx}:${startVal}:${action}\n`;
        console.log(`  -> Sending Counter command: ${command.trim()}`);
        if (connectedSerialPort) { sendData(connectedSerialPort, command); }
        else { showCustomAlert("Device not connected. Cannot send counter command.", "Connection Error"); }
    }

    // --- MEDIA ---
    else if (btn.type === 'media' && btn.mediaAction) {
        const mediaKeyMap = { 'play_pause': 'audio_play', 'next_track': 'audio_next', 'prev_track': 'audio_prev', 'vol_up': 'audio_vol_up', 'vol_down': 'audio_vol_down', 'mute': 'audio_mute' };
        const robotKey = mediaKeyMap[btn.mediaAction];
        if (robotKey) {
            console.log(`  -> RobotJS executing media key: ${robotKey}`);
            window.electronAPI.robot.keyTap(robotKey).catch(err => console.error("Error sending media key:", err.message));
        }
    }

    // --- TEXT ---
    else if (btn.type === 'text') {
        if (btn.textSimulateTyping) {
            console.log(`  -> RobotJS sending simulated text...`);
            window.electronAPI.robot.typeStringSimulated(btn.textMacro).catch(err => console.error("Error sending simulated text:", err.message));
        } else {
            console.log(`  -> RobotJS sending text macro (Clipboard)...`);
            window.electronAPI.robot.typeString(btn.textMacro).catch(err => console.error("Error sending text macro:", err.message));
        }
    }

    // --- MOUSE ---
    else if (btn.type === 'mouse' && btn.mouseConfig) {
        const mCfg = btn.mouseConfig;
        const btnKey = mCfg.button || 'left';
        console.log(`  -> RobotJS executing mouse event: ${mCfg.event}`);
        try {
            if (mCfg.event === 'click') {
                window.electronAPI.robot.mouseMove(mCfg.x1, mCfg.y1);
                window.electronAPI.robot.mouseClick(btnKey, false);
            } else if (mCfg.event === 'double_click') {
                window.electronAPI.robot.mouseMove(mCfg.x1, mCfg.y1);
                window.electronAPI.robot.mouseClick(btnKey, true);
            } else if (mCfg.event === 'move') {
                window.electronAPI.robot.mouseMove(mCfg.x1, mCfg.y1);
            } else if (mCfg.event === 'drag') {
                window.electronAPI.robot.mouseMove(mCfg.x1, mCfg.y1);
                window.electronAPI.robot.mouseToggle('down', btnKey);
                window.electronAPI.robot.mouseMove(mCfg.x2, mCfg.y2);
                window.electronAPI.robot.mouseToggle('up', btnKey);
            }
        } catch (e) {
            console.error("RobotJS Mouse Error:", e.message);
            showCustomAlert(`Mouse Action Failed:\n${e.message}`, "RobotJS Error");
        }
    }
}

async function startSerialListener(port) {
    if (!port || !port.readable || isListening) {
        console.log("Listener start cancelled: Port not readable or already listening.");
        return;
    }

    isListening = true;
    console.log("Serial listener starting...");

    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable, { preventCancel: true });
    portReader = textDecoder.readable.getReader();

    try {
        let lineBuffer = '';
        while (true) {
            const { value, done } = await portReader.read();
            if (done) {
                console.log("Listener done.");
                break;
            }
            if (value) {
                lineBuffer += value;
                let newlineIndex;
                while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
                    const line = lineBuffer.substring(0, newlineIndex).trim();
                    lineBuffer = lineBuffer.substring(newlineIndex + 1);

                    if (line.length > 0) {
                        console.log(`[SERIAL IN]: ${line}`);

                        // --- 1. BUTTON CLICK ---
                        if (line.startsWith('BTN:')) {
                            const parts = line.split(':');
                            if (parts.length >= 3) {
                                const pageIdx = parseInt(parts[1]);
                                const btnIdx = parseInt(parts[2]);

                                if (parts.length === 4) {
                                    const deviceState = parseInt(parts[3]) === 1;
                                    if (cfg.pages[pageIdx] && cfg.pages[pageIdx][btnIdx]) {
                                        const btn = cfg.pages[pageIdx][btnIdx];
                                        if (btn.type === 'toggle') {
                                            if (btn.toggleState === deviceState) {
                                                btn.toggleState = !deviceState;
                                                console.log(`[SYNC] Auto-correction: Force-set App state to ${!deviceState}`);
                                                // Instead of drawGrid();:
                                                updateButtonVisuals(btnIdx); // <-- FIX
                                            }
                                        }
                                    }
                                }
                                executeButtonAction(pageIdx, btnIdx);
                            }
                        }

                        // --- 2. TIMER FINISHED (TIMER_DONE) ---
                        else if (line.startsWith('TIMER_DONE:')) {
                            const parts = line.split(':');
                            if (parts.length === 3) {
                                const pageIdx = parseInt(parts[1]);
                                const btnIdx = parseInt(parts[2]);

                                const btn = cfg.pages[pageIdx]?.[btnIdx];
                                const label = btn?.label || `Button ${btnIdx + 1}`;
                                const title = `Timer Finished`;
                                const body = `Your timer "${label}" is complete.`;

                                // --- SOUND PLAYING PART ---
                                try {
                                    const notifUrl = getNotificationSoundPath();
                                    console.log("Attempting to play timer sound:", notifUrl); // Log for debug

                                    if (notifUrl) {
                                        const audio = new Audio(notifUrl);
                                        audio.volume = 0.8;
                                        const playPromise = audio.play();

                                        if (playPromise !== undefined) {
                                            playPromise.catch(error => {
                                                console.error("Notification playback failed:", error);
                                            });
                                        }
                                    } else {
                                        console.warn("No notification sound path found.");
                                    }
                                } catch (e) {
                                    console.error("Error setup playing notification sound:", e);
                                }
                                // ------------------------

                                if (window.electronAPI && window.electronAPI.showNotification) {
                                    window.electronAPI.showNotification(title, body);
                                }
                            }
                        }

                        // --- 3. TIMER GÜNCELLEME (Canlı Geri Sayım) ---
                        // --- 3. TIMER UPDATE (Live Countdown) ---
                        else if (line.startsWith('TIMER_UPDATE:')) {
                            const parts = line.split(':');
                            const pIdx = parseInt(parts[1]);
                            const bIdx = parseInt(parts[2]);
                            const state = parseInt(parts[3]);
                            const remSec = parseInt(parts[4]);

                            // OLD CODE: if (currentPage === pIdx) { handlePcTimer(bIdx, state, remSec); }

                            // NEW CODE: Call directly without page check
                            handlePcTimer(pIdx, bIdx, state, remSec);
                        }

                        // --- 4. COUNTER UPDATE ---
                        else if (line.startsWith('COUNTER_UPDATE:')) {
                            const parts = line.split(':');
                            if (parts.length === 4) {
                                const pIdx = parseInt(parts[1]);
                                const bIdx = parseInt(parts[2]);
                                const newVal = parseInt(parts[3]);

                                if (currentPage === pIdx) {
                                    handlePcCounter(bIdx, newVal);
                                }
                            }
                        }

                        // --- 5. CONNECTION (Handshake) ---
                        else if (line.startsWith('PONG_DECK:')) {
                            const deviceName = line.substring(10);
                            const connectBtn = el('#connectSerialBtn');
                            if (connectBtn) {
                                connectBtn.textContent = `Connected: ${deviceName}`;
                                connectBtn.classList.remove('primary');
                                connectBtn.classList.add('success');
                            }

                            setTimeout(async () => {
                                if (connectedSerialPort && connectedSerialPort.writable) {
                                    try {
                                        const writer = connectedSerialPort.writable.getWriter();
                                        await writer.write(new TextEncoder().encode("GET_SYNC\n"));
                                        writer.releaseLock();
                                        console.log("[SYNC] Requested init state (GET_SYNC)...");
                                    } catch (e) { console.warn("Sync request failed:", e); }
                                }
                            }, 200);
                        }

                        // --- 6. SYNC RESPONSES ---
                        else if (line.startsWith('SYNC_PAGE:')) {
                            const p = parseInt(line.split(':')[1]);
                            if (!isNaN(p) && cfg.pages[p]) {
                                if (currentPage !== p) {
                                    console.log(`[SYNC] Switching app to Page ${p + 1}`);
                                    currentPage = p;
                                    renderPageBar();
                                    drawGrid();
                                }
                            }
                        }
                        else if (line.startsWith('SYNC_STATE:')) {
                            const parts = line.split(':');
                            const btnIdx = parseInt(parts[1]);
                            const stateVal = parseInt(parts[2]);

                            if (!isNaN(btnIdx) && !isNaN(stateVal) && cfg.pages[currentPage]) {
                                const btn = cfg.pages[currentPage][btnIdx];
                                if (btn && btn.type === 'toggle') {
                                    const newState = (stateVal === 1);
                                    if (btn.toggleState !== newState) {
                                        console.log(`[SYNC] Init: Btn ${btnIdx} state updated to ${newState}`);
                                        btn.toggleState = newState;

                                        // Instead of drawGrid();:
                                        updateButtonVisuals(btnIdx); // <-- FIX

                                        saveConfig(false);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.warn("Serial listen error (device likely disconnected):", error.message);
        if (error.name !== 'AbortError') {
            await disconnectSerial();
        }
    } finally {
        isListening = false;
    }
}

// UPDATED: Changes 'Connect' Button Text
async function connectSerial() {
    if (connectedSerialPort) {
        console.warn("Already connected.");
        return;
    }

    const selectEl = el('#serialPortSelect');
    const connectBtn = el('#connectSerialBtn');
    const disconnectBtn = el('#disconnectSerialBtn');
    // const statusEl = el('#connectStatus'); // NO LONGER USED
    const selectedIndex = parseInt(selectEl.value);

    if (isNaN(selectedIndex) || !availableSerialPorts[selectedIndex]) {
        // Instead of showing error message, make button 'Error' for 1 second
        const originalText = connectBtn.textContent;
        connectBtn.textContent = 'Select Port!';
        connectBtn.classList.add('danger');
        setTimeout(() => {
            connectBtn.textContent = originalText;
            connectBtn.classList.remove('danger');
        }, 1500);
        return;
    }

    try {
        const port = availableSerialPorts[selectedIndex];
        // statusEl.textContent = 'Connecting...'; // NO LONGER USED
        connectBtn.textContent = 'Connecting...'; // NEW
        // statusEl.className = 'upload-status-message'; // NO LONGER USED
        connectBtn.disabled = true;

        await port.open({ baudRate: 115200 });
        connectedSerialPort = port;

        // statusEl.textContent = 'Connected. Identifying device...'; // NO LONGER USED
        // statusEl.classList.add('success'); // NO LONGER USED
        connectBtn.textContent = 'Identifying...'; // NEW
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';

        startSerialListener(port);

        const writer = port.writable.getWriter();
        await writer.write(new TextEncoder().encode("PING_DECK\n"));
        writer.releaseLock();

    } catch (e) {
        console.error(`Failed to open port: ${e.message}`);
        // statusEl.textContent = `Error: Failed to open port. Is it in use?`; // NO LONGER USED
        // statusEl.classList.add('error'); // NO LONGER USED
        connectBtn.textContent = 'Error'; // NEW
        connectBtn.classList.add('danger');
        connectBtn.disabled = false;

        setTimeout(() => {
            connectBtn.textContent = 'Connect';
            connectBtn.classList.remove('danger');
        }, 2000);
    }
}

// UPDATED: Changes 'Connect' Button Text
async function disconnectSerial() {
    if (isListening && portReader) {
        try {
            await portReader.cancel();
            portReader.releaseLock();
        } catch (e) {
            console.warn("Error cancelling reader:", e.message);
        }
    }

    if (connectedSerialPort) {
        try {
            await connectedSerialPort.close();
        } catch (e) {
            console.warn("Error closing port:", e.message);
        }
    }

    connectedSerialPort = null;
    portReader = null;
    isListening = false;
    textDecoder = new TextDecoderStream();

    // Update UI (connectStatus no longer exists, just fixing the button)
    const connectBtn = el('#connectSerialBtn');
    if (connectBtn) {
        connectBtn.textContent = 'Connect';
        connectBtn.style.display = 'block';
        connectBtn.disabled = false;
        connectBtn.classList.remove('success', 'danger');
        connectBtn.classList.add('primary');
    }

    const disconnectBtn = el('#disconnectSerialBtn');
    if (disconnectBtn) {
        disconnectBtn.style.display = 'none';
    }

    console.log("Serial port disconnected.");
}

// --- NEW: Listing Installed Apps (Windows Only) ---
let cachedAppList = [];
let isAppListLoading = false;



async function loadInstalledApps() {
    if (!navigator.platform.toLowerCase().includes('win')) return;
    if (cachedAppList.length > 0 || isAppListLoading) return;

    const selectEl = el('#appQuickSelect');
    if (!selectEl) return;

    // SECURITY CHECK: Is there a new API?
    if (!window.electronAPI || !window.electronAPI.system) {
        console.error("API Error: electronAPI.system missing.");
        return;
    }

    isAppListLoading = true;
    selectEl.innerHTML = '<option>Loading apps...</option>';

    try {
        // --- NEW METHOD: Request from Main process ---
        let apps = await window.electronAPI.system.scanInstalledApps();

        cachedAppList = apps.filter(app => app.P && app.N);
        selectEl.innerHTML = '<option value="">Select app...</option>';
        cachedAppList.forEach(app => {
            const o = document.createElement('option');
            o.value = app.P;
            o.textContent = app.N;
            selectEl.appendChild(o);
        });
    } catch (e) {
        console.error("App scan failed:", e);
        selectEl.innerHTML = '<option value="">Error loading apps</option>';
    } finally {
        isAppListLoading = false;
    }
}


// app.js
// --- UI Update When Connected to Device ---
async function connectToDevice(port) {
    try {
        // --- NEW: Ensure port is clean before connecting ---
        await forceFreePort(port);
        // ----------------------------------------------------------

        // Open port
        await port.open({ baudRate: 115200 });

        connectedSerialPort = port;
        isAutoConnected = true;

        // Start listener (Read if data comes)
        startSerialListener(port);

        // --- UI UPDATE (GREEN MODE) ---
        const statusText = el('#deviceStatusText'); // If exists (For Sidebar)
        const detailText = el('#deviceDetailText'); // If exists
        const dot = el('#connectionDot'); // Bottom bar
        const uploadBtn = el('#uploadViaUsbBtn');

        if (statusText) {
            statusText.textContent = "Connected";
            statusText.style.color = "#2ecc71";
        }
        if (detailText) detailText.textContent = "Smart Deck is ready.";
        if (dot) dot.className = "status-dot connected";

        // Activate Upload Button
        if (uploadBtn) {
            uploadBtn.classList.remove('ghost');
            uploadBtn.classList.add('primary');
            uploadBtn.title = "Upload configuration to device";
            uploadBtn.style.cursor = "pointer";
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Upload Settings";
        }

        stopAutoConnectLoop();

    } catch (e) {
        console.error("Connection error:", e);
        // Try to clean port in case of error too
        await forceFreePort(port);
        handleDisconnectUI("Connection Failed", e.message);
    }
}

// --- UI Update When Disconnected ---
function handleDisconnectUI(status, detail) {
    const statusText = el('#deviceStatusText');
    const detailText = el('#deviceDetailText');
    const dot = el('#connectionDot');
    const uploadBtn = el('#uploadViaUsbBtn');

    if (statusText) {
        statusText.textContent = status || "Disconnected";
        statusText.style.color = "var(--text)";
    }
    if (detailText) detailText.textContent = detail || "Searching...";
    if (dot) dot.className = "status-dot searching"; // Yellow/Blinking dot

    // Deactivate Upload Button
    if (uploadBtn) {
        uploadBtn.classList.remove('primary');
        uploadBtn.classList.add('ghost');
        uploadBtn.title = "Please connect device first";
        uploadBtn.style.cursor = "not-allowed";
        // uploadBtn.disabled = true; // You can lock completely if you want
    }

    connectedSerialPort = null;
    isAutoConnected = false;

    // Connection lost, start searching again
    startAutoConnectLoop();
}
// app.js




async function updateSerialPortList(isFromRefreshButton = false) {
    if (!navigator.serial) return;

    // Do not scan if not called by button press and already connected.
    if (!isFromRefreshButton && (isAutoConnected || isAutoConnecting)) return;

    // Clear previous timer (Retry cancellation)
    clearTimeout(scanRetryTimer);

    const uploadBtn = el('#uploadViaUsbBtn');

    if (uploadBtn && !isAutoConnected) {
        uploadBtn.textContent = 'Searching for device...';
        uploadBtn.classList.remove('primary', 'danger', 'success');
        uploadBtn.classList.add('ghost');
        uploadBtn.disabled = true;
    }

    try {
        isAutoConnecting = true;

        // 1. Get port list
        availableSerialPorts = await navigator.serial.getPorts();
        let smartDeckPort = null;

        // --- CRITICAL FIX: Wait logic if new port plugged in ---
        // Condition: No previously connected port AND ports exist in system AND new attempt.
        if (availableSerialPorts.length > 0 && !connectedSerialPort && isFromRefreshButton) {
            if (uploadBtn) uploadBtn.textContent = 'Device detected. Waiting for boot...';
            console.log("New port detected. Waiting 3 seconds for device to boot up before handshake.");
            // Wait ONLY 3 seconds
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Get port list again after delay (assumed unchanged)
            availableSerialPorts = await navigator.serial.getPorts();
        }
        // --- CRITICAL FIX END ---

        // 2. Query each port to find Smart Deck
        for (const port of availableSerialPorts) {
            const customName = await identifyPort(port);
            if (customName && (customName.toLowerCase().includes('smartdeck') || customName.toLowerCase().includes('smart deck'))) {
                smartDeckPort = port;
                break;
            }
        }

        if (smartDeckPort) {
            // Smart Deck found, connect!

            if (connectedSerialPort === smartDeckPort && isListening) {
                isAutoConnected = true;
                if (uploadBtn) {
                    uploadBtn.textContent = 'Upload All (Connected)';
                    uploadBtn.classList.remove('ghost', 'danger');
                    uploadBtn.classList.add('primary');
                    uploadBtn.disabled = false;
                }
                return;
            }

            // New connection or reconnection
            if (uploadBtn) uploadBtn.textContent = 'Connecting...';

            if (!smartDeckPort.readable || smartDeckPort.readable.locked) {
                await smartDeckPort.open({ baudRate: 115200 });
            }

            connectedSerialPort = smartDeckPort;
            startSerialListener(connectedSerialPort);
            isAutoConnected = true;

            if (uploadBtn) {
                uploadBtn.textContent = 'Upload All (Connected)';
                uploadBtn.classList.remove('ghost', 'danger');
                uploadBtn.classList.add('primary');
                uploadBtn.disabled = false;
            }

        } else {
            // Smart Deck not found, clear connection.
            if (connectedSerialPort) {
                if (isListening && portReader) {
                    try { await portReader.cancel(); portReader.releaseLock(); } catch (e) { }
                }
                if (connectedSerialPort.readable && !connectedSerialPort.readable.locked) {
                    try { await connectedSerialPort.close(); } catch (e) { console.warn("Error closing disconnected port:", e); }
                }
            }

            connectedSerialPort = null;
            isListening = false;
            isAutoConnected = false;

            // NEW LOGIC: If not found after an automatic event, retry after a short while
            if (!isFromRefreshButton) {
                if (uploadBtn) uploadBtn.textContent = 'Retrying search...';

                // Retry after 3 seconds
                scanRetryTimer = setTimeout(() => updateSerialPortList(true), 3000);
                return;
            }

            // If still not found after button press or retry:
            if (uploadBtn) {
                uploadBtn.textContent = 'Click to Find Device';
                uploadBtn.classList.remove('primary', 'danger', 'success');
                uploadBtn.classList.add('ghost');
                uploadBtn.disabled = false;
            }
        }

    } catch (e) {
        console.error("Auto-connect error:", e);
        if (uploadBtn) {
            uploadBtn.textContent = 'Connection Error';
            uploadBtn.classList.remove('primary', 'ghost', 'success');
            uploadBtn.classList.add('danger');
            uploadBtn.disabled = true;
        }
        isAutoConnected = false;
    } finally {
        isAutoConnecting = false;
    }
}

// New device finding/adding function (For Magnifier button)
async function findNewSerialPort() {
    if (!navigator.serial) return;
    try {
        // Open standard browser selection window
        await navigator.serial.requestPort();
        // Update list after selection
        await updateSerialPortList();
    } catch (e) {
        // Runs if user cancels, no problem.
        console.log("Port selection cancelled or failed:", e);
    }
}
// app.js
function getIconUrl(name) {
    if (!name) return null;

    // 1. If already file: or data: do not touch
    if (name.startsWith('data:image') || name.startsWith('file:')) {
        return name;
    }

    // 2. If path like C:/Users... add file:///
    if (name.includes(':/') || name.includes(':\\')) {
        return 'file:///' + name.replace(/\\/g, '/');
    }

    // 3. Online Iconify
    if (name.startsWith('online:')) {
        const parts = name.split(':');
        if (parts.length >= 3) {
            return `https://api.iconify.design/${parts[1]}/${parts.slice(2).join('-')}.svg`;
        }
    }

    if (typeof ICON_MAP !== 'undefined' && ICON_MAP.has(name)) {
        return ICON_MAP.get(name);
    }

    // --- FIX HERE ---
    // If unknown path comes (like view-sidebar.svg)
    // return 'null' to avoid error.
    return null;
}
/**
 * Shows a custom, theme-compliant text input window (prompt).
 * @param {string} title - Window title.
 * @param {string} label - Label above input box.
 * @param {string} [defaultValue=''] - Default text to appear in input box.
 * @returns {Promise<string|null>} - Returns entered text or null if cancelled.
 */
function showCustomPrompt(title, label, defaultValue = '') {
    return new Promise((resolve) => {
        const dialog = el('#customPrompt');
        const titleEl = el('#promptTitle');
        const labelEl = el('#promptLabel');
        const inputEl = el('#promptInput');
        const okBtn = el('#promptOkBtn');
        const cancelBtn = el('#promptCancelBtn');

        // Set texts
        titleEl.textContent = title;
        labelEl.textContent = label;
        inputEl.value = defaultValue;

        // Function to run when dialog closes (with OK, Cancel or Esc)
        const closeHandler = (e) => {
            // If 'submit' event (Enter or OK button) and dialog return value is 'ok'
            if (dialog.returnValue === 'ok') {
                resolve(inputEl.value);
            } else {
                resolve(null); // Cancelled
            }
            // Cleanup: Remove event listener so it doesn't accumulate on next open
            dialog.removeEventListener('close', closeHandler);
        };

        // Listen for 'close' event (triggered automatically thanks to <form method="dialog">)
        dialog.addEventListener('close', closeHandler);

        // Set button 'value's (affects dialog.returnValue)
        okBtn.value = 'ok';
        cancelBtn.value = 'cancel';

        // Manually close when cancel button pressed (might be needed if not in form, just to be safe)
        cancelBtn.onclick = () => dialog.close('cancel');

        // Show window and focus input
        dialog.showModal();
        inputEl.focus();
        inputEl.select(); // Select existing text
    });
}


/**
 * Shows a custom, theme-compliant alert window.
 * @param {string} message - Main message to show to the user.
 * @param {string} [title='Info'] - Window title.
 * @param {string} [okText='Dismiss'] - Confirmation button text.
 * @returns {Promise<void>} - Resolves when user clicks 'OK'.
 */
function showCustomAlert(message, title = 'Info', okText = 'Dismiss') {
    return new Promise((resolve) => {
        const dialog = el('#customAlert');
        // Check in case HTML is not added yet
        if (!dialog) {
            console.error("Custom Alert dialog (#customAlert) not found in HTML.");
            // Use standard alert for backward compatibility
            alert(message);
            resolve();
            return;
        }

        const titleEl = el('#alertTitle');
        const messageEl = el('#alertMessage');
        const okBtn = el('#alertOkBtn');
        const closeBtn = el('#alertCloseBtn'); // Close (X) button

        // Set texts
        titleEl.textContent = title;
        // Convert \n (newline) characters in message to <br> tags
        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        okBtn.textContent = okText;

        // Clear event listeners (cloning method)
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        // Assign new listeners (OK, X and ESC key do the same thing)
        const closeHandler = () => {
            dialog.close();
            // Clear listeners (optional but good practice)
            dialog.onclose = null;
            resolve();
        };

        newOkBtn.onclick = closeHandler;
        newCloseBtn.onclick = closeHandler;
        dialog.onclose = closeHandler; // Close with Esc key

        dialog.showModal();
    });
}


// -----------------------------------------------------------------
// 2. REPLACE EXISTING resetAllSettings FUNCTION WITH THIS
// -----------------------------------------------------------------
// NEW: Function to reset all settings (Uses custom confirmation window)
// app.js
async function resetAllSettings() {

    // ----- LANGUAGE CHANGE HERE -----
    const confirmed = await showCustomConfirm(
        t('alerts.reset.message'),    // "WARNING: This will delete..."
        t('alerts.reset.title'),      // "Reset All Settings"
        t('header.buttons.reset'),    // "Reset"
        t('editor.cancel')            // "Cancel"
    );
    // ---------------------------------

    if (confirmed) {
        try {
            // 1. Clear local storage
            localStorage.removeItem(CONFIG_STORAGE_KEY);

            // 2. Load default settings
            cfg = ensureDefaults({});
            currentPage = 0;

            // 2.5 Revert language to default (Optional, but logical)
            await loadLanguage(DEFAULT_LANG);

            // 3. Update inputs in UI with defaults
            el('#deviceName').value = cfg.deviceName;
            // el('#wifiSSID').value = cfg.wifi.ssid; // These fields no longer exist
            // el('#wifiPass').value = cfg.wifi.pass; // These fields no longer exist
            el('#bgColor').value = '#' + cfg.theme.bg;
            el('#btnColor').value = '#' + cfg.theme.btn;
            el('#txtColor').value = '#' + cfg.theme.text;
            el('#strokeColor').value = '#' + cfg.theme.stroke;
            el('#shadowColor').value = '#' + cfg.theme.shadow;
            el('#resolutionSelect').value = cfg.device.resolution;

            // 4. Redraw application
            applyTheme();
            applyDeviceProfile(cfg.device.resolution); // This also calls drawGrid
            renderPageBar();

            // 5. Update web interface title
            const webTitleEl = el('#web-title-text');
            if (webTitleEl) {
                // ----- LANGUAGE CHANGE HERE -----
                webTitleEl.textContent = cfg.deviceName || t('device.frame.title');
            }

            // 6. Save new defaults
            saveConfig();

        } catch (e) {
            console.error("Reset error:", e);
            // We can translate the error message too, but logging to console is enough for now.
        }
    }
}

async function searchOnlineInline(query, resultsEl, inputEl, callback) {
    if (!query || query.length < 2) {
        resultsEl.style.display = 'none';
        return;
    }
    if (query.startsWith('http') || query.startsWith('data:') || query.startsWith('online:')) {
        resultsEl.style.display = 'none';
        return;
    }

    try {
        const limit = 30;
        const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`);
        if (resp.ok) {
            const data = await resp.json();
            resultsEl.innerHTML = '';

            if (data.icons && data.icons.length > 0) {
                data.icons.forEach(iconStr => {
                    const li = document.createElement('li');
                    li.title = iconStr;
                    const img = document.createElement('img');

                    // NEW: Use smart URL function
                    img.src = getSmartPreviewUrl(iconStr);

                    li.appendChild(img);
                    li.onclick = (e) => {
                        e.stopPropagation();
                        // Write set name to input (e.g. online:mdi:home)
                        // Note: Color decision could be added here too but let's keep it like this for now
                        const [set, ...rest] = iconStr.split(':');
                        inputEl.value = `online:${set}:${rest.join('-')}`;
                        resultsEl.style.display = 'none';
                        if (callback) callback();
                    };
                    resultsEl.appendChild(li);
                });
                resultsEl.style.display = 'grid';
            } else {
                resultsEl.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Inline search error:", e);
        resultsEl.style.display = 'none';
    }
}




const el = (q, r = document) => r.querySelector(q);




// app.js (~satır 705)

// Find convertToJpgBlob function in app.js and replace with this:

function convertToJpgBlob(iconUrl, btnData = {}, exportSize, overrideBgColor = null) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = exportSize;
        canvas.height = exportSize;
        const ctx = canvas.getContext('2d');

        // 1. Determine background color
        let bgColor = '#' + (cfg.theme.btn || '202020');

        if (overrideBgColor) {
            bgColor = overrideBgColor;
        } else {
            if (btnData && btnData.btnBgColor) {
                bgColor = btnData.btnBgColor;
            }
            if (btnData.type === 'toggle' && btnData.toggleState === true && btnData.toggleData?.onColor) {
                bgColor = btnData.toggleData.onColor;
            }
        }

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, exportSize, exportSize);

        const hasIcon = iconUrl && iconUrl.length > 0;

        const drawContent = () => {
            // 3. Draw text (Except Counter)
            if (btnData && btnData.label && btnData.type !== 'counter') {
                const exportCellSize = exportSize;
                const fontPx = safeFont(exportCellSize, btnData.labelSize);

                // Match font family exactly with CSS (Order is important)
                ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
                ctx.fillStyle = btnData.labelColor || '#FFFFFF';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // --- FIX HERE ---
                const padding = 6;
                const lineHeight = fontPx * 1.2;

                // UPDATE: Reduced multiplier from 0.92 to 0.88.
                // This "Safety Margin" prevents Canvas from thinking text is wider than CSS.
                // Export output will now be forced to write in a narrower area and wrap early like Preview.
                const maxWidth = (exportSize * 0.88) - (padding * 2);

                const text = btnData.label.trim();
                let lines = [];

                // --- TEXT WRAPPING LOGIC ---
                const words = text.split(' ');
                let currentLine = '';

                for (let i = 0; i < words.length; i++) {
                    let word = words[i];
                    let testLine = currentLine ? (currentLine + ' ' + word) : word;
                    let metrics = ctx.measureText(testLine);

                    if (metrics.width > maxWidth) {
                        // Line overflowing...
                        if (currentLine !== '') {
                            lines.push(currentLine);
                            currentLine = '';
                            testLine = word;
                        }

                        // Does the word itself fit in the line alone?
                        if (ctx.measureText(word).width > maxWidth) {
                            // WORD TOO LONG: Split character by character
                            let tempWord = word;
                            while (ctx.measureText(tempWord).width > maxWidth) {
                                let subWord = '';
                                for (let j = 0; j < tempWord.length; j++) {
                                    if (ctx.measureText(subWord + tempWord[j]).width <= maxWidth) {
                                        subWord += tempWord[j];
                                    } else {
                                        break;
                                    }
                                }
                                // Infinite loop protection
                                if (subWord.length === 0 && tempWord.length > 0) subWord = tempWord[0];

                                lines.push(subWord);
                                tempWord = tempWord.substring(subWord.length);
                            }
                            currentLine = tempWord;
                        } else {
                            currentLine = word;
                        }
                    } else {
                        currentLine = testLine;
                    }
                }
                if (currentLine) lines.push(currentLine);
                // ---------------------------------------------------

                // Max 3 lines
                if (lines.length > 3) {
                    lines = lines.slice(0, 3);
                }

                const totalTextHeight = lines.length * lineHeight;
                let y;

                if (btnData.labelV === 'top') {
                    y = padding + (lineHeight / 2);
                } else if (btnData.labelV === 'bottom') {
                    y = (exportSize - padding) - totalTextHeight + (lineHeight / 2);
                } else {
                    // middle
                    y = (exportSize - totalTextHeight) / 2 + (lineHeight / 2);
                }

                // Light shadow
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 1;
                ctx.shadowBlur = 2;

                const centerX = exportSize / 2;
                for (let k = 0; k < lines.length; k++) {
                    ctx.fillText(lines[k].trim(), centerX, y + (k * lineHeight));
                }
            }

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob (JPG) failed'));
            }, 'image/jpeg', 1.0);
        };

        if (hasIcon) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const scalePercent = (btnData.iconScale || 0);
                    const scaleValue = 1 + (scalePercent / 100.0);
                    const finalScale = Math.max(0.1, scaleValue);

                    const imgWidth = img.naturalWidth;
                    const imgHeight = img.naturalHeight;
                    const maxBoxSize = exportSize * finalScale;

                    let sW, sH;
                    if (imgWidth > imgHeight) {
                        sW = maxBoxSize;
                        sH = (imgHeight / imgWidth) * sW;
                    } else {
                        sH = maxBoxSize;
                        sW = (imgWidth / imgHeight) * sH;
                    }

                    const dX = (exportSize - sW) / 2;
                    const dY = (exportSize - sH) / 2;

                    if (btnData.iconColor) {
                        const tintCanvas = document.createElement('canvas');
                        tintCanvas.width = exportSize;
                        tintCanvas.height = exportSize;
                        const tintCtx = tintCanvas.getContext('2d');
                        tintCtx.drawImage(img, dX, dY, sW, sH);
                        tintCtx.globalCompositeOperation = 'source-in';
                        tintCtx.fillStyle = btnData.iconColor;
                        tintCtx.fillRect(0, 0, exportSize, exportSize);
                        ctx.drawImage(tintCanvas, 0, 0);
                    } else {
                        ctx.drawImage(img, dX, dY, sW, sH);
                    }
                    drawContent();
                } catch (e) { reject(new Error(`Error drawing icon: ${e.message}`)); }
            };
            img.onerror = () => { drawContent(); };

            if (iconUrl.startsWith('data:')) img.src = iconUrl;
            else img.src = iconUrl + (iconUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
        } else {
            drawContent();
        }
    });
}


/* Device Profiles (FIXED) */
const DEVICE_PROFILES = {
    "800x480_7": { w: 800, h: 480, cell: 90, maxCols: 8, maxRows: 4, name: "800x480 (7 inch)" },
    "800x480": { w: 800, h: 480, cell: 110, maxCols: 6, maxRows: 3, name: "800x480 (5 inch)" },
    "480x320": { w: 480, h: 320, cell: 70, maxCols: 5, maxRows: 3, name: "480x320 (3.5 inch)" }
};


// NEW: Central function to find icon URL
function getIconUrl(name) {
    if (!name) return null;

    // 0) If already full URL or data/file URL, do not touch
    if (name.startsWith('data:') || name.startsWith('file:') || /^https?:\/\//i.test(name)) {
        return name;
    }

    // 1) If plain file path (C:\... , \\server\..., /home/..., etc.) comes, make it file://
    const looksLikePath =
        name.includes(':\\') ||              // C:\icons\...
        name.startsWith('\\\\') ||           // \\server\share\...
        name.startsWith('/') ||              // /home/user/...
        /^[A-Za-z]:\//.test(name);           // C:/icons/...

    if (looksLikePath) {
        const normalized = name.replace(/\\/g, '/');
        return `file://${normalized}`;
    }

    // 2) Check local map first (manifest / user icon folder)
    if (ICON_MAP.has(name)) return ICON_MAP.get(name);

    // 3) If starts with 'online:', create Iconify URL
    // Format: online:set-name:icon-name (e.g. online:mdi:home)
    if (name.startsWith('online:')) {
        const parts = name.split(':');
        if (parts.length >= 3) {
            const iconSet = parts[1];
            const iconName = parts.slice(2).join('-'); // name may contain hyphens
            return `https://api.iconify.design/${iconSet}/${iconName}.svg`;
        }
    }

    // If unrecognized, null
    return null;
}


// NEW: Smart function creating preview URL based on icon set
function getSmartPreviewUrl(iconStr) {
    const [set, ...rest] = iconStr.split(':');
    const name = rest.join('-');

    // Check from main list
    if (COLORED_ICON_SETS.some(s => set.toLowerCase().includes(s))) {
        return `https://api.iconify.design/${set}/${name}.svg`;
    }

    // Force white color for others
    return `https://api.iconify.design/${set}/${name}.svg?color=white`;
}


function autoSetIconColor(iconName, currentBtnData, colorInputEl) {
    if (!iconName || !iconName.startsWith('online:')) return;

    const parts = iconName.split(':');
    if (parts.length < 2) return;

    const set = parts[1].toLowerCase();

    // Check from main list
    if (COLORED_ICON_SETS.some(s => set.includes(s))) {
        console.log(`Colored set detected (${set}), original colors preserved.`);
        currentBtnData.iconColor = '';
        colorInputEl.value = '#ffffff';
        colorInputEl.classList.add('unset');
    } else {
        if (!currentBtnData.iconColor) {
            console.log(`Monochrome set detected (${set}), painting white.`);
            currentBtnData.iconColor = '#ffffff';
            colorInputEl.value = '#ffffff';
            colorInputEl.classList.remove('unset');
        }
    }
}

let DEV_W, DEV_H, CELL, MAX_COLS, MAX_ROWS;
let GRID_COLS, GRID_ROWS;

let cfg = null, currentPage = 0;
let ICON_FOLDERS = {};
let clipboardButton = null;

const CONFIG_STORAGE_KEY = 'deckConfig';
// const HOST_STORAGE_KEY = 'deviceHost'; // Key to save IP address

function emptyBtn() {
    return {
        type: '', combo: '', gotoPage: 0, icon: '', label: '',
        labelColor: '', labelSize: 18, labelV: 'middle',
        btnBgColor: '',
        iconScale: 0,
        iconColor: '',
        textMacro: '',
        appPath: '',
        timerDuration: 0,
        customScript: '',
        websiteUrl: '',
        mediaAction: '',
        soundPath: '',
        soundVolume: 100,
        textSimulateTyping: false,
        counterStartValue: 0,
        counterAction: 'increment',

        // --- TOGGLE CONFIG ---
        toggleState: false, // false = OFF (A), true = ON (B)
        toggleData: {
            offCombo: '',
            onCombo: '',
            onColor: '#2ecc71' // Default Green
        },
        // ---------------------

        mouseConfig: {
            event: 'click', button: 'left', x1: 0, y1: 0, x2: 0, y2: 0
        }
    };
}


// app.js
function saveConfig(shouldSaveHistory = true) {
    if (!cfg) return;
    try {
        cfg.theme.bg = el('#bgColor').value.replace('#', '');
        cfg.theme.btn = el('#btnColor').value.replace('#', '');
        cfg.theme.text = el('#txtColor').value.replace('#', '');
        cfg.theme.stroke = el('#strokeColor').value.replace('#', '');
        cfg.theme.shadow = el('#shadowColor').value.replace('#', '');
        cfg.grid.cols = GRID_COLS;
        cfg.grid.rows = GRID_ROWS;
        cfg.currentPage = currentPage;
        cfg.deviceName = el('#deviceName').value;
        cfg.pageNames = cfg.pageNames || [];

        cfg.wifi = cfg.wifi || {};

        cfg.device = cfg.device || {};

        // --- FIX HERE ---
        const resSelect = el('#resolutionSelect');
        // Get value ONLY if <select> exists in DOM AND options are loaded (options.length > 0)
        // Otherwise DO NOT TOUCH existing cfg value
        if (resSelect && resSelect.options.length > 0) {
            cfg.device.resolution = resSelect.value;
        }
        // --- FIX END ---

        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));

        if (shouldSaveHistory) {
            saveHistory();
        }

    } catch (e) {
        console.error("Error saving config to LocalStorage:", e);
    }
}

function loadConfig() {
    try {
        const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (savedConfig) {
            console.log("Loading config from LocalStorage.");
            const parsedConfig = JSON.parse(savedConfig);
            return ensureDefaults(parsedConfig);
        }
    } catch (e) {
        console.error("Error loading config from LocalStorage:", e);
        localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    console.log("No valid config found in LocalStorage, using defaults.");
    return ensureDefaults({});
}

// --- NEW: Serial Command Sending Helper ---
async function sendSerialCommand(command) {
    if (!connectedSerialPort || !connectedSerialPort.writable) {
        console.warn("Serial port not connected, cannot send command:", command);
        return;
    }

    try {
        const writer = connectedSerialPort.writable.getWriter();
        const encoder = new TextEncoder();
        // Sending by adding \n to end of command
        await writer.write(encoder.encode(command + "\n"));
        writer.releaseLock();
        console.log("[SERIAL OUT] Sent:", command);
    } catch (e) {
        console.error("Serial write error:", e);
    }
}

function ensureDefaults(data) {
    if (!data || typeof data !== 'object') data = {};
    // NEW: shadow added
    data.theme = data.theme || { bg: '101010', btn: '202020', text: 'FFFFFF', stroke: '555555', shadow: '000000' };

    // --- NEW ADDED BLOCK: Device Settings ---
    data.deviceSettings = data.deviceSettings || {};
    if (typeof data.deviceSettings.brightness === 'undefined') data.deviceSettings.brightness = 100; // Default 100%
    if (typeof data.deviceSettings.sleepEnabled === 'undefined') data.deviceSettings.sleepEnabled = false; // Default off
    if (typeof data.deviceSettings.sleepMinutes === 'undefined') data.deviceSettings.sleepMinutes = 5; // Default 5 min
    // ------------------------------------------


    if (!data.theme.stroke) data.theme.stroke = '555555';
    if (data.theme.shadow === undefined) data.theme.shadow = '000000'; // NEW

    data.device = data.device || { resolution: "800x480" };
    const currentProfile = DEVICE_PROFILES[data.device.resolution] || DEVICE_PROFILES["800x480"];

    data.grid = data.grid || { cols: currentProfile.maxCols, rows: currentProfile.maxRows };
    data.grid.cols = Math.min(data.grid.cols, currentProfile.maxCols);
    data.grid.rows = Math.min(data.grid.rows, currentProfile.maxRows);

    data.pageCount = Math.max(1, Number(data.pageCount || 1));
    data.pages = Array.isArray(data.pages) ? data.pages : [[]];
    data.currentPage = Math.max(0, Math.min(Number(data.currentPage || 0), data.pageCount - 1));
    data.iconSource = data.iconSource || 'default';
    data.userIconFolderName = data.userIconFolderName || null;

    data.deviceName = data.deviceName || '';
    data.pageNames = Array.isArray(data.pageNames) ? data.pageNames : [];
    data.wifi = data.wifi || { ssid: '', pass: '' };

    while (data.pageNames.length < data.pageCount) {
        data.pageNames.push('');
    }
    data.pageNames = data.pageNames.slice(0, data.pageCount);


    if (data.pages) {
        data.pages.forEach(page => {
            if (Array.isArray(page)) {
                page.forEach(btn => {
                    if (btn && btn.icon && typeof btn.icon === 'string' && btn.icon.startsWith('blob:')) {
                        console.log(`Sanitizing invalid blob icon URL for button: ${btn.label || '[no label]'}`);
                        btn.icon = '';
                    }
                    if (btn && typeof btn.iconScale === 'undefined') {
                        btn.iconScale = 0;
                    }
                    if (btn && typeof btn.iconColor === 'undefined') {
                        btn.iconColor = '';
                    }
                });
            }
        });
    }

    el('#bgColor').value = '#' + data.theme.bg;
    el('#btnColor').value = '#' + data.theme.btn;
    el('#txtColor').value = '#' + data.theme.text;
    el('#strokeColor').value = '#' + data.theme.stroke;
    el('#shadowColor').value = '#' + data.theme.shadow; // NEW
    el('#deviceName').value = data.deviceName;
    document.title = data.deviceName || 'Deck Config';

    // Set title bar in web interface
    const webTitleEl = el('#web-title-text');
    if (webTitleEl) {
        webTitleEl.textContent = data.deviceName || 'Device Name';
    }

    //   el('#wifiSSID').value = data.wifi.ssid;
    //   el('#wifiPass').value = data.wifi.pass;

    GRID_COLS = data.grid.cols;
    GRID_ROWS = data.grid.rows;
    currentPage = data.currentPage;

    // --- NEW ADDED BLOCK: App Settings ---
    data.appSettings = data.appSettings || {};
    // 'showConfirm' = Always ask. 'minimize' = Minimize to Tray. 'exit' = Close directly.
    data.appSettings.defaultCloseAction = data.appSettings.defaultCloseAction || 'showConfirm';
    // --- NEW END ---


    return data;
}

// NEW: shadow added
function applyTheme() {
    document.documentElement.style.setProperty('--c-bg', '#' + cfg.theme.bg);
    document.documentElement.style.setProperty('--c-btn', '#' + cfg.theme.btn);
    document.documentElement.style.setProperty('--c-text', '#' + cfg.theme.text);
    document.documentElement.style.setProperty('--c-stroke', '#' + cfg.theme.stroke);
    document.documentElement.style.setProperty('--c-shadow', '#' + cfg.theme.shadow); // NEW
}

// app.js
function wireTheme() {
    const bg = el('#bgColor'), bn = el('#btnColor'), tx = el('#txtColor'), sk = el('#strokeColor'), sh = el('#shadowColor');

    const upd = () => {
        cfg.theme.bg = bg.value.replace('#', '');
        cfg.theme.btn = bn.value.replace('#', '');
        cfg.theme.text = tx.value.replace('#', '');
        cfg.theme.stroke = sk.value.replace('#', '');
        cfg.theme.shadow = sh.value.replace('#', '');
        applyTheme();
        debounceSave();
    };
    [bg, bn, tx, sk, sh].forEach(i => i.addEventListener('input', upd));

    el('#deviceName').addEventListener('input', (e) => {
        document.title = e.target.value || 'Deck Config';

        const webTitleEl = el('#web-title-text');
        if (webTitleEl) {
            // --- FIX (PROBLEM 1) ---
            // If box is empty, show translated title (e.g. Device Name)
            webTitleEl.textContent = e.target.value || t('device.frame.title');
            // --- FIX END ---
        }
        debounceSave();
    });
}

function applyDeviceProfile(profileKey) {
    const profile = DEVICE_PROFILES[profileKey] || DEVICE_PROFILES["800x480"];

    DEV_W = profile.w;
    DEV_H = profile.h;
    CELL = profile.cell;
    MAX_COLS = profile.maxCols;
    MAX_ROWS = profile.maxRows;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--dev-w', DEV_W + 'px');
    rootStyle.setProperty('--dev-h', DEV_H + 'px');
    rootStyle.setProperty('--cell-w', CELL + 'px');

    // --- NEW: Radius Setting ---
    // 20px for 3.5 inch, 24px for others (larger ones)
    let radius = 24;
    if (profileKey === "480x320") {
        radius = 20;
    }
    rootStyle.setProperty('--btn-radius', radius + 'px');
    // --------------------------

    if (!cfg) cfg = {};
    if (!cfg.device) cfg.device = {};
    cfg.device.resolution = profileKey;

    if (cfg.grid.cols > MAX_COLS) cfg.grid.cols = MAX_COLS;
    if (cfg.grid.rows > MAX_ROWS) cfg.grid.rows = MAX_ROWS;
    GRID_COLS = cfg.grid.cols;
    GRID_ROWS = cfg.grid.rows;

    applyGeometry(GRID_COLS, GRID_ROWS);
    populateGridControls();
    drawGrid();
    renderPageBar();
    saveConfig();
}


// FIXED: Function using special math for 480x320
function applyGeometry(cols, rows) {
    GRID_COLS = cols; GRID_ROWS = rows;
    document.documentElement.style.setProperty('--cols', GRID_COLS);
    document.documentElement.style.setProperty('--rows', GRID_ROWS);

    // --- Y (vertical) calculations (From previous answer) ---
    // (Logic increasing vertical gaps for 8x4 grid)
    const gridAvailableHeight = DEV_H - 90;
    const totalCellHeight = GRID_ROWS * CELL;
    const remainingSpace = gridAvailableHeight - totalCellHeight;

    let gapY, padY_top, padY_bottom;
    const numGaps = GRID_ROWS - 1;

    if (remainingSpace < 0) {
        gapY = -2;
        padY_top = 0;
        padY_bottom = 0;
    } else if (numGaps > 0) {
        padY_top = 2;
        padY_bottom = 2;
        let space_for_gaps = remainingSpace - padY_top - padY_bottom;
        gapY = Math.floor(space_for_gaps / numGaps);
        let remainder = space_for_gaps % numGaps;
        padY_bottom += remainder;
    } else {
        gapY = 0;
        padY_top = Math.floor(remainingSpace / 2);
        padY_bottom = remainingSpace - padY_top;
    }

    // --- X (horizontal) calculations (NEW SHADOW CALCULATION) ---

    // 1. We know shadow offset from style.css (5px)
    const SHADOW_OFFSET_X = 5;

    // 2. Calculate gap between buttons (gapX) (Old logic)
    // (Finds a base value distributing all gaps (gap+pad) equally)
    let gapX = GRID_COLS > 1 ? Math.floor((DEV_W - GRID_COLS * CELL) / (GRID_COLS + 1)) : Math.floor((DEV_W - CELL) / 2);

    // 3. Calculate total padding space
    // (Total width - Cells - Gaps in between)
    const totalPaddingSpace = DEV_W - (GRID_COLS * CELL) - ((GRID_COLS - 1) * gapX);

    // 4. Calculate asymmetric padding (To balance shadow)
    // Left padding = (Total Padding - Shadow Margin) / 2
    // Right padding = (Total Padding + Shadow Margin) / 2
    let padX_left = Math.floor((totalPaddingSpace - SHADOW_OFFSET_X) / 2);
    let padX_right = Math.floor((totalPaddingSpace + SHADOW_OFFSET_X) / 2);

    // 5. Fix rounding errors (add drifting 1px to right)
    const remainderX = totalPaddingSpace - (padX_left + padX_right);
    padX_right += remainderX;

    // 6. Set CSS Variables
    document.documentElement.style.setProperty('--gapx', gapX + 'px');
    document.documentElement.style.setProperty('--gapy', gapY + 'px');

    // NEW: Set padding separately
    document.documentElement.style.setProperty('--padx-left', Math.max(0, padX_left) + 'px');
    document.documentElement.style.setProperty('--padx-right', Math.max(0, padX_right) + 'px');

    document.documentElement.style.setProperty('--pady-top', Math.max(0, padY_top) + 'px');
    document.documentElement.style.setProperty('--pady-bottom', Math.max(0, padY_bottom) + 'px');
}
function flattenButtons() { const out = []; for (const p of cfg.pages) { for (const b of p) { if (b && (b.icon || b.label || b.type === 'goto' || (b.type === 'key' && b.combo))) out.push(b); } } return out; }
function repartition(all, cap) { const pages = []; const count = Math.max(1, Math.ceil(all.length / cap) || 1); let i = 0; for (let p = 0; p < count; p++) { const arr = []; for (let j = 0; j < cap; j++) { arr.push(all[i++] || emptyBtn()); } pages.push(arr); } return pages; }

// app.js (~satır 904)
// Replace existing 'onGridChanged' function with this:

// app.js (~satır 904)
// Replace existing 'onGridChanged' function with this:

// app.js (~satır 904 civarı)
// Add this helper function IMMEDIATELY BEFORE previous 'onGridChanged' function:

/**
 * Extracts "Main" base name from a page name like "Main 2".
 */
function getBasePageName(name) {
    if (!name) return ""; // Empty names are not grouped
    // "Main 2" -> "Main"
    // "Main" -> "Main"
    // "Photoshop" -> "Photoshop"
    const match = name.match(/^(.*?)(\s\d+)?$/);
    // Return match [1] (main group) or name itself if no match
    return match ? match[1] : name;
}


// Now replace existing 'onGridChanged' function (line 904)
// COMPLETELY with this:

function onGridChanged(cols, rows) {
    const newCap = cols * rows; // New capacity per page
    const oldPages = cfg.pages;
    const oldPageNames = cfg.pageNames;

    const newPages = [];
    const newPageNames = [];
    const processedOldIndices = new Set(); // Track which old pages we processed

    for (let i = 0; i < oldPages.length; i++) {
        if (processedOldIndices.has(i)) continue; // This page already merged with a group

        const originalName = oldPageNames[i] || "";
        const baseName = getBasePageName(originalName);
        const buttonsToConsolidate = []; // All buttons to be consolidated

        // 1. Collect buttons of this page (i)
        const currentButtons = (oldPages[i] || []).filter(isFilled);
        buttonsToConsolidate.push(...currentButtons);
        processedOldIndices.add(i);

        // 2. Check if this page is empty
        const isThisPageOriginallyEmpty = currentButtons.length === 0;

        // 3. Find related other pages (IF not empty AND has a name)
        // (Those named "" are not grouped, preserved like "Empty Page")
        if (!isThisPageOriginallyEmpty && baseName !== "") {
            for (let j = i + 1; j < oldPages.length; j++) {
                if (processedOldIndices.has(j)) continue;

                const otherBaseName = getBasePageName(oldPageNames[j] || "");
                if (otherBaseName === baseName) {
                    // Matching page found (e.g. "Main 2" found)
                    const relatedButtons = (oldPages[j] || []).filter(isFilled);
                    buttonsToConsolidate.push(...relatedButtons);
                    processedOldIndices.add(j); // Mark this page as processed
                }
            }
        }

        // 4. Distribute collected buttons to new pages (or single page)
        if (buttonsToConsolidate.length === 0) {
            // This was an empty page, keep as empty
            newPages.push(Array.from({ length: newCap }, () => emptyBtn()));
            newPageNames.push(originalName); // Preserve original name ("" or "Empty Page")
        } else {
            // Resplit (or merge) filled pages according to new capacity
            let chunkCount = 0;
            for (let j = 0; j < buttonsToConsolidate.length; j += newCap) {
                chunkCount++;
                const chunk = buttonsToConsolidate.slice(j, j + newCap);
                const newPageArray = Array.from({ length: newCap }, () => emptyBtn());
                chunk.forEach((btn, idx) => newPageArray[idx] = btn);

                newPages.push(newPageArray);

                // Name the page
                const finalBaseName = (baseName === "") ? `Page ${i + 1}` : baseName;

                if (chunkCount === 1) {
                    // First part always takes the original base name
                    newPageNames.push(finalBaseName); // "Main" veya "Page 1"
                } else {
                    // Subsequent parts (if overflow) take name "Main 2"
                    newPageNames.push(`${finalBaseName} ${chunkCount}`);
                }
            }
        }
    }

    // Apply changes
    cfg.pages = newPages;
    cfg.pageNames = newPageNames;
    cfg.pageCount = newPages.length;
    cfg.grid = { cols, rows };

    // Update UI
    currentPage = Math.max(0, Math.min(currentPage, cfg.pageCount - 1));
    applyGeometry(cols, rows);
    populateGridControls();
    drawGrid();
    renderPageBar();
    saveConfig();
}


function shouldMultiLine(t) { if (!t) return false; t = String(t); return t.includes(' ') || t.length >= 8; }
function safeFont(cellPx, user) { return Math.min(Math.max(10, user || 18), 28); }

function applyLabelStyle(lab, btn) {
    lab.classList.remove('top', 'bottom', 'multi');
    if (btn.labelV === 'top') lab.classList.add('top');
    if (btn.labelV === 'bottom') lab.classList.add('bottom');

    const scale = CELL / 110.0;
    const scaledUserFont = (btn.labelSize || 18) * scale;
    const finalFontSize = Math.min(Math.max(10, scaledUserFont), 28);

    lab.style.fontSize = finalFontSize + 'px';
    lab.style.color = btn.labelColor || '';
    if (shouldMultiLine(btn.label)) lab.classList.add('multi');
}


// app.js (~satır 955)
// Replace existing 'isFilled' function with this:

// app.js (~satır 955)
// Replace existing 'isFilled' function with this (if not done already):

function isFilled(btn) {
    if (!btn) return false;
    // 1. If it has appearance, it is filled (icon or label)
    if (btn.icon || btn.label) return true;

    // 2. If it has action, it is filled (old ones)
    if (btn.type === 'goto') return true; // goto is always filled
    if (btn.type === 'key' && btn.combo) return true;
    if (btn.type === 'text' && btn.textMacro) return true;
    if (btn.type === 'app' && btn.appPath) return true;

    // --- NEW ADDED CHECKS ---
    if (btn.type === 'script' && btn.customScript) return true;
    if (btn.type === 'website' && btn.websiteUrl) return true;
    if (btn.type === 'media' && btn.mediaAction) return true;
    if (btn.type === 'timer' && btn.timerDuration > 0) return true;
    if (btn.type === 'counter') return true;
    // 'mouse' action is filled if it has settings other than default (click at 0,0)
    if (btn.type === 'mouse' && (
        btn.mouseConfig.event !== 'click' ||
        btn.mouseConfig.button !== 'left' ||
        btn.mouseConfig.x1 != 0 ||
        btn.mouseConfig.y1 != 0 ||
        btn.mouseConfig.x2 != 0 ||
        btn.mouseConfig.y2 != 0
    )) return true;

    return false; // Everything else is empty
}


// app.js (~satır 992)

// app.js (~satır 992)

function cellTemplate(i, incomingBtnData) {
    const div = document.createElement('div');
    div.className = 'cell';
    div.dataset.index = i;
    const currentBtn = cfg.pages[currentPage]?.[i];

    // Drag and Drop Logic (Remains same)
    div.draggable = true;
    div.addEventListener('dragstart', e => {
        div.classList.add('dragging');
        const dragData = JSON.stringify({ sourcePage: currentPage, sourceIndex: i });
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => {
        document.querySelectorAll('.cell.dragover').forEach(c => c.classList.remove('dragover'));
        div.classList.remove('dragging');
    });
    div.addEventListener('dragenter', e => {
        document.querySelectorAll('.cell.dragover').forEach(c => c.classList.remove('dragover'));
        if (e.dataTransfer.types.includes('application/json')) { div.classList.add('dragover'); }
    });
    div.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/json')) { e.preventDefault(); } });

    // --- START HERE (Delete old drop code, paste this) ---
    div.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        div.classList.remove('dragover');

        const dragDataRaw = e.dataTransfer.getData('application/json');
        if (!dragDataRaw) return;
        const data = JSON.parse(dragDataRaw);

        // SCENARIO 1: New button dragged from Plugin Sidebar
        if (data.sourceType === 'plugin-btn') {
            const incomingData = data.btnData;
            const basePath = data.basePath;

            // --- NEW: Get ID and Index from Payload ---
            const pluginId = data.pluginId;
            const buttonIndex = data.buttonIndex;
            // --- NEW CODE END ---

            const resolvePath = (p) => {
                if (!p || typeof p !== 'string') return p;
                if (p.match(/^(http|https|online:|data:|file:)/)) return p;
                if (basePath) {
                    const cleanBase = basePath.replace(/\\/g, '/');
                    const cleanPath = p.replace(/\\/g, '/').replace(/^\//, '');
                    return `file:///${cleanBase}/${cleanPath}`;
                }
                return p;
            };

            if (incomingData.icon) incomingData.icon = resolvePath(incomingData.icon);
            if (incomingData.soundPath) incomingData.soundPath = resolvePath(incomingData.soundPath);
            if (incomingData.appPath && !incomingData.appPath.includes(':')) incomingData.appPath = resolvePath(incomingData.appPath);
            if (incomingData.toggleData) {
                if (incomingData.toggleData.iconOn) incomingData.toggleData.iconOn = resolvePath(incomingData.toggleData.iconOn);
                // can be added for iconOff (if exists)
            }
            if (incomingData.combos) {
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const selectedCombo = isMac
                    ? (incomingData.combos.mac || incomingData.combos.win)
                    : (incomingData.combos.win || incomingData.combos.mac);
                if (selectedCombo) incomingData.combo = selectedCombo;
            }

            const newBtn = Object.assign(emptyBtn(), incomingData);

            // --- NEW: "Tag" the Button ---
            newBtn._pluginId = pluginId;
            newBtn._buttonIndex = buttonIndex;
            // --- NEW CODE END ---

            cfg.pages[currentPage][i] = newBtn;
            drawGrid();
            saveConfig();
            return;
        }

        // SCENARIO 2: Swapping (Remains same)
        const fromPage = data.sourcePage;
        const fromIndex = data.sourceIndex;
        const toPage = currentPage;
        const toIndex = i;
        if (fromPage === toPage && fromIndex === toIndex) return;
        const pFrom = cfg.pages[fromPage];
        const pTo = cfg.pages[toPage];
        [pFrom[fromIndex], pTo[toIndex]] = [pTo[toIndex], pFrom[fromIndex]];
        drawGrid();
        saveConfig();
    });
    // --- END HERE ---

    if (currentBtn && isFilled(currentBtn)) {
        const x = document.createElement('div'); x.className = 'close'; x.textContent = '×'; x.title = 'Clear Button';
        x.onclick = (e) => { e.stopPropagation(); cfg.pages[currentPage][i] = emptyBtn(); drawGrid(); saveConfig(); };
        div.appendChild(x);

        const b = document.createElement('button'); b.className = 'btn'; b.type = 'button';

        // --- APPEARANCE LOGIC ---
        let finalBgColor = currentBtn.btnBgColor || '';
        let finalIconName = currentBtn.icon;
        let finalIconColor = currentBtn.iconColor || '';

        // Toggle State Check
        if (currentBtn.type === 'toggle') {
            const isStateOn = currentBtn.toggleState === true;
            if (isStateOn) {
                finalBgColor = currentBtn.toggleData?.onColor || '#2ecc71';
                if (currentBtn.toggleData?.iconOn) {
                    finalIconName = currentBtn.toggleData.iconOn;
                }
                if (currentBtn.toggleData?.onIconColor) {
                    finalIconColor = currentBtn.toggleData.onIconColor;
                } else {
                    finalIconColor = '#ffffff';
                }
            }
        }

        // 1. Background Color
        if (finalBgColor) {
            b.style.backgroundColor = finalBgColor;
        } else {
            b.style.backgroundColor = '';
        }

        // 2. Icon and Image Elements (BOTH ARE CREATED)
        const iconI = document.createElement('i');
        iconI.className = 'icon-img';
        iconI.style.display = 'none'; // Default hidden

        const iconImg = document.createElement('img');
        iconImg.className = 'icon-img';
        iconImg.style.display = 'none'; // Default hidden

        if (finalIconName && currentBtn.type !== 'timer') {
            const imgUrl = getIconUrl(finalIconName);
            if (imgUrl) {
                const isRawImage = imgUrl.startsWith('data:') || imgUrl.startsWith('file:');
                const scaleValue = 1 + ((currentBtn.iconScale || 0) / 100.0);
                const transformStyle = `scale(${Math.max(0.1, scaleValue)})`;

                if (isRawImage) {
                    // --- SHOW LOCAL IMAGE (IMG) ---
                    // Add timestamp for cache (in case file changed)
                    const finalSrc = imgUrl.startsWith('file:') ? (imgUrl + '?t=' + Date.now()) : imgUrl;
                    iconImg.src = finalSrc;
                    iconImg.style.display = 'block';
                    iconImg.style.transform = transformStyle;
                } else {
                    // --- SHOW ONLINE ICON (I) ---
                    iconI.style.display = 'block';
                    iconI.style.transform = transformStyle;

                    if (finalIconColor) {
                        iconI.style.backgroundColor = finalIconColor;
                        iconI.style.webkitMaskImage = `url("${imgUrl}")`;
                        iconI.style.maskImage = `url("${imgUrl}")`;
                        iconI.style.backgroundImage = 'none';
                    } else {
                        iconI.style.backgroundColor = 'transparent';
                        iconI.style.webkitMaskImage = 'none';
                        iconI.style.maskImage = 'none';
                        iconI.style.backgroundImage = `url("${imgUrl}")`;
                    }
                }
            }
        }

        // Add elements to button
        b.appendChild(iconI);
        b.appendChild(iconImg);

        // 3. Apply Label/Counter
        let labelText = currentBtn.label;
        if (currentBtn.type === 'counter') {
            labelText = currentBtn.label || String(currentBtn.counterStartValue || 0);
        }

        if (labelText) {
            const lab = document.createElement('div');
            lab.className = 'label';
            lab.textContent = labelText;
            applyLabelStyle(lab, currentBtn);
            b.appendChild(lab);
        }

        b.onclick = () => openEditor(i, currentBtn);
        div.appendChild(b);
    } else {
        const plus = document.createElement('button'); plus.className = 'plus'; plus.textContent = '+';
        plus.onclick = () => openEditor(i, emptyBtn()); div.appendChild(plus);
    }
    return div;
}

function drawGrid() {
    // 1. Stop old visual timers (CPU saving)
    clearAllActiveTimers();

    const root = el('#grid');
    root.innerHTML = '';
    const pageData = cfg.pages[currentPage] || [];
    const totalCells = GRID_COLS * GRID_ROWS;

    for (let i = 0; i < totalCells; i++) {
        root.appendChild(cellTemplate(i, pageData[i] || emptyBtn()));
    }

    // app.js - END of drawGrid function

    // ... (previous codes) ...

    // 2. NEW: Check if there is a timer running in background on this page and restore
    for (const key in activeTimerTargets) {
        const parts = key.split('_');
        const pIdx = parseInt(parts[0]);
        const bIdx = parseInt(parts[1]);

        // Restore only timers of this page and those not expired
        if (pIdx === currentPage) {
            const targetTime = activeTimerTargets[key];
            if (targetTime > Date.now()) {
                console.log(`Restoring timer for Page ${pIdx} Button ${bIdx}`);
                startVisualTimer(bIdx, targetTime);
            } else {
                // If expired, clear from memory (Garbage collection)
                delete activeTimerTargets[key];
            }
        }
    }
} // drawGrid End



function updatePreviewEl(tmp) {
    const lab = el('#previewLabel');
    lab.textContent = tmp.label || '';
    applyLabelStyle(lab, {
        ...tmp,
        labelSize: safeFont(110, tmp.labelSize)
    });

    const imgUrl = getIconUrl(tmp.icon);
    const iconEl = el('#previewIcon');     // <i>
    const rawImgEl = el('#previewImgRaw'); // <img>

    // Hide by default
    iconEl.style.display = 'none';
    if (rawImgEl) rawImgEl.style.display = 'none';

    if (imgUrl && imgUrl.length > 5) {
        const isRawImage = imgUrl.startsWith('data:') || imgUrl.startsWith('file:');
        const scaleValue = 1 + ((tmp.iconScale || 0) / 100.0);
        const transformStyle = `scale(${Math.max(0.1, scaleValue)})`;

        if (isRawImage) {
            // --- LOCAL IMAGE MODE ---
            if (rawImgEl) {
                rawImgEl.style.display = 'block';
                // Src assignment (Cache breaking with Timestamp)
                // Note: Since there is instant change in editor, adding timestamp every time might cause flickering.
                // Let's add only if 'file:' and URL changed.
                const newSrc = imgUrl.startsWith('file:') ? (imgUrl + '?t=' + Date.now()) : imgUrl;

                // Update only if source really changed (to prevent flicker)
                // Since query string changes in file:// urls, we can check this via base path
                const currentSrcBase = rawImgEl.src.split('?')[0];
                const newSrcBase = imgUrl.split('?')[0];

                if (currentSrcBase !== newSrcBase || !rawImgEl.src) {
                    rawImgEl.src = newSrc;
                }

                rawImgEl.style.transform = transformStyle;
            }
        } else {
            // --- ONLINE ICON MODE ---
            iconEl.style.display = 'block';

            iconEl.style.webkitMaskImage = 'none';
            iconEl.style.maskImage = 'none';
            iconEl.style.backgroundImage = 'none';
            iconEl.style.backgroundColor = 'transparent';

            const iconColor = tmp.iconColor || '';
            if (iconColor) {
                iconEl.style.backgroundColor = iconColor;
                iconEl.style.webkitMaskImage = `url("${imgUrl}")`;
                iconEl.style.maskImage = `url("${imgUrl}")`;
            } else {
                iconEl.style.backgroundImage = `url("${imgUrl}")`;
            }
            iconEl.style.transform = transformStyle;
        }
    }

    const previewBtn = el('#editor .previewBtn');
    if (previewBtn) {
        previewBtn.style.backgroundColor = tmp.btnBgColor || '';
    }
}


function updateIconStatusIndicator() {
    const indicator = el('#iconStatusIndicator'); if (!indicator) return;
    if (cfg.iconSource === 'default') {
        if (ICON_MAP.size > 0) { indicator.textContent = 'Default icons loaded.'; indicator.className = 'status-ok'; }
        else { indicator.textContent = 'Failed to load default icons. Check manifest.json or select folder.'; indicator.className = 'status-error'; }
    } else if (cfg.iconSource === 'user') {
        if (ICON_MAP.size > 0) { indicator.textContent = `User icons active: '${cfg.userIconFolderName}'.`; indicator.className = 'status-ok'; }
        else { indicator.textContent = `Requires re-selection: '${cfg.userIconFolderName}'.`; indicator.className = 'status-warning'; }
    } else { indicator.textContent = 'No icon source defined. Select folder.'; indicator.className = 'status-warning'; }
}


// --- Icon Loading Functions ---
async function apiIconsManifest() {
    ICON_FOLDERS = {}; ICON_MAP.clear(); let manifestFound = false;
    try {
        const r = await fetch(`icons/manifest.json?v=${Date.now()}`, { cache: 'no-store' });
        if (r.ok) {
            const j = await r.json();
            if (Array.isArray(j.icons)) {
                manifestFound = true;
                j.icons.forEach(p => {
                    const parts = String(p).split('/'); const name = parts.pop(); const folder = parts.length > 0 ? parts.join('/') : 'Default';
                    const url = ('icons/' + String(p).replace(/^\//, '')).replace(/\/+/g, '/');
                    if (!ICON_FOLDERS[folder]) ICON_FOLDERS[folder] = [];
                    ICON_FOLDERS[folder].push({ url, name }); ICON_MAP.set(name, url);
                });
                console.log("Icons loaded from manifest.json"); return true;
            } else { console.warn("manifest.json found but 'icons' array missing/invalid."); }
        } else { console.warn(`Could not fetch icons/manifest.json: ${r.status} ${r.statusText}`); }
    } catch (e) { console.error("Error loading/parsing manifest.json:", e); }
    if (!manifestFound) { console.log("manifest.json not found or invalid."); if (!ICON_FOLDERS['Default']) ICON_FOLDERS['Default'] = []; }
    return false;
}

async function loadIconsFromFSDir() {
    try {
        const dirHandle = await window.showDirectoryPicker({ id: 'icons-dir', mode: 'read' });
        ICON_FOLDERS = {}; ICON_MAP.clear(); const workItems = [];
        for await (const [entryName, entryHandle] of dirHandle.entries()) {
            if (entryHandle.kind === 'directory') {
                const folderName = entryName; ICON_FOLDERS[folderName] = [];
                for await (const [iconName, iconHandle] of entryHandle.entries()) {
                    if (iconHandle.kind === 'file') {
                        const ext = iconName.toLowerCase().split('.').pop();
                        if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) { workItems.push({ handle: iconHandle, name: iconName, folder: folderName }); }
                    }
                }
            } else if (entryHandle.kind === 'file') {
                const iconName = entryName; const ext = iconName.toLowerCase().split('.').pop();
                if (['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
                    if (!ICON_FOLDERS['Default']) ICON_FOLDERS['Default'] = [];
                    workItems.push({ handle: entryHandle, name: iconName, folder: 'Default' });
                }
            }
        }
        const allPromises = workItems.map(async (item) => { const file = await item.handle.getFile(); const url = await readFileAsDataURL(file); ICON_FOLDERS[item.folder].push({ url, name: item.name }); ICON_MAP.set(item.name, url); });
        await Promise.all(allPromises);
        Object.keys(ICON_FOLDERS).forEach(folderName => { if (ICON_FOLDERS[folderName].length === 0) { delete ICON_FOLDERS[folderName]; } });
        if (Object.keys(ICON_FOLDERS).length === 0 || !Object.values(ICON_FOLDERS).some(arr => arr.length > 0)) { alert('No valid icons found.'); updateIconStatusIndicator(); return false; }
        cfg.iconSource = 'user'; cfg.userIconFolderName = dirHandle.name; saveConfig();
        renderIconsSidebar(); drawGrid(); updateIconStatusIndicator(); return true;
    } catch (e) {
        if (e.name !== 'AbortError') { console.warn("Could not load icons from directory:", e); alert("Error loading icons."); }
        updateIconStatusIndicator(); return false;
    }
}


async function reloadIcons(showAlerts = true) {
    console.log("Reloading icons...");
    ICON_MAP.clear();
    ICON_FOLDERS = {};
    const source = cfg?.iconSource || 'default';

    if (source === 'default') {
        await apiIconsManifest();
    }
    else if (source === 'user') {
        if (showAlerts) {
            alert("To refresh icons from a user-selected folder, please click 'Select icon folder...' again.");
        }
    }
    else {
        console.log("Unknown icon source. Using empty set.");
    }

    if (!ICON_FOLDERS['Default']) ICON_FOLDERS['Default'] = [];

    renderIconsSidebar();
    drawGrid();
    updateIconStatusIndicator();
}

async function ensureIcons() {
    await reloadIcons(false);
}

function renderFolderView(parentElement, onIconClickCallback, searchQuery = '') {
    parentElement.innerHTML = ''; const query = searchQuery.toLowerCase().trim();
    const folderNames = Object.keys(ICON_FOLDERS).sort();
    if (ICON_FOLDERS['Default']) { folderNames.splice(folderNames.indexOf('Default'), 1); folderNames.unshift('Default'); }
    folderNames.forEach(folderName => {
        if (!ICON_FOLDERS[folderName] || ICON_FOLDERS[folderName].length === 0) return;
        const details = document.createElement('details'); details.className = 'icon-folder';
        const summary = document.createElement('summary');
        const displayName = folderName.length > 20 ? folderName.substring(0, 17) + '...' : folderName;
        summary.textContent = displayName; summary.title = folderName; details.appendChild(summary);
        const iconList = document.createElement('ul'); iconList.className = 'icon-list-inner';
        ICON_FOLDERS[folderName].forEach(it => {
            if (query.length > 0 && !it.name.toLowerCase().includes(query)) { return; }
            const li = document.createElement('li'); const img = document.createElement('img');
            img.className = 'thumb'; img.src = it.url; img.title = it.name; li.appendChild(img);
            if (onIconClickCallback) { li.onclick = () => onIconClickCallback(it); }
            iconList.appendChild(li);
        });
        if (iconList.children.length > 0) { if (query.length > 0) { details.open = true; } details.appendChild(iconList); parentElement.appendChild(details); }
    });
}


function renderIconsSidebar() { renderFolderView(el('#icons'), null, ''); }

async function openPicker() {
    const dlg = el('#iconPicker'), list = el('#pickerList'), searchInput = el('#iconSearchInput');
    list.innerHTML = ''; searchInput.value = '';
    if (Object.keys(ICON_FOLDERS).length === 0 || !Object.values(ICON_FOLDERS).some(arr => arr.length > 0)) {
        if (cfg.iconSource === 'default') { await ensureIcons(); }
    }
    if (Object.keys(ICON_FOLDERS).length === 0 || !Object.values(ICON_FOLDERS).some(arr => arr.length > 0)) { alert('No icons loaded.'); return; }
    const iconClickHandlerForPicker = (iconData) => { el('#iconPath').value = iconData.name; el('#iconPath').dispatchEvent(new Event('input')); dlg.close(); };
    renderFolderView(list, iconClickHandlerForPicker, '');
    searchInput.oninput = () => { renderFolderView(list, iconClickHandlerForPicker, searchInput.value); };
    el('#pickerClose').onclick = () => dlg.close(); el('#iconPickerCloseBtn').onclick = () => dlg.close();
    dlg.showModal();
}


// --- Import/Export Functions ---
function exportSettings() {
    saveConfig(); const data = localStorage.getItem(CONFIG_STORAGE_KEY); if (!data) { alert("No settings."); return; }
    const blob = new Blob([data], { type: 'application/json' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'deck_settings.json'; a.click(); URL.revokeObjectURL(a.href);
}

async function importSettingsFile(file) {
    const fr = new FileReader();
    fr.onload = async () => {
        try {
            console.log("Importing settings...");
            const importedCfgString = fr.result;

            // 1. Validate JSON
            try { JSON.parse(importedCfgString); }
            catch (e) { throw new Error("Invalid JSON file format."); }

            // 2. Save to LocalStorage and load
            localStorage.setItem(CONFIG_STORAGE_KEY, importedCfgString);
            cfg = loadConfig();

            // --- FIX HERE ---
            // Always go to page 1 (index 0) after import
            currentPage = 0;
            cfg.currentPage = 0; // Apply to config too
            // -----------------------

            // 3. Update UI
            applyDeviceProfile(cfg.device.resolution); // Also calls drawGrid
            applyTheme();

            // Force update page bar and grid (applyDeviceProfile might not be enough sometimes)
            renderPageBar();
            drawGrid();

            updateIconStatusIndicator();
            console.log("Settings imported successfully.");
            //alert("Settings imported successfully!"); 

        } catch (e) {
            console.error("Error importing settings:", e);
            alert(`Could not process file: ${e.message}`);
        }
        // Clear input
        el('#importFile').value = '';
    };
    fr.readAsText(file);
}

// Find generateEspFiles function in app.js and replace with this:

async function generateEspFiles() {
    if (!cfg) {
        alert("Config not loaded.");
        return null;
    }

    const currentProfileKey = cfg.device.resolution || "800x480";
    const currentProfile = DEVICE_PROFILES[currentProfileKey] || DEVICE_PROFILES["800x480"];
    let exportCellSize = currentProfile.cell;

    if (currentProfileKey === "480x320") {
        exportCellSize = 80;
        console.log("Export: 3.5 inch detected. Forcing cell size to 80px.");
    }

    console.log(`Generating files for profile ${currentProfileKey} with cell size: ${exportCellSize}px`);

    const espConfig = {
        title: cfg.deviceName || null,
        wifi: { ssid: cfg.wifi?.ssid || '', pass: cfg.wifi?.pass || '' },
        theme: {
            bg_color: cfg.theme.bg, btn_color: cfg.theme.btn, text_color: cfg.theme.text,
            stroke_color: cfg.theme.stroke, shadow_color: cfg.theme.shadow
        },
        grid: { cols: cfg.grid.cols, rows: cfg.grid.rows },
        pages: []
    };

    const itemsToRender = new Map();
    let generatedIconCounter = 0;

    cfg.pages.forEach((page, pageIndex) => {
        const pageName = cfg.pageNames[pageIndex] || `Page ${pageIndex + 1}`;
        const espPage = { name: pageName, buttons: [] };

        page.forEach(btn => {
            if (btn && isFilled(btn)) {
                let iconName = btn.icon || null;
                let espIconBaseName = null;

                generatedIconCounter++;

                if (iconName) {
                    if (iconName.startsWith('data:')) {
                        espIconBaseName = `local_${generatedIconCounter}`;
                    } else {
                        const lastDot = iconName.lastIndexOf('.');
                        let baseName = (lastDot > -1) ? iconName.substring(0, lastDot) : iconName;
                        baseName = baseName.replace(/[:/\\?%*|"<>]/g, '_');
                        espIconBaseName = `${baseName}_${generatedIconCounter}`;
                    }
                } else if (btn.label && btn.label.length > 0) {
                    espIconBaseName = `text_${generatedIconCounter}`;
                } else {
                    espIconBaseName = null;
                }

                if (espIconBaseName) {
                    if (btn.type === 'toggle') {
                        const offName = `${espIconBaseName}_0.jpg`;
                        const onName = `${espIconBaseName}_1.jpg`;

                        // 1. OFF Image (State A)
                        // Uses default icon and user selected normal colors.
                        itemsToRender.set(offName, {
                            btnData: btn,
                            finalFileName: offName,
                            forcedColor: btn.btnBgColor || ('#' + cfg.theme.btn),
                            forcedIconUrl: null // Use main icon
                        });

                        // 2. ON Image (State B)
                        // SPECIAL LOGIC: 
                        // - URL: "active icon" if exists, else "main icon".
                        // - BG Color: "active bg color"
                        // - Icon Color: "active icon color"

                        const stateBIconUrl = btn.toggleData?.iconOn ? getIconUrl(btn.toggleData.iconOn) : null;

                        // Create a temporary data object and manipulate color so it doesn't break main data
                        const onBtnData = Object.assign({}, btn);
                        if (btn.toggleData?.onIconColor) {
                            onBtnData.iconColor = btn.toggleData.onIconColor;
                        } else {
                            // If active icon color not selected, make white by default (for visibility)
                            onBtnData.iconColor = '#ffffff';
                        }

                        itemsToRender.set(onName, {
                            btnData: onBtnData,
                            finalFileName: onName,
                            forcedColor: btn.toggleData?.onColor || '#2ecc71',
                            forcedIconUrl: stateBIconUrl // Use custom icon if exists
                        });

                        const espBtn = {
                            icon: offName,
                            type: btn.type,
                            toggleData: {
                                iconOff: offName,
                                iconOn: onName,
                                onColor: (btn.toggleData?.onColor || '').replace('#', '')
                            },
                            btnColor: (btn.btnBgColor || cfg.theme.btn).replace('#', ''),
                            labelColor: (btn.labelColor || '').replace('#', '')
                        };
                        if (btn.type === 'key') espBtn.combo = btn.combo;

                        espPage.buttons.push(espBtn);

                    } else {
                        const normalName = `${espIconBaseName}.jpg`;
                        itemsToRender.set(normalName, {
                            btnData: btn,
                            finalFileName: normalName,
                            forcedColor: null
                        });

                        const espBtn = { icon: normalName, type: btn.type || 'normal' };
                        if (btn.type === 'key') espBtn.combo = btn.combo;
                        else if (btn.type === 'goto') espBtn.page = btn.gotoPage + 1;
                        else if (btn.type === 'counter') { espBtn.counterStartValue = btn.counterStartValue; espBtn.counterAction = btn.counterAction; }
                        else if (btn.type === 'timer') {
                            espBtn.duration = btn.timerDuration;
                            espBtn.btnColor = (btn.btnBgColor ? btn.btnBgColor.replace('#', '') : cfg.theme.btn);
                            if (btn.labelColor) espBtn.labelColor = btn.labelColor.replace('#', '');
                        }
                        espPage.buttons.push(espBtn);
                    }
                } else {
                    espPage.buttons.push(null);
                }
            } else {
                espPage.buttons.push(null);
            }
        });
        espConfig.pages.push(espPage);
    });

    const configFileName = 'esp_config.json';
    const configBlob = new Blob([JSON.stringify(espConfig, null, 2)], { type: 'application/json' });

    const imageFiles = [];
    const errors = [];

    for (const [fileName, item] of itemsToRender.entries()) {
        const btnData = item.btnData;
        // If forcedIconUrl exists (State B icon) use it, otherwise use main icon
        const iconUrl = item.forcedIconUrl || getIconUrl(btnData.icon);

        // BUG FIX: If no URL and no label, skip creation (Prevents red square)
        if (!iconUrl && (!btnData.label || btnData.label.length === 0)) {
            continue;
        }

        try {
            const iconBlob = await convertToJpgBlob(iconUrl, btnData, exportCellSize, item.forcedColor);
            imageFiles.push({ blob: iconBlob, fileName: fileName });
        } catch (error) {
            console.error(`Error generating JPG for ${fileName}:`, error);
            errors.push(`Failed to generate ${fileName}: ${error.message}`);
        }
    }

    return { configBlob, configFileName, imageFiles, errors };
}

// -----------------------------------------------------------------
// 3. REPLACE EXISTING uploadConfigToDevice FUNCTION WITH THIS
// -----------------------------------------------------------------
async function uploadConfigToDevice() {
    const btn = el('#uploadToDeviceBtn');
    const originalBtnText = btn.textContent;
    const statusEl = el('#uploadStatus');

    statusEl.textContent = '';
    statusEl.className = 'upload-status-message';

    let host = el('#deviceHost').value.trim();
    if (host.length === 0) {
        host = 'http://smartdeck.local';
        el('#deviceHost').value = host;
    }

    if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = 'http://' + host;
    }
    host = host.replace(/\/$/, '');

    localStorage.setItem(HOST_STORAGE_KEY, host);

    // --- CHANGE HERE ---
    // Using new showCustomConfirm() instead of old confirm().
    const confirmed = await showCustomConfirm(
        `This process will upload the new configuration to the device (${host}) and restart it.\n\nOld, unused icons will be cleaned up *after* the device restarts.\nContinue?`,
        "Upload to Device (WiFi)",
        "Upload",
        "Cancel"
    );

    if (!confirmed) {
        return; // User clicked 'Cancel'
    }
    // --- CHANGE END ---

    try {
        btn.disabled = true;
        btn.textContent = 'Generating files...';

        const generatedData = await generateEspFiles();
        if (!generatedData) {
            btn.disabled = false;
            btn.textContent = originalBtnText;
            return;
        }

        const { configBlob, configFileName, imageFiles, errors } = generatedData;

        if (errors.length > 0) {
            statusEl.textContent = `Errors found during file generation. Aborting upload.\n- ${errors.join('\n- ')}`;
            statusEl.classList.add('error');
            btn.disabled = false;
            btn.textContent = originalBtnText;
            return;
        }

        // STEP 2: /upload (Upload all files)
        const allFiles = [{ blob: configBlob, fileName: configFileName }, ...imageFiles];
        let uploadedCount = 0;

        // First upload config file
        btn.textContent = `Uploading config...`;
        const configFile = allFiles[0];
        let formData = new FormData();
        formData.append('file', configFile.blob, configFile.fileName);

        let response = await fetch(`${host}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Failed to upload ${configFile.fileName}. Status: ${response.statusText}`);
        }
        uploadedCount++;

        // Now upload icons
        for (let i = 1; i < allFiles.length; i++) {
            const file = allFiles[i];
            btn.textContent = `Uploading icon ${i}/${imageFiles.length}...`;
            formData = new FormData();
            formData.append('file', file.blob, file.fileName);

            response = await fetch(`${host}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Failed to upload ${file.fileName}. Status: ${response.statusText}`);
            }
            uploadedCount++;
        }

        // STEP 3: /reboot (Restart)
        btn.textContent = 'Rebooting device...';
        await fetch(`${host}/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "reboot" })
        });

        statusEl.textContent = `Upload complete! ${uploadedCount} files uploaded. Device (${host}) is rebooting.`;
        statusEl.classList.add('success');

    } catch (error) {
        console.error("Upload process failed:", error);

        statusEl.textContent = `Error: Failed to connect or upload to device (${host}). Details: ${error.message}`;
        statusEl.classList.add('error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalBtnText;

        // Clear message after a few seconds
        setTimeout(() => {
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.className = 'upload-status-message';
            }
        }, 8000); // After 8 seconds
    }
}


// app.js
async function openSettings() {
    // 1. Create basic HTML structure for settings
    const settingsHTML = `
        <dialog id="appSettingsDialog" style="width: 1000px; max-width: 90vw; border: none; border-radius: 16px; background: #161616; color: #fff; padding: 0; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
            <div class="editor" style="padding: 20px; width: 100%; box-sizing: border-box;"> 
                
                <div class="hstack" style="justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                    <h3 style="margin: 0; font-size: 18px;" data-i18n="settings.title">⚙️ Application Settings</h3>
                    <button type="button" id="settingsCloseX" class="dialog-close-btn" style="position: static;">×</button>
                </div>
                
                <label style="font-size: 12px; color: var(--muted); font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Startup</label>
                <div class="group-box" style="margin-bottom: 20px;">
                    <div class="row" style="margin-bottom: 0;">
                        <div class="hstack settings-row-stretch" style="justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <span style="color: var(--text); font-weight: 500;" data-i18n="settings.startup">Start with Windows</span>
                                <div class="muted" style="font-size: 12px; margin-top: 4px;" data-i18n="settings.startupDesc">Automatically start minimized to tray on login.</div>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="startupCheckbox">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <label style="font-size: 12px; color: var(--muted); font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Window Behavior</label>
                <div class="group-box" style="margin-bottom: 20px;">
                    <div class="row" style="margin-bottom: 0;">
                        <label for="defaultCloseAction" style="color: var(--text); font-weight: 500; margin-bottom: 8px; display: block;" data-i18n="settings.closeAction">When clicking 'X' (Close) button</label>
                        <select id="defaultCloseAction" class="text" style="width: 100%;">
                            <option value="showConfirm" data-i18n="settings.closeOptions.ask">Always Ask (Show Confirmation)</option>
                            <option value="minimize" data-i18n="settings.closeOptions.minimize">Minimize to Tray (Keep Running)</option>
                            <option value="exit" data-i18n="settings.closeOptions.exit">Exit Application Immediately</option>
                        </select>
                    </div>
                </div>

                <label style="font-size: 12px; color: var(--muted); font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Language</label>
                <div class="group-box" style="margin-bottom: 20px;">
                    <div class="row" style="margin-bottom: 0;">
                        <label for="languageSelect" style="color: var(--text); font-weight: 500; margin-bottom: 8px; display: block;">Application Language</label>
                        <select id="languageSelect" class="text" style="width: 100%;">
                            <option value="en">🇬🇧 English (English)</option>
                            <option value="tr">🇹🇷 Türkçe (Turkish)</option>
                            <option value="de">🇩🇪 Deutsch (German)</option>
                            <option value="es">🇪🇸 Español (Spanish)</option>
                            <option value="fr">🇫🇷 Français (French)</option>
                            <option value="ja">🇯🇵 日本語 (Japanese)</option>
                            <option value="zh">🇨🇳 简体中文 (Simplified Chinese)</option>
                        </select>
                    </div>
                </div>
                <label style="font-size: 12px; color: var(--muted); font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;" data-i18n="settings.sounds">Sound Settings</label>
                <div class="group-box" style="margin-bottom: 20px;">
                    
                    <div class="row" style="margin-bottom: 15px;">
                        <label style="color: var(--text); font-weight: 500; margin-bottom: 8px; display: block;" data-i18n="settings.soundsToggle">Default Toggle Sound</label>
                        <div class="hstack">
                            <input type="text" id="customToggleSoundInput" class="text" style="flex: 1;" data-i18n-placeholder="settings.soundsTogglePlaceholder" placeholder="Default (switch.wav)" readonly />
                            <button id="browseToggleSoundGlobal" class="ghost" type="button" data-i18n="settings.browse">Browse</button>
                            <button id="resetToggleSoundGlobal" class="ghost" type="button" data-i18n="settings.reset_sound" title="Reset">↺</button>
                        </div>
                    </div>

                    <div class="row" style="margin-bottom: 0;">
                        <label style="color: var(--text); font-weight: 500; margin-bottom: 8px; display: block;" data-i18n="settings.soundsTimer">Timer Notification Sound</label>
                        <div class="hstack">
                            <input type="text" id="customNotificationSoundInput" class="text" style="flex: 1;" data-i18n-placeholder="settings.soundsTimerPlaceholder" placeholder="Default (notification.wav)" readonly />
                            <button id="browseNotificationSoundGlobal" class="ghost" type="button" data-i18n="settings.browse">Browse</button>
                            <button id="resetNotificationSoundGlobal" class="ghost" type="button" data-i18n="settings.reset_sound" title="Reset">↺</button>
                        </div>
                    </div>
                </div>

                <label style="font-size: 12px; color: var(--muted); font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;" data-i18n="settings.screen">Screen & Device Settings</label>
                <div class="group-box" style="margin-bottom: 20px;">
                    
                    <div class="row" style="margin-bottom: 15px;">
                        <div class="hstack" style="justify-content: space-between; margin-bottom: 5px;">
                            <label style="color: var(--text); font-weight: 500;" data-i18n="settings.brightness">Screen Brightness</label>
                            <span id="brightnessValueLabel" style="font-size: 13px; color: var(--accent);">100%</span>
                        </div>
                        <input type="range" id="screenBrightnessRange" min="5" max="100" step="5" value="100" style="width: 100%; accent-color: var(--accent);">
                    </div>

                    <div class="row" style="padding-top: 15px; border-top: 1px dashed var(--border); margin-bottom: 0;">
                        <div class="hstack settings-row-stretch" style="justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <span style="color: var(--text); font-weight: 500;" data-i18n="settings.sleep">Screen Sleep (Dim)</span>
                                <div class="muted" style="font-size: 12px; margin-top: 4px;" data-i18n="settings.sleepDesc">Dim screen after inactivity to save power.</div>
                            </div>
                            
                            <select id="sleepDurationSelect" class="text" style="width: 100px; margin-right: 10px; display: none;">
                                <option value="1">1 min</option>
                                <option value="5">5 min</option>
                                <option value="10">10 min</option>
                                <option value="30">30 min</option>
                                <option value="60">60 min</option>
                            </select>

                            <label class="switch">
                                <input type="checkbox" id="screenSleepToggle">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>

                </div>
                
                <div class="row actions" style="margin-top: 25px;">
                    <div class="spacer"></div>
                    <button id="settingsOkBtn" class="primary" type="button" style="min-width: 100px;" data-i18n="settings.done">Done</button>
                </div>
            </div>
        </dialog>
        <input type="file" id="settingsHiddenSoundInput" accept="audio/*" hidden />
    `;

    // 2. Cleanup and Add
    const oldDialog = el('#appSettingsDialog');
    if (oldDialog) oldDialog.remove();
    const oldInput = el('#settingsHiddenSoundInput');
    if (oldInput) oldInput.remove();

    document.body.insertAdjacentHTML('beforeend', settingsHTML);
    const dialog = el('#appSettingsDialog');

    // Immediately after adding HTML, translate according to current language
    applyTranslations();

    // --- LOAD VALUES ---
    el('#defaultCloseAction', dialog).value = (cfg.appSettings && cfg.appSettings.defaultCloseAction) ? cfg.appSettings.defaultCloseAction : 'showConfirm';
    const checkbox = el('#startupCheckbox', dialog);
    if (window.electronAPI && window.electronAPI.app) {
        const isStartupEnabled = await window.electronAPI.app.getStartupStatus();
        checkbox.checked = isStartupEnabled;
    } else {
        checkbox.disabled = true;
    }

    const langSelect = el('#languageSelect', dialog);
    langSelect.value = currentLang;

    const toggleSoundInput = el('#customToggleSoundInput', dialog);
    if (cfg.appSettings && cfg.appSettings.customToggleSound) toggleSoundInput.value = cfg.appSettings.customToggleSound;
    const notifSoundInput = el('#customNotificationSoundInput', dialog);
    if (cfg.appSettings && cfg.appSettings.customNotificationSound) notifSoundInput.value = cfg.appSettings.customNotificationSound;

    const brRange = el('#screenBrightnessRange', dialog);
    const brLabel = el('#brightnessValueLabel', dialog);
    const sleepToggle = el('#screenSleepToggle', dialog);
    const sleepSelect = el('#sleepDurationSelect', dialog);

    const currentBr = cfg.deviceSettings.brightness || 100;
    brRange.value = currentBr;
    brLabel.textContent = currentBr + '%';

    const isSleepOn = cfg.deviceSettings.sleepEnabled || false;
    sleepToggle.checked = isSleepOn;
    sleepSelect.value = cfg.deviceSettings.sleepMinutes || 5;
    sleepSelect.style.display = isSleepOn ? 'block' : 'none';

    // --- SAVING AND EVENTS ---
    brRange.oninput = () => {
        const val = brRange.value;
        brLabel.textContent = val + '%';
        sendSerialCommand(`SET_BRIGHTNESS:${val}`);
        cfg.deviceSettings.brightness = parseInt(val);
        saveConfig();
    };

    const updateSleepSettings = () => {
        const isOn = sleepToggle.checked;
        sleepSelect.style.display = isOn ? 'block' : 'none';
        const mins = parseInt(sleepSelect.value);
        cfg.deviceSettings.sleepEnabled = isOn;
        cfg.deviceSettings.sleepMinutes = mins;
        saveConfig();
        const cmdVal = isOn ? mins : 0;
        sendSerialCommand(`SET_SLEEP:${cmdVal}`);
    };

    sleepToggle.onchange = updateSleepSettings;
    sleepSelect.onchange = updateSleepSettings;

    const applySettings = async () => {
        if (window.electronAPI && window.electronAPI.app) {
            await window.electronAPI.app.setStartupStatus(checkbox.checked);

            if (!cfg.appSettings) cfg.appSettings = {};
            cfg.appSettings.defaultCloseAction = el('#defaultCloseAction', dialog).value;

            const tSound = toggleSoundInput.value.trim();
            cfg.appSettings.customToggleSound = tSound.length > 0 ? tSound : null;

            const nSound = notifSoundInput.value.trim();
            cfg.appSettings.customNotificationSound = nSound.length > 0 ? nSound : null;

            saveConfig();
        }
    };

    el('#startupCheckbox', dialog).onchange = applySettings;
    el('#defaultCloseAction', dialog).onchange = applySettings;

    langSelect.onchange = () => {
        const newLang = langSelect.value;
        loadLanguage(newLang);
    };

    const hiddenInput = el('#settingsHiddenSoundInput');
    const bindBrowse = (btnId, inputEl) => {
        el(btnId, dialog).onclick = () => {
            hiddenInput.value = null;
            hiddenInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file && file.path) {
                    inputEl.value = file.path;
                    applySettings();
                }
            };
            hiddenInput.click();
        };
    };
    const bindReset = (btnId, inputEl) => {
        el(btnId, dialog).onclick = () => {
            inputEl.value = "";
            applySettings();
        };
    };
    bindBrowse('#browseToggleSoundGlobal', toggleSoundInput);
    bindReset('#resetToggleSoundGlobal', toggleSoundInput);
    bindBrowse('#browseNotificationSoundGlobal', notifSoundInput);
    bindReset('#resetNotificationSoundGlobal', notifSoundInput);

    // Close
    const closeDialog = () => dialog.close();
    el('#settingsOkBtn', dialog).onclick = closeDialog;
    el('#settingsCloseX', dialog).onclick = closeDialog;

    dialog.showModal();
}

async function exportForEsp32() {
    try {
        const generatedData = await generateEspFiles();
        if (!generatedData) return;

        const { configBlob, configFileName, imageFiles, errors } = generatedData;

        const outputDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

        const configFileHandle = await outputDirHandle.getFileHandle(configFileName, { create: true });
        let writableConfig = await configFileHandle.createWritable();
        await writableConfig.write(configBlob);
        await writableConfig.close();
        console.log(`${configFileName} created.`);

        let iconsCopied = 0;
        for (const file of imageFiles) {
            const iconFileHandle = await outputDirHandle.getFileHandle(file.fileName, { create: true });
            const writableIcon = await iconFileHandle.createWritable();
            await writableIcon.write(file.blob);
            await writableIcon.close();
            iconsCopied++;
        }

        // --- CHANGE HERE ---
        // Using our new custom function instead of alert()
        let message = `Export complete!\n- ${configFileName}\n- ${iconsCopied} JPGs saved to your computer.`;
        if (errors.length > 0) {
            message += `\n\nErrors during generation:\n- ${errors.join('\n- ')}`;
        }
        await showCustomAlert(message, "Export Complete");
        // --- CHANGE END ---

    } catch (e) {
        console.error("Local Export error:", e);
        // --- CHANGE HERE ---
        // Using custom function for error message too
        if (e.name !== 'AbortError') {
            await showCustomAlert(`Local Export error: ${e.message}`, "Export Error");
        }
        // --- CHANGE END ---
    }
}

// app.js (~satır 1835)

// Define timer outside function (or in global scope)
let pageSwitchTimer = null;

// app.js (~satır 1837)
// Replace existing 'renderPageBar' function with this:

// app.js
function renderPageBar() {
    const bar = el('#pagebar'); bar.innerHTML = '';

    // To update page name in bottom bar of web interface
    const webPageNameEl = el('#web-page-name');

    // ----- LANGUAGE CHANGE HERE -----
    let defaultPageName = t('device.frame.page', { pageNum: currentPage + 1 }); // "Page X"
    let currentActivePageName = defaultPageName;
    // ---------------------------------

    for (let i = 0; i < cfg.pageCount; i++) {
        const b = document.createElement('button'); b.className = 'page-pill' + (i === currentPage ? ' active' : '');

        // ----- LANGUAGE CHANGE HERE -----
        const pageName = cfg.pageNames[i];
        // Translate default name
        const defaultNameForThis = t('device.frame.page', { pageNum: i + 1 });
        b.textContent = (pageName || String(i + 1)); // Show number if no page name (not translated name)
        if (pageName) b.title = defaultNameForThis; // Put translated name in title
        // ---------------------------------

        // Capture active page name
        if (i === currentPage) {
            currentActivePageName = (pageName || defaultNameForThis);
        }

        b.onclick = () => { currentPage = i; drawGrid(); renderPageBar(); saveConfig(false); };

        // --- DRAG EVENTS (No change) ---
        b.addEventListener('dragenter', (e) => {
            if (!e.dataTransfer.types.includes('application/json')) return;
            e.preventDefault();
            if (i === currentPage || pageSwitchTimer) return;
            pageSwitchTimer = setTimeout(() => {
                currentPage = i;
                drawGrid();
                renderPageBar();
                saveConfig();
                pageSwitchTimer = null;
            }, 500);
        });
        b.addEventListener('dragleave', (e) => {
            clearTimeout(pageSwitchTimer);
            pageSwitchTimer = null;
        });
        b.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('application/json')) {
                e.preventDefault();
            }
        });
        b.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(pageSwitchTimer);
            pageSwitchTimer = null;
            const dragData = e.dataTransfer.getData('application/json');
            if (!dragData) return;
            const data = JSON.parse(dragData);
            const fromPage = data.sourcePage;
            const fromIndex = data.sourceIndex;

            const toPage = i;
            if (fromPage === toPage) return;
            const targetPageButtons = cfg.pages[toPage];
            const emptySlotIndex = targetPageButtons.findIndex(btn => !isFilled(btn));
            if (emptySlotIndex !== -1) {
                cfg.pages[toPage][emptySlotIndex] = cfg.pages[fromPage][fromIndex];
                cfg.pages[fromPage][fromIndex] = emptyBtn();
                currentPage = toPage;
                drawGrid();
                renderPageBar();
                saveConfig();
            } else {
                // ----- DİL DEĞİŞİKLİĞİ BURADA -----
                showCustomAlert(t('alerts.pageFull.message'), t('alerts.pageFull.title'));
            }
        });
        // --- DRAG EVENTS END ---

        const edit = document.createElement('i');
        edit.className = 'edit-name page-edit-btn';
        edit.textContent = '✎';
        edit.title = 'Rename Page'; // It would be better to add this to HTML with data-i18n-title, but let's keep it in JS for now.
        edit.onclick = async (e) => {
            e.stopPropagation();
            const currentName = cfg.pageNames[i] || '';

            // ----- DİL DEĞİŞİKLİĞİ BURADA -----
            const newName = await showCustomPrompt(
                t('prompt.renamePage.title', { pageNum: i + 1 }),
                t('prompt.renamePage.label'),
                currentName
            );
            // ---------------------------------

            if (newName !== null) {
                cfg.pageNames[i] = newName.trim();
                saveConfig();
                renderPageBar();
            }
        };
        b.appendChild(edit);

        const x = document.createElement('div'); x.className = 'close'; x.textContent = '×'; x.title = 'Delete Page';
        x.onclick = async (e) => {
            e.stopPropagation();
            if (cfg.pageCount <= 1) {
                // ----- DİL DEĞİŞİKLİĞİ BURADA -----
                await showCustomAlert(t('alerts.deletePage.error_min_pages'), 'Delete Error'); // Can translate error title too
                return;
            }

            // ----- DİL DEĞİŞİKLİĞİ BURADA -----
            const pageDisplayName = cfg.pageNames[i] || t('device.frame.page', { pageNum: i + 1 });
            const confirmed = await showCustomConfirm(
                t('alerts.deletePage.message', { pageName: pageDisplayName }),
                t('alerts.deletePage.title'),
                'Delete', // Can translate this too
                t('editor.cancel')
            );
            // ---------------------------------

            if (!confirmed) return;

            cfg.pages.splice(i, 1);
            cfg.pageNames.splice(i, 1);
            cfg.pageCount--;
            currentPage = Math.max(0, Math.min(currentPage, cfg.pageCount - 1));
            drawGrid();
            renderPageBar();
            saveConfig();
        };
        b.appendChild(x); bar.appendChild(b);
    }

    const add = document.createElement('button'); add.className = 'page-pill add'; add.textContent = '+';

    add.onclick = async () => {

        // ----- DİL DEĞİŞİKLİĞİ BURADA -----
        const newName = await showCustomPrompt(
            t('prompt.addPage.title'),
            t('prompt.addPage.label'),
            t('prompt.addPage.default', { pageNum: cfg.pageCount + 1 })
        );
        // ---------------------------------

        if (newName === null) {
            return;
        }

        cfg.pageCount++;
        cfg.pages.push(Array.from({ length: GRID_COLS * GRID_ROWS }, () => emptyBtn()));
        cfg.pageNames.push(newName.trim()); // Use new name instead of ''
        currentPage = cfg.pageCount - 1;
        drawGrid();
        renderPageBar();
        saveConfig();
    };

    bar.appendChild(add);

    // Update page name in bottom bar of web interface
    if (webPageNameEl) {
        webPageNameEl.textContent = currentActivePageName;
    }
}

function populateGridControls() {
    const csel = el('#cols'), rsel = el('#rows'); csel.innerHTML = ''; rsel.innerHTML = '';
    for (let i = 1; i <= MAX_COLS; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; csel.appendChild(o); }
    for (let i = 1; i <= MAX_ROWS; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; rsel.appendChild(o); }
    csel.value = Math.min(GRID_COLS, MAX_COLS); rsel.value = Math.min(GRID_ROWS, MAX_ROWS);
    GRID_COLS = Number(csel.value); GRID_ROWS = Number(rsel.value);
    csel.onchange = () => onGridChanged(Number(csel.value), GRID_ROWS); rsel.onchange = () => onGridChanged(GRID_COLS, Number(rsel.value));
}


// --- NEW: Function to force free port ---
async function forceFreePort(port) {
    if (!port) return;

    // 1. Is port readable (i.e. open)?
    if (port.readable) {
        // 2. Is it locked? (Is a reader attached?)
        if (port.readable.locked) {
            try {
                // If this port is connected to current global reader (portReader), cancel reader
                if (portReader && connectedSerialPort === port) {
                    await portReader.cancel();
                    portReader.releaseLock();
                    portReader = null;
                }
                // If not global but still locked somehow, we can't unlock it (API limitation),
                // but usually the above step is enough.
            } catch (e) {
                console.warn("Reader unlock error (insignificant):", e);
            }
        }

        // 3. Close port
        try {
            await port.close();
            console.log("Port forcibly closed (cleanup).");
        } catch (e) {
            console.warn("Port close error:", e);
        }
    }
}

function parseAndExecuteKeyCombo(combo) {
    if (!window.electronAPI || !window.electronAPI.robot) {
        console.warn("RobotJS API not found.");
        return;
    }

    const cleanCombo = combo.trim();
    if (cleanCombo.length === 0) return;

    // 1. Media Keys (Remains same)
    const mediaKeys = {
        'AUDIO_MUTE': 'audio_mute', 'AUDIO_PLAY': 'audio_play',
        'AUDIO_NEXT': 'audio_next', 'AUDIO_PREV': 'audio_prev',
        'AUDIO_STOP': 'audio_stop', 'AUDIO_VOL_UP': 'audio_vol_up',
        'AUDIO_VOL_DOWN': 'audio_vol_down'
    };
    if (mediaKeys[cleanCombo.toUpperCase()]) {
        try { window.electronAPI.robot.keyTap(mediaKeys[cleanCombo.toUpperCase()]); } catch (e) { }
        return;
    }

    // 2. Parse Shortcut
    const parts = cleanCombo.split('+').map(k => k.trim());

    const modifierMap = {
        'CTRL': 'control', 'ALT': 'alt', 'SHIFT': 'shift', 'WIN': 'command', 'GUI': 'command'
    };

    let modifiers = [];
    // All except last part are modifiers
    for (let i = 0; i < parts.length - 1; i++) {
        const partUpper = parts[i].toUpperCase();
        if (modifierMap[partUpper]) {
            modifiers.push(modifierMap[partUpper]);
        }
    }

    // Actual Key (Last Part) - E.g. "Ö"
    let rawKey = parts[parts.length - 1];

    // --- CRITICAL FIX: Turkish -> US Physical Key Map ---
    // RobotJS only recognizes US Layout keys.
    // We write which key on TR Q Keyboard corresponds to which key on US.

    const trMap = {
        // TR Letter : US RobotJS Equivalent
        'ö': ',', 'Ö': ',',   // Ö key on TR is Comma key on US
        'ç': '.', 'Ç': '.',   // Ç key on TR is Period key on US
        'ş': ';', 'Ş': ';',   // Ş key on TR is Semicolon key on US
        'ğ': '[', 'Ğ': '[',   // Ğ key on TR is [ key on US
        'ü': ']', 'Ü': ']',   // Ü key on TR is ] key on US

        'i': "'", 'İ': "'",   // İ key on TR (next to Enter) is Single Quote (') key on US
        'ı': 'i', 'I': 'i',   // I key on TR is i key on US (This is very confusing!)

        ',': ',', '.': '.', ';': ';', '/': '/', '\\': '\\',
        '-': '-', '=': '=', '[': '[', ']': ']', "'": "'"
    };

    let finalKey;

    // 1. Is it in the list? (Case sensitive check)
    if (trMap[rawKey]) {
        finalKey = trMap[rawKey];
    }
    // 2. Otherwise standard conversion (only standards to avoid toLowerCase issue)
    else {
        finalKey = rawKey.toLowerCase();

        // Special key name fixes
        if (finalKey === 'esc') finalKey = 'escape';
        if (finalKey === 'return') finalKey = 'enter';
        if (finalKey === 'ins') finalKey = 'insert';
        if (finalKey === 'del') finalKey = 'delete';
        if (finalKey === 'caps') finalKey = 'capslock';
    }

    console.log(`[RobotJS] Raw: "${rawKey}" -> Sending: "${finalKey}" + [${modifiers}]`);

    try {
        // Send cleaned key to RobotJS
        window.electronAPI.robot.keyTap(finalKey, modifiers);
    } catch (e) {
        console.error(`RobotJS Error on key "${finalKey}": ${e.message}`);
    }
}

// app.js (DOMContentLoaded bloğu)


// app.js (En alttaki DOMContentLoaded fonksiyonunun TAMAMI)

document.addEventListener('DOMContentLoaded', async () => {
    if (window.electronAPI && window.electronAPI.app) {
        const ver = await window.electronAPI.app.getVersion();
        const verText = document.querySelector('.app-version-text');
        if (verText) verText.textContent = `Smart Deck v${ver}`;
    }

    // --- AUTO UPDATE LOGIC ---
    const updateContainer = el('#update-container'); // Kutuyu seç
    const updateBtn = el('#updateBtn');

    if (window.electronAPI && window.electronAPI.app) {

        window.electronAPI.app.onUpdateAvailable(() => {
            if (updateContainer && updateBtn) {
                updateContainer.style.display = 'block'; // Kutuyu aç
                updateBtn.classList.remove('hidden');
                updateBtn.innerHTML = `<span class="spin">↻</span> ${t('update.downloading')}`;
            }
        });

        window.electronAPI.app.onUpdateDownloaded(() => {
            if (updateContainer && updateBtn) {
                updateContainer.style.display = 'block'; // Kutuyu aç (zaten açıktır ama garanti olsun)
                updateBtn.classList.add('ready');
                updateBtn.innerHTML = `<span>⬇</span> ${t('update.ready')}`;
                updateBtn.onclick = () => window.electronAPI.app.restartAndInstall();
            }
        });
    }

    initCropSystem();
    // DOMContentLoaded içinde uygun bir yere ekle:
    el('#openFlasherBtn').addEventListener('click', openFirmwareDialog);
    // 1. Learn Asset Path
    if (window.electronAPI && window.electronAPI.app) {
        ASSETS_PATH = await window.electronAPI.app.getAssetsPath();
        ASSETS_PATH = ASSETS_PATH.replace(/\\/g, '/');
        console.log("Assets Path Loaded:", ASSETS_PATH);
    }

    loadPlugins(); // Load plugins
    el('#refreshPluginsBtn').addEventListener('click', loadPlugins);
    el('#openPluginsFolderBtn').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.app && window.electronAPI.app.openPluginsFolder) {
            window.electronAPI.app.openPluginsFolder();
        }
    });

    // 2. Bind Event Listeners
    el('#settingsBtn').addEventListener('click', openSettings);
    el('#undoBtn').addEventListener('click', undoAction);
    el('#redoBtn').addEventListener('click', redoAction);
    el('#refreshSerialBtn').addEventListener('click', () => updateSerialPortList(true));

    el('#uploadViaUsbBtn').onclick = async () => {
        if (!connectedSerialPort) {
            await showCustomAlert(t('alerts.deviceNotConnected', "Device not connected..."), t('alerts.connectionError', "Connection Error"));
            return;
        }
        uploadConfigViaUsb();
    };

    el('#exportSettingsBtn').addEventListener('click', exportSettings);
    el('#exportEspBtn').addEventListener('click', exportForEsp32);
    el('#importSettingsBtn').addEventListener('click', () => { el('#importFile').value = null; el('#importFile').click(); });
    el('#importFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importSettingsFile(f); });
    el('#resetSettingsBtn').addEventListener('click', resetAllSettings);

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoAction(); }
            else if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); redoAction(); }
        }
    });

    // 3. Load Config and Draw UI
    try {
        cfg = loadConfig(); // Load config

        // --- NEW SAFETY CHECK ---
        // If saved resolution setting is broken (e.g. ""), return to default
        if (!cfg.device.resolution || !DEVICE_PROFILES[cfg.device.resolution]) {
            console.warn("Broken resolution setting detected. Resetting to default.");
            cfg.device.resolution = "800x480"; // Return to default profile
        }
        // --- CHECK END ---


        // ----- LANGUAGE LOADING START -----
        let initialLang = (cfg.appSettings && cfg.appSettings.language) ? cfg.appSettings.language : DEFAULT_LANG;

        if (!cfg.appSettings.language) {
            const browserLang = (navigator.language || navigator.userLanguage).split('-')[0];
            if (['en', 'tr', 'de', 'es', 'fr', 'ja', 'zh'].includes(browserLang)) {
                initialLang = browserLang;
            }
        }

        // Start translation engine
        await loadLanguage(initialLang);
        // ----- LANGUAGE LOADING END -----

        // Load Profile and Grid settings
        const resSelect = el('#resolutionSelect');
        for (const [key, profile] of Object.entries(DEVICE_PROFILES)) {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = profile.name;
            resSelect.appendChild(o);
        }

        // This line will now work thanks to cfg.device.resolution having a valid value
        resSelect.value = cfg.device.resolution;

        resSelect.addEventListener('change', (e) => {
            applyDeviceProfile(e.target.value);
        });

        applyTheme();
        wireTheme();

        applyDeviceProfile(cfg.device.resolution);

        saveHistory(); // Save initial state

    } catch (e) {
        console.error("Fatal error during DOMContentLoaded:", e);
    }

    // 4. Start Connection
    if (navigator.serial) {
        navigator.serial.addEventListener('connect', () => updateSerialPortList(true));
        navigator.serial.addEventListener('disconnect', () => updateSerialPortList(true));

        updateSerialPortList(true);
    }
});



// --- UPDATED: "Handshake" function to learn device name ---
async function identifyPort(port) {
    try {
        // --- NEW STEP: First force close port if open ---
        await forceFreePort(port);
        // -----------------------------------------------

        await port.open({ baudRate: 115200 });
        const writer = port.writable.getWriter();
        const reader = port.readable.getReader();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // 1. Send "PING_DECK" command
        await writer.write(encoder.encode("PING_DECK\n"));

        // 2. Wait for response for a short time (e.g. 300ms)
        let deviceName = null;
        const timeout = new Promise(resolve => setTimeout(resolve, 300));
        const readLoop = async () => {
            let buffer = '';
            try {
                while (true) {
                    const { value, done } = await Promise.race([reader.read(), timeout.then(() => ({ done: true, timeout: true }))]);
                    if (done || (value && value.timeout)) break;
                    buffer += decoder.decode(value);
                    if (buffer.includes('\n')) {
                        const line = buffer.trim();
                        if (line.startsWith('PONG_DECK:')) {
                            deviceName = line.substring(10); // Remove "PONG_DECK:" part
                            break;
                        }
                    }
                }
            } catch (e) { /* Ignore if error */ }
        };
        await readLoop();

        // 3. Close port and return name
        try {
            writer.releaseLock();
            reader.releaseLock();
            await port.close();
        } catch (closeErr) { console.warn("Identify close err:", closeErr); }

        return deviceName;

    } catch (e) {
        // If port is busy or error, force clean and return null
        await forceFreePort(port);
        return null;
    }
}

// app.js
function startAutoConnectLoop() {
    if (autoConnectTimer) return; // Exit if already running
    console.log("Starting auto-connect loop...");

    autoConnectTimer = setInterval(() => {
        // If not connected, scan
        if (!connectedSerialPort && !isAutoConnecting) {
            updateSerialPortList(false); // Silent scan
        }
    }, AUTO_CONNECT_INTERVAL);
}

function stopAutoConnectLoop() {
    if (autoConnectTimer) {
        clearInterval(autoConnectTimer);
        autoConnectTimer = null;
        console.log("Auto-connect loop stopped.");
    }
}

// --- Scan Ports and Find Smart Deck ---
// app.js - updateSerialPortList Fonksiyonu
// app.js - updateSerialPortList Function (FIXED VERSION)

// app.js - updateSerialPortList Function (SMART LOOP VERSION)

// app.js - updateSerialPortList Function (30s Timeout + Dot Animation)

let isSearchingLoopActive = false;

// Replace updateSerialPortList function in app.js with this:

async function updateSerialPortList(isManual = false) {
    if (!navigator.serial) return;

    if (connectedSerialPort) {
        const currentLabel = el('#connStatus').textContent;
        const deviceName = currentLabel.includes(':') ? currentLabel.split(':')[1].trim() : "Smart Deck";
        updateConnectionUI(true, deviceName);
        return;
    }

    if (isSearchingLoopActive) return;

    const statusEl = el('#connStatus');
    const dotEl = el('#connectionDot');
    const refreshBtn = el('#refreshSerialBtn');
    const uploadBtn = el('#uploadViaUsbBtn');

    isSearchingLoopActive = true;
    if (refreshBtn) refreshBtn.classList.add('spin');
    if (dotEl) dotEl.className = "status-dot scanning";

    // --- CHANGE STARTS HERE ---
    // Here we only do static initial assignment, not making variable const.
    if (statusEl) {
        statusEl.textContent = t('connection.searching');
        statusEl.className = "conn-scanning";
    }
    if (uploadBtn) {
        uploadBtn.textContent = t('connection.searching');
        uploadBtn.classList.add('ghost');
        uploadBtn.disabled = true;
    }

    const maxRetries = 30;

    for (let i = 0; i < maxRetries; i++) {
        if (connectedSerialPort) break;

        // --- CRITICAL FIX ---
        // We get translation fresh at EACH step of loop.
        // So if language changes, text will change in next second too.
        const currentSearchingText = t('connection.searching');

        const dotCount = (i % 3) + 1;
        const dots = ".".repeat(dotCount);

        const message = currentSearchingText + dots; // Use new translation

        if (statusEl) statusEl.textContent = message;
        if (uploadBtn) uploadBtn.textContent = message;
        // --- FIX END ---

        try {
            const ports = await navigator.serial.getPorts();
            let foundPort = null;
            let foundName = "";

            for (const port of ports) {
                const name = await identifyPort(port);
                if (name && (name.toLowerCase().includes('smartdeck') || name.toLowerCase().includes('smart deck'))) {
                    foundPort = port;
                    foundName = name;
                    break;
                }
            }

            if (foundPort) {
                await connectToDevice(foundPort);
                updateConnectionUI(true, foundName);
                isSearchingLoopActive = false;
                if (refreshBtn) refreshBtn.classList.remove('spin');
                return;
            }

        } catch (e) {
            console.log("Search iter error:", e);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isSearchingLoopActive = false;
    updateConnectionUI(false);
    if (refreshBtn) refreshBtn.classList.remove('spin');
}

// --- NEW: For new device find button (Magnifying glass) ---
async function findNewSerialPort() {
    if (!navigator.serial) return;
    try {
        await navigator.serial.requestPort();
        // Update list when selection window closes
        await updateSerialPortList();
    } catch (e) {
        // User cancelled, no problem.
    }
}

// app.js (uploadConfigViaUsb fonksiyonunun tamamı)

// app.js (uploadConfigViaUsb fonksiyonunun tamamı)

// app.js (uploadConfigViaUsb function FIXED version)

async function uploadConfigViaUsb() {

    const btn = el('#uploadViaUsbBtn');
    const originalBtnText = btn.textContent;
    const statusEl = el('#uploadStatus');
    statusEl.textContent = '';
    statusEl.className = 'upload-status-message';

    // --- NEW: Track if upload really started ---
    let isUploadStarted = false;
    // ------------------------------------------------------

    let uploadSuccess = false;
    let portToUse = connectedSerialPort;

    // 1. Port Check
    if (!portToUse) {
        try {
            statusEl.textContent = 'Please select your Smart Deck device...';
            statusEl.classList.add('warning');
            portToUse = await navigator.serial.requestPort({});
        } catch (e) {
            if (e.message.includes('No port selected') || e.name === 'NotFoundError') {
                statusEl.textContent = 'No device selected.';
            } else {
                statusEl.textContent = 'Error: ' + e.message;
            }
            statusEl.classList.add('error');
            btn.disabled = false;
            btn.textContent = originalBtnText;

            // If we return here, finally won't run because try block hasn't started yet.
            // But if port connection is lost, we may want to refresh UI.
            setTimeout(async () => {
                connectedSerialPort = null;
                isAutoConnected = false;
                statusEl.textContent = '';
                await updateSerialPortList(true);
            }, 500);
            return;
        }
    }

    let uploadReader;
    let writer;

    try {
        btn.disabled = true;
        statusEl.textContent = 'Generating files...';

        // 2. Generate Files
        let generatedData;
        try {
            generatedData = await generateEspFiles();
            if (!generatedData || generatedData.errors.length > 0) {
                throw new Error(generatedData?.errors.join(', ') || "Gen failed");
            }
        } catch (e) { throw e; }

        const { configBlob, configFileName, imageFiles } = generatedData;
        const allFiles = [{ blob: configBlob, fileName: configFileName }, ...imageFiles];

        // 3. Manifest Checks and Hash Calculation
        let oldManifest = {};
        try { oldManifest = JSON.parse(localStorage.getItem(MANIFEST_STORAGE_KEY) || '{}'); } catch (e) { }

        const filesToUpload = [];
        const newManifest = {};

        statusEl.textContent = 'Calculating changes...';

        for (const file of allFiles) {
            const hash = await calculateBlobHash(file.blob);
            newManifest[file.fileName] = hash;
            if (oldManifest[file.fileName] !== hash) {
                filesToUpload.push(file);
            }
        }

        const skippedCount = allFiles.length - filesToUpload.length;

        // 4. User Confirmation
        let confirmMsg = "";
        if (filesToUpload.length === 0) {
            confirmMsg = "No changes detected. Your device is up to date.\n\nDo you want to force a full upload anyway?";
        } else {
            confirmMsg = `Smart Upload Ready:\n- ${filesToUpload.length} files changed/new.\n- ${skippedCount} files unchanged (skipping).\n\nContinue?`;
        }

        const confirmResult = await showCustomConfirm(
            `${confirmMsg}\n\n<label style="display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--text);"><input type="checkbox" id="forceFullUpload" style="width: 16px; height: 16px;"> Force Full Upload (Slow)</label>`,
            "Upload Confirmation",
            "Start Upload",
            "Cancel"
        );

        if (!confirmResult) {
            // --- CANCEL STATE ---
            // isUploadStarted is still false so finally block won't disconnect.
            btn.disabled = false;
            btn.textContent = originalBtnText;
            statusEl.textContent = '';
            return;
        }

        // --- CRITICAL POINT: User CONFIRMED, no turning back now ---
        isUploadStarted = true;
        // -------------------------------------------------------------

        const forceUpload = document.getElementById('forceFullUpload')?.checked || false;
        let finalUploadList = forceUpload ? allFiles : filesToUpload;

        if (finalUploadList.length === 0 && !forceUpload) {
            statusEl.textContent = 'Up to date. No upload needed.';
            statusEl.classList.add('success');
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
            btn.disabled = false;
            btn.textContent = originalBtnText;
            // Here we didn't upload but process is considered complete, 
            // isUploadStarted=true so finally will reset port. 
            // In this case resetting is not a problem, it's a clean start.
            return;
        }

        // --- UPLOAD OPERATIONS ---
        statusEl.textContent = '';

        // Port Preparation (Close current listener)
        if (portToUse === connectedSerialPort) {
            if (isListening && portReader) {
                await portReader.cancel();
                portReader.releaseLock();
                isListening = false;
                if (textDecoder.writable) {
                    await textDecoder.writable.abort();
                    textDecoder = new TextDecoderStream();
                }
            }
        }

        // Open port if not open
        if (!portToUse.readable) await portToUse.open({ baudRate: 115200 });

        writer = portToUse.writable.getWriter();
        uploadReader = portToUse.readable.getReader();

        // Serial Helpers
        let serialBuffer = '';
        const uploadDecoder = new TextDecoder();
        async function readUploadLine() {
            while (true) {
                const n = serialBuffer.indexOf('\n');
                if (n !== -1) { const l = serialBuffer.substring(0, n).trim(); serialBuffer = serialBuffer.substring(n + 1); return l; }
                const { value, done } = await uploadReader.read();
                if (done) throw new Error('Port closed');
                if (value) serialBuffer += uploadDecoder.decode(value, { stream: true });
            }
        }
        async function writeSerial(d) { const enc = new TextEncoder(); await writer.write(typeof d === 'string' ? enc.encode(d) : d); }

        // Protocol Start
        btn.textContent = 'Handshake...';
        await writeSerial("START_UPLOAD\n");

        let response = await readUploadLine();
        while (response && !response.includes("READY")) { response = await readUploadLine(); }
        if (!response || !response.includes("READY")) throw new Error("Device not ready");

        // Send Files
        for (let i = 0; i < finalUploadList.length; i++) {
            const f = finalUploadList[i];
            btn.textContent = `File ${i + 1}/${finalUploadList.length}`;
            statusEl.textContent = `Uploading: ${f.fileName} (${Math.ceil(f.blob.size / 1024)}KB)`;

            const buf = await f.blob.arrayBuffer();
            await writeSerial(`FILE:${f.fileName}:${buf.byteLength}\n`);
            if ((await readUploadLine()) !== "OK_FILE") throw new Error(`Init failed: ${f.fileName}`);
            await writeSerial(buf);
            if ((await readUploadLine()) !== "OK_DATA") throw new Error(`Data failed: ${f.fileName}`);
        }

        btn.textContent = 'Finishing...';
        statusEl.textContent = 'Finalizing...';
        await writeSerial("END_UPLOAD\n");

        response = await readUploadLine();
        if (!response.includes("DONE_REBOOT")) throw new Error("Finalize failed");

        console.log("Upload successful!");
        statusEl.textContent = 'Rebooting device...';

        localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(newManifest));

        let setupDone = false;
        const rebootTimer = setTimeout(() => { if (!setupDone) console.warn("Reboot timeout."); }, 15000);

        while (!setupDone) {
            try {
                response = await readUploadLine();
                if (response && response.includes("SETUP_DONE")) {
                    setupDone = true;
                    clearTimeout(rebootTimer);
                }
            } catch (e) { setupDone = true; clearTimeout(rebootTimer); }
        }

        if (setupDone) {
            statusEl.textContent = `Success! (${finalUploadList.length} uploaded, ${skippedCount} skipped)`;
            statusEl.classList.add('success');
            uploadSuccess = true;
        }

    } catch (error) {
        console.error("USB Upload failed:", error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.classList.add('error');
    } finally {
        // --- CHANGE HERE: Reset port only if upload started ---
        if (isUploadStarted) {
            if (writer) try { writer.releaseLock(); } catch (e) { }
            if (uploadReader) try { uploadReader.releaseLock(); } catch (e) { }

            // Clean and close port
            if (portToUse) {
                try {
                    if (portToUse.readable && !portToUse.readable.locked) await portToUse.close();
                } catch (err) { console.warn("Port close error:", err); }
            }

            connectedSerialPort = null;
            isAutoConnected = false;

            // Device is rebooting, wait a bit and search again
            await new Promise(resolve => setTimeout(resolve, 2000));
            await updateSerialPortList(true);
        } else {
            // If cancelled (isUploadStarted = false), don't touch anything!
            // Just fix button state.
        }

        btn.disabled = false;
        btn.textContent = originalBtnText;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, uploadSuccess ? 5000 : 8000);
    }
}


async function searchOnlineIcons(query) {
    const statusEl = el('#onlineStatus');
    const listEl = el('#onlineList');

    if (!query || query.length < 2) {
        listEl.innerHTML = '';
        statusEl.textContent = 'Type at least 2 characters to search...';
        statusEl.style.display = 'block';
        return;
    }

    statusEl.textContent = 'Searching Iconify...';
    statusEl.style.display = 'block';

    try {
        const limit = 100;
        const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`);
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();

        listEl.innerHTML = '';
        if (data.icons && data.icons.length > 0) {
            statusEl.style.display = 'none';
            data.icons.forEach(iconStr => {
                const li = document.createElement('li');
                li.title = iconStr;

                const img = document.createElement('img');
                // NEW: Use smart URL function
                img.src = getSmartPreviewUrl(iconStr);
                img.loading = 'lazy';

                li.appendChild(img);

                li.onclick = () => {
                    const [set, ...nameParts] = iconStr.split(':');
                    const name = nameParts.join('-');
                    el('#iconPath').value = `online:${set}:${name}`;
                    el('#iconPath').dispatchEvent(new Event('input'));
                    el('#iconPicker').close();
                };

                listEl.appendChild(li);
            });
        } else {
            statusEl.textContent = 'No icons found.';
        }
    } catch (e) {
        console.error("Online search error:", e);
        statusEl.textContent = 'Error searching icons.';
    }
}

let searchDebounceTimer = null;

async function searchOnlineIcons(query) {
    const statusEl = el('#onlineStatus');
    const listEl = el('#onlineList');

    if (!query || query.length < 2) {
        // If query is empty, we can show some popular icons as examples or leave it empty.
        // Let's keep it clean for now.
        listEl.innerHTML = '';
        statusEl.textContent = 'Type at least 2 characters to search...';
        statusEl.style.display = 'block';
        return;
    }

    statusEl.textContent = 'Searching Iconify...';
    statusEl.style.display = 'block';

    try {
        const limit = 100;
        const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`);
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();

        listEl.innerHTML = '';
        if (data.icons && data.icons.length > 0) {
            statusEl.style.display = 'none';
            data.icons.forEach(iconStr => {
                // iconStr example: "mdi:home-outline"
                const [set, ...nameParts] = iconStr.split(':');
                const name = nameParts.join('-');
                const iconUrl = `https://api.iconify.design/${set}/${name}.svg`;

                const li = document.createElement('li');
                li.title = iconStr;

                const img = document.createElement('img');
                img.src = iconUrl;
                img.loading = 'lazy'; // Lazy load for performance

                li.appendChild(img);

                li.onclick = () => {
                    // Write selected to input and close dialog
                    el('#iconPath').value = `online:${set}:${name}`;
                    el('#iconPath').dispatchEvent(new Event('input'));
                    el('#iconPicker').close();
                };

                listEl.appendChild(li);
            });
        } else {
            statusEl.textContent = 'No icons found.';
        }
    } catch (e) {
        console.error("Online search error:", e);
        statusEl.textContent = 'Error searching icons.';
    }
}

function openPicker() {
    const dlg = el('#iconPicker');
    const searchInput = el('#iconSearchInput');
    const statusEl = el('#onlineStatus');
    const listEl = el('#onlineList');

    // Make a clean start every time dialog opens
    searchInput.value = '';
    listEl.innerHTML = '';
    statusEl.textContent = 'Type above to search Iconify...';
    statusEl.style.display = 'block';

    // Auto focus
    setTimeout(() => searchInput.focus(), 100);

    // Search listener
    searchInput.oninput = () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchOnlineIcons(searchInput.value);
        }, 300); // 300ms wait
    };

    el('#pickerClose').onclick = () => dlg.close();
    el('#iconPickerCloseBtn').onclick = () => dlg.close();
    dlg.showModal();
}
// --- REQUIRED FUNCTIONS FOR MAIN PROCESS INTEGRATION ---
// Add to BOTTOM of app.js file

window.getCloseAction = function () {
    // If cfg not loaded yet, return 'showConfirm' as default
    return (typeof cfg !== 'undefined' && cfg && cfg.appSettings) ? cfg.appSettings.defaultCloseAction : 'showConfirm';
};

window.setCloseAction = function (action) {
    if (typeof cfg === 'undefined' || !cfg) return;

    if (!cfg.appSettings) cfg.appSettings = {};
    cfg.appSettings.defaultCloseAction = action;

    // Save setting
    saveConfig();
    console.log(`[Main] Default close action saved as: ${action}`);
};

// --- AUTO-SCALING ---
// Scales everything proportionally when window shrinks.

function fitToWindow() {
    // Original dimensions design is based on (your values in main.js)
    const baseWidth = 1200;
    const baseHeight = 1200;

    // Current window dimensions
    const currentWidth = window.innerWidth;
    const currentHeight = window.innerHeight;

    // Calculate ratio for both width and height
    const widthRatio = currentWidth / baseWidth;
    const heightRatio = currentHeight / baseHeight;

    // Use whichever ratio is smaller (So no overflow, "fit" logic)
    // If you want only width-based, use 'widthRatio' directly.
    const newZoom = Math.min(widthRatio, heightRatio);

    // Apply zoom level
    document.body.style.zoom = newZoom;
}

// 1. Run when application opens
window.addEventListener('DOMContentLoaded', fitToWindow);

// 2. Run every time window resizes
window.addEventListener('resize', fitToWindow);

// app.js - handlePcTimer Fonksiyonunu DEĞİŞTİR

// app.js - handlePcTimer Function (UPDATED)

function handlePcTimer(pIdx, bIdx, state, remainingSeconds) {
    const timerKey = `${pIdx}_${bIdx}`;

    // 1. MEMORY MANAGEMENT
    if (state === 2 || state === 0) {
        delete activeTimerTargets[timerKey];
    }
    else if (state === 1) {
        if (!activeTimerTargets[timerKey]) {
            activeTimerTargets[timerKey] = Date.now() + (remainingSeconds * 1000);
        }
    }

    // 2. VISUAL MANAGEMENT (Only if on active page)
    if (pIdx !== currentPage) {
        return;
    }

    // Clear old interval if exists
    if (activePcTimers[bIdx]) {
        clearInterval(activePcTimers[bIdx]);
        delete activePcTimers[bIdx];
    }

    const cellDiv = document.querySelector(`.cell[data-index="${bIdx}"]`);
    if (!cellDiv) return;
    const labelEl = cellDiv.querySelector('.label');
    if (!labelEl) return;

    // --- RESET (2) veya PAUSE (0) ---
    if (state === 2 || state === 0) {
        const min = Math.floor(remainingSeconds / 60);
        const sec = remainingSeconds % 60;
        labelEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

        // --- COLOR FIX ---
        // When resetting: Restore button's original color from settings
        const originalBtn = cfg.pages[pIdx] ? cfg.pages[pIdx][bIdx] : null;

        if (originalBtn && originalBtn.labelColor) {
            // If user has custom color, apply it
            labelEl.style.color = originalBtn.labelColor;
        } else {
            // Otherwise return to theme default (remove style)
            labelEl.style.color = '';
        }
        // -----------------------
    }
    // --- RUN (1) ---
    else if (state === 1) {
        if (activeTimerTargets[timerKey]) {
            startVisualTimer(bIdx, activeTimerTargets[timerKey]);
        }
    }
}

// --- PC Side Live Counter Management ---
function handlePcCounter(btnIndex, newValue) {
    const cellDiv = document.querySelector(`.cell[data-index="${btnIndex}"]`);
    if (!cellDiv) return;

    const labelEl = cellDiv.querySelector('.label');
    if (labelEl) {
        // Replace label with new counter value
        labelEl.textContent = String(newValue);

        // Optional: Small animation/color effect to show value changed
        // labelEl.style.color = "#4ade80"; // Make green
        // setTimeout(() => { labelEl.style.color = ""; }, 300); // Revert
    }
}

// --- NEW: Get Sound File Path (Fixed .wav) ---
function getToggleSoundPath() {
    // 1. Did user select custom sound? (If setting is filled)
    if (cfg.appSettings && cfg.appSettings.customToggleSound && cfg.appSettings.customToggleSound.trim() !== "") {
        let customPath = cfg.appSettings.customToggleSound.replace(/\\/g, '/');

        if (customPath.startsWith('file:') || customPath.startsWith('http')) {
            return customPath;
        }
        return 'file:///' + encodeURI(customPath);
    }

    // 2. If setting is EMPTY, use default
    if (!ASSETS_PATH) return "";

    const cleanAssetsPath = ASSETS_PATH.replace(/\\/g, '/');

    // FIX: Updated to switch.wav
    const defaultPath = `file:///${cleanAssetsPath}/switch.wav`;

    return encodeURI(defaultPath);
}

// --- NEW: Get Notification Sound Path (For Timer) ---
function getNotificationSoundPath() {
    // 1. Did user select custom sound?
    if (cfg.appSettings && cfg.appSettings.customNotificationSound) {
        const s = cfg.appSettings.customNotificationSound.trim();
        if (s.length > 0) {
            let customPath = s.replace(/\\/g, '/');
            // Don't touch if protocol already exists
            if (customPath.startsWith('file:') || customPath.startsWith('http')) {
                return customPath;
            }
            // Otherwise convert to file path format
            return 'file:///' + encodeURI(customPath);
        }
    }

    // 2. If no custom sound, use default
    if (!ASSETS_PATH) {
        console.warn("Warning: ASSETS_PATH is empty. Cannot find default sound.");
        return "";
    }

    const cleanAssetsPath = ASSETS_PATH.replace(/\\/g, '/');

    // Default file: notification.wav (Make sure file name matches exactly in assets folder!)
    return encodeURI(`file:///${cleanAssetsPath}/notification.wav`);
}

// --- NEW: Updates only single button visually (Without breaking Grid) ---
function updateButtonVisuals(index) {
    // 1. Find existing button (Cell)
    const oldCell = document.querySelector(`.cell[data-index="${index}"]`);
    if (!oldCell) return; // Exit if not found

    // 2. Get new data for that index
    const btnData = cfg.pages[currentPage][index];

    // 3. Create new cell (cellTemplate is our existing logic)
    const newCell = cellTemplate(index, btnData || emptyBtn());

    // 4. Replace old cell with new one (DOM Replacement)
    // This operation doesn't touch other cells (Timer etc.)!
    oldCell.replaceWith(newCell);
}

// app.js - UI Helper

// app.js
function updateConnectionUI(isConnected, deviceName = "") {
    const statusEl = el('#connStatus');
    const dotEl = el('#connectionDot');
    const uploadBtn = el('#uploadViaUsbBtn');

    if (isConnected) {
        // --- FIX (PROBLEM 2) ---
        statusEl.textContent = t('connection.connected', { deviceName: deviceName });
        statusEl.className = "conn-connected";
        dotEl.className = "status-dot connected";

        uploadBtn.textContent = t('device.buttons.upload'); // Use translation
        uploadBtn.classList.remove('ghost', 'danger');
        uploadBtn.classList.add('primary');
        uploadBtn.disabled = false;
    } else {
        // --- DÜZELTME (PROBLEM 2) ---
        statusEl.textContent = t('connection.disconnected');
        statusEl.className = "conn-disconnected";
        dotEl.className = "status-dot disconnected";

        uploadBtn.textContent = t('device.buttons.upload'); // Use translation
        uploadBtn.classList.remove('primary', 'danger');
        uploadBtn.classList.add('ghost');
        uploadBtn.disabled = false;
    }
}



// Paste the following function somewhere and call initCropSystem() in DOMContentLoaded.
function initCropSystem() {
    const browseBtn = el('#browseLocalIconBtn');
    const fileInput = el('#hiddenLocalIconInput');
    const dialog = el('#cropDialog');
    cropImgEl = el('#cropImageToEdit');
    const wrapper = el('#cropWrapper');
    const zoomSlider = el('#cropZoomSlider');
    const saveBtn = el('#cropSaveBtn');
    const cancelBtn = el('#cropCancelBtn');

    if (browseBtn) browseBtn.onclick = () => {
        fileInput.value = null;
        fileInput.click();
    };

    if (fileInput) fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            cropImgEl.src = evt.target.result;
            cropImgEl.onload = () => {
                const initialScale = 0.7; // start a bit more zoomed out

                cropState.scale = initialScale;
                cropState.x = 0;
                cropState.y = 0;
                cropState.imgWidth = cropImgEl.naturalWidth;
                cropState.imgHeight = cropImgEl.naturalHeight;

                if (zoomSlider) {
                    // Let's narrow the range a bit, make it precise
                    zoomSlider.min = 0.01;
                    zoomSlider.max = 3.0;
                    zoomSlider.step = 0.01;
                    zoomSlider.value = initialScale;
                }

                updateCropTransform();
                dialog.showModal();
            };

        };
        reader.readAsDataURL(file);
    };

    if (zoomSlider) zoomSlider.oninput = () => {
        cropState.scale = parseFloat(zoomSlider.value);
        updateCropTransform();
    };

    if (wrapper) {
        wrapper.onmousedown = (e) => {
            cropState.isDragging = true;
            cropState.startX = e.clientX - cropState.x;
            cropState.startY = e.clientY - cropState.y;
            wrapper.style.cursor = 'grabbing';
        };
        window.addEventListener('mousemove', (e) => {
            if (!cropState.isDragging) return;
            e.preventDefault();
            cropState.x = e.clientX - cropState.startX;
            cropState.y = e.clientY - cropState.startY;
            updateCropTransform();
        });
        window.addEventListener('mouseup', () => {
            cropState.isDragging = false;
            if (wrapper) wrapper.style.cursor = 'grab';
        });
    }

    if (cancelBtn) cancelBtn.onclick = () => dialog.close();

    // --- FIXED SAVE SECTION ---
    // ... in initCropSystem ...
    // 5. SAVE BUTTON (DIRECT DOM INTERVENTION)
    if (saveBtn) saveBtn.onclick = async () => {
        const base64Data = getCroppedImageBase64();

        if (window.electronAPI && window.electronAPI.app) {
            try {
                const result = await window.electronAPI.app.saveTempIcon(base64Data);

                if (result.success) {
                    let cleanPath = result.path.replace(/\\/g, '/');
                    const fileUrl = 'file:///' + cleanPath;

                    console.log("File saved:", fileUrl);

                    // --- 1. UPDATE INPUT ---
                    const iconInput = document.getElementById('iconPath');
                    if (iconInput) {
                        iconInput.value = fileUrl;
                        // Trigger input event so other listeners wake up
                        iconInput.dispatchEvent(new Event('input'));
                    }

                    // --- 2. UPDATE TMP VARIABLE (Memory) ---
                    if (typeof tmp !== 'undefined') {
                        tmp.icon = fileUrl;
                        tmp.iconColor = '';
                        // Reset color picker
                        const c = document.getElementById('iconColor');
                        if (c) { c.value = '#ffffff'; c.classList.add('unset'); }
                    }

                    // --- 3. CRITICAL HIT: WRITE DIRECTLY TO IMAGE (DOM) ---
                    // Skip intermediaries, writing directly to element.
                    const rawImg = document.getElementById('previewImgRaw');
                    const iconI = document.getElementById('previewIcon');

                    if (rawImg) {
                        rawImg.src = fileUrl; // <--- Hammering URL here
                        rawImg.style.display = 'block'; // Make visible

                        // Apply scaling
                        const scale = (typeof tmp !== 'undefined') ? (1 + (tmp.iconScale / 100)) : 1;
                        rawImg.style.transform = `scale(${Math.max(0.1, scale)})`;
                    }

                    // Hide old icon
                    if (iconI) iconI.style.display = 'none';

                } else {
                    alert("Error: " + result.error);
                }
            } catch (e) {
                console.error(e);
                alert("Save failed.");
            }
        }
        dialog.close();
    };

}

function updateCropTransform() {
    if (!cropImgEl) return;
    cropImgEl.style.transform = `translate(${cropState.x}px, ${cropState.y}px) scale(${cropState.scale})`;
}

function getCroppedImageBase64() {
    // Output size (128px or 256px for quality)
    const outputSize = 128;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    // Crop area size (Should be proportional to .crop-overlay width/height value in CSS)
    // We said 150px in CSS.
    const viewportSize = 150;

    // Calculations
    const scale = cropState.scale;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw image to Canvas
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.translate(cropState.x * (outputSize / viewportSize), cropState.y * (outputSize / viewportSize));
    ctx.scale(scale * (outputSize / viewportSize), scale * (outputSize / viewportSize));
    ctx.drawImage(cropImgEl, -cropState.imgWidth / 2, -cropState.imgHeight / 2);
    ctx.restore();

    return canvas.toDataURL('image/png');
}

// --- PLUGIN SYSTEM ---

// app.js
async function loadPlugins() {
    const container = el('#pluginsContainer');
    if (!container) return;

    container.innerHTML = `<div class="muted" style="text-align:center; padding:20px;" data-i18n="plugins.loading">Loading plugins...</div>`;

    if (window.electronAPI && window.electronAPI.app && window.electronAPI.app.scanPlugins) {
        const plugins = await window.electronAPI.app.scanPlugins();

        // --- UPDATE: Load AND START scripts ---
        // Load sequentially (await)
        for (const p of plugins) {
            if (p._jsPath) {
                console.log(`Loading dynamic script for: ${p.meta.name}`);

                try {
                    // 1. Load script and wait for completion
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = p._jsPath;
                        script.onload = resolve;
                        script.onerror = () => reject(new Error(`Script load error: ${p.meta.name}`));
                        document.body.appendChild(script);
                    });

                    // 2. If script loaded, find and run init function
                    // (We expect the function name in plugin.js to be "init_PLUGIN_ID_plugin")
                    const pluginId = (p.meta && p.meta.id) ? p.meta.id : null;
                    if (pluginId) {
                        const initFunctionName = `init_${pluginId}_plugin`;
                        if (typeof window[initFunctionName] === 'function') {
                            console.log(`Initializing plugin: ${initFunctionName}`);
                            // Give it the API bridge
                            window[initFunctionName](window.SmartDeckAPI);
                        } else {
                            console.warn(`Plugin ${p.meta.name} has a plugin.js but no ${initFunctionName} function was found.`);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
        // --- UPDATE END ---

        renderPlugins(plugins); // Draw HTML after all scripts loaded
    } else {
        container.innerHTML = `<div class="muted" data-i18n="plugins.api_not_ready">API not ready.</div>`;
    }
}
// app.js
// app.js
function renderPlugins(plugins) {
    const container = el('#pluginsContainer');
    container.innerHTML = '';

    if (!plugins || plugins.length === 0) {
        container.innerHTML = `<div class="muted" style="text-align:center; padding:20px;" data-i18n="plugins.none">No plugins found in /plugins folder.</div>`;
        return;
    }

    plugins.sort((a, b) => {
        const nameA = (a.meta && a.meta.name) ? a.meta.name.toLowerCase() : "zz_unknown";
        const nameB = (b.meta && b.meta.name) ? b.meta.name.toLowerCase() : "zz_unknown";
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });

    plugins.forEach(p => {
        const details = document.createElement('details');
        details.className = 'plugin-item';

        const summary = document.createElement('summary');
        const title = (p.meta && p.meta.name) ? p.meta.name : 'Unknown Plugin';
        const author = (p.meta && p.meta.author) ?
            ` <span style="font-weight:normal; opacity:0.5; font-size:11px; margin-left: auto; margin-right: 10px;">by ${p.meta.author}</span>` : '';
        summary.innerHTML = `${title}${author}`;

        summary.addEventListener('click', (e) => {
            if (!details.hasAttribute('open')) {
                const siblings = container.querySelectorAll('details');
                siblings.forEach(other => {
                    if (other !== details) {
                        other.removeAttribute('open');
                    }
                });
            }
        });

        const grid = document.createElement('div');
        grid.className = 'plugin-grid';

        if (p.buttons && Array.isArray(p.buttons)) {
            p.buttons.forEach((btnData, i) => {
                const btnEl = document.createElement('div');
                btnEl.className = 'plugin-btn-drag';
                btnEl.draggable = true;

                const pluginId = (p.meta && p.meta.id) ? p.meta.id : title.toLowerCase().replace(' ', '-');
                btnEl.dataset.pluginId = pluginId;
                btnEl.dataset.buttonIndex = i;

                let previewIconUrl = getIconUrl(btnData.icon);

                if (p._basePath && btnData.icon && !btnData.icon.match(/^(http|https|online:|data:|file:)/)) {
                    const cleanBase = p._basePath.replace(/\\/g, '/');
                    const cleanIcon = btnData.icon.replace(/\\/g, '/').replace(/^\//, '');
                    previewIconUrl = `file:///${cleanBase}/${cleanIcon}`;
                }

                if (previewIconUrl) {
                    const img = document.createElement('img');
                    img.src = previewIconUrl;
                    const isAsset = /\.(jpg|jpeg|png|gif|webp)$/i.test(btnData.icon) || !btnData.icon.startsWith('online:');
                    if (isAsset) {
                        img.classList.add('real-image');
                    }
                    img.onerror = () => {
                        img.style.display = 'none';
                        const i = document.createElement('i');
                        i.textContent = '★';
                        btnEl.appendChild(i);
                    };
                    btnEl.appendChild(img);
                } else {
                    const i = document.createElement('i');
                    i.textContent = '★';
                    i.style.fontStyle = 'normal';
                    i.style.fontSize = '24px';
                    btnEl.appendChild(i);
                }

                const span = document.createElement('span');
                span.textContent = btnData.label || 'Button';
                btnEl.appendChild(span);

                btnEl.addEventListener('dragstart', (e) => {
                    const payload = {
                        sourceType: 'plugin-btn',
                        btnData: btnData,
                        basePath: p._basePath,
                        // --- NEW: Added ID and Index to Payload ---
                        pluginId: pluginId,
                        buttonIndex: i
                        // --- NEW CODE END ---
                    };
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                    e.dataTransfer.effectAllowed = 'copy';
                });

                grid.appendChild(btnEl);
            });
        }

        details.appendChild(summary);
        details.appendChild(grid);
        container.appendChild(details);
    });
}

function openFirmwareDialog() {
    const dialog = el('#firmwareDialog');
    const modelSelect = el('#fwModelSelect');
    const portSelect = el('#fwPortSelect');
    const refreshBtn = el('#fwRefreshPortsBtn');
    const flashBtn = el('#btnStartFlash');
    const logArea = el('#fwLogArea');
    const closeBtn = el('#firmwareCloseBtn');
    const warningText = el('#fwPortWarning');

    // --- 1. Load Firmware List (boards.json) ---
    const loadFirmwareList = async () => {
        // Loading text
        modelSelect.innerHTML = `<option value="" disabled selected>Loading...</option>`;
        modelSelect.disabled = true;

        if (window.electronAPI && window.electronAPI.app && window.electronAPI.app.getFirmwareList) {
            try {
                // Request list from Main process
                const boards = await window.electronAPI.app.getFirmwareList();

                modelSelect.innerHTML = ''; // Clear list

                if (boards.length === 0) {
                    const opt = document.createElement('option');
                    opt.text = "No firmware found";
                    modelSelect.appendChild(opt);
                } else {
                    // Add incoming list in loop
                    boards.forEach(board => {
                        const opt = document.createElement('option');
                        opt.value = board.folder; // Backend will use folder name
                        opt.textContent = board.name; // User will see name
                        modelSelect.appendChild(opt);
                    });
                }
            } catch (e) {
                console.error("Failed to load firmware list:", e);
                modelSelect.innerHTML = '<option>Error loading list</option>';
            }
        }
        modelSelect.disabled = false;
    };

    // --- 2. Scan COM Ports ---
    const refreshPorts = async () => {
        // "Scanning..." (From translation)
        portSelect.innerHTML = `<option>${t('firmware.scanning', { defaultValue: 'Scanning...' })}</option>`;
        portSelect.disabled = true;

        if (window.electronAPI && window.electronAPI.system && window.electronAPI.system.listSerialPorts) {
            const ports = await window.electronAPI.system.listSerialPorts();
            portSelect.innerHTML = '';

            if (ports.length === 0) {
                const opt = document.createElement('option');
                opt.text = "No COM ports";
                portSelect.appendChild(opt);
            } else {
                ports.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    opt.textContent = p;
                    portSelect.appendChild(opt);
                });
            }
        } else {
            portSelect.innerHTML = '<option>API Error</option>';
        }
        portSelect.disabled = false;

        // Show warning if app is already connected
        if (connectedSerialPort) {
            warningText.style.display = 'block';
            // Note: Warning text is defined in HTML with data-i18n, we're just showing it in JS.
        } else {
            warningText.style.display = 'none';
        }
    };

    // --- Initial Loads ---
    loadFirmwareList(); // Fetch models
    refreshPorts();     // Fetch ports
    refreshBtn.onclick = refreshPorts; // Refresh button

    // --- 3. Flash Process ---
    flashBtn.onclick = async () => {
        const port = portSelect.value;
        const model = modelSelect.value;

        // Validation
        if (!port || !port.startsWith("COM")) {
            await showCustomAlert(
                t('firmware.alerts.invalidPortTitle', { defaultValue: 'Selection Error' }),
                t('firmware.alerts.invalidPort', { defaultValue: 'Please select a valid COM port first.' })
            );
            return;
        }

        // Disconnect if connection exists
        if (connectedSerialPort) {
            await disconnectSerial();
            logArea.textContent = t('firmware.logs.autoDisconnect') + "\n";
        } else {
            logArea.textContent = "";
        }

        // Lock UI
        flashBtn.disabled = true;
        flashBtn.textContent = t('firmware.btnFlashing'); // "FLASHING... DO NOT UNPLUG!"
        modelSelect.disabled = true;
        portSelect.disabled = true;
        refreshBtn.disabled = true;
        closeBtn.disabled = true;

        // Clear old listeners
        if (window.electronAPI.app.removeAllFlashListeners) {
            window.electronAPI.app.removeAllFlashListeners();
        }

        // Listen and write logs
        window.electronAPI.app.onFlashLog((text) => {
            logArea.textContent += text;
            logArea.scrollTop = logArea.scrollHeight;
        });

        // Function to run when process completes
        window.electronAPI.app.onFlashComplete(async (success) => {
            // Unlock UI
            flashBtn.disabled = false;
            flashBtn.textContent = t('firmware.startBtn'); // "START FLASHING"
            modelSelect.disabled = false;
            portSelect.disabled = false;
            refreshBtn.disabled = false;
            closeBtn.disabled = false;

            if (success) {
                logArea.textContent += "\n" + t('firmware.logs.successReboot');
                await showCustomAlert(
                    t('firmware.alerts.successTitle', { defaultValue: 'Success!' }),
                    t('firmware.alerts.success', { defaultValue: 'Firmware updated successfully! Device will reboot.' })
                );
            } else {
                logArea.textContent += "\n" + t('firmware.logs.failedCheck');
                await showCustomAlert(
                    t('firmware.alerts.failedTitle', { defaultValue: 'Failed' }),
                    t('firmware.alerts.failed', { defaultValue: 'Firmware update failed. Please check the log area for details.' })
                );
            }
        });

        // Send start command to Main process
        window.electronAPI.app.flashFirmware(port, model);
    };

    closeBtn.onclick = () => dialog.close();
    dialog.showModal();
}
// --- NEW: Theme-Compatible Custom Alert Box Function ---
function showCustomAlert(title, message) {
    const dialog = el('#customAlertDialog');
    const alertTitle = el('#alertTitle', dialog);
    const alertMessage = el('#alertMessage', dialog);
    const alertOkBtn = el('#alertOkBtn', dialog);

    alertTitle.textContent = title;
    alertMessage.textContent = message;

    return new Promise(resolve => {
        const closeHandler = () => {
            dialog.close();
            alertOkBtn.removeEventListener('click', closeHandler);
            resolve(true); // Notify that OK was pressed
        };
        alertOkBtn.addEventListener('click', closeHandler);
        dialog.showModal();
    });
}

