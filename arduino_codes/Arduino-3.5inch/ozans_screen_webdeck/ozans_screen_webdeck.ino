/* * OZAN'S WEB DECK - v4.0 (Serial and ESP-NOW Mode)
 * * This version does not include Wi-Fi and BLE. Communication is done via USB Serial Port
 * or ESP-NOW (Dongle Mode).
 * */

// --- NEW CONTROL FLAG ---
// 0: Write directly to USB Serial Port
// 1: Send via ESP-NOW to dongle
#define DONGLE_MODE 0 

// NEW: Receiver MAC address for dongle mode (required if DONGLE_MODE = 1)
// Note: You must enter the MAC address here as 6 bytes.
uint8_t receiver_mac[] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF}; 

// LVGL Libraries REMOVED
#include <TAMC_GT911.h>

// --- REMOVED: <BleKeyboard.h> ---
// --- REMOVED: <WiFi.h>, <AsyncTCP.h>, <ESPAsyncWebServer.h>, <ESPmDNS.h> ---

#include <vector>
#include <string>
#include <set> 
#include <ArduinoJson.h>

/* GFX Libraries */
#include <Arduino_GFX_Library.h>
#include "Arduino_GFX_dev_device.h"
#ifndef GFX_DEV_DEVICE
#include "Arduino_GFX_pins.h"
#include "Arduino_GFX_databus.h"
#include "Arduino_GFX_display.h"
#endif
#ifdef ESP32
#undef F
#define F(s) (s)
#endif

/* SD Card Libraries */
#include "FS.h"
#include "SD.h"
#include <SPI.h>

/* --- TJpgDec Library --- */
#include <TJpg_Decoder.h>

/* --- NEW: For Saving Settings --- */
#include <Preferences.h>
Preferences preferences;

/* --- NEW: Brightness and Sleep Variables --- */
int current_brightness = 100;       // 0-100 range
bool sleep_enabled = false;         // Is sleep mode enabled?
unsigned long sleep_timeout_ms = 5 * 60 * 1000; // Default 5 minutes
unsigned long last_activity_time = 0; // Last activity time
bool is_sleeping = false;           // Currently sleeping?

// PWM Settings (ESP32 LEDC)
#define BL_PWM_CHANNEL 0
#define BL_PWM_FREQ 1500
#define BL_PWM_RESOLUTION 8


// --- CONDITIONAL LIBRARY INCLUSION (Only for Dongle Mode) ---
#if DONGLE_MODE == 1
#include <WiFi.h> // Required for ESP-NOW
#include <esp_now.h>
#endif
// --- END ---

/*********** Touch Ayarları (7-inch) ***********/
#define TOUCH_SDA 33
#define TOUCH_SCL 32
#define TOUCH_INT 0
#define TOUCH_RST 25
#define TOUCH_WIDTH 480
#define TOUCH_HEIGHT 320
TAMC_GT911 tp(TOUCH_SDA, TOUCH_SCL, TOUCH_INT, TOUCH_RST, TOUCH_WIDTH, TOUCH_HEIGHT);
/*********** SD Kart Ayarları (7-inch) ***********/
#define SD_CS 5
#define DEVICE_NAME "Smart Deck"
/*********** Grid Ayarları ***********/
const int CELL_W = 80;
const int CELL_H = 80;
const int CELL_PADDING = 10;
const int STROKE_WIDTH = 2;
const int CORNER_RADIUS = 20;

/*********** Başlık/İsim Kutusu Ayarları ***********/
const int TITLE_BOX_HEIGHT = 15;
const int TITLE_BOX_MARGIN_Y = 2;

/*******************************************************************************
 * Global Variables
 ******************************************************************************/
uint32_t screenWidth = TOUCH_WIDTH;
uint32_t screenHeight = TOUCH_HEIGHT;

/* REMOVED: BleKeyboard bleKeyboard; */
/* REMOVED: AsyncWebServer server(80); */
/* REMOVED: String ip_address = "Connecting..."; */
/* REMOVED: File uploadFile; */

String serial_cmd_buffer = "";
bool serial_cmd_ready = false;

DynamicJsonDocument doc(4096);
uint8_t current_page = 0;
uint16_t theme_bg_color_rgb565;
uint16_t theme_btn_color_rgb565;
uint16_t theme_stroke_color_rgb565 = 0x8410;       
uint16_t theme_empty_btn_color_rgb565 = 0x3186;     
uint16_t theme_click_stroke_color_rgb565 = 0x05BF;  
uint16_t theme_text_color_rgb565;
uint16_t theme_shadow_color_rgb565;                

struct ButtonInfo {
  int x;
  int y;
  int w;
  int h;
  String action;
  String value;
  bool defined = false;
};
std::vector<ButtonInfo> current_buttons;

enum TimerState {
  TIMER_INACTIVE,
  TIMER_RUNNING,
  TIMER_FINISHED
};
struct TimerInfo {
  TimerState state = TIMER_INACTIVE;
  int duration = 0;
  unsigned long startTime = 0;
  int lastSeconds = -1; // Last displayed seconds 
};

struct CounterInfo {
  long currentValue = 0; // Current counter value
  long startValue = 0;   // Start value (for reset)
  String action = "increment"; // "increment" or "decrement"
};
std::vector<CounterInfo> current_counters; // <-- NEWLY ADDED

// --- NEW: TOGGLE INFO ---
struct ToggleInfo {
  bool state = false; // false = OFF (State A), true = ON (State B)
  uint16_t onColor = 0x07E0; // Default Green (RGB565)
};
std::vector<ToggleInfo> current_toggles;

std::vector<TimerInfo> current_timers;

bool was_touched = false;
int last_touched_button_index = -1;
unsigned long touch_start_time = 0; // NEW: For detecting long press
bool long_press_triggered = false; // NEW: Was long press triggered?

typedef struct {
  int x;
  int y;          
  int maxWidth;
  int maxHeight; 
  int x_offset;
  int y_offset;  
  int radius;
} JpegDrawInfo;

JpegDrawInfo jpegInfo;


// --- FUNCTION PROTOTYPES (Prevents compiler errors) ---
void draw_page(int page_index);
void draw_single_button(int btn_index);
void checkActiveTimers();


