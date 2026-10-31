#include "NAMFileDialog.h"

#import <Cocoa/Cocoa.h>

static void OpenFilePanel(NSArray<NSString*>* types, NSString* title,
                          std::function<void(const std::string&)> callback)
{
  NSOpenPanel* panel = [NSOpenPanel openPanel];
  [panel setAllowedFileTypes:types];
  [panel setAllowsMultipleSelection:NO];
  [panel setCanChooseFiles:YES];
  [panel setCanChooseDirectories:NO];
  [panel setTitle:title];

  [panel beginWithCompletionHandler:^(NSModalResponse result) {
    if (result == NSModalResponseOK)
    {
      NSURL* url = [[panel URLs] firstObject];
      if (url)
        callback(std::string([[url path] UTF8String]));
    }
  }];
}

void NAM_OpenModelFileDialog(std::function<void(const std::string&)> callback)
{
  OpenFilePanel(@[@"nam"], @"Load NAM Model", callback);
}

void NAM_OpenIRFileDialog(std::function<void(const std::string&)> callback)
{
  OpenFilePanel(@[@"wav"], @"Load Impulse Response", callback);
}
