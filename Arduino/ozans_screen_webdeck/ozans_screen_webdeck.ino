/* * OZAN'S WEB DECK - v4.0 (Serial and ESP-NOW Mode)
 * * This version does not include Wi-Fi and BLE. Communication is done via USB Serial Port
 * or ESP-NOW (Dongle Mode).
 * */

#include "config.h"

// Receiver MAC for ESP-NOW dongle mode
uint8_t receiver_mac[] = RECEIVER_MAC;

#include <TAMC_GT911.h>

// --- REMOVED: <BleKeyboard.h> ---
// --- REMOVED: <WiFi.h>, <AsyncTCP.h>, <ESPAsyncWebServer.h>, <ESPmDNS.h> ---

#include <vector>
#include <map>
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

#include <Adafruit_NeoPixel.h>

// NeoPixel object
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);


/* --- TJpgDec Library --- */
#include <TJpg_Decoder.h>

/* --- NEW: For Saving Settings --- */
#include <Preferences.h>
Preferences preferences;

/* --- NEW: Brightness and Sleep Variables --- */
int current_brightness = 100;                    // 0-100 range
bool sleep_enabled = false;                      // Is sleep mode enabled?
unsigned long sleep_timeout_ms = 1 * 60 * 1000;  // Default 5 minutes
unsigned long last_activity_time = 0;            // Last activity time
bool is_sleeping = false;                        // Currently sleeping?

/* --- Clock for Sleep Mode (millis-based tracking) --- */
int current_hour = 12;
int current_minute = 0;
int current_second = 0;
unsigned long last_clock_update_millis = 0;  // Last time we updated the clock
bool clock_initialized = false;              // Has time been set at least once?

#include <Wire.h>
#include <AS5600.h>

AS5600 as5600(&Wire);

// Knob LED settings
int knob_old_angle = 0;
int knob_threshold = KNOB_THRESHOLD;
unsigned long lastKnobEvent = 0;
uint8_t knob_r = 255, knob_g = 255, knob_b = 255;  // Default: White
int knob_tail_length = 5;


// --- CONDITIONAL LIBRARY INCLUSION (Only for Dongle Mode) ---
#if DONGLE_MODE == 1
#include <WiFi.h>  // Required for ESP-NOW
#include <esp_now.h>
#endif
// --- END ---

// Touch Panel
TAMC_GT911 tp(TOUCH_SDA, TOUCH_SCL, TOUCH_INT, TOUCH_RST, TOUCH_WIDTH, TOUCH_HEIGHT);

/*******************************************************************************
 * Global Variables
 ******************************************************************************/
uint32_t screenWidth = SCREEN_WIDTH;
uint32_t screenHeight = SCREEN_HEIGHT;

/* REMOVED: BleKeyboard bleKeyboard; */
/* REMOVED: AsyncWebServer server(80); */
/* REMOVED: String ip_address = "Connecting..."; */
/* REMOVED: File uploadFile; */

String serial_cmd_buffer = "";
bool serial_cmd_ready = false;

DynamicJsonDocument doc(16384);
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
  int lastSeconds = -1;  // Last displayed seconds
};

// Global map for running timers (survives page changes)
// Key: page * 100 + btn_idx
std::map<int, TimerInfo> running_timers;

// Global map for finished timers (waiting for auto-reset on other pages)
// Key: page * 100 + btn_idx, Value: {finish_time, duration}
struct FinishedTimerInfo {
  unsigned long finishTime;
  int duration;
};
std::map<int, FinishedTimerInfo> finished_timers;

struct CounterInfo {
  long currentValue = 0;        // Current counter value
  long startValue = 0;          // Start value (for reset)
  String action = "increment";  // "increment" or "decrement"
};
std::vector<CounterInfo> current_counters;  // <-- NEWLY ADDED

// --- NEW: TOGGLE INFO ---
struct ToggleInfo {
  bool state = false;         // false = OFF (State A), true = ON (State B)
  uint16_t onColor = 0x07E0;  // Default Green (RGB565)
};
std::vector<ToggleInfo> current_toggles;

std::vector<TimerInfo> current_timers;

bool was_touched = false;
int last_touched_button_index = -1;
unsigned long touch_start_time = 0;  // NEW: For detecting long press
bool long_press_triggered = false;   // NEW: Was long press triggered?

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
#else
  // Send via USB Serial
  Serial.printf("%s", command);
#endif
}
// *** NEW: Brightness Adjustment Function ***
// *** FIXED: Brightness Adjustment Function ***
// *** FIXED: Gamma (Perceptual) Brightness Function ***
#include <math.h>  // May be needed for pow function, usually embedded in Arduino but just to be sure.

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
    duty = 0;  // Completely off
  } else if (percent == 100) {
    duty = 255;  // Completely on
  } else {
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
    // CRITICAL FIX: First clear screen, then restore brightness, then draw page
    // This prevents the sleep clock from flashing briefly
    gfx->fillScreen(BLACK);
    set_brightness(current_brightness);
    draw_page(current_page);
  }
}

void check_sleep_mode() {
  // Zaten uyuyorsak tekrar işlem yapma
  if (is_sleeping) {
    return;
  }

  if (!sleep_enabled) return;

  if (millis() - last_activity_time > sleep_timeout_ms) {
    is_sleeping = true;

    // Request time from PC if not initialized
    if (!clock_initialized) {
      Serial.println("GET_TIME");
    }

    // Dim the screen
#ifdef GFX_BL
    // Use ~30% brightness for sleep mode
    ledcWrite(BL_PWM_CHANNEL, 80);
#endif

    // Clear screen and draw clock
    gfx->fillScreen(BLACK);
    draw_sleep_clock();
  }
}

void draw_sleep_clock() {
  // Clear screen to prevent text overlap
  gfx->fillScreen(BLACK);
  
  char timeStr[6];
  snprintf(timeStr, sizeof(timeStr), "%02d:%02d", current_hour, current_minute);

  // Large centered clock
  gfx->setTextSize(20);

  // Use WHITE for visibility in dim light
  gfx->setTextColor(0xFFFF);

  int16_t x1, y1;
  uint16_t w, h;
  gfx->getTextBounds(timeStr, 0, 0, &x1, &y1, &w, &h);

  int cx = (screenWidth - w) / 2;
  int cy = (screenHeight - h) / 2;

  gfx->setCursor(cx, cy);
  gfx->print(timeStr);
  gfx->setTextSize(2);  // Reset
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
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// *** Helper Function: Convert Font Size to GFX Size *** (Remains the same)
int mapFontSize(int pixelSize) {
  if (pixelSize <= 14) return 1;
  if (pixelSize <= 22) return 2;
  return 3;
}

// *** Helper Function: Draw Text on Button *** (Remains the same)
void drawButtonText(int x, int y, const char* text) {
  int16_t tx, ty;
  uint16_t tw, th;
  gfx->setTextSize(2);
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


  File root = SD.open("/");
  if (!root) {
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
        if (SD.remove(filePath.c_str())) {
          deletedCount++;
        } else {
        }
      }
    }
    file.close();
  }

  root.close();
}