// *** NEW: Send Command to PC/Dongle Function (State Supported) ***
void send_pc_command(int page, int index) {
  char command[64];
  
  // Check if button is Toggle
  if (current_buttons[index].action == "toggle") {
      // If Toggle: BTN:Page:Index:State (e.g: BTN:0:14:1)
      int stateVal = current_toggles[index].state ? 1 : 0;
      sprintf(command, "BTN:%d:%d:%d\n", page, index, stateVal);
  } else {
      // If normal button, use old format: BTN:Page:Index
      sprintf(command, "BTN:%d:%d\n", page, index);
  }

#if DONGLE_MODE == 1
  // Send via ESP-NOW
  esp_now_send(receiver_mac, (uint8_t*)command, strlen(command) + 1);
  Serial.printf("ESP-NOW Sent: %s", command); 
#else 
  // Send via USB Serial
  Serial.printf("%s", command);
#endif
}
// *** NEW: Brightness Adjustment Function ***
// *** FIXED: Brightness Adjustment Function ***
// *** FIXED: Gamma (Perceptual) Brightness Function ***
#include <math.h> // May be needed for pow function, usually embedded in Arduino but just to be sure.

// *** FIXED: Smoother Transition Brightness Function ***
#include <math.h> 

// *** FIXED (V3): Linear and Stable Brightness ***
void set_brightness(int percent) {
  // Safety check
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  
  current_brightness = percent;
  
  int duty = 0;

  if (percent == 0) {
    duty = 0; // Completely off
  } 
  else if (percent == 100) {
    duty = 255; // Completely on
  } 
  else {
    // HARDWARE LIMIT UPDATE
    // If your screen turns off below 85, your lower limit is too high.
    // 235 out of 255 is approximately 92% power.
    // We're mapping slider's 1% to this 235.
    
    int min_hardware_limit = 30; 
    int max_hardware_limit = 255;

    duty = map(percent, 1, 100, min_hardware_limit, max_hardware_limit);
  }
  
  #ifdef GFX_BL
    ledcWrite(BL_PWM_CHANNEL, duty);
  #endif
}

// *** NEW: Activity Update (Wake Up) ***
void update_activity() {
  last_activity_time = millis();
  if (is_sleeping) {
    is_sleeping = false;
    // Return to previous brightness
    set_brightness(current_brightness);
    Serial.println("Wake up!");
  }
}

// *** NEW: Sleep Mode Check (To be called in loop) ***
void check_sleep_mode() {
  if (!sleep_enabled || is_sleeping) return;

  if (millis() - last_activity_time > sleep_timeout_ms) {
    is_sleeping = true;
    // Dim the screen (0 turns it completely off, 10 makes it dim)
    // Completely off (0) is usually better.
    #ifdef GFX_BL
      ledcWrite(BL_PWM_CHANNEL, 0); 
    #endif
    Serial.println("Going to sleep...");
  }
}

// --- Function Implementations (Draw and Utilities) ---

// *** TJpgDec Output Callback Function *** (Remains the same)
bool tft_output(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  int16_t jpg_rel_x = jpegInfo.x_offset + x;
  int16_t jpg_rel_y = jpegInfo.y_offset + y;

  int r = jpegInfo.radius;
  int btn_w = jpegInfo.maxWidth;
  int btn_h = jpegInfo.maxHeight;
  long r_squared = (long)r * r;

  for (int16_t py = 0; py < h; py++) {
    for (int16_t px = 0; px < w; px++) {

      int16_t btn_rel_x = jpg_rel_x + px;
      int16_t btn_rel_y = jpg_rel_y + py;

      if (btn_rel_x < 0 || btn_rel_x >= btn_w || btn_rel_y < 0 || btn_rel_y >= btn_h) {
        continue;
      }

      bool draw_pixel = true;
      if (btn_rel_x < r && btn_rel_y < r) {
        if (((long)r - btn_rel_x) * ((long)r - btn_rel_x) + ((long)r - btn_rel_y) * ((long)r - btn_rel_y) > r_squared) {
          draw_pixel = false;
        }
      } else if (btn_rel_x >= (btn_w - r) && btn_rel_y < r) {
        if (((long)btn_rel_x - (btn_w - 1 - r)) * ((long)btn_rel_x - (btn_w - 1 - r)) + ((long)r - btn_rel_y) * ((long)r - btn_rel_y) > r_squared) {
          draw_pixel = false;
        }
      } else if (btn_rel_x < r && btn_rel_y >= (btn_h - r)) {
        if (((long)r - btn_rel_x) * ((long)r - btn_rel_x) + ((long)btn_rel_y - (btn_h - 1 - r)) * ((long)btn_rel_y - (btn_h - 1 - r)) > r_squared) {
          draw_pixel = false;
        }
      } else if (btn_rel_x >= (btn_w - r) && btn_rel_y >= (btn_h - r)) {
        if (((long)btn_rel_x - (btn_w - 1 - r)) * ((long)btn_rel_x - (btn_w - 1 - r)) + ((long)btn_rel_y - (btn_h - 1 - r)) * ((long)btn_rel_y - (btn_h - 1 - r)) > r_squared) {
          draw_pixel = false;
        }
      }

      if (draw_pixel) {
        int16_t draw_x = jpegInfo.x + btn_rel_x;
        int16_t draw_y = jpegInfo.y + btn_rel_y;

        uint16_t color = bitmap[py * w + px];
        gfx->drawPixel(draw_x, draw_y, color);
      }
    }
  }

  return true;
}

// *** Helper Function: Convert Hex Color to RGB565 *** (Remains the same)
uint16_t hex_to_rgb565(const char* hex_str) {
  uint32_t hex_val = (uint32_t)strtol(hex_str, NULL, 16);
  uint8_t r = (hex_val >> 16) & 0xFF;
  uint8_t g = (hex_val >> 8) & 0xFF;
  uint8_t b = hex_val & 0xFF;
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) |
         (b >> 3);
}

// *** Helper Function: Convert Font Size to GFX Size *** (Remains the same)
int mapFontSize(int pixelSize) {
  if (pixelSize <= 14) return 1;
  if (pixelSize <= 22) return 2;
  return 3;
}

// *** Helper Function: Draw Text on Button *** (Remains the same)
void drawButtonText(int x, int y, const char* text) {
  int16_t tx, ty; uint16_t tw, th;
  gfx->setTextSize(1);
  gfx->getTextBounds(text, 0, 0, &tx, &ty, &tw, &th);
  int text_x = x + (CELL_W - tw) / 2;
  int text_y = y + (CELL_H - th) / 2;
  gfx->fillRect(x + 5, y + 5, CELL_W - 10, CELL_H - 10, theme_btn_color_rgb565);
  gfx->setTextColor(theme_text_color_rgb565);
  gfx->setCursor(text_x, text_y);
  gfx->print(text);
}


