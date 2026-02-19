var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/offscreen.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "captureScreenshot") {
    captureScreenshot(msg.streamId);
  }
});
async function captureScreenshot(streamId) {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId
        }
      }
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    chrome.storage.local.set({ lastScreenshot: dataUrl });
    stream.getTracks().forEach((track) => track.stop());
    chrome.runtime.sendMessage({ action: "screenshotCaptured" });
  } catch (error) {
    console.error("Capture failed:", error);
  }
}
__name(captureScreenshot, "captureScreenshot");
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vc3JjL29mZnNjcmVlbi5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChtc2cpID0+IHtcbiAgaWYgKG1zZy5hY3Rpb24gPT09ICdjYXB0dXJlU2NyZWVuc2hvdCcpIHtcbiAgICBjYXB0dXJlU2NyZWVuc2hvdChtc2cuc3RyZWFtSWQpO1xuICB9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gY2FwdHVyZVNjcmVlbnNob3Qoc3RyZWFtSWQpIHtcbiAgY29uc3QgdmlkZW8gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndmlkZW8nKTtcbiAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NhbnZhcycpO1xuICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc3Qgc3RyZWFtID0gYXdhaXQgbmF2aWdhdG9yLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoe1xuICAgICAgdmlkZW86IHtcbiAgICAgICAgbWFuZGF0b3J5OiB7XG4gICAgICAgICAgY2hyb21lTWVkaWFTb3VyY2U6ICdkZXNrdG9wJyxcbiAgICAgICAgICBjaHJvbWVNZWRpYVNvdXJjZUlkOiBzdHJlYW1JZFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgdmlkZW8uc3JjT2JqZWN0ID0gc3RyZWFtO1xuICAgIGF3YWl0IHZpZGVvLnBsYXkoKTtcbiAgICBcbiAgICBjYW52YXMud2lkdGggPSB2aWRlby52aWRlb1dpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSB2aWRlby52aWRlb0hlaWdodDtcbiAgICBjdHguZHJhd0ltYWdlKHZpZGVvLCAwLCAwKTtcbiAgICBcbiAgICBjb25zdCBkYXRhVXJsID0gY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJyk7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHtsYXN0U2NyZWVuc2hvdDogZGF0YVVybH0pO1xuICAgIFxuICAgIHN0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnN0b3AoKSk7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe2FjdGlvbjogXCJzY3JlZW5zaG90Q2FwdHVyZWRcIn0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NhcHR1cmUgZmFpbGVkOicsIGVycm9yKTtcbiAgfVxufSJdLAogICJtYXBwaW5ncyI6ICI7Ozs7QUFBQSxPQUFPLFFBQVEsVUFBVSxZQUFZLENBQUMsUUFBUTtBQUM1QyxNQUFJLElBQUksV0FBVyxxQkFBcUI7QUFDdEMsc0JBQWtCLElBQUksUUFBUTtBQUFBLEVBQ2hDO0FBQ0YsQ0FBQztBQUVELGVBQWUsa0JBQWtCLFVBQVU7QUFDekMsUUFBTSxRQUFRLFNBQVMsZUFBZSxPQUFPO0FBQzdDLFFBQU0sU0FBUyxTQUFTLGVBQWUsUUFBUTtBQUMvQyxRQUFNLE1BQU0sT0FBTyxXQUFXLElBQUk7QUFFbEMsTUFBSTtBQUNGLFVBQU0sU0FBUyxNQUFNLFVBQVUsYUFBYSxhQUFhO0FBQUEsTUFDdkQsT0FBTztBQUFBLFFBQ0wsV0FBVztBQUFBLFVBQ1QsbUJBQW1CO0FBQUEsVUFDbkIscUJBQXFCO0FBQUEsUUFDdkI7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sTUFBTSxLQUFLO0FBRWpCLFdBQU8sUUFBUSxNQUFNO0FBQ3JCLFdBQU8sU0FBUyxNQUFNO0FBQ3RCLFFBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQztBQUV6QixVQUFNLFVBQVUsT0FBTyxVQUFVLFdBQVc7QUFDNUMsV0FBTyxRQUFRLE1BQU0sSUFBSSxFQUFDLGdCQUFnQixRQUFPLENBQUM7QUFFbEQsV0FBTyxVQUFVLEVBQUUsUUFBUSxXQUFTLE1BQU0sS0FBSyxDQUFDO0FBQ2hELFdBQU8sUUFBUSxZQUFZLEVBQUMsUUFBUSxxQkFBb0IsQ0FBQztBQUFBLEVBQzNELFNBQVMsT0FBTztBQUNkLFlBQVEsTUFBTSxtQkFBbUIsS0FBSztBQUFBLEVBQ3hDO0FBQ0Y7QUE5QmU7IiwKICAibmFtZXMiOiBbXQp9Cg==