// --- NEW: Save current config (doc) to SD card ---
bool saveConfigToSD() {
  File file = SD.open("/esp_config.json", FILE_WRITE);
  if (!file) {
    Serial.println("ERR: Failed to open esp_config.json for writing");
    return false;
  }
  
  size_t bytesWritten = serializeJson(doc, file);
  file.close();
  
  if (bytesWritten > 0) {
    return true;
  } else {
    Serial.println("ERR: Failed to write config to SD");
    return false;
  }
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
          unsigned long lastDataTime = millis();
          const unsigned long DATA_TIMEOUT = 10000;  // 10 second timeout
          byte buffer[512];  // Read in chunks for better performance

          while (remaining > 0) {
            int available = Serial.available();
            if (available > 0) {
              // Read as much as we can, up to buffer size or remaining bytes
              int toRead = min((long)available, min((long)sizeof(buffer), remaining));
              int bytesRead = Serial.readBytes(buffer, toRead);
              
              if (bytesRead > 0) {
                usbUploadFile.write(buffer, bytesRead);
                remaining -= bytesRead;
                lastDataTime = millis();  // Reset timeout
              }
            } else {
              // No data available, check timeout
              if (millis() - lastDataTime > DATA_TIMEOUT) {
                Serial.println("ERR_DATA_TIMEOUT");
                break;
              }
              yield();  // Feed watchdog
            }
          }

          usbUploadFile.close();
          if (remaining == 0) {
            Serial.println("OK_DATA");
          } else {
            Serial.printf("ERR_DATA_INCOMPLETE:%ld\n", remaining);
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
    cleanUnusedIcons();
  } else {
  }

  Serial.println("Rebooting...");
  delay(500);
  ESP.restart();
}


// --- CHECK ALL RUNNING TIMERS (All Pages) ---
// This function checks timers on OTHER pages (not current page)
// Current page timers are handled by checkActiveTimers()
void checkAllRunningTimers() {
  unsigned long now = millis();
  
  // Create a list of timers to remove (can't modify map while iterating)
  std::vector<int> timersToRemove;
  
  for (auto& kv : running_timers) {
    int timerKey = kv.first;
    TimerInfo& timer = kv.second;
    
    if (timer.state != TIMER_RUNNING) continue;
    
    int page = timerKey / 100;
    int idx = timerKey % 100;
    
    // Skip current page - handled by checkActiveTimers()
    if (page == current_page) continue;
    
    unsigned long elapsed_ms = now - timer.startTime;
    long remaining_sec = timer.duration - (elapsed_ms / 1000);
    
    // Timer finished on another page!
    if (remaining_sec < 0) {
      // Send TIMER_DONE to PC
      Serial.printf("TIMER_DONE:%d:%d\n", page, idx);
      
      // Add to finished_timers for tracking (with duration for reset)
      FinishedTimerInfo info;
      info.finishTime = now;
      info.duration = timer.duration;
      finished_timers[timerKey] = info;
      
      // Mark for removal from running_timers
      timersToRemove.push_back(timerKey);
    }
  }
  
  // Remove finished timers from running map
  for (int key : timersToRemove) {
    running_timers.erase(key);
  }
  
  // Check for auto-reset of finished timers on other pages
  // (They should reset after 2 seconds even if not on screen)
  std::vector<int> resetKeys;
  for (auto& kv : finished_timers) {
    int page = kv.first / 100;
    int idx = kv.first % 100;
    
    // Skip current page - handled by checkActiveTimers()
    if (page == current_page) continue;
    
    if (now - kv.second.finishTime > 2000) {
      // Send reset notification to PC with original duration
      Serial.printf("TIMER_UPDATE:%d:%d:2:%d\n", page, idx, kv.second.duration);
      resetKeys.push_back(kv.first);
    }
  }
  
  for (int key : resetKeys) {
    finished_timers.erase(key);
  }
}


// --- CHECK ACTIVE TIMERS (Auto Reset Synchronization Added) ---
void checkActiveTimers() {
  unsigned long now = millis();

  for (int i = 0; i < current_timers.size(); i++) {
    TimerInfo& timer = current_timers[i];
    // If INACTIVE, skip to next button
    if (timer.state == TIMER_INACTIVE) continue;

    ButtonInfo& button = current_buttons[i];
    JsonObject button_cfg = doc["pages"][current_page]["buttons"][i];

    // 1. IS TIMER RUNNING?
    if (timer.state == TIMER_RUNNING) {
      unsigned long elapsed_ms = now - timer.startTime;
      long remaining_sec = timer.duration - (elapsed_ms / 1000);

      // A. Has time expired?
      if (remaining_sec < 0) {
        timer.state = TIMER_FINISHED;
        timer.startTime = now;  // Save finish time (for flash effect)
        timer.lastSeconds = -1;

        // Remove from global running timers
        int timerKey = current_page * 100 + i;
        running_timers.erase(timerKey);

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

        int16_t tx, ty;
        uint16_t tw, th;
        gfx->getTextBounds("00:00", 0, 0, &tx, &ty, &tw, &th);
        gfx->setCursor(button.x + (button.w - tw) / 2, button.y + (button.h - th) / 2);
        gfx->print("00:00");

      }
      // B. Time not expired, did second change?
      else if (remaining_sec != timer.lastSeconds) {
        timer.lastSeconds = remaining_sec;
        
        // Update global running timers map
        int timerKey = current_page * 100 + i;
        running_timers[timerKey] = timer;
        
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
        if (final_font_size < 3) final_font_size = 3;

        gfx->setTextSize(final_font_size);
        uint16_t text_color_to_use = theme_text_color_rgb565;
        const char* label_color_hex = button_cfg["labelColor"];
        if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);
        gfx->setTextColor(text_color_to_use);

        int16_t tx, ty;
        uint16_t tw, th;
        gfx->getTextBounds(time_str, 0, 0, &tx, &ty, &tw, &th);
        gfx->setCursor(button.x + (button.w - tw) / 2, button.y + (button.h - th) / 2);
        gfx->print(time_str);
      }
    }

    // 2. TIMER FINISHED (TIMER_FINISHED) - Flashing and Auto Reset
    else if (timer.state == TIMER_FINISHED) {

      unsigned long flashDuration = now - timer.startTime;

      // AUTO RESET MOMENT (after 2 seconds)
      if (flashDuration > 2000) {
        timer.state = TIMER_INACTIVE;
        timer.startTime = 0;
        timer.lastSeconds = timer.duration;  // Reset to beginning

        draw_single_button(i);  // Restore screen to previous state

        // --- NEWLY ADDED SECTION: Notify PC of Reset ---
        // State 2 = RESET
        Serial.printf("TIMER_UPDATE:%d:%d:2:%d\n", current_page, i, timer.duration);
        // -------------------------------------------------

        continue;
      }

      // Flashing Effect (Remains the same)
      const uint16_t flash_colors[5] = { 0xF800, 0xFFE0, 0x07E0, 0x001F, 0xF81F };
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

      int16_t tx, ty;
      uint16_t tw, th;
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
  int gridAvailableHeight = screenHeight - 90;
  int start_y_offset = 50;

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
  JsonVariant button_variant = page_data[btn_index];
  int radius = CORNER_RADIUS;

  // --- CHECK IF BUTTON IS NULL (Empty slot) ---
  if (button_variant.isNull() || !btn_info.defined) {
    // Empty slot - draw nothing
    return;
  }

  JsonObject button_cfg = button_variant.as<JsonObject>();

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
    } else {
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
    
    // If timer is RUNNING, calculate real remaining time
    if (current_timers[btn_index].state == TIMER_RUNNING) {
      unsigned long elapsed_ms = millis() - current_timers[btn_index].startTime;
      long remaining = current_timers[btn_index].duration - (elapsed_ms / 1000);
      if (remaining < 0) remaining = 0;
      displayVal = remaining;
    }
    // If timer is INACTIVE but has lastSeconds (paused), use that
    else if (current_timers[btn_index].state == TIMER_INACTIVE && current_timers[btn_index].lastSeconds != -1) {
      displayVal = current_timers[btn_index].lastSeconds;
    }
    
    sprintf(time_str, "%02d:%02d", displayVal / 60, displayVal % 60);
    label_text = time_str;
  } else if (btn_info.action == "counter") {
    long val = current_counters[btn_index].currentValue;
    sprintf(counter_str, "%ld", val);
    label_text = counter_str;
  } else {
    label_text = NULL;
  }

  if (label_text) {
    int final_font_size = mapFontSize(label_size_px);
    if ((btn_info.action == "timer" || btn_info.action == "counter")) {
      final_font_size = 3;
    }

    gfx->setTextSize(final_font_size);
    uint16_t text_color_to_use = theme_text_color_rgb565;
    const char* label_color_hex = button_cfg["labelColor"];
    if (label_color_hex) text_color_to_use = hex_to_rgb565(label_color_hex);

    gfx->setTextColor(text_color_to_use);

    int16_t tx, ty;
    uint16_t tw, th;
    gfx->getTextBounds(label_text, 0, 0, &tx, &ty, &tw, &th);
    int text_x = x_pos + (CELL_W - tw) / 2;
    int text_y = y_pos + (CELL_H - th) / 2;
    gfx->setCursor(text_x, text_y);
    gfx->print(label_text);
  }
}