/* --- REMOVED: send_key_combo (BLE) function removed --- */

// Replace cleanUnusedIcons function in ozans_screen_webdeck.ino with this:

void cleanUnusedIcons() {
  Serial.println("Starting smart icon cleanup...");
  std::set<String> requiredIcons;
  
  JsonArray pages_array = doc["pages"];
  
  // STEP 1: Extract list of required files
  for (JsonVariant page : pages_array) {
    JsonArray buttons_array = page["buttons"];
    for (JsonVariant btn : buttons_array) {
      if (btn.isNull()) continue;

      // A. Add Main Icon (For normal buttons and Toggle OFF/Fallback)
      const char* icon_file = btn["icon"];
      if (icon_file) {
        requiredIcons.insert(String(icon_file));
      }

      // B. Add Toggle Button Icons (CRITICAL FIX)
      // Now we also protect paths in toggleData in JSON
      if (btn.containsKey("toggleData")) {
          const char* iconOn = btn["toggleData"]["iconOn"];
          if (iconOn) requiredIcons.insert(String(iconOn));
          
          const char* iconOff = btn["toggleData"]["iconOff"];
          if (iconOff) requiredIcons.insert(String(iconOff));
      }
    }
  }

  Serial.printf("Found %d unique required icons in config file.\n", requiredIcons.size());
  
  File root = SD.open("/");
  if (!root) {
    Serial.println("Failed to open root dir for cleanup.");
    return;
  }

  int deletedCount = 0;
  
  // STEP 2: Scan SD Card and delete files not in the list
  while (File file = root.openNextFile()) {
    String fileName = String(file.name());
    String filePath = "/" + fileName;
    
    // Only check image files
    if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".JPG") || fileName.endsWith(".JPEG")) {
      
      // If file is NOT in the list, delete it
      if (requiredIcons.find(fileName) == requiredIcons.end()) {
        Serial.printf(" - Deleting unused icon: %s\n", filePath.c_str());
        if (SD.remove(filePath.c_str())) {
          deletedCount++;
        } else {
          Serial.printf("   ! Failed to delete %s\n", filePath.c_str());
        }
      }
    }
    file.close();
  }

  root.close();
  Serial.printf("Cleanup complete. Deleted %d unused icons.\n", deletedCount);
}

/* --- REMOVED: rmdirRecursive and wipeSDCard functions removed --- */
/* --- REMOVED: initWiFi, initAPWebServer, onSaveWifi, initWebServer functions removed --- */


// *** NEW: USB CONFIGURATION UPLOAD (Remains the same) ***
void handleUsbUpload() {
  Serial.println("READY");
  
  File usbUploadFile;
  bool in_upload = true;
  unsigned long uploadStartTime = millis();

  // (Previous USB upload logic remains the same)
  while (in_upload) {

    // 60 second general timeout
    if (millis() - uploadStartTime > 60000) {
      Serial.println("ERR_TIMEOUT");
      in_upload = false;
      break;
    }

    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      uploadStartTime = millis();  // Reset timeout on each command

      if (cmd.startsWith("FILE:")) {
        int firstColon = cmd.indexOf(':');
        int secondColon = cmd.indexOf(':', firstColon + 1);

        if (firstColon == -1 || secondColon == -1) {
          Serial.println("ERR_CMD_FORMAT");
          continue;
        }

        String filename = "/" + cmd.substring(firstColon + 1, secondColon);
        long fileSize = cmd.substring(secondColon + 1).toInt();

        if (fileSize == 0) {
          Serial.println("ERR_FILE_SIZE");
          continue;
        }

        if (SD.exists(filename)) {
          SD.remove(filename);
        }

        usbUploadFile = SD.open(filename, FILE_WRITE);
        if (!usbUploadFile) {
          Serial.println("ERR_FILE_CREATE");
        } else {
          Serial.println("OK_FILE");

          long remaining = fileSize;
          unsigned long fileStartTime = millis();

          while (remaining > 0) {
            if (Serial.available() > 0) {
              byte b = Serial.read();
              usbUploadFile.write(b);
              remaining--;
              fileStartTime = millis();
            } else {
              if (millis() - fileStartTime > 5000) {
                Serial.println("ERR_DATA_TIMEOUT");
                break;
              }
              delay(1);
            }
          }

          usbUploadFile.close();
          if (remaining == 0) {
            Serial.println("OK_DATA");
          } else {
            Serial.println("ERR_DATA_INCOMPLETE");
          }
        }
      } else if (cmd == "END_UPLOAD") {
        in_upload = false;
      } else {
        Serial.println("ERR_UNKNOWN_CMD");
      }
    }
    delay(1);
  }

  Serial.println("DONE_REBOOT");
  delay(100);

  File file = SD.open("/esp_config.json", FILE_READ);
  bool config_ok = false;
  if (file) {
    DeserializationError error = deserializeJson(doc, file);
    file.close();
    if (!error) {
      config_ok = true;
    }
  }

  if (config_ok) {
    Serial.println("Config loaded, running smart cleanup...");
    cleanUnusedIcons();
  } else {
    Serial.println("Failed to load new config, skipping cleanup.");
  }

  Serial.println("Rebooting in 3 seconds...");
  delay(3000);
  ESP.restart();
}


// --- CHECK ACTIVE TIMERS (Auto Reset Synchronization Added) ---
void checkActiveTimers() {
  unsigned long now = millis();
  
  for (int i = 0; i < current_timers.size(); i++) {
    TimerInfo &timer = current_timers[i];
    // If INACTIVE, skip to next button
    if (timer.state == TIMER_INACTIVE) continue;

    ButtonInfo &button = current_buttons[i];
    JsonObject button_cfg = doc["pages"][current_page]["buttons"][i];

    // 1. IS TIMER RUNNING?
    if (timer.state == TIMER_RUNNING) {
      unsigned long elapsed_ms = now - timer.startTime;
      long remaining_sec = timer.duration - (elapsed_ms / 1000);

      // A. Has time expired?
      if (remaining_sec < 0) {
        timer.state = TIMER_FINISHED;
        timer.startTime = now; // Save finish time (for flash effect)
        timer.lastSeconds = -1;
        
        // Notify PC: Time's Up!
        Serial.printf("TIMER_DONE:%d:%d\n", current_page, i);
        
        // Visual Effects: Red BG
        gfx->fillRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, 0xF800);
        gfx->drawRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, 0xF800);
        
        // Draw "00:00" text
        // ... (Metin çizim kodları aynı) ...
        int label_size_px = button_cfg["labelSize"] | 18;
        int final_font_size = mapFontSize(label_size_px);
        if (final_font_size < 3) final_font_size = 3;
        
        gfx->setTextSize(final_font_size);
        uint16_t text_color_to_use = theme_text_color_rgb565;
        const char* label_color_hex = button_cfg["labelColor"];
        if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);
        gfx->setTextColor(text_color_to_use);
        
        int16_t tx, ty; uint16_t tw, th;
        gfx->getTextBounds("00:00", 0, 0, &tx, &ty, &tw, &th);
        gfx->setCursor(button.x + (button.w - tw) / 2, button.y + (button.h - th) / 2);
        gfx->print("00:00");
        
      }
      // B. Time not expired, did second change?
      else if (remaining_sec != timer.lastSeconds) {
        timer.lastSeconds = remaining_sec;
        char time_str[6];
        sprintf(time_str, "%02ld:%02ld", remaining_sec / 60, remaining_sec % 60);
        
        // Redraw button (Background, border, new time)
        // ... (Drawing code remains the same) ...
        uint16_t btn_color_rgb565 = theme_btn_color_rgb565;
        const char* btn_color_hex = button_cfg["btnColor"] | "DEFAULT";
        if (strcmp(btn_color_hex, "DEFAULT") != 0) btn_color_rgb565 = hex_to_rgb565(btn_color_hex);
        
        gfx->fillRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, btn_color_rgb565);
        gfx->drawRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, theme_stroke_color_rgb565);
        gfx->drawRoundRect(button.x + 1, button.y + 1, button.w - 2, button.h - 2, CORNER_RADIUS > 0 ? CORNER_RADIUS - 1 : 0, theme_stroke_color_rgb565);
        
        int label_size_px = button_cfg["labelSize"] | 18;
        int final_font_size = mapFontSize(label_size_px);
        if (final_font_size < 3) final_font_size = 1;
        
        gfx->setTextSize(final_font_size);
        uint16_t text_color_to_use = theme_text_color_rgb565;
        const char* label_color_hex = button_cfg["labelColor"];
        if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);
        gfx->setTextColor(text_color_to_use);
        
        int16_t tx, ty; uint16_t tw, th;
        gfx->getTextBounds(time_str, 0, 0, &tx, &ty, &tw, &th);
        gfx->setCursor(button.x + (button.w - tw) / 2, button.y + (button.h - th) / 2);
        gfx->print(time_str);
      }
    }
    
    // 2. TIMER FINISHED (TIMER_FINISHED) - Flashing and Auto Reset
    else if (timer.state == TIMER_FINISHED) {
      
      unsigned long flashDuration = now - timer.startTime;
      
      // AUTO RESET MOMENT (e.g: after 10 seconds)
      if (flashDuration > 10000) { 
          timer.state = TIMER_INACTIVE;
          timer.startTime = 0;
          timer.lastSeconds = timer.duration; // Reset to beginning
          
          draw_single_button(i); // Restore screen to previous state
          
          // --- NEWLY ADDED SECTION: Notify PC of Reset ---
          // State 2 = RESET
          Serial.printf("TIMER_UPDATE:%d:%d:2:%d\n", current_page, i, timer.duration);
          // -------------------------------------------------
          
          continue; 
      }
      
      // Flashing Effect (Remains the same)
      const uint16_t flash_colors[5] = {0xF800, 0xFFE0, 0x07E0, 0x001F, 0xF81F};
      int color_index = (flashDuration / 400) % 5; 
      uint16_t flash_color = flash_colors[color_index];
      
      gfx->fillRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, flash_color);
      gfx->drawRoundRect(button.x, button.y, button.w, button.h, CORNER_RADIUS, 0xFFFF);
      gfx->drawRoundRect(button.x + 1, button.y + 1, button.w - 2, button.h - 2, CORNER_RADIUS > 0 ? CORNER_RADIUS - 1 : 0, 0xFFFF);
      
      int label_size_px = button_cfg["labelSize"] | 18;
      int final_font_size = mapFontSize(label_size_px);
      if (final_font_size < 3) final_font_size = 3;
      
      gfx->setTextSize(final_font_size);
      uint16_t text_color_to_use = theme_text_color_rgb565;
      const char* label_color_hex = button_cfg["labelColor"];
      if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);
      gfx->setTextColor(text_color_to_use);
      
      int16_t tx, ty; uint16_t tw, th;
      gfx->getTextBounds("00:00", 0, 0, &tx, &ty, &tw, &th);
      gfx->setCursor(button.x + (button.w - tw) / 2, button.y + (button.h - th) / 2);
      gfx->print("00:00");
    }
  }
}

// ozans_screen_webdeck.ino



