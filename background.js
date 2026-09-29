"use strict";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_DESIGNER") {
    chrome.tabs.create({ url: chrome.runtime.getURL("designer.html") });
  }
});