void draw_page(int page_index) {
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

  // --- FRAME DRAWING REMOVED ---


  // --- 2. POSITION CALCULATIONS (App.js Compatible) ---

  int gridAvailableHeight = screenHeight - 90;
  int start_y_offset = 50;  // Header space

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
  if (COLS > 1) gapX = (screenWidth - (COLS * CELL_W)) / (COLS + 1);
  else gapX = (screenWidth - CELL_W) / 2;

  int shadow_offset_x = 5;
  int totalPaddingSpaceX = screenWidth - (COLS * CELL_W) - ((COLS - 1) * gapX);
  int padX_left = (totalPaddingSpaceX - shadow_offset_x) / 2;
  if (padX_left < 0) padX_left = 0;

  // ---------------------------------------------------------

  // Device Title (Center Header)
  const char* title_text = doc["title"] | "Stream Deck";
  gfx->setTextSize(2);
  gfx->setTextColor(theme_text_color_rgb565);
  int16_t tx, ty;
  uint16_t tw, th;
  gfx->getTextBounds(title_text, 0, 0, &tx, &ty, &tw, &th);

  // Center title vertically (within 50px header area)
  int header_center_y = (50 / 2) - 15;
  gfx->setCursor((screenWidth - tw) / 2, header_center_y + (th / 2));
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
      btn_info.x = x_pos;
      btn_info.y = y_pos;
      btn_info.w = CELL_W;
      btn_info.h = CELL_H;

      if (btn_index >= page_data.size() || page_data[btn_index].isNull()) {
        btn_info.defined = false;
        btn_info.action = "";
        btn_info.value = "";
        
        // Save to vector even for null buttons
        current_buttons[current_button_vector_index] = btn_info;
        
        // Draw empty cell (will do nothing since defined=false)
        draw_single_button(current_button_vector_index);
      } else {
        JsonObject button_cfg = page_data[btn_index];
        btn_info.defined = true;
        btn_info.action = button_cfg["type"] | "none";

        // Assign Action Values
        if (btn_info.action == "goto") {
          btn_info.value = button_cfg["page"] | 1;
        } else if (btn_info.action == "key") {
          btn_info.value = button_cfg["combo"] | "";
        } else if (btn_info.action == "text") {
          btn_info.value = button_cfg["text"] | "";
        } else if (btn_info.action == "app") {
          btn_info.value = "";
        } else if (btn_info.action == "script") {
          btn_info.value = "";
        } else if (btn_info.action == "website") {
          btn_info.value = "";
        } else if (btn_info.action == "media") {
          btn_info.value = "";
        } else if (btn_info.action == "mouse") {
          btn_info.value = "";
        } else if (btn_info.action == "http") {
          btn_info.value = button_cfg["http"]["url"] | "";
        } else if (btn_info.action == "sound") {
          btn_info.value = "";
        }

        // Timer
        else if (btn_info.action == "timer") {
          int duration = button_cfg["duration"] | 0;

          // Check Preferences for saved override value
          char prefKey[16];
          snprintf(prefKey, sizeof(prefKey), "t_%d_%d", page_index, current_button_vector_index);
          int savedDuration = preferences.getInt(prefKey, -1);
          if (savedDuration >= 0) {
            duration = savedDuration;  // Use saved value
          }

          btn_info.value = String(duration);
          
          // Check if this timer is running in global map
          int timerKey = page_index * 100 + current_button_vector_index;
          if (running_timers.count(timerKey) > 0) {
            // Restore running timer state
            current_timers[current_button_vector_index] = running_timers[timerKey];
          } 
          // Check if this timer finished while on another page
          else if (finished_timers.count(timerKey) > 0) {
            // Timer finished on another page, show as FINISHED
            current_timers[current_button_vector_index].duration = duration;
            current_timers[current_button_vector_index].state = TIMER_FINISHED;
            current_timers[current_button_vector_index].startTime = finished_timers[timerKey].finishTime;
            current_timers[current_button_vector_index].lastSeconds = -1;
            // Remove from finished_timers (now handled by checkActiveTimers)
            finished_timers.erase(timerKey);
          }
          else {
            // Initialize as inactive
            current_timers[current_button_vector_index].duration = duration;
            current_timers[current_button_vector_index].state = TIMER_INACTIVE;
            current_timers[current_button_vector_index].lastSeconds = duration;
          }
        }
        // Counter
        else if (btn_info.action == "counter") {
          int start_val = button_cfg["counterStartValue"] | 0;
          const char* action_type = button_cfg["counterAction"] | "increment";
          current_counters[current_button_vector_index].startValue = start_val;
          current_counters[current_button_vector_index].action = String(action_type);
          
          // Check Preferences for saved counter value
          char prefKey[16];
          snprintf(prefKey, sizeof(prefKey), "c_%d_%d", page_index, current_button_vector_index);
          long savedValue = preferences.getLong(prefKey, -999999);
          if (savedValue != -999999) {
            current_counters[current_button_vector_index].currentValue = savedValue;
          } else {
            current_counters[current_button_vector_index].currentValue = start_val;
          }
          
          btn_info.value = String(current_counters[current_button_vector_index].currentValue);
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
        } else {
          btn_info.value = "";
        }

        // Save to vector
        current_buttons[current_button_vector_index] = btn_info;

        // DO THE DRAWING
        draw_single_button(current_button_vector_index);
      }
      btn_index++;
    }
  }

  // Check if page is empty (no filled buttons) and not page 1
  if (page_index > 0) {
    bool has_any_filled_button = false;
    for (int i = 0; i < current_buttons.size(); i++) {
      // A button is "filled" if it has a valid action (not "none" and not empty)
      if (current_buttons[i].defined) {
        String action = current_buttons[i].action;
        if (action.length() > 0 && action != "none") {
          has_any_filled_button = true;
          break;
        }
      }
    }

    // If empty page, show "Go to Page 1" button in center
    if (!has_any_filled_button) {
      int btn_size = 70;  // Square button
      int btn_x = (screenWidth - btn_size) / 2;
      int btn_y = (screenHeight - btn_size) / 2;

      // Draw button background (accent blue color)
      uint16_t accent_color = gfx->color565(59, 130, 246);  // Blue accent
      gfx->fillRoundRect(btn_x, btn_y, btn_size, btn_size, 12, accent_color);

      // Draw arrow symbol
      gfx->setTextSize(4);
      gfx->setTextColor(WHITE);
      const char* btn_text = "<";
      int16_t tx, ty;
      uint16_t tw, th;
      gfx->getTextBounds(btn_text, 0, 0, &tx, &ty, &tw, &th);
      gfx->setCursor(btn_x + (btn_size - tw) / 2, btn_y + (btn_size - th) / 2);
      gfx->print(btn_text);

      // Add this as a special "goto page 1" button
      ButtonInfo goto_btn;
      goto_btn.x = btn_x;
      goto_btn.y = btn_y;
      goto_btn.w = btn_size;
      goto_btn.h = btn_size;
      goto_btn.defined = true;
      goto_btn.action = "goto";
      goto_btn.value = "1";  // Page 1 (1-indexed, becomes index 0)

      // Store in first slot
      current_buttons[0] = goto_btn;

    }
  }

  // Page Name (Bottom Bar - Footer)
  const char* page_name_text = pages_array[page_index]["name"] | "Page";
  int footer_y = screenHeight - 30;

  gfx->setTextSize(2);
  gfx->setTextColor(theme_text_color_rgb565);
  gfx->getTextBounds(page_name_text, 0, 0, &tx, &ty, &tw, &th);
  gfx->setCursor((screenWidth - tw) / 2, footer_y);
  gfx->print(page_name_text);

  gfx->setTextSize(2);
}



