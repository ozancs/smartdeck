# SmartDeck
![Screenshot_15](https://github.com/user-attachments/assets/1aec9e52-7d8d-423a-9e10-12daaef4f580)
<div align="center">


**A powerful, customizable macro deck application for Windows**

</div>

---

## 📖 Overview

SmartDeck is a feature-rich desktop application that transforms physical touch screens into powerful macro control panels. It provides an intuitive interface for creating custom buttons that can execute keyboard shortcuts, launch applications, control media, run scripts, and much more. Perfect for streamers, content creators, developers, and power users who want to streamline their workflow.

## ✨ Key Features

### 🎮 **12 Button Action Types**

SmartDeck supports a comprehensive range of button actions:

1. **HotKey** - Execute keyboard shortcuts (CTRL+C, ALT+TAB, etc.)
2. **Page Navigation** - Switch between different button pages
3. **Toggle** - Two-state buttons with visual feedback and custom actions for each state
4. **Text Macro** - Type predefined text with optional typing simulation
5. **Open Application** - Launch programs with a single tap
6. **Timer** - Countdown timers with visual feedback
7. **Script** - Execute custom command-line scripts
8. **Website** - Open URLs in your default browser
9. **Media Controls** - Play/pause, volume, next/previous track controls
10. **Mouse Actions** - Click, double-click, move, and drag operations
11. **Counter** - Increment/decrement counters with long-press reset
12. **Sound** - Play audio files with volume control


![Screenshot_17](https://github.com/user-attachments/assets/cd9b04b3-6aa7-4df8-9465-15fd3973a675)

### 🎨 **Customization**

- **Visual Customization**: Each button can have custom colors for background, text, icon, stroke, and shadow
- **Icon Support**: 
  - Search from 100,000+ online icons via Iconify
  - Upload local images (PNG, JPG, SVG, WebP)
  - Built-in crop and scale editor
- **Text Positioning**: Top, middle, or bottom alignment
- **Adjustable Sizes**: Icon scale (-100 to +100) and text size (10-28px)
- **Color Themes**: Customize device background, button colors, and text colors

### 📱 **Multi-Screen Support**

Currently supports three screen sizes with dedicated firmware:

- **3.5-inch** display
- **5-inch** display  
- **7-inch** display

### 🔌 **Pre-Built Shortcut Presets**

Includes ready-to-use shortcut presets for popular applications:

- **Creative Suite**: Adobe Photoshop, Illustrator, Premiere Pro, After Effects
- **3D & Video**: Blender, Cinema 4D, DaVinci Resolve
- **Audio**: FL Studio, Spotify
- **Streaming**: OBS Studio
- **Development**: VS Code
- **Utilities**: Google Chrome, Discord, VLC Player

### 🌍 **Multi-Language Support**

Built-in support for 7 languages:
- English (en)
- Turkish (tr)
- German (de)
- Spanish (es)
- French (fr)
- Japanese (ja)
- Chinese (zh)

### 🔄 **Advanced Features**

- **Undo/Redo System**: Full history tracking with up to 10 steps
- **Drag & Drop**: Intuitive button reordering and page management
- **Import/Export**: Save and share your configurations
- **USB Upload**: Direct settings upload to connected devices
- **Auto-Updates**: Built-in update system via GitHub releases
- **Serial Communication**: Real-time connection with hardware devices
- **Firmware Flasher**: Built-in tool to flash firmware to devices

## 🚀 Getting Started

### Prerequisites

- Windows 10 or later
- Arduino-compatible touch screen (3.5", 5", or 7")

### Installation

1. **Download the latest release** from the [Releases](https://github.com/ozancs/smartdeck/releases) page
2. **Run the installer** and follow the setup wizard
3. **Connect your device** via USB
4. **Flash the firmware** using the built-in firmware installer (⚡ Install Firmware button)


![Screenshot_16](https://github.com/user-attachments/assets/2d39f30d-3a07-4f91-ad30-1c0c40b035a7)


## 🎯 How It Works

### Application Architecture

SmartDeck consists of three main components:

1. **Desktop Application (Electron)**: The main interface built with HTML, CSS, and JavaScript
2. **Arduino Firmware**: Runs on the touch screen device, handles display and touch input
3. **Serial Communication**: Bridges the desktop app and hardware device

### Button Configuration

Each button stores:
- **Visual Properties**: Icon, label, colors, sizes, positioning
- **Action Type**: One of 12 available action types
- **Action Data**: Type-specific configuration (shortcuts, paths, scripts, etc.)
- **Toggle States**: For toggle buttons, separate configurations for ON/OFF states

### Page System

- Support for multiple pages (grid-based layout)
- Customizable grid size per device resolution
- Page navigation buttons
- Drag-and-drop between pages

### Connection Flow

1. Application scans for available COM ports
2. User selects the device port
3. Serial connection established at 115200 baud
4. Settings synchronized to device
5. Touch events received and processed in real-time

## 🔧 Configuration

### Device Settings

- **Resolution**: Select your screen size (3.5", 5", or 7")
- **Grid Layout**: Configure rows and columns (max varies by screen)
- **Device Name**: Custom name displayed on the device
- **Color Scheme**: Background, button, text, stroke, and shadow colors

### Application Settings

Access via the ⚙️ button:

- **Startup Behavior**: Launch with Windows
- **Close Action**: Minimize to tray or exit
- **Sound Settings**: Custom toggle and timer sounds
- **Screen Settings**: Brightness and sleep timeout
- **Language**: Choose from 7 supported languages



## 🎨 Button Types Explained

### Toggle Buttons

Toggle buttons have two states with independent configurations:

- **State A (OFF)**: Default state with custom action and visuals
- **State B (ON)**: Active state with different action, colors, and optional icon
- **Sound Feedback**: Optional switch sound on state change
- **Presets**: Quick setup for common toggles (mute/unmute, monitor on/off, etc.)

### Timer Buttons

- Set duration in minutes and seconds (picker interface)
- Visual countdown display on the button
- Notification sound when timer completes
- Persistent across app restarts

### Counter Buttons

- Increment or decrement mode
- Custom start value
- Long-press to reset to start value
- Real-time display on button

### Mouse Actions

- **Click**: Single, double, or right-click at current position
- **Move**: Move cursor to specific coordinates
- **Drag**: Drag from point A to point B
- **Capture Tool**: Built-in coordinate capture for easy setup



## 🛠️ Firmware Installation

1. Click the **⚡ Install Firmware** button in the bottom bar
2. Select your screen model (3.5", 5", or 7")
3. Choose the COM port (disconnect from app first if connected)
4. Click **START FLASHING**
5. Wait for completion (do not unplug during flashing!)
6. Device will automatically reboot



## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.


## 🙏 Acknowledgments

- Icons provided by [Iconify](https://iconify.design/)
- Audio control presets use [NirCmd](https://www.nirsoft.net/utils/nircmd.html)
- Built with [Electron](https://www.electronjs.org/)

---

<div align="center">

[Report Bug](https://github.com/ozancs/smartdeck/issues) · [Request Feature](https://github.com/ozancs/smartdeck/issues)

</div>