void draw_single_button(int btn_index) {
  int COLS = doc["grid"]["cols"] | 3;
  int ROWS = doc["grid"]["rows"] | 3;

  // --- POSITION CALCULATIONS (App.js Compatible) ---
  int gridAvailableHeight = screenHeight - 60;
  int start_y_offset = 25;

  int totalCellHeight = ROWS * CELL_H;
  int remainingSpaceY = gridAvailableHeight - totalCellHeight;
  
  int gapY = 0;
  int padY_top = 0;
  int numGapsY = ROWS - 1;

  if (remainingSpaceY < 0) {
      gapY = -2;
      padY_top = 0;
  } else if (numGapsY > 0) {
      padY_top = 2;
      int space_for_gaps = remainingSpaceY - 4;
      gapY = space_for_gaps / numGapsY;
  } else {
      gapY = 0;
      padY_top = remainingSpaceY / 2;
  }
  padY_top += start_y_offset;

  int gapX = 0;
  if (COLS > 1) {
      gapX = (screenWidth - (COLS * CELL_W)) / (COLS + 1);
  } else {
      gapX = (screenWidth - CELL_W) / 2;
  }

  int shadow_offset_x = 5;
  int totalPaddingSpaceX = screenWidth - (COLS * CELL_W) - ((COLS - 1) * gapX);
  int padX_left = (totalPaddingSpaceX - shadow_offset_x) / 2;
  if (padX_left < 0) padX_left = 0;

  int r = btn_index / COLS;
  int c = btn_index % COLS;

  int x_pos = padX_left + (c * CELL_W) + (c * gapX);
  int y_pos = padY_top + (r * CELL_H) + (r * gapY);
  
  // ---------------------------------------------------------

  JsonArray pages_array = doc["pages"];
  JsonArray page_data = pages_array[current_page]["buttons"];
  ButtonInfo& btn_info = current_buttons[btn_index];
  JsonObject button_cfg = page_data[btn_index];
  int radius = CORNER_RADIUS;

  // --- 0. SHADOW DRAWING [NEWLY ADDED] ---
  // Before the button itself, we draw a dark colored box 5px to the right and 5px down.
  // This creates a shadow effect under the button.
  gfx->fillRoundRect(x_pos + 5, y_pos + 5, CELL_W, CELL_H, radius, theme_shadow_color_rgb565);

  // 1. BACKGROUND COLOR (Fallback)
  uint16_t bg_color = theme_btn_color_rgb565;
  const char* custom_color = button_cfg["btnColor"];
  if (custom_color && strlen(custom_color) > 0 && strcmp(custom_color, "DEFAULT") != 0) {
      bg_color = hex_to_rgb565(custom_color);
  }
  
  if (btn_info.action == "toggle" && current_toggles[btn_index].state) {
      bg_color = current_toggles[btn_index].onColor;
  }

  // Draw background
  gfx->fillRoundRect(x_pos, y_pos, CELL_W, CELL_H, radius, bg_color);

  // 2. ICON / JPEG DRAWING
  String fileToDraw = "";
  if (btn_info.action != "timer") {
      if (btn_info.action == "toggle") {
          bool isStateOn = current_toggles[btn_index].state;
          const char* iconOffName = button_cfg["toggleData"]["iconOff"];
          const char* iconOnName = button_cfg["toggleData"]["iconOn"];

          if (isStateOn) {
              if (iconOnName) fileToDraw = "/" + String(iconOnName);
          } else {
              if (iconOffName) fileToDraw = "/" + String(iconOffName);
          }
      } 
      else {
          const char* icon_file_ptr = button_cfg["icon"];
          if (icon_file_ptr) {
              fileToDraw = "/" + String(icon_file_ptr);
          }
      }

      if (fileToDraw.length() > 1) { 
          if (SD.exists(fileToDraw)) {
              uint16_t jpg_w = 0, jpg_h = 0;
              TJpgDec.getSdJpgSize(&jpg_w, &jpg_h, fileToDraw.c_str());
              
              if (jpg_w > 0 && jpg_h > 0) {
                  jpegInfo.x = x_pos;
                  jpegInfo.y = y_pos;
                  jpegInfo.maxWidth = CELL_W; 
                  jpegInfo.maxHeight = CELL_H;
                  jpegInfo.x_offset = (CELL_W - jpg_w) / 2;
                  jpegInfo.y_offset = (CELL_H - jpg_h) / 2;
                  jpegInfo.radius = radius;
                  TJpgDec.drawSdJpg(0, 0, fileToDraw.c_str());
              } else {
                  Serial.printf("ERR: JPG size 0 for %s\n", fileToDraw.c_str());
              }
          } else {
              Serial.printf("ERR: File not found -> %s\n", fileToDraw.c_str());
              gfx->setTextColor(0xFFFF);
              gfx->setCursor(x_pos + 5, y_pos + 5);
              gfx->print("!"); 
          }
      }
  }

  // 3. Border
  gfx->drawRoundRect(x_pos, y_pos, CELL_W, CELL_H, radius, theme_stroke_color_rgb565);
  gfx->drawRoundRect(x_pos + 1, y_pos + 1, CELL_W - 2, CELL_H - 2, radius > 0 ? radius - 1 : 0, theme_stroke_color_rgb565);

  // 4. Text Drawing
  const char* label_text = button_cfg["label"];
  int label_size_px = button_cfg["labelSize"] | 18;
  char time_str[10];
  char counter_str[32]; 

  if (btn_info.action == "timer") {
      int displayVal = current_timers[btn_index].duration;
      if (current_timers[btn_index].state == TIMER_INACTIVE && current_timers[btn_index].lastSeconds != -1) {
          displayVal = current_timers[btn_index].lastSeconds;
      }
      sprintf(time_str, "%02d:%02d", displayVal / 60, displayVal % 60);
      label_text = time_str;
  }
  else if (btn_info.action == "counter") {
      long val = current_counters[btn_index].currentValue;
      sprintf(counter_str, "%ld", val);
      label_text = counter_str; 
  }
  else {
      label_text = NULL; 
  }

  if (label_text) {
      int final_font_size = mapFontSize(label_size_px);
      if ((btn_info.action == "timer" || btn_info.action == "counter") && final_font_size < 3) {
          final_font_size = 1;
      }
      
      gfx->setTextSize(final_font_size);
      uint16_t text_color_to_use = theme_text_color_rgb565;
      const char* label_color_hex = button_cfg["labelColor"];
      if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);
      
      gfx->setTextColor(text_color_to_use);

      int16_t tx, ty; uint16_t tw, th;
      gfx->getTextBounds(label_text, 0, 0, &tx, &ty, &tw, &th);
      int text_x = x_pos + (CELL_W - tw) / 2;
      int text_y = y_pos + (CELL_H - th) / 2;
      gfx->setCursor(text_x, text_y);
      gfx->print(label_text);
  }
}




// ozans_screen_webdeck.ino dosyasındaki draw_page fonksiyonunu bununla değiştir:



