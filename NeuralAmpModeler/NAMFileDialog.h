#pragma once

#include <functional>
#include <string>

// Native macOS file-picker helpers. Compiled only when WEBVIEW_EDITOR_DELEGATE
// is defined (NAMFileDialog.mm). Both calls are safe to invoke on the main thread.

void NAM_OpenModelFileDialog(std::function<void(const std::string&)> callback);
void NAM_OpenIRFileDialog(std::function<void(const std::string&)> callback);
