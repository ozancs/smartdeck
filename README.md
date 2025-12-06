# SmartDeck v2.1

<img width="2068" height="1741" alt="Ekran görüntüsü 2025-12-06 211021" src="https://github.com/user-attachments/assets/ebf281c7-dcad-42d6-8602-d9dad1fda417" />

<div align="center">

**A powerful, customizable macro deck application for Windows**

[![Release](https://img.shields.io/github/v/release/ozancs/smartdeck)](https://github.com/ozancs/smartdeck/releases)
[![License](https://img.shields.io/github/license/ozancs/smartdeck)](LICENSE)

</div>

---

## 📖 Overview

SmartDeck transforms ESP32-based touch screens into powerful macro control panels. Create custom buttons to execute keyboard shortcuts, launch applications, control media, run scripts, build multi-action sequences, and much more. Perfect for streamers, content creators, developers, and power users.

---

## 🖥️ Supported Devices

| Status | Device | Description |
|--------|--------|-------------|
| ✅ **Supported** | **Guition JC8048W550** | 5" 800x480 Capacitive, ESP32-S3, with rotary encoder ([AliExpress](https://www.aliexpress.us/item/3256806529267135.html)) |
| 🔜 Coming Soon | 3.5" Capacitive | Community contribution welcome |
| 🔜 Coming Soon | 7" Capacitive | Community contribution welcome |

> 💡 **Open Source**: SmartDeck is fully open source. Community members can easily adapt the firmware for other ESP32-based displays. Pull requests welcome!

---

## 🛒 Bill of Materials (BOM)

> ⚠️ **Note**: The following parts are required to build the complete SmartDeck with rotary encoder. The display itself is sold separately - see "Supported Devices" above.

| Part | Description | Link |
|------|-------------|------|
| **Guition JC8048W550** | 5" ESP32-S3 Capacitive Display (Main unit) | [AliExpress](https://www.aliexpress.us/item/3256806529267135.html) |
| **AS5600 Magnetic Encoder** | Rotary encoder module with magnet included | [AliExpress](https://tr.aliexpress.com/item/1005009252608246.html) |
| **NeoPixel RGB LED Ring** | 16-LED WS2812 ring (53mm inner, 66mm outer) | [AliExpress](https://tr.aliexpress.com/item/33039423907.html) |
| **25×52×15 Ball Bearing** | Deep-groove ball bearing for smooth rotation | [Link](https://simmering.pl/en/deep-groove-ball-bearings/28183-6205-zz-nectech-25x52x15-deep-groove-ball-bearing.html) |
| **6×3mm Neodymium Magnets** | Round magnets for encoder (80-150 pcs) | [Temu](https://www.temu.com/tr/80-150pcs-6x3mm-round-magnets-strong-neodymium--mini-refrigerator-whiteboard-magnets-durable-metal-construction-for-office-kitchen-fridge-organization-magnets-for-fridge-kitchen-accessories-sleek-metallic---magnets-g-601101415928711.html) |
| **1.25mm to Dupont Cable** | 4-pin cable for 5V, GND, external pins (2 pcs) | [AliExpress](https://tr.aliexpress.com/item/1005006621865408.html) |
| **90° USB-C Adapter** | Right-angle Type-C male to female (40Gbps preferred) | [AliExpress](https://tr.aliexpress.com/item/1005006997812852.html) |
| **Screws** | Assorted screws for assembly | [Temu](https://www.temu.com/goods.html?_bg_fs=1&goods_id=601099519474986&sku_id=17592228808109) / [AliExpress](https://www.aliexpress.us/item/3256804422855415.html) |
| **Cables & Wires** | General-purpose wires for connections | — |
| **Soldering Iron** | For wiring and assembly | — |
| **Tape** | Insulation tape for cable management | — |

### 🖨️ 3D Printed Parts

STL files for the enclosure are available in the `/3d-models` folder (coming soon).

---

## ✨ Key Features

### 🎮 **13 Button Action Types**

<img width="2067" height="1737" alt="Ekran görüntüsü 2025-12-06 211035" src="https://github.com/user-attachments/assets/bb0dc818-fc07-42e8-b35a-f049680b0558" />

| Action | Description |
|--------|-------------|
| **HotKey** | Keyboard shortcuts (CTRL+C, ALT+TAB, etc.) |
| **Page** | Navigate between button pages |
| **Toggle** | Two-state buttons with visual feedback |
| **Text** | Type text with optional realistic typing simulation |
| **Open App** | Launch applications |
| **Timer** | Countdown timers with notifications |
| **Script** | Execute command-line scripts |
| **Website** | Open URLs in browser |
| **Media** | Play/pause, volume, track controls |
| **Mouse** | Click, double-click, move, drag |
| **Counter** | Increment/decrement with long-press reset |
| **Sound** | Play audio files with volume control |
| **Multi-Action** | Chain multiple actions in sequence |

### 🔗 **Multi-Action Builder**

Create complex macros by chaining actions together:

- **Delay** - Wait between actions (ms precision)
- **HotKey** - Press key combinations
- **Text** - Type text strings
- **Open App** - Launch programs
- **Website** - Open URLs
- **Script** - Run commands
- **Media** - Media controls
- **Sound** - Play audio
- **Mouse** - Mouse operations
- **Go to Page** - Switch pages

Drag & drop interface for easy sequence building.

### 🎛️ **Rotary Encoder Support**

- Volume control, scrolling, zooming
- Customizable actions for clockwise/counter-clockwise
- LED color feedback per page
- Adjustable sensitivity
- Modifier key combinations (ALT+Scroll, CTRL+Scroll)

### 🎨 **Full Customization**

- **100,000+ Icons** via Iconify integration
- **Local Images** with built-in crop & scale editor
- **Custom Colors** for background, text, icon, stroke, shadow
- **Text Positioning** - Top, middle, bottom alignment
- **Per-Button Styling** - Every button fully customizable

### 🌍 **7 Languages**

English • Türkçe • Deutsch • Español • Français • 日本語 • 中文

### ⚡ **Smart Features**

- **Auto-Connect** - Automatic device detection and reconnection
- **Smart Upload** - Only uploads changed files (faster sync)
- **App-Based Pages** - Auto-switch pages based on active application
- **Sleep/Wake** - Configurable screen timeout with tap-to-wake
- **Preview Mode** - Test buttons without device (right-click → Test)
- **Undo/Redo** - Full history with up to 50 steps
- **Drag & Drop** - Reorder buttons and pages intuitively
- **System Tray** - Minimize to tray, start minimized option

### 📦 **Built-in Presets**

Ready-to-use shortcuts for:

- Adobe Suite (Photoshop, Premiere, After Effects, Illustrator)
- 3D Software (Blender, Cinema 4D)
- DAWs (FL Studio, DaVinci Resolve)
- Streaming (OBS Studio)
- Development (VS Code)
- General (Chrome, Discord, VLC, Spotify)

---

## 🚀 Getting Started

### Requirements

- Windows 10/11
- Guition JC8048W550 (or compatible ESP32 display)

### Installation

1. Download latest release from [Releases](https://github.com/ozancs/smartdeck/releases)
2. Run installer
3. Connect device via USB
4. Flash firmware using **⚡ Install Firmware** button
5. Start creating!

---

## 🔧 How It Works

```
┌─────────────────┐     USB/Serial     ┌──────────────────┐
│  SmartDeck App  │ ◄───────────────► │  ESP32 Device    │
│  (Electron)     │    115200 baud     │  (Touch Screen)  │
└─────────────────┘                    └──────────────────┘
        │                                       │
        ▼                                       ▼
   Button Config                          Display & Touch
   Action Execute                         Button Rendering
   Serial Commands                        Touch Events
```

### Connection Flow

1. App scans for COM ports automatically
2. Sends PING, waits for PONG handshake
3. Syncs configuration to device
4. Receives touch events in real-time
5. Auto-reconnects on disconnect

---

## ⚙️ Settings

<img width="2062" height="1731" alt="Ekran görüntüsü 2025-12-06 211042" src="https://github.com/user-attachments/assets/b171f1df-1219-4e9b-91e4-100e76ec5a79" />

| Category | Options |
|----------|---------|
| **Device** | Name, resolution, grid size, colors |
| **Screen** | Brightness, sleep timeout |
| **Knob** | LED colors per page, sensitivity, actions |
| **Startup** | Launch with Windows, start minimized |
| **Close** | Exit or minimize to tray |
| **Sound** | Toggle sound, timer notification |
| **Language** | 7 language options |

---

## 🛠️ Firmware Installation

1. Click **⚡ Install Firmware**
2. Select screen model
3. Choose COM port
4. Click **START FLASHING**
5. Wait for completion (~60 seconds)

> ⚠️ Do not unplug during flashing!

---

## 📝 What's New in v2.1

- ✅ Multi-Action Builder with drag & drop
- ✅ Rotary encoder support with LED feedback
- ✅ Preview/Test mode (right-click menu)
- ✅ Start minimized to system tray
- ✅ Unicode path support (Turkish characters, etc.)
- ✅ App-based automatic page switching
- ✅ Smart upload (only changed files)
- ✅ Serial debug monitor
- ✅ Improved auto-reconnect stability
- ✅ Full internationalization for all UI elements

---

## 🤝 Contributing

Contributions welcome! 

- **Bug Reports**: Open an issue with reproduction steps
- **Feature Requests**: Describe your idea in an issue
- **New Device Support**: Fork, adapt firmware, submit PR

## 📄 License

This project is open source. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Iconify](https://iconify.design/) - Icon library
- [NirCmd](https://www.nirsoft.net/utils/nircmd.html) - Audio control utilities
- [Electron](https://www.electronjs.org/) - Application framework
- [@jitsi/robotjs](https://github.com/nicktgr15/robotjs) - Keyboard/mouse automation

---

<div align="center">

**[⬇️ Download](https://github.com/ozancs/smartdeck/releases)** • **[🐛 Report Bug](https://github.com/ozancs/smartdeck/issues)** • **[💡 Request Feature](https://github.com/ozancs/smartdeck/issues)**

Made with ❤️ by [ozancs](https://github.com/ozancs)

</div>