void draw_page(int page_index) {
  Serial.printf("Drawing page index %d...\n", page_index);
  current_buttons.clear();
  current_timers.clear();
  
  // Clear screen
  gfx->fillScreen(theme_bg_color_rgb565);
  
  int COLS = doc["grid"]["cols"] | 3;
  int ROWS = doc["grid"]["rows"] | 3;
  
  current_buttons.resize(ROWS * COLS);
  current_timers.resize(ROWS * COLS);
  current_counters.clear(); 
  current_counters.resize(ROWS * COLS);
  current_toggles.clear();
  current_toggles.resize(ROWS * COLS);

  JsonArray pages_array = doc["pages"];
  if (page_index >= pages_array.size()) {
    Serial.printf("Error: Page index %d is out of bounds!\n", page_index);
    return;
  }

  // --- 1. FRAME DRAWING ---
  // A rounded rectangle surrounding the content like in the original code
  int frame_margin = 2; // 10px space from edges
  int frame_x = frame_margin;
  int frame_y = frame_margin;
  int frame_w = screenWidth - (2 * frame_margin);
  int frame_h = screenHeight - (2 * frame_margin);
  
  gfx->drawRoundRect(frame_x, frame_y, frame_w, frame_h, CORNER_RADIUS, theme_stroke_color_rgb565);
  // Optional: Draw another one inside to make the frame more prominent (Thickness effect)
  gfx->drawRoundRect(frame_x + 1, frame_y + 1, frame_w - 2, frame_h - 2, CORNER_RADIUS, theme_stroke_color_rgb565);


  // --- 2. POSITION CALCULATIONS (App.js Compatible) ---
  
  int gridAvailableHeight = screenHeight - 60;
  int start_y_offset = 25; // Header space

  int totalCellHeight = ROWS * CELL_H;
  int remainingSpaceY = gridAvailableHeight - totalCellHeight;
  int gapY = 0;
  int padY_top = 0;
  int numGapsY = ROWS - 1;

  if (remainingSpaceY < 0) { gapY = -2; padY_top = 0; } 
  else if (numGapsY > 0) {
      padY_top = 2;
      int space_for_gaps = remainingSpaceY - 4;
      gapY = space_for_gaps / numGapsY;
  } else { gapY = 0; padY_top = remainingSpaceY / 2; }
  padY_top += start_y_offset;

  int gapX = 0;
  if (COLS > 1) gapX = (screenWidth - (COLS * CELL_W)) / (COLS + 1);
  else gapX = (screenWidth - CELL_W) / 2;

  int shadow_offset_x = 5;
  int totalPaddingSpaceX = screenWidth - (COLS * CELL_W) - ((COLS - 1) * gapX);
  int padX_left = (totalPaddingSpaceX - shadow_offset_x) / 2;
  if (padX_left < 0) padX_left = 0;
  
  // ---------------------------------------------------------

  // Device Title (Center Header)
  const char* title_text = doc["title"] | "Stream Deck";
  gfx->setTextSize(1);
  gfx->setTextColor(theme_text_color_rgb565);
  int16_t tx, ty; uint16_t tw, th;
  gfx->getTextBounds(title_text, 0, 0, &tx, &ty, &tw, &th);
  
  // Center title vertically (within 50px header area)
  int header_center_y = (50 / 2)-15;
  gfx->setCursor((screenWidth - tw) / 2, header_center_y + (th/2)); 
  gfx->print(title_text);
  
  // NOTE: The line between (drawFastHLine) was removed from here.

  // Calculate and Draw Buttons
  JsonArray page_data = pages_array[page_index]["buttons"];
  int btn_index = 0;
  
  TJpgDec.setJpgScale(1);
  TJpgDec.setCallback(tft_output);

  for (int r = 0; r < ROWS; r++) {
    for (int c = 0; c < COLS; c++) {
      int current_button_vector_index = r * COLS + c;
      
      // USE CALCULATED POSITIONS
      int x_pos = padX_left + (c * CELL_W) + (c * gapX);
      int y_pos = padY_top + (r * CELL_H) + (r * gapY);

      ButtonInfo btn_info;
      btn_info.x = x_pos; btn_info.y = y_pos; btn_info.w = CELL_W; btn_info.h = CELL_H;

      if (btn_index >= page_data.size() || page_data[btn_index].isNull()) {
        btn_info.defined = false;
      } else {
        JsonObject button_cfg = page_data[btn_index];
        btn_info.defined = true;
        btn_info.action = button_cfg["type"] | "none";

        // Assign Action Values
        if (btn_info.action == "goto") { btn_info.value = button_cfg["page"] | 1; }
        else if (btn_info.action == "key") { btn_info.value = button_cfg["combo"] | ""; }
        else if (btn_info.action == "text") { btn_info.value = button_cfg["text"] | ""; }
        else if (btn_info.action == "app") { btn_info.value = ""; }
        else if (btn_info.action == "script") { btn_info.value = ""; } 
        else if (btn_info.action == "website") { btn_info.value = ""; }
        else if (btn_info.action == "media") { btn_info.value = ""; } 
        else if (btn_info.action == "mouse") { btn_info.value = ""; } 
        else if (btn_info.action == "http") { btn_info.value = button_cfg["http"]["url"] | ""; }
        else if (btn_info.action == "sound") { btn_info.value = ""; }
        
        // Timer
        else if (btn_info.action == "timer") {
            int duration = button_cfg["duration"] | 0;
            btn_info.value = String(duration);
            current_timers[current_button_vector_index].duration = duration;
            current_timers[current_button_vector_index].state = TIMER_INACTIVE;
            current_timers[current_button_vector_index].lastSeconds = duration;
        } 
        // Counter
        else if (btn_info.action == "counter") {
            int start_val = button_cfg["counterStartValue"] | 0;
            const char* action_type = button_cfg["counterAction"] | "increment";
            current_counters[current_button_vector_index].startValue = start_val;
            current_counters[current_button_vector_index].currentValue = start_val;
            current_counters[current_button_vector_index].action = String(action_type);
            btn_info.value = String(start_val);
        }
        // Toggle
        else if (btn_info.action == "toggle") {
            btn_info.value = "toggle";
            current_toggles[current_button_vector_index].state = true; 
            const char* on_color_hex = button_cfg["toggleData"]["onColor"];
            if (on_color_hex) {
                current_toggles[current_button_vector_index].onColor = hex_to_rgb565(on_color_hex);
            } else {
                current_toggles[current_button_vector_index].onColor = 0x07E0;
            }
        }
        else { btn_info.value = ""; }

        // Save to vector
        current_buttons[current_button_vector_index] = btn_info;
        
        // DO THE DRAWING
        draw_single_button(current_button_vector_index);
      }
      btn_index++;
    }
  }

  // Page Name (Bottom Bar - Footer)
  const char* page_name_text = pages_array[page_index]["name"] | "Page";
  int footer_y = screenHeight - 30; 
  
  gfx->setTextSize(1);
  gfx->setTextColor(theme_text_color_rgb565);
  gfx->getTextBounds(page_name_text, 0, 0, &tx, &ty, &tw, &th);
  gfx->setCursor((screenWidth - tw) / 2, footer_y);
  gfx->print(page_name_text);

  gfx->setTextSize(1);
  Serial.printf("Page %d drawn successfully.\n", page_index + 1);
}



// --- SETUP FUNCTION ---
void setup() {
  Serial.begin(115200);
  Serial.println("Starting Setup (v4.0 - Serial/ESP-NOW Only)...");

  // --- CONDITIONAL ESP-NOW INITIALIZATION ---
#if DONGLE_MODE == 1
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    // Fill screen with error
  }
  // Add receiver
  esp_now_peer_info_t peerInfo;
  memcpy(peerInfo.peer_addr, receiver_mac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add peer");
  }
  Serial.println("ESP-NOW Initialized.");
