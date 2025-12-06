/*******************************************************************************
 * Arduino_GFX_dev_device.h - Display Configuration
 * 
 * Display selection is done in config.h
 * Supported displays:
 *   - ESP32_3248S035    : 3.5" 480x320 (ST7796 SPI)
 *   - ESP32_JC8048W550  : Guition JC8048W550 - 5" 800x480 (RGB)
 *   - ESP32_8048S070    : 7.0" 800x480 (RGB)
 ******************************************************************************/

#include "config.h"

//=============================================================================
// 3.5" Display - ESP32_3248S035 (480x320, ST7796 SPI)
//=============================================================================
#if defined(ESP32_3248S035)
#define GFX_DEV_DEVICE ESP32_3248S035
#define GFX_BL 27
Arduino_DataBus *bus = new Arduino_ESP32SPI(
    2 /* DC */, 15 /* CS */, 14 /* SCK */, 13 /* MOSI */, 12 /* MISO */, VSPI /* spi_num */);
Arduino_GFX *gfx = new Arduino_ST7796(bus, GFX_NOT_DEFINED /* RST */, SCREEN_ROTATION);

//=============================================================================
// 5" Display - ESP32_JC8048W550 / Guition JC8048W550 (800x480, RGB)
//=============================================================================
#elif defined(ESP32_JC8048W550)
#define GFX_DEV_DEVICE ESP32_JC8048W550
#define GFX_BL 2
#define RGB_PANEL
Arduino_ESP32RGBPanel *rgbpanel = new Arduino_ESP32RGBPanel(
    40 /* DE */, 41 /* VSYNC */, 39 /* HSYNC */, 42 /* PCLK */,
    45 /* R0 */, 48 /* R1 */, 47 /* R2 */, 21 /* R3 */, 14 /* R4 */,
    5 /* G0 */, 6 /* G1 */, 7 /* G2 */, 15 /* G3 */, 16 /* G4 */, 4 /* G5 */,
    8 /* B0 */, 3 /* B1 */, 46 /* B2 */, 9 /* B3 */, 1 /* B4 */,
    0 /* hsync_polarity */, 10 /* hsync_front_porch */, 4 /* hsync_pulse_width */, 40 /* hsync_back_porch */,
    0 /* vsync_polarity */, 8 /* vsync_front_porch */, 8 /* vsync_pulse_width */, 8 /* vsync_back_porch */,
    1 /* pclk_active_neg */, 16000000 /* prefer_speed */);
Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
    SCREEN_WIDTH, SCREEN_HEIGHT, rgbpanel, SCREEN_ROTATION, true /* auto_flush */);

//=============================================================================
// 7" Display - ESP32_8048S070 (800x480, RGB)
//=============================================================================
#elif defined(ESP32_8048S070)
#define GFX_DEV_DEVICE ESP32_8048S070
#define GFX_BL 2
#define RGB_PANEL
Arduino_ESP32RGBPanel *rgbpanel = new Arduino_ESP32RGBPanel(
    41 /* DE */, 40 /* VSYNC */, 39 /* HSYNC */, 42 /* PCLK */,
    14 /* R0 */, 21 /* R1 */, 47 /* R2 */, 48 /* R3 */, 45 /* R4 */,
    9 /* G0 */, 46 /* G1 */, 3 /* G2 */, 8 /* G3 */, 16 /* G4 */, 1 /* G5 */,
    15 /* B0 */, 7 /* B1 */, 6 /* B2 */, 5 /* B3 */, 4 /* B4 */,
    0 /* hsync_polarity */, 210 /* hsync_front_porch */, 30 /* hsync_pulse_width */, 16 /* hsync_back_porch */,
    0 /* vsync_polarity */, 22 /* vsync_front_porch */, 13 /* vsync_pulse_width */, 10 /* vsync_back_porch */,
    1 /* pclk_active_neg */, 16000000 /* prefer_speed */);
Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
    SCREEN_WIDTH, SCREEN_HEIGHT, rgbpanel, SCREEN_ROTATION, true /* auto_flush */);

#else
#error "No display defined in config.h! Uncomment one: ESP32_3248S035, ESP32_JC8048W550, or ESP32_8048S070"
#endif