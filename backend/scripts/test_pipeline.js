import WebSocket from 'ws';

// Create a small 64x64 valid base64 JPEG
// 1x1 black JPEG
const testJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const ws = new WebSocket('ws://localhost:5000/ws');

ws.on('open', () => {
  console.log('Connected to SafeHome AI WebSocket');
  
  // Register as phone
  ws.send(JSON.stringify({
    type: 'register_phone',
    device_id: 'test_pipeline_phone',
    device_name: 'Test Android Node'
  }));

  setTimeout(() => {
    console.log('Sending test frame to AI pipeline...');
    ws.send(JSON.stringify({
      type: 'frame',
      image: testJpeg,
      timestamp: new Date().toISOString()
    }));
  }, 500);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received WebSocket reply:', msg.type);
  if (msg.type === 'detection_result') {
    console.log('Detection results received from AI engine:');
    console.log('  Detections:', msg.detections);
    console.log('  Processing Time:', msg.processing_time_ms, 'ms');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
  process.exit(1);
});

setTimeout(() => {
  console.log('Pipeline test completed.');
  process.exit(0);
}, 4000);