#endif
  // --- END ---

  delay(1000);
  // Initialize Screen
  if (!gfx || !gfx->begin()) {
    Serial.println("GFX Panel init failed!");
    while (1)
      ;
  }

  Serial.println("GFX Panel Initialized.");

  gfx->setRotation(3);
// ...
  // Load Preferences (Namespace: "deck_prefs")
  preferences.begin("deck_prefs", false); // false = read/write
  current_brightness = preferences.getInt("bright", 100);
  sleep_enabled = preferences.getBool("sleep_on", false);
  int sleep_min = preferences.getInt("sleep_min", 5);
  sleep_timeout_ms = sleep_min * 60 * 1000;
  
  // Backlight PWM Setup
  #ifdef GFX_BL
    pinMode(GFX_BL, OUTPUT);
    // Set up ESP32 PWM Channel
    ledcSetup(BL_PWM_CHANNEL, BL_PWM_FREQ, BL_PWM_RESOLUTION);
    ledcAttachPin(GFX_BL, BL_PWM_CHANNEL);
    
    // Apply saved brightness
    set_brightness(current_brightness);
    Serial.printf("Backlight Init: %d%%\n", current_brightness);
  #endif
  
  last_activity_time = millis(); // Start counter
  // ...
  gfx->fillScreen(gfx->color565(0, 0, 0));

  // Initialize Touch
  tp.begin();
  tp.setRotation(ROTATION_LEFT);
  Serial.println("Touch Initialized.");

  // Initialize SD Card
  Serial.println("Initializing SD card...");
  if (!SD.begin(SD_CS)) {
    Serial.println("SD Card initialization failed!");
    gfx->setCursor(10, 10);
    gfx->setTextColor(0xFFFF);
    gfx->print("SD Card FAILED!");
    while (1)
      ;
  } else {
    Serial.println("SD Card Initialized.");
    // Load JSON
    File file = SD.open("/esp_config.json", FILE_READ);
    bool config_ok = false;
    if (!file) {
      Serial.println("Failed to open config file!");
      gfx->setCursor(10, 10);
      gfx->setTextColor(0xFFFF);
      gfx->print("JSON File FAILED!");
    } else {
      DeserializationError error = deserializeJson(doc, file);
      file.close();
      if (error) {
        Serial.print(F("deserializeJson() failed: "));
        Serial.println(error.f_str());
        gfx->setCursor(10, 10);
        gfx->setTextColor(0xFFFF);
        gfx->print("JSON Parse FAILED!");
      } else {
        Serial.println("JSON Config Loaded and Parsed.");
        config_ok = true;
      }
    }

    // Set Theme Colors
    theme_bg_color_rgb565 = hex_to_rgb565(doc["theme"]["bg_color"] | "000000");
    theme_btn_color_rgb565 = hex_to_rgb565(doc["theme"]["btn_color"] | "333333");
    theme_text_color_rgb565 = hex_to_rgb565(doc["theme"]["text_color"] | "ffffff");
    theme_stroke_color_rgb565 = hex_to_rgb565(doc["theme"]["stroke_color"] | "555555");
    theme_shadow_color_rgb565 = hex_to_rgb565(doc["theme"]["shadow_color"] | "000000");

    // Do smart cleanup ONLY if config is successful
    if (config_ok) {
      cleanUnusedIcons();
    }
    
    // Draw First Page
    current_page = 0;
    draw_page(current_page);
    Serial.println("Initial page drawn. Setup done.");
  }

  Serial.println("SETUP_DONE");
}

