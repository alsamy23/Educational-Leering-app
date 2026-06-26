import { UserProfile } from '../types';

/**
 * Draw specific vector badge icons directly on HTML5 Canvas context.
 * This guarantees pristine quality without external SVG files or network assets.
 */
const drawBadgeIcon = (ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number) => {
  ctx.save();
  ctx.translate(x, y);
  
  // Outer glowing gold styling for all icons
  ctx.strokeStyle = '#fef08a'; // light gold
  ctx.fillStyle = '#f59e0b'; // amber-500
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const scale = size / 100; // design on 100x100 grid

  switch (id) {
    case 'first-quiz': {
      // Sleek Play Button Triangle
      ctx.beginPath();
      ctx.moveTo(35 * scale, 25 * scale);
      ctx.lineTo(75 * scale, 50 * scale);
      ctx.lineTo(35 * scale, 75 * scale);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();
      break;
    }
    case '10-quizzes': {
      // Open Book Icon
      ctx.beginPath();
      // Left Page
      ctx.moveTo(50 * scale, 25 * scale);
      ctx.bezierCurveTo(40 * scale, 20 * scale, 25 * scale, 20 * scale, 15 * scale, 25 * scale);
      ctx.lineTo(15 * scale, 75 * scale);
      ctx.bezierCurveTo(25 * scale, 70 * scale, 40 * scale, 70 * scale, 50 * scale, 75 * scale);
      // Right Page
      ctx.bezierCurveTo(60 * scale, 70 * scale, 75 * scale, 70 * scale, 85 * scale, 75 * scale);
      ctx.lineTo(85 * scale, 25 * scale);
      ctx.bezierCurveTo(75 * scale, 20 * scale, 60 * scale, 20 * scale, 50 * scale, 25 * scale);
      ctx.closePath();
      
      // Middle line
      ctx.moveTo(50 * scale, 25 * scale);
      ctx.lineTo(50 * scale, 75 * scale);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();
      break;
    }
    case '100-points': {
      // Four-point shining star with smaller companion stars
      const drawStar = (cx: number, cy: number, outer: number, inner: number) => {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
          const nextAngle = angle + Math.PI / 4;
          ctx.lineTo(cx + Math.cos(nextAngle) * inner, cy + Math.sin(nextAngle) * inner);
        }
        ctx.closePath();
        ctx.fillStyle = '#fbbf24'; // yellow-400
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      };
      
      // Center star
      drawStar(50 * scale, 50 * scale, 40 * scale, 12 * scale);
      // Secondary spark top-right
      drawStar(78 * scale, 25 * scale, 15 * scale, 5 * scale);
      // Secondary spark bottom-left
      drawStar(22 * scale, 72 * scale, 12 * scale, 4 * scale);
      break;
    }
    case 'level-5': {
      // Graduation Cap / Mortarboard
      ctx.beginPath();
      // Cap Diamond
      ctx.moveTo(50 * scale, 20 * scale); // Top
      ctx.lineTo(88 * scale, 38 * scale); // Right
      ctx.lineTo(50 * scale, 56 * scale); // Bottom
      ctx.lineTo(12 * scale, 38 * scale); // Left
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.stroke();

      // Cap Base/Skull
      ctx.beginPath();
      ctx.moveTo(28 * scale, 48 * scale);
      ctx.lineTo(28 * scale, 65 * scale);
      ctx.quadraticCurveTo(50 * scale, 78 * scale, 72 * scale, 65 * scale);
      ctx.lineTo(72 * scale, 48 * scale);
      ctx.closePath();
      ctx.fillStyle = '#d97706'; // Dark amber
      ctx.fill();
      ctx.stroke();

      // Tassel
      ctx.beginPath();
      ctx.moveTo(50 * scale, 38 * scale);
      ctx.quadraticCurveTo(24 * scale, 42 * scale, 24 * scale, 58 * scale);
      ctx.lineTo(22 * scale, 68 * scale);
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();
      break;
    }
    case 'level-10': {
      // Golden Trophy Cup
      ctx.beginPath();
      // Top Cup
      ctx.moveTo(25 * scale, 20 * scale);
      ctx.lineTo(75 * scale, 20 * scale);
      ctx.quadraticCurveTo(75 * scale, 55 * scale, 50 * scale, 60 * scale);
      ctx.quadraticCurveTo(25 * scale, 55 * scale, 25 * scale, 20 * scale);
      ctx.closePath();
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Handles Left
      ctx.beginPath();
      ctx.moveTo(25 * scale, 26 * scale);
      ctx.bezierCurveTo(10 * scale, 26 * scale, 10 * scale, 46 * scale, 25 * scale, 46 * scale);
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();

      // Handles Right
      ctx.beginPath();
      ctx.moveTo(75 * scale, 26 * scale);
      ctx.bezierCurveTo(90 * scale, 26 * scale, 90 * scale, 46 * scale, 75 * scale, 46 * scale);
      ctx.strokeStyle = '#fbbf24';
      ctx.stroke();

      // Stem & Base
      ctx.beginPath();
      ctx.moveTo(50 * scale, 60 * scale);
      ctx.lineTo(50 * scale, 72 * scale);
      ctx.moveTo(35 * scale, 76 * scale);
      ctx.lineTo(65 * scale, 76 * scale);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = size * 0.1;
      ctx.stroke();
      break;
    }
    default: {
      // Universal Ribbon/Star
      ctx.beginPath();
      ctx.arc(50 * scale, 50 * scale, 30 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
};

/**
 * Dynamically draws the high-fidelity Share Card on an offscreen canvas
 * and triggers an immediate download.
 */
export const shareBadgeImage = (user: UserProfile, badge: { id: string; name: string; desc: string }) => {
  const canvas = document.createElement('canvas');
  const size = 1000; // High-resolution 1000x1000px
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // --- 1. Background Radial Gradient ---
  const radialGrad = ctx.createRadialGradient(size / 2, size / 2, 100, size / 2, size / 2, size * 0.7);
  radialGrad.addColorStop(0, '#1e293b'); // Center Slate-800
  radialGrad.addColorStop(0.5, '#0f172a'); // Mid Slate-900
  radialGrad.addColorStop(1, '#020617'); // Edges Slate-950
  ctx.fillStyle = radialGrad;
  ctx.fillRect(0, 0, size, size);

  // --- 2. Micro Background Grid / Starry Accents ---
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 50;
  for (let x = 0; x < size; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y < size; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // --- 3. Double-Border Gold Frame with Corner Corner Rosettes ---
  ctx.strokeStyle = '#d97706'; // Gold/Amber-600
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, size - 80, size - 80);

  ctx.strokeStyle = '#fbbf24'; // Light gold
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, size - 96, size - 96);

  // Corner Corner Ornaments
  const drawCorner = (cx: number, cy: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Inner angle bracket
    ctx.moveTo(15, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, 15);
    // Outer dynamic loop
    ctx.moveTo(25, 0);
    ctx.lineTo(25, 25);
    ctx.lineTo(0, 25);
    ctx.stroke();
    ctx.restore();
  };
  drawCorner(55, 55, 0);
  drawCorner(size - 55, 55, Math.PI / 2);
  drawCorner(size - 55, size - 55, Math.PI);
  drawCorner(55, size - 55, -Math.PI / 2);

  // --- 4. Glowing Sunburst Aura behind Badge ---
  const glowGrad = ctx.createRadialGradient(size / 2, size * 0.38, 10, size / 2, size * 0.38, 220);
  glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
  glowGrad.addColorStop(0.4, 'rgba(217, 119, 6, 0.1)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.38, 220, 0, Math.PI * 2);
  ctx.fill();

  // --- 5. Beautiful Thick Circular Badge Ring ---
  const badgeY = size * 0.38;
  const badgeRadius = 140;

  // Outer solid gold ring
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(size / 2, badgeY, badgeRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner bright gold ring with dashes
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.arc(size / 2, badgeY, badgeRadius - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); // Reset line dash

  // Core solid circular plate
  const plateGrad = ctx.createLinearGradient(size / 2 - 100, badgeY - 100, size / 2 + 100, badgeY + 100);
  plateGrad.addColorStop(0, '#7c2d12'); // Deep rust
  plateGrad.addColorStop(0.5, '#451a03'); // Dark brown
  plateGrad.addColorStop(1, '#1c1917'); // Stone-900
  ctx.fillStyle = plateGrad;
  ctx.beginPath();
  ctx.arc(size / 2, badgeY, badgeRadius - 14, 0, Math.PI * 2);
  ctx.fill();

  // Draw the Badge Vector Icon
  const iconSize = 130;
  drawBadgeIcon(ctx, badge.id, size / 2 - iconSize / 2, badgeY - iconSize / 2, iconSize);

  // --- 6. ScholarEarn Badge Header Branding ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Branding top line
  ctx.font = '800 18px "Space Grotesk", "Inter", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.letterSpacing = '6px';
  ctx.fillText('★ SCHOLAREARN ACADEMIC MILESTONE ★', size / 2, size * 0.12);

  // --- 7. Recipient Header Section ---
  ctx.letterSpacing = 'normal';
  ctx.font = 'italic 500 24px "Inter", sans-serif';
  ctx.fillStyle = '#94a3b8'; // Slate-400
  ctx.fillText('This official verified badge is proudly presented to', size / 2, size * 0.63);

  // Recipient Name
  ctx.font = '800 52px "Space Grotesk", "Inter", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.fillText(user.name || 'Scholar Student', size / 2, size * 0.70);
  ctx.shadowBlur = 0; // reset shadow

  // Badge Name Label
  ctx.font = '600 20px "Inter", sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.letterSpacing = '2px';
  ctx.fillText('FOR SECURING THE ACHIEVEMENT', size / 2, size * 0.77);

  // Giant Unlocked Badge Name
  ctx.letterSpacing = 'normal';
  ctx.font = '800 48px "Space Grotesk", "Inter", sans-serif';
  // gold shiny text gradient
  const textGrad = ctx.createLinearGradient(size / 2 - 200, 0, size / 2 + 200, 0);
  textGrad.addColorStop(0, '#fef08a');
  textGrad.addColorStop(0.5, '#fbbf24');
  textGrad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = textGrad;
  ctx.fillText(`"${badge.name.toUpperCase()}"`, size / 2, size * 0.83);

  // Description Text (Auto-wrapped)
  ctx.font = '500 18px "Inter", sans-serif';
  ctx.fillStyle = '#cbd5e1'; // slate-300
  const descText = badge.desc;
  const maxDescWidth = 600;
  
  // Custom wrapping helper
  const words = descText.split(' ');
  let currentLine = '';
  const lines: string[] = [];
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxDescWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);

  lines.forEach((line, idx) => {
    ctx.fillText(line, size / 2, size * 0.88 + idx * 24);
  });

  // --- 8. Professional Bottom Metadata & Authentication Seal ---
  // Student Rank Label (Left alignment)
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px "JetBrains Mono", monospace';
  ctx.fillStyle = '#475569';
  ctx.fillText(`VERIFICATION: SE-${badge.id.toUpperCase()}-${user.level || 1}`, 90, size - 85);
  ctx.fillStyle = '#64748b';
  ctx.fillText(`RANK: LEVEL ${user.level || 1} STUDY LEAGUE`, 90, size - 65);

  // Authentic Rosette / Seal graphic (Bottom Right)
  const sealX = size - 130;
  const sealY = size - 100;
  ctx.save();
  ctx.translate(sealX, sealY);
  // Rosette points
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    ctx.lineTo(Math.cos(angle) * 35, Math.sin(angle) * 35);
    const nextAngle = angle + Math.PI / 16;
    ctx.lineTo(Math.cos(nextAngle) * 30, Math.sin(nextAngle) * 30);
  }
  ctx.closePath();
  ctx.fill();

  // Seal gold core
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();

  // Seal inner star
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
    const nextAngle = angle + Math.PI / 5;
    ctx.lineTo(Math.cos(nextAngle) * 6, Math.sin(nextAngle) * 6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Trigger immediate user download
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const badgeNameClean = badge.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `ScholarEarn_${badgeNameClean}_Achievement.png`;
  link.href = dataUrl;
  link.click();
};
