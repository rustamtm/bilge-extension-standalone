chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'captureScreenshot') {
    captureScreenshot(msg.streamId);
  }
});

async function captureScreenshot(streamId) {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    });
    
    video.srcObject = stream;
    await video.play();
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const dataUrl = canvas.toDataURL('image/png');
    chrome.storage.local.set({lastScreenshot: dataUrl});
    
    stream.getTracks().forEach(track => track.stop());
    chrome.runtime.sendMessage({action: "screenshotCaptured"});
  } catch (error) {
    console.error('Capture failed:', error);
  }
}