// --- SETUP FUNCTION ---
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  Serial.println("Starting Setup (v4.0 - Serial/ESP-NOW Only)...");



  strip.begin();             // NeoPixel'i başlat
  strip.show();              // Tüm pikselleri 'kapalı' duruma getir (başlangıç temizliği)
  strip.setBrightness(255);  // Set brightness (0-255)

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
#endif
  // --- END ---

  delay(200);  // Brief delay for hardware stabilization
  // Initialize Screen
  if (!gfx || !gfx->begin()) {
    Serial.println("GFX Panel init failed!");
    while (1)
      ;
  }

  Serial.println("GFX Panel Initialized.");

  //gfx->setRotation(0);
  // ...
  // Load Preferences (Namespace: "deck_prefs")
  preferences.begin("deck_prefs", false);  // false = read/write
  // Load Knob Color Settings
  knob_r = preferences.getInt("k_r", 255);
  knob_g = preferences.getInt("k_g", 255);
  knob_b = preferences.getInt("k_b", 255);
  knob_tail_length = preferences.getInt("k_tail", 5);
  current_brightness = preferences.getInt("bright", 100);
  sleep_enabled = preferences.getBool("sleep_on", true);
  int sleep_min = preferences.getInt("sleep_min", 5);
  sleep_timeout_ms = (unsigned long)sleep_min * 60 * 1000;

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

  last_activity_time = millis();  // Start counter
  // ...
  gfx->fillScreen(gfx->color565(0, 0, 0));

  // Initialize Touch
  tp.begin();
  tp.setRotation(TOUCH_ROTATION);
  Serial.println("Touch Initialized.");

  as5600.begin();  // 4 = Direction Pin Mode (Varsayılan)

  if (as5600.isConnected()) {
    Serial.println("DURUM: BAGLANDI! (Sensör cevap veriyor)");
  } else {
    Serial.println("DURUM: HATA! (Sensör bulunamadı)");
  }


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

    // Set Theme Colors - Check Preferences first (Serial ile gönderilmiş tema), yoksa config.json'dan al
    String pref_bg = preferences.getString("th_bg", "");
    if (pref_bg.length() > 0) {
      // Preferences'ta tema var - Serial ile gönderilmiş
      theme_bg_color_rgb565 = hex_to_rgb565(pref_bg.c_str());
      theme_btn_color_rgb565 = hex_to_rgb565(preferences.getString("th_btn", "333333").c_str());
      theme_text_color_rgb565 = hex_to_rgb565(preferences.getString("th_txt", "ffffff").c_str());
      theme_stroke_color_rgb565 = hex_to_rgb565(preferences.getString("th_str", "555555").c_str());
      theme_shadow_color_rgb565 = hex_to_rgb565(preferences.getString("th_shd", "000000").c_str());
      Serial.println("Theme loaded from Preferences (Serial sync)");
    } else {
      // Preferences boş - config.json'dan al
      theme_bg_color_rgb565 = hex_to_rgb565(doc["theme"]["bg_color"] | "000000");
      theme_btn_color_rgb565 = hex_to_rgb565(doc["theme"]["btn_color"] | "333333");
      theme_text_color_rgb565 = hex_to_rgb565(doc["theme"]["text_color"] | "ffffff");
      theme_stroke_color_rgb565 = hex_to_rgb565(doc["theme"]["stroke_color"] | "555555");
      theme_shadow_color_rgb565 = hex_to_rgb565(doc["theme"]["shadow_color"] | "000000");
    }

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
  update_activity();
}

// Loop timing variables
unsigned long lastLedUpdate = 0;
unsigned long lastTouchPoll = 0;
unsigned long lastTimerSync = 0;          // For syncing all running timers to PC
const int LED_INTERVAL = 50;              // Update LEDs every 50ms (20 FPS)
const int TOUCH_INTERVAL = 10;            // Poll touch every 10ms
unsigned long last_valid_touch_time = 0;  // Debounce for touch