void loop() {
  
  // --- Serial Port Command Check ---
  if (Serial.available() > 0) {
    // FIX 1: Define variable at the beginning
    String command = Serial.readStringUntil('\n');
    command.trim();

    // --- NEW: Brightness Setting ---
    if (command.startsWith("SET_BRIGHTNESS:")) {
        int val = command.substring(15).toInt();
        set_brightness(val);
        preferences.putInt("bright", val); // Save permanently
        Serial.printf("Brightness set to %d%%\n", val);
        update_activity(); // Activity occurred, reset counter
    }
    // --- NEW: Sleep Setting ---
    else if (command.startsWith("SET_SLEEP:")) {
        int mins = command.substring(10).toInt();
        if (mins > 0) {
            sleep_enabled = true;
            sleep_timeout_ms = mins * 60 * 1000;
            preferences.putBool("sleep_on", true);
            preferences.putInt("sleep_min", mins);
            Serial.printf("Sleep enabled: %d min\n", mins);
        } else {
            sleep_enabled = false;
            preferences.putBool("sleep_on", false);
            // If sleeping, wake up immediately
            update_activity();
            Serial.println("Sleep disabled");
        }
        update_activity();
    }
    // --- Existing Commands ---
    else if (command.equals("PING_DECK")) {
      Serial.print("PONG_DECK:");
      Serial.println(DEVICE_NAME);
      update_activity();
    }
    else if (command.equals("START_UPLOAD")) {
      handleUsbUpload();
      // Activity should be updated after upload finishes
      update_activity();
    }
    else if (command.equals("GET_SYNC")) {
        Serial.printf("SYNC_PAGE:%d\n", current_page);
        if (current_buttons.size() == current_toggles.size()) {
            for (int i = 0; i < current_buttons.size(); i++) {
                // Toggle State Sync
                if (current_buttons[i].defined && current_buttons[i].action == "toggle") {
                    int stateVal = current_toggles[i].state ? 1 : 0;
                    Serial.printf("SYNC_STATE:%d:%d\n", i, stateVal);
                }
                // Counter Value Sync
                else if (current_buttons[i].defined && current_buttons[i].action == "counter") {
                    long val = current_counters[i].currentValue;
                    Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, i, val);
                }
            }
        }
        update_activity();
    }
    // Unknown or any other data from PC
    else {
       update_activity();
    }
  }
  
  tp.read();
  bool is_touched_now = tp.isTouched;

  // --- NEW: Sleep and Wake Logic ---
  // 1. If there's touch, update activity
  if (is_touched_now) {
      // If device is in SLEEP mode
      if (is_sleeping) {
          update_activity(); // Wake up
          // IMPORTANT: We don't want button press right after waking up.
          // So we ignore the touch for this loop.
          is_touched_now = false; 
          tp.isTouched = false;
      } else {
          // If awake, just extend the timer
          update_activity();
      }
  }
  
  // 2. Check if time has expired
  check_sleep_mode();
  
  int touch_x = -1, touch_y = -1;
  int current_touched_button_index = -1;

  if (is_touched_now) {
    touch_x = tp.points[0].x;
    touch_y = tp.points[0].y;
    for (int i = 0; i < current_buttons.size(); ++i) {
      const auto& btn = current_buttons[i];
      if (btn.defined && touch_x >= btn.x && touch_x < (btn.x + btn.w) && touch_y >= btn.y && touch_y < (btn.y + btn.h)) {
        current_touched_button_index = i;
        break;
      }
    }
  }

  int radius = CORNER_RADIUS;
  // --- 1. PRESS START ---
  if (is_touched_now && current_touched_button_index != -1 && last_touched_button_index != current_touched_button_index) {
    touch_start_time = millis();
    long_press_triggered = false; 

    if (current_timers[current_touched_button_index].state != TIMER_FINISHED) {
      if (last_touched_button_index != -1) {
        const auto& old_btn = current_buttons[last_touched_button_index];
        gfx->drawRoundRect(old_btn.x, old_btn.y, old_btn.w, old_btn.h, radius, theme_stroke_color_rgb565);
        gfx->drawRoundRect(old_btn.x + 1, old_btn.y + 1, old_btn.w - 2, old_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_stroke_color_rgb565);
      }
      const auto& current_btn = current_buttons[current_touched_button_index];
      gfx->drawRoundRect(current_btn.x, current_btn.y, current_btn.w, current_btn.h, radius, theme_click_stroke_color_rgb565);
      gfx->drawRoundRect(current_btn.x + 1, current_btn.y + 1, current_btn.w - 2, current_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_click_stroke_color_rgb565);
    }
    last_touched_button_index = current_touched_button_index;
  }

  // --- 2. HOLDING (Hold) ---
  else if (is_touched_now && current_touched_button_index != -1 && current_touched_button_index == last_touched_button_index) {
      unsigned long pressDuration = millis() - touch_start_time;
      if (!long_press_triggered && pressDuration > 800) {
          
          // A. COUNTER RESET
          if (current_buttons[current_touched_button_index].action == "counter") {
              CounterInfo &counter = current_counters[current_touched_button_index];
              counter.currentValue = counter.startValue;
              draw_single_button(current_touched_button_index);
              
              // Notify PC that counter was reset
              Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, current_touched_button_index, counter.currentValue);
              long_press_triggered = true;
          }
          
          // B. TIMER RESET
          else if (current_buttons[current_touched_button_index].action == "timer") {
              TimerInfo &timer = current_timers[current_touched_button_index];
              timer.state = TIMER_INACTIVE;
              timer.lastSeconds = timer.duration; 
              draw_single_button(current_touched_button_index);
              
              // Notify PC: Reset
              Serial.printf("TIMER_UPDATE:%d:%d:2:%d\n", current_page, current_touched_button_index, timer.duration);
              long_press_triggered = true;
          }
      }
  }
  
  // --- 3. RELEASE (Release) ---
  else if (!is_touched_now && was_touched) {
    if (last_touched_button_index != -1) {
      const auto& released_btn = current_buttons[last_touched_button_index];
      // A. "goto"
      if (released_btn.action == "goto") {
        int page_index = released_btn.value.toInt() - 1;
        if (page_index >= 0 && page_index < doc["pages"].size()) {
          current_page = page_index;
          draw_page(current_page); 
          last_touched_button_index = -1;
          was_touched = false;
          delay(50);
        }
      }
      
      // B. "timer"
      else if (released_btn.action == "timer") {
        // ONLY IF SHORT PRESS (Long press already reset in Hold section above)
        if (!long_press_triggered) { 
            TimerInfo &timer = current_timers[last_touched_button_index];
            if (timer.state == TIMER_INACTIVE) {
              // --- START / RESUME ---
              timer.state = TIMER_RUNNING;
              
              // Compensate for elapsed time
              unsigned long time_already_passed_ms = 0;
              if (timer.lastSeconds > 0 && timer.lastSeconds < timer.duration) {
                  time_already_passed_ms = (timer.duration - timer.lastSeconds) * 1000;
              }
              timer.startTime = millis() - time_already_passed_ms;

              // Notification (State: 1 = RUNNING)
              int currentDisplaySec = (timer.lastSeconds > 0) ? timer.lastSeconds : timer.duration;
              Serial.printf("TIMER_UPDATE:%d:%d:1:%d\n", current_page, last_touched_button_index, currentDisplaySec);

            } else {
              // --- PAUSE ---
              timer.state = TIMER_INACTIVE;
              // Calculate and save elapsed time
              unsigned long elapsed_sec = (millis() - timer.startTime) / 1000;
              timer.lastSeconds = timer.duration - elapsed_sec;
              
              // Safety: Don't go negative
              if (timer.lastSeconds < 0) timer.lastSeconds = 0;
              draw_single_button(last_touched_button_index);
              
              // Notification (State: 0 = PAUSE)
              Serial.printf("TIMER_UPDATE:%d:%d:0:%d\n", current_page, last_touched_button_index, timer.lastSeconds);
            }
        }
      }

      // C. Other Commands
      else if (released_btn.action == "key" || released_btn.action == "text" || released_btn.action == "app" || released_btn.action == "script" || released_btn.action == "website" || released_btn.action == "media" || released_btn.action == "mouse" || released_btn.action == "sound") {
          send_pc_command(current_page, last_touched_button_index);
      }

      // D. Toggle
      else if (released_btn.action == "toggle") {
          current_toggles[last_touched_button_index].state = !current_toggles[last_touched_button_index].state;
          draw_single_button(last_touched_button_index);
          send_pc_command(current_page, last_touched_button_index);
      }

      // E. Counter (Increment/Decrement)
      else if (released_btn.action == "counter") {
          if (!long_press_triggered) {
              CounterInfo &counter = current_counters[last_touched_button_index];
              if (counter.action == "increment") counter.currentValue++;
              else counter.currentValue--;
              
              draw_single_button(last_touched_button_index);
              
              // Notify PC of new value
              Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, last_touched_button_index, counter.currentValue);
          }
      }
      
      // Visual Cleanup
      if (released_btn.action != "goto" && released_btn.action != "toggle" && current_timers[last_touched_button_index].state == TIMER_INACTIVE) {
          gfx->drawRoundRect(released_btn.x, released_btn.y, released_btn.w, released_btn.h, radius, theme_stroke_color_rgb565);
          gfx->drawRoundRect(released_btn.x + 1, released_btn.y + 1, released_btn.w - 2, released_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_stroke_color_rgb565);
      }
      last_touched_button_index = -1;
    }
  }

  was_touched = is_touched_now;
  checkActiveTimers();
  delay(20);
}
