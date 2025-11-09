const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  
  // Gradient circle (vinyl)
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.35;
  
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#ff00ff');
  gradient.addColorStop(1, '#00ffff');
  
  // Outer circle
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner black circle
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
  ctx.fill();
  
  // Center circle
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Center dot
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.15, 0, Math.PI * 2);
  ctx.fill();
  
  // Grooves
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0.7; i <= 0.95; i += 0.08) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`public/${filename}`, buffer);
  console.log(`✅ Created ${filename} (${size}x${size})`);
}

try {
  createIcon(192, 'icon-192.png');
  createIcon(512, 'icon-512.png');
  console.log('\n🎉 Icons generated successfully!');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('\n⚠️  canvas module not found.');
    console.log('📦 Installing canvas...\n');
    require('child_process').execSync('npm install canvas', { stdio: 'inherit' });
    console.log('\n🔄 Retrying icon generation...\n');
    createIcon(192, 'icon-192.png');
    createIcon(512, 'icon-512.png');
    console.log('\n🎉 Icons generated successfully!');
  } else {
    throw error;
  }
}