void loop() {
  unsigned long currentMillis = millis();

  // ============================================================
  // 0. INTERNAL CLOCK UPDATE (millis-based)
  // ============================================================
  if (clock_initialized && currentMillis - last_clock_update_millis >= 1000) {
    // Update every second
    unsigned long elapsed_seconds = (currentMillis - last_clock_update_millis) / 1000;
    last_clock_update_millis = currentMillis;
    
    current_second += elapsed_seconds;
    while (current_second >= 60) {
      current_second -= 60;
      current_minute++;
      if (current_minute >= 60) {
        current_minute = 0;
        current_hour++;
        if (current_hour >= 24) {
          current_hour = 0;
        }
      }
      // Update sleep clock if minute changed
      if (is_sleeping) {
        draw_sleep_clock();
      }
    }
  }

  // ============================================================
  // 1. KNOB READING AND LED MANAGEMENT (BREATH + COMET)
  // ============================================================
  if (currentMillis - lastLedUpdate >= LED_INTERVAL) {
    lastLedUpdate = currentMillis;

    // A) Knob Verisini Oku
    int rawAngle = as5600.readAngle();

    strip.clear();

    // B) MODE CHECK: SLEEP OR ACTIVE?
    if (is_sleeping) {
      // --- BREATHING MODE ---
      // Calculate brightness using sine wave (smooth cyclic transition)
      float breath = (exp(sin(millis() / 2000.0 * PI)) - 0.36787944) * 108.0;
      int bVal = (int)breath;
      if (bVal < 0) bVal = 0;
      if (bVal > 255) bVal = 255;

      // Adjust color brightness based on breath value
      uint8_t r = (knob_r * bVal) / 255;
      uint8_t g = (knob_g * bVal) / 255;
      uint8_t b = (knob_b * bVal) / 255;

      // Light all LEDs
      for (int i = 0; i < strip.numPixels(); i++) {
        strip.setPixelColor(i, strip.Color(r, g, b));
      }

    } else {
      // --- ACTIVE MODE (SMOOTH COMET TAIL) ---
      // Calculate float position (0.0 - 16.0)
      float ledPosFloat = (rawAngle / 4096.0f) * 16.0f;

      // If tail is 16, all LEDs light equally
      if (knob_tail_length >= 16) {
        for (int i = 0; i < 16; i++) {
          strip.setPixelColor(i, strip.Color(knob_r, knob_g, knob_b));
        }
      } else {
        // Calculate brightness for each LED
        for (int i = 0; i < 16; i++) {
          // Calculate distance between this LED and head position
          float dist = ledPosFloat - (float)i;

          // Wrap-around: keep between 0 and 16
          while (dist < 0.0f) dist += 16.0f;
          while (dist >= 16.0f) dist -= 16.0f;

          float brightness = 0.0f;
          float tailF = (float)knob_tail_length;

          // Leading LED - gradually brighten
          if (dist > 15.0f) {
            brightness = dist - 15.0f;  // 15→0, 16→1
            brightness = brightness * brightness;
          }
          // Kuyruk LED'leri - ana bölge
          else if (dist < tailF) {
            float fadeRatio = dist / tailF;
            brightness = 1.0f - (fadeRatio * fadeRatio * 0.9f);  // Quadratic, min %10
          }
          // Kuyruk sonu - smooth fade out (1 LED ekstra)
          else if (dist < tailF + 1.0f) {
            float fadeOut = tailF + 1.0f - dist;    // 1→0
            brightness = fadeOut * fadeOut * 0.1f;  // Quadratic fade to 0
          }

          // Parlaklık uygula
          if (brightness > 0.01f) {
            int bVal = (int)(brightness * 255.0f);
            if (bVal > 255) bVal = 255;

            uint8_t r = (knob_r * bVal) / 255;
            uint8_t g = (knob_g * bVal) / 255;
            uint8_t b = (knob_b * bVal) / 255;

            strip.setPixelColor(i, strip.Color(r, g, b));
          }
        }
      }
    }
    strip.show();

    // C) Hareket Algılama ve RAW Açı Gönderme
    int delta = rawAngle - knob_old_angle;
    if (delta > 2048) delta -= 4096;
    else if (delta < -2048) delta += 4096;

    // Minimal gürültü filtresi - sadece 3 birimden fazla hareket varsa gönder
    if (abs(delta) > 3) {
      update_activity();
      Serial.printf("KNOB_RAW:%d\n", rawAngle);
      knob_old_angle = rawAngle;
    }
  }

  // ============================================================
  // 2. SERİ PORT KOMUTLARI (PC'den Gelenler)
  // ============================================================
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.length() > 0) {

      // --- Parlaklık ---
      if (command.startsWith("SET_BRIGHTNESS:")) {
        int val = command.substring(15).toInt();
        set_brightness(val);
        preferences.putInt("bright", val);
        Serial.printf("Brightness set to %d%%\n", val);
        update_activity();
      }

      if (command.startsWith("SWAP_BTN:")) {
        int first = command.indexOf(':');
        int second = command.indexOf(':', first + 1);
        int third = command.indexOf(':', second + 1);

        if (first > 0 && second > 0 && third > 0) {
          int page = command.substring(first + 1, second).toInt();
          int fromIdx = command.substring(second + 1, third).toInt();
          int toIdx = command.substring(third + 1).toInt();

          // Validate page and index
          if (page >= 0 && page < doc["pages"].size()) {
            JsonArray pages = doc["pages"];
            JsonArray btns = pages[page]["buttons"];

            if (fromIdx >= 0 && toIdx >= 0 && fromIdx < btns.size() && toIdx < btns.size()) {

              // Swap buttons in JSON
              DynamicJsonDocument tmp(1024);
              tmp.set(btns[fromIdx]);
              btns[fromIdx] = btns[toIdx];
              btns[toIdx] = tmp.as<JsonVariant>();

              // Save config to SD (persistent)
              saveConfigToSD();

              // ÖNEMLİ: Bu sayfa ekranda ise, her şeyi baştan kur
              if (page == current_page) {
                draw_page(current_page);  // rebuilds current_buttons, timers, counters, toggles
              }

              Serial.println("BTN_SWAPPED_OK");
            } else {
              Serial.println("BTN_SWAPPED_FAIL");
            }
          } else {
            Serial.println("BTN_SWAPPED_FAIL");
          }
        }

        update_activity();
      }

      // --- Sleep Mode ---
      else if (command.startsWith("SET_SLEEP:")) {
        int mins = command.substring(10).toInt();
        if (mins > 0) {
          sleep_enabled = true;
          // Safe timeout calculation
          sleep_timeout_ms = (unsigned long)mins * 60 * 1000;

          preferences.putBool("sleep_on", true);
          preferences.putInt("sleep_min", mins);

          Serial.printf("Sleep enabled: %d min (Timeout: %lu ms)\n", mins, sleep_timeout_ms);
        } else {
          sleep_enabled = false;
          preferences.putBool("sleep_on", false);
          update_activity();
          Serial.println("Sleep disabled");
        }
        update_activity();  // Reset activity timer
      }
      // --- Other Commands ---
      else if (command.equals("PING_DECK")) {
        Serial.print("PONG_DECK:");
        Serial.println(DEVICE_NAME);
        update_activity();
      } else if (command.equals("START_UPLOAD")) {
        handleUsbUpload();
        update_activity();
      } else if (command.equals("GET_SYNC")) {
        Serial.printf("SYNC_PAGE:%d\n", current_page);
        Serial.printf("KNOB_RAW:%d\n", as5600.readAngle());
        if (current_buttons.size() == current_toggles.size()) {
          for (int i = 0; i < current_buttons.size(); i++) {
            if (current_buttons[i].defined && current_buttons[i].action == "toggle") {
              int stateVal = current_toggles[i].state ? 1 : 0;
              Serial.printf("SYNC_STATE:%d:%d\n", i, stateVal);
            } else if (current_buttons[i].defined && current_buttons[i].action == "counter") {
              long val = current_counters[i].currentValue;
              Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, i, val);
            }
          }
        }
        // Send all running timers to app
        for (auto& kv : running_timers) {
          int timerKey = kv.first;
          TimerInfo& timer = kv.second;
          int page = timerKey / 100;
          int idx = timerKey % 100;
          
          if (timer.state == TIMER_RUNNING) {
            unsigned long elapsed_ms = millis() - timer.startTime;
            long remaining = timer.duration - (elapsed_ms / 1000);
            if (remaining > 0) {
              Serial.printf("TIMER_UPDATE:%d:%d:1:%ld\n", page, idx, remaining);
            }
          }
        }
        update_activity();
      } else if (!command.startsWith("SET_TIME:")) {
        update_activity();
      }
    }
    // --- YENİ: KNOB LED AYARI (Format: SET_KNOB:R:G:B:Tail) ---
    if (command.startsWith("SET_KNOB:")) {
      // Örn: SET_KNOB:255:0:0:7
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);
      int third = command.indexOf(':', second + 1);
      int fourth = command.indexOf(':', third + 1);

      if (second > 0 && third > 0 && fourth > 0) {
        knob_r = command.substring(first + 1, second).toInt();
        knob_g = command.substring(second + 1, third).toInt();
        knob_b = command.substring(third + 1, fourth).toInt();
        knob_tail_length = command.substring(fourth + 1).toInt();

        // Kuyruk uzunluğu sınırla (Max 15, Min 1)
        if (knob_tail_length > 15) knob_tail_length = 15;
        if (knob_tail_length < 1) knob_tail_length = 1;

        // Save settings (optional persistence)
        preferences.putInt("k_r", knob_r);
        preferences.putInt("k_g", knob_g);
        preferences.putInt("k_b", knob_b);
        preferences.putInt("k_tail", knob_tail_length);

        Serial.println("KNOB_CONFIG_UPDATED");
        update_activity();  // Wake on setting change
      }
    }

    // --- YENİ: TEMA RENK GÜNCELLEME (Format: SET_THEME:bg:btn:text:stroke:shadow:knobR:knobG:knobB) ---
    // Örn: SET_THEME:0f0f0f:1a1a2e:ffffff:4a4a6a:000000:217:70:239
    if (command.startsWith("SET_THEME:")) {
      String data = command.substring(10);
      String parts[8];
      int partIndex = 0;

      // Parse all 8 parts (5 colors + 3 RGB for knob)
      while (data.length() > 0 && partIndex < 8) {
        int colonPos = data.indexOf(':');
        if (colonPos == -1) {
          parts[partIndex++] = data;
          break;
        }
        parts[partIndex++] = data.substring(0, colonPos);
        data = data.substring(colonPos + 1);
      }

      if (partIndex >= 5) {
        // Tema renklerini güncelle
        theme_bg_color_rgb565 = hex_to_rgb565(parts[0].c_str());
        theme_btn_color_rgb565 = hex_to_rgb565(parts[1].c_str());
        theme_text_color_rgb565 = hex_to_rgb565(parts[2].c_str());
        theme_stroke_color_rgb565 = hex_to_rgb565(parts[3].c_str());
        theme_shadow_color_rgb565 = hex_to_rgb565(parts[4].c_str());

        // Save to Preferences (persistent)
        preferences.putString("th_bg", parts[0]);
        preferences.putString("th_btn", parts[1]);
        preferences.putString("th_txt", parts[2]);
        preferences.putString("th_str", parts[3]);
        preferences.putString("th_shd", parts[4]);

        // Knob LED rengi de varsa güncelle
        if (partIndex == 8) {
          knob_r = parts[5].toInt();
          knob_g = parts[6].toInt();
          knob_b = parts[7].toInt();

          preferences.putInt("k_r", knob_r);
          preferences.putInt("k_g", knob_g);
          preferences.putInt("k_b", knob_b);
        }

        // Redraw screen
        draw_page(current_page);

        Serial.println("THEME_UPDATED");
        update_activity();
      }
    }

    // --- YENİ: TIMER GÜNCELLEME (Format: SET_TIMER:page:buttonIndex:duration) ---
    // Örn: SET_TIMER:0:3:300 (sayfa 0, buton 3, 300 saniye)
    if (command.startsWith("SET_TIMER:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);
      int third = command.indexOf(':', second + 1);

      if (first > 0 && second > 0 && third > 0) {
        int page = command.substring(first + 1, second).toInt();
        int btnIndex = command.substring(second + 1, third).toInt();
        int duration = command.substring(third + 1).toInt();

        // Save to Preferences (persistent storage)
        char prefKey[16];
        snprintf(prefKey, sizeof(prefKey), "t_%d_%d", page, btnIndex);
        preferences.putInt(prefKey, duration);

        // If on current page and valid button index
        if (page == current_page && btnIndex >= 0 && btnIndex < current_timers.size()) {
          // Timer'ı güncelle
          current_timers[btnIndex].duration = duration;
          current_timers[btnIndex].state = TIMER_INACTIVE;
          current_timers[btnIndex].lastSeconds = duration;
          current_timers[btnIndex].startTime = 0;

          // Redraw button
          draw_single_button(btnIndex);

          Serial.printf("TIMER_SET:%d:%d:%d\n", page, btnIndex, duration);
        } else {
          Serial.printf("TIMER_SET_ERROR:invalid_page_or_index\n");
        }
        update_activity();
      }
    }

    // --- NEW: DEV_RESET - Restart ESP32 ---
    if (command.equals("DEV_RESET")) {
      Serial.println("DEV_RESET_OK");
      delay(100);
      ESP.restart();
    }

    // --- NEW: DEV_INFO - Get device info ---
    if (command.equals("DEV_INFO")) {
      Serial.println("=== ESP32 Info ===");
      yield();  // Feed watchdog
      
      Serial.printf("Heap: %d KB free\n", ESP.getFreeHeap() / 1024);
      yield();
      
      Serial.printf("CPU: %d MHz, %s\n", ESP.getCpuFreqMHz(), ESP.getChipModel());
      yield();
      
      unsigned long sec = millis() / 1000;
      Serial.printf("Uptime: %02lu:%02lu:%02lu\n", sec/3600, (sec%3600)/60, sec%60);
      yield();
      
      Serial.printf("SD: %s\n", SD.cardType() != CARD_NONE ? "OK" : "NONE");
      yield();
      
      Serial.printf("Page: %d, Bright: %d%%\n", current_page + 1, current_brightness);
      Serial.println("==================");
      
      update_activity();
    }


    // --- NEW: MOVE_BTN - Move button between pages ---
    // Format: MOVE_BTN:fromPage:fromIdx:toPage:toIdx
    if (command.startsWith("MOVE_BTN:")) {
      // Note: This requires page switching logic
      // For now, just acknowledge - full implementation needs SD card page files
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);
      int third = command.indexOf(':', second + 1);
      int fourth = command.indexOf(':', third + 1);

      if (first > 0 && second > 0 && third > 0 && fourth > 0) {
        int fromPage = command.substring(first + 1, second).toInt();
        int fromIdx = command.substring(second + 1, third).toInt();
        int toPage = command.substring(third + 1, fourth).toInt();
        int toIdx = command.substring(fourth + 1).toInt();

        Serial.printf("BTN_MOVE_REQ:%d:%d:%d:%d\n", fromPage, fromIdx, toPage, toIdx);
        // TODO: Implement full cross-page move when SD card page files are available
        update_activity();
      }
    }

    // --- NEW: CLEAR_BTN - Clear a button ---
    // Format: CLEAR_BTN:page:idx
    if (command.startsWith("CLEAR_BTN:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);

      if (first > 0 && second > 0) {
        int page = command.substring(first + 1, second).toInt();
        int idx = command.substring(second + 1).toInt();

        JsonArray pages_array = doc["pages"];
        if (page >= 0 && page < (int)pages_array.size()) {
          JsonArray buttons = pages_array[page]["buttons"];
          if (idx >= 0 && idx < (int)buttons.size()) {
            
            // Clear the element (makes it null in ArduinoJson)
            buttons[idx].clear();
            
            // Save to SD card
            saveConfigToSD();
            
            // If current page, redraw entire page
            if (page == current_page) {
              draw_page(current_page);
            }
            
            Serial.printf("BTN_CLEARED:%d:%d\n", page, idx);
          }
        }
        update_activity();
      }
    }

    // --- NEW: SET_GOTO - Update goto target ---
    // Format: SET_GOTO:page:idx:targetPage
    if (command.startsWith("SET_GOTO:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);
      int third = command.indexOf(':', second + 1);

      if (first > 0 && second > 0 && third > 0) {
        int page = command.substring(first + 1, second).toInt();
        int idx = command.substring(second + 1, third).toInt();
        int targetPage = command.substring(third + 1).toInt();

        if (page == current_page && idx >= 0 && idx < current_buttons.size()) {
          // Update goto target (stored in value field)
          current_buttons[idx].value = String(targetPage);
          Serial.println("GOTO_UPDATED");
        }
        update_activity();
      }
    }

    // --- NEW: SET_PAGE_NAME - Set page name ---
    // Format: SET_PAGE_NAME:page:name
    if (command.startsWith("SET_PAGE_NAME:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);

      if (first > 0 && second > 0) {
        int page = command.substring(first + 1, second).toInt();
        String name = command.substring(second + 1);

        // Update page name in JSON document
        JsonArray pages_array = doc["pages"];
        if (page >= 0 && page < (int)pages_array.size()) {
          pages_array[page]["name"] = name;
          
          // Save to SD card for persistence
          saveConfigToSD();
          
          // If we're on this page, redraw to show the new name
          if (current_page == page) {
            draw_page(current_page);
          }
          
          Serial.printf("PAGE_NAME_SET:%d:%s\n", page, name.c_str());
        } else {
          Serial.printf("PAGE_NAME_ERROR:%d:Invalid page index\n", page);
        }
        update_activity();
      }
    }

    // --- NEW: SET_DEVICE_NAME - Set device name/title ---
    // Format: SET_DEVICE_NAME:name
    if (command.startsWith("SET_DEVICE_NAME:")) {
      int first = command.indexOf(':');
      if (first > 0) {
        String name = command.substring(first + 1);
        
        // Update device name in JSON document
        doc["title"] = name;
        
        // Save to SD card for persistence
        saveConfigToSD();
        
        // Redraw current page to show new title
        draw_page(current_page);
        
        Serial.printf("DEVICE_NAME_SET:%s\n", name.c_str());
        update_activity();
      }
    }


    // --- NEW: SET_KNOB_ACTION - Set per-page knob actions ---
    // Format: SET_KNOB_ACTION:page:cwAction:ccwAction
// --- NEW: SET_BTN_DATA - JSON Güncelle ve SAYFAYI YENİDEN ÇİZ ---
    // Format: SET_BTN_DATA:page:index:{...json_objesi...}
    if (command.startsWith("SET_BTN_DATA:")) {
      int p1 = command.indexOf(':');
      int p2 = command.indexOf(':', p1 + 1);
      int p3 = command.indexOf(':', p2 + 1);

      if (p1 > 0 && p2 > 0 && p3 > 0) {
        int page = command.substring(p1 + 1, p2).toInt();
        int idx = command.substring(p2 + 1, p3).toInt();
        String jsonPayload = command.substring(p3 + 1); // Geri kalan her şey JSON

        JsonArray pages_array = doc["pages"];
        if (page >= 0 && page < (int)pages_array.size()) {
          JsonArray buttons = pages_array[page]["buttons"];
          
          // Eğer index mevcut boyuttan büyükse, arayı boş objelerle doldur
          while (buttons.size() <= idx) {
            buttons.add(JsonObject());
          }

          // 1. Gelen JSON'u parse et
          DynamicJsonDocument tempDoc(2048);
          DeserializationError error = deserializeJson(tempDoc, jsonPayload);

          if (!error) {
            // 2. Copy to main config (RAM JSON updated)
            buttons[idx] = tempDoc.as<JsonObject>();

            // 3. Save to SD Card (persistent across restarts)
            saveConfigToSD();

            // 4. If current page is affected, redraw completely
            if (page == current_page) {
              draw_page(current_page); 
              Serial.println("BTN_UPDATED_AND_PAGE_REDRAWN");
            }
          } else {
            Serial.println("ERR_BAD_JSON");
          }
        }
      }
    }

    // --- NEW: SET_TIME - Set current time for sleep clock ---
    // Format: SET_TIME:HH:MM or SET_TIME:HH:MM:SS
    if (command.startsWith("SET_TIME:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);
      int third = command.indexOf(':', second + 1);

      if (first > 0 && second > 0) {
        current_hour = command.substring(first + 1, second).toInt();
        if (third > 0) {
          current_minute = command.substring(second + 1, third).toInt();
          current_second = command.substring(third + 1).toInt();
        } else {
          current_minute = command.substring(second + 1).toInt();
          current_second = 0;
        }

        // Validate
        if (current_hour < 0 || current_hour > 23) current_hour = 12;
        if (current_minute < 0 || current_minute > 59) current_minute = 0;
        if (current_second < 0 || current_second > 59) current_second = 0;

        // Initialize clock tracking
        clock_initialized = true;
        last_clock_update_millis = millis();

        Serial.printf("TIME_SET:%02d:%02d:%02d\n", current_hour, current_minute, current_second);

        // If sleeping, update clock display
        if (is_sleeping) {
          gfx->fillScreen(BLACK);
          draw_sleep_clock();
        }

        Serial.println("TIME_UPDATED");
        // Don't call update_activity() - we don't want time sync to wake device
      }
    }

    // --- NEW: SET_PAGE - Switch to specific page ---
    // Format: SET_PAGE:pageIndex
    if (command.startsWith("SET_PAGE:")) {
      int colonPos = command.indexOf(':');
      if (colonPos > 0) {
        int pageIdx = command.substring(colonPos + 1).toInt();
        JsonArray pages_arr = doc["pages"];
        if (pageIdx >= 0 && pageIdx < (int)pages_arr.size()) {
          current_page = pageIdx;
          draw_page(current_page);
          Serial.printf("PAGE_CHANGED:%d\n", current_page);
        }
      }
    }

    // --- NEW: SET_GRID - Update grid dimensions ---
    // Format: SET_GRID:cols:rows
    if (command.startsWith("SET_GRID:")) {
      int first = command.indexOf(':');
      int second = command.indexOf(':', first + 1);

      if (first > 0 && second > 0) {
        int cols = command.substring(first + 1, second).toInt();
        int rows = command.substring(second + 1).toInt();

        // Validate
        if (cols >= 1 && cols <= 6 && rows >= 1 && rows <= 6) {
          // Update the JSON doc with new grid values
          doc["grid"]["cols"] = cols;
          doc["grid"]["rows"] = rows;

          // Save to SD card for persistence
          if (saveConfigToSD()) {
            Serial.println("CONFIG_SAVED");
          }

          // Redraw current page with new grid
          draw_page(current_page);
          Serial.printf("GRID_CHANGED:%d:%d\n", cols, rows);
        }
      }
    }
    
    // --- NEW: SAVE_CONFIG - Force save current config to SD ---
    // Format: SAVE_CONFIG
    if (command == "SAVE_CONFIG") {
      if (saveConfigToSD()) {
        Serial.println("CONFIG_SAVED:OK");
      } else {
        Serial.println("CONFIG_SAVED:FAIL");
      }
      update_activity();
    }

    // --- NEW: DUMP_CONFIG - Send esp_config.json content via Serial ---
    // Format: DUMP_CONFIG
    if (command == "DUMP_CONFIG") {
      File file = SD.open("/esp_config.json", FILE_READ);
      if (file) {
        Serial.println("CONFIG_START");
        while (file.available()) {
          Serial.write(file.read());
        }
        Serial.println();
        Serial.println("CONFIG_END");
        file.close();
      } else {
        Serial.println("CONFIG_ERROR:Cannot open file");
      }
      update_activity();
    }
  }

  // ============================================================
  // 3. TOUCH SCREEN (WITH DEBOUNCE)
  // ============================================================
  if (currentMillis - lastTouchPoll >= TOUCH_INTERVAL) {
    lastTouchPoll = currentMillis;

    tp.read();  // Sensörden veriyi al
    bool raw_touch_state = tp.isTouched;

    // --- DEBOUNCE MANTIĞI ---
    // Eğer sensör fiziksel bir temas görüyorsa süreyi güncelle
    if (raw_touch_state) {
      last_valid_touch_time = currentMillis;
    }

    // If less than 50ms since last valid touch, assume finger still on screen.
    // Bu, kısa süreli sinyal kopmalarını (bouncing) yutar.
    bool is_touched_now = (currentMillis - last_valid_touch_time < 50);

    // Uyku Modundan Çıkış
    if (is_touched_now) {
      if (is_sleeping) {
        update_activity();
        is_touched_now = false;  // Don't count wake-up touch as click
        // Reset debounce to prevent immediate trigger
        last_valid_touch_time = 0;
      } else {
        update_activity();
      }
    }

    check_sleep_mode();

    int touch_x = -1, touch_y = -1;
    int current_touched_button_index = -1;

    // Get coordinates and find which button is touched
    if (tp.points[0].x > 0 && tp.points[0].y > 0) {
      touch_x = tp.points[0].x;
      touch_y = tp.points[0].y;

      for (int i = 0; i < current_buttons.size(); ++i) {
        const auto& btn = current_buttons[i];
        if (btn.defined && touch_x >= btn.x && touch_x < (btn.x + btn.w) && touch_y >= btn.y && touch_y < (btn.y + btn.h)) {
          current_touched_button_index = i;
          break;
        }
      }
    } else if (is_touched_now && last_touched_button_index != -1) {
      // Signal lost but within debounce period, keep previous button pressed.
      current_touched_button_index = last_touched_button_index;
    }

    int radius = CORNER_RADIUS;

    // --- A. BASMA ANI (Press) ---
    if (is_touched_now && current_touched_button_index != -1 && last_touched_button_index != current_touched_button_index) {
      touch_start_time = millis();
      long_press_triggered = false;

      if (current_timers[current_touched_button_index].state != TIMER_FINISHED) {
        // Draw old button (if any) as released
        if (last_touched_button_index != -1) {
          const auto& old_btn = current_buttons[last_touched_button_index];
          gfx->drawRoundRect(old_btn.x, old_btn.y, old_btn.w, old_btn.h, radius, theme_stroke_color_rgb565);
          gfx->drawRoundRect(old_btn.x + 1, old_btn.y + 1, old_btn.w - 2, old_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_stroke_color_rgb565);
        }
        // Draw new button with pressed effect
        const auto& current_btn = current_buttons[current_touched_button_index];
        gfx->drawRoundRect(current_btn.x, current_btn.y, current_btn.w, current_btn.h, radius, theme_click_stroke_color_rgb565);
        gfx->drawRoundRect(current_btn.x + 1, current_btn.y + 1, current_btn.w - 2, current_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_click_stroke_color_rgb565);
      }
      last_touched_button_index = current_touched_button_index;
    }

    // --- B. BASILI TUTMA (Hold / Long Press) ---
    else if (is_touched_now && current_touched_button_index != -1 && current_touched_button_index == last_touched_button_index) {
      unsigned long pressDuration = millis() - touch_start_time;

      // 800ms basılı tutulursa (Long Press)
      if (!long_press_triggered && pressDuration > 800) {
        // Counter Reset İşlemi
        if (current_buttons[current_touched_button_index].action == "counter") {
          CounterInfo& counter = current_counters[current_touched_button_index];
          counter.currentValue = counter.startValue;
          
          // Remove saved value from Preferences (reset to start)
          char prefKey[16];
          snprintf(prefKey, sizeof(prefKey), "c_%d_%d", current_page, current_touched_button_index);
          preferences.remove(prefKey);
          
          draw_single_button(current_touched_button_index);
          Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, current_touched_button_index, counter.currentValue);
          long_press_triggered = true;
        }
        // Timer Reset İşlemi
        else if (current_buttons[current_touched_button_index].action == "timer") {
          TimerInfo& timer = current_timers[current_touched_button_index];
          timer.state = TIMER_INACTIVE;
          timer.lastSeconds = timer.duration;
          draw_single_button(current_touched_button_index);
          Serial.printf("TIMER_UPDATE:%d:%d:2:%d\n", current_page, current_touched_button_index, timer.duration);
          long_press_triggered = true;
        }
      }
    }

    // --- C. BIRAKMA ANI (Release) ---
    // Burası artık parmak gerçekten 50ms boyunca çekildikten sonra çalışır
    else if (!is_touched_now && was_touched) {
      if (last_touched_button_index != -1) {
        const auto& released_btn = current_buttons[last_touched_button_index];

        // Sadece Long Press tetiklenmediyse normal tıklama işlemini yap
        if (!long_press_triggered) {
          if (released_btn.action == "goto") {
            int page_index = released_btn.value.toInt() - 1;
            if (page_index >= 0 && page_index < doc["pages"].size()) {
              current_page = page_index;
              draw_page(current_page);
              // CRITICAL FIX: Notify app about page change so knob settings can be updated
              Serial.printf("PAGE_CHANGED:%d\n", current_page);
              // Reset touch state after page change
              last_touched_button_index = -1;
              was_touched = false;
              return;  // Exit loop iteration
            }
          } else if (released_btn.action == "timer") {
            TimerInfo& timer = current_timers[last_touched_button_index];
            int timerKey = current_page * 100 + last_touched_button_index;
            
            if (timer.state == TIMER_INACTIVE) {
              timer.state = TIMER_RUNNING;
              unsigned long time_already_passed_ms = 0;
              if (timer.lastSeconds > 0 && timer.lastSeconds < timer.duration) {
                time_already_passed_ms = (timer.duration - timer.lastSeconds) * 1000;
              }
              timer.startTime = millis() - time_already_passed_ms;
              
              // Add to global running timers
              running_timers[timerKey] = timer;
              
              int currentDisplaySec = (timer.lastSeconds > 0) ? timer.lastSeconds : timer.duration;
              Serial.printf("TIMER_UPDATE:%d:%d:1:%d\n", current_page, last_touched_button_index, currentDisplaySec);
            } else {
              timer.state = TIMER_INACTIVE;
              unsigned long elapsed_sec = (millis() - timer.startTime) / 1000;
              timer.lastSeconds = timer.duration - elapsed_sec;
              if (timer.lastSeconds < 0) timer.lastSeconds = 0;
              
              // Remove from global running timers
              running_timers.erase(timerKey);
              
              draw_single_button(last_touched_button_index);
              Serial.printf("TIMER_UPDATE:%d:%d:0:%d\n", current_page, last_touched_button_index, timer.lastSeconds);
            }
          } else if (released_btn.action == "key" || released_btn.action == "text" || released_btn.action == "app" || released_btn.action == "script" || released_btn.action == "website" || released_btn.action == "media" || released_btn.action == "mouse" || released_btn.action == "sound" || released_btn.action == "multi") {
            send_pc_command(current_page, last_touched_button_index);
          } else if (released_btn.action == "toggle") {
            current_toggles[last_touched_button_index].state = !current_toggles[last_touched_button_index].state;
            draw_single_button(last_touched_button_index);
            send_pc_command(current_page, last_touched_button_index);
          } else if (released_btn.action == "counter") {
            CounterInfo& counter = current_counters[last_touched_button_index];
            if (counter.action == "increment") counter.currentValue++;
            else counter.currentValue--;
            
            // Save counter value to Preferences
            char prefKey[16];
            snprintf(prefKey, sizeof(prefKey), "c_%d_%d", current_page, last_touched_button_index);
            preferences.putLong(prefKey, counter.currentValue);
            
            draw_single_button(last_touched_button_index);
            Serial.printf("COUNTER_UPDATE:%d:%d:%ld\n", current_page, last_touched_button_index, counter.currentValue);
          }
        }

        // Clear button press effect (restore normal border)
        // Skip if page transition (goto) occurred
        if (released_btn.action != "goto" && released_btn.action != "toggle" && current_timers[last_touched_button_index].state == TIMER_INACTIVE) {
          gfx->drawRoundRect(released_btn.x, released_btn.y, released_btn.w, released_btn.h, radius, theme_stroke_color_rgb565);
          gfx->drawRoundRect(released_btn.x + 1, released_btn.y + 1, released_btn.w - 2, released_btn.h - 2, radius > 0 ? radius - 1 : 0, theme_stroke_color_rgb565);
        }

        last_touched_button_index = -1;
      }
    }

    was_touched = is_touched_now;
  }

  // ============================================================
  // 4. CHECK ALL RUNNING TIMERS (All Pages - for TIMER_DONE)
  // ============================================================
  checkAllRunningTimers();
  
  // ============================================================
  // 5. AKTİF TIMER KONTROLÜ (Current Page Visual Updates)
  // ============================================================
  checkActiveTimers();

  // ============================================================
  // 5. RUNNING TIMERS SYNC TO PC (Every second)
  // ============================================================
  if (currentMillis - lastTimerSync >= 1000) {
    lastTimerSync = currentMillis;
    
    // Sync all running timers to PC (including other pages)
    for (auto& kv : running_timers) {
      int timerKey = kv.first;
      TimerInfo& timer = kv.second;
      int page = timerKey / 100;
      int idx = timerKey % 100;
      
      if (timer.state == TIMER_RUNNING) {
        unsigned long elapsed_ms = currentMillis - timer.startTime;
        long remaining = timer.duration - (elapsed_ms / 1000);
        if (remaining > 0) {
          Serial.printf("TIMER_UPDATE:%d:%d:1:%ld\n", page, idx, remaining);
        }
      }
    }
  }
}