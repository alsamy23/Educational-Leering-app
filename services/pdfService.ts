import { jsPDF } from 'jspdf';
import { UserProfile, TestRecord } from '../types';

/**
 * Parses markdown-like text and renders it beautifully into a jsPDF instance.
 * Supports auto-wrapping, pagination, lists, headings, and color styling.
 */
const renderMarkdownToPDF = (doc: jsPDF, text: string, startY: number): number => {
  const lines = text.split('\n');
  const marginX = 20;
  const contentWidth = 170; // 210 - 20 * 2
  let y = startY;
  const pageHeight = 297;
  const bottomMargin = 25;
  const limitY = pageHeight - bottomMargin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > limitY) {
      doc.addPage();
      y = 30; // reset Y coordinate on new page (leaving room for header)
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      // Paragraph spacing
      y += 4;
      continue;
    }

    // Check for Headings
    if (line.startsWith('# ')) {
      const headingText = line.replace('# ', '').replace(/\*/g, '').trim();
      checkPageBreak(15);
      
      // Draw left decorative thick accent line
      doc.setFillColor(180, 83, 9); // Warm amber
      doc.rect(marginX, y, 4, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138); // Deep Navy
      doc.text(headingText, marginX + 6, y + 6);
      y += 14;
    } else if (line.startsWith('## ')) {
      const headingText = line.replace('## ', '').replace(/\*/g, '').trim();
      checkPageBreak(12);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 58, 138); // Deep Navy
      doc.text(headingText, marginX, y + 5);
      
      // Horizontal subtle line
      doc.setDrawColor(229, 231, 235); // Gray-200
      doc.setLineWidth(0.3);
      doc.line(marginX, y + 7, marginX + contentWidth, y + 7);
      
      y += 11;
    } else if (line.startsWith('### ')) {
      const headingText = line.replace('### ', '').replace(/\*/g, '').trim();
      checkPageBreak(10);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(180, 83, 9); // Amber
      doc.text(headingText, marginX, y + 4);
      y += 8;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Bullet points
      const bulletText = line.substring(2).replace(/\*\*/g, '').trim();
      const wrappedLines: string[] = doc.splitTextToSize(bulletText, contentWidth - 8);
      
      checkPageBreak(wrappedLines.length * 5 + 2);
      
      // Render bullet icon (small square/circle)
      doc.setFillColor(30, 58, 138); // Deep Navy bullet
      doc.circle(marginX + 2, y + 2, 0.8, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59); // Slate-800
      
      wrappedLines.forEach((wLine, idx) => {
        doc.text(wLine, marginX + 6, y + 2.5 + (idx * 5));
      });
      y += (wrappedLines.length * 5) + 1;
    } else {
      // Regular Paragraph text (Clean bold markdown tags if any)
      const cleanText = line.replace(/\*\*/g, '');
      const wrappedLines: string[] = doc.splitTextToSize(cleanText, contentWidth);
      
      checkPageBreak(wrappedLines.length * 5 + 2);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59); // Slate-800
      
      wrappedLines.forEach((wLine, idx) => {
        doc.text(wLine, marginX, y + 2.5 + (idx * 5));
      });
      y += (wrappedLines.length * 5) + 1;
    }
  }

  return y;
};

/**
 * Compiles personalized student profile data and Gemini generated recommendations,
 * constructs a high-craft PDF file, and triggers a download in the browser.
 */
export const generateAndDownloadRoadmapPDF = (user: UserProfile, roadmapText: string) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // --- Page 1: Elegant Dashboard Style Header & Profile Block ---
  // Large background accent panel for user profile summary
  doc.setFillColor(248, 250, 252); // Soft gray/slate-50
  doc.rect(15, 18, 180, 52, 'F');
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.rect(15, 18, 180, 52, 'D');

  // Cover/Header band inside the card
  doc.setFillColor(30, 58, 138); // Deep Navy #1e3a8a
  doc.rect(15, 18, 180, 15, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('SCHOLAREARN ACADEMIC ROADMAP', 22, 27);

  // Profile Details Layout
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  
  // Left Column
  doc.setFont('helvetica', 'bold');
  doc.text('STUDENT NAME:', 22, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(user.name || 'Scholar Student', 55, 43);

  doc.setFont('helvetica', 'bold');
  doc.text('GRADE / BOARD:', 22, 49);
  doc.setFont('helvetica', 'normal');
  doc.text(`${user.gradeLevel || 'Not Configured'} (${user.board || 'Default Board'})`, 55, 49);

  doc.setFont('helvetica', 'bold');
  doc.text('STUDY FOCUS:', 22, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(user.focus || 'General Studies', 55, 55);

  doc.setFont('helvetica', 'bold');
  doc.text('CURRENT TOPIC:', 22, 61);
  doc.setFont('helvetica', 'normal');
  doc.text(user.topic || 'General Topic', 55, 61);

  // Right Column
  doc.setFont('helvetica', 'bold');
  doc.text('MASTERY LEVEL:', 115, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(`Level ${user.level || 1} (${user.totalPoints || 0} Points)`, 152, 43);

  doc.setFont('helvetica', 'bold');
  doc.text('QUIZZES COMPLETED:', 115, 49);
  doc.setFont('helvetica', 'normal');
  doc.text(`${user.totalQuizzes || 0} Quizzes`, 152, 49);

  doc.setFont('helvetica', 'bold');
  doc.text('DIFFICULTY RATE:', 115, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(user.difficulty || 'Beginner', 152, 55);

  doc.setFont('helvetica', 'bold');
  doc.text('TARGET SUBJECT:', 115, 61);
  doc.setFont('helvetica', 'normal');
  doc.text(user.subject || 'All Subjects', 152, 61);

  // --- Dynamic Body Content Rendering ---
  const bodyStartY = 80;
  renderMarkdownToPDF(doc, roadmapText, bodyStartY);

  // --- Dynamic Footers & Headers Overlay on all pages ---
  const totalPages = doc.getNumberOfPages();
  const todayStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Header Bar
    doc.setFillColor(30, 58, 138); // deep blue
    doc.rect(0, 0, 210, 4, 'F');
    
    // Header texts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('SCHOLAREARN ACADEMIC ROADMAP & NEXT-STEPS STREP', 20, 10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${todayStr}`, 190, 10, { align: 'right' });
    
    // Header bottom line
    doc.setDrawColor(241, 245, 249); // slate-100
    doc.setLineWidth(0.3);
    doc.line(20, 12, 190, 12);

    // Footer divider line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(20, 282, 190, 282);

    // Footer texts
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('This AI-generated academic guidance recommends study patterns based on active test diagnostics.', 20, 287);
    doc.text(`Page ${i} of ${totalPages}`, 190, 287, { align: 'right' });
  }

  // Save the PDF
  const userNameClean = (user.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`ScholarEarn_Roadmap_${userNameClean}.pdf`);
};
