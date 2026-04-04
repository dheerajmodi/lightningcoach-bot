// ⚡ LIGHTNINGCOACH — Automated WhatsApp Assessment Bot
// Handles: Intake → Self-Assessment → Peer Collection → Peer Survey → AI Analysis → PDF Report → 30-Day Coaching
// Stack: Node.js + Express + Twilio WhatsApp + Claude API + PDFKit

const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── CONFIG (set these as environment variables) ───
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER, // format: whatsapp:+14155238886
  ANTHROPIC_API_KEY,
  BASE_URL, // your server URL for PDF hosting
  PORT = 3000,
} = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── IN-MEMORY STORE (replace with database in production) ───
const sessions = {}; // keyed by phone number
const peerSessions = {}; // keyed by peer phone number

// ─── ASSESSMENT QUESTIONS ───
const SELF_QUESTIONS = [
  { q: "I feel confident making decisions even without all the information.", dim: "Decision Making" },
  { q: "I regularly ask my team for feedback on my leadership style.", dim: "Self-Awareness" },
  { q: "I find it easy to have difficult conversations with team members.", dim: "Communication" },
  { q: "I delegate tasks effectively rather than doing everything myself.", dim: "Delegation" },
  { q: "I can clearly articulate our team's goals and priorities.", dim: "Strategic Clarity" },
  { q: "I handle disagreements with peers or my manager constructively.", dim: "Conflict Mgmt" },
  { q: "I make time for 1:1s and give meaningful, specific feedback.", dim: "People Dev" },
  { q: "I manage stress well and don't let it negatively affect my team.", dim: "Resilience" },
  { q: "I adapt my communication style for different stakeholders.", dim: "Influence" },
  { q: "I take ownership of failures rather than blaming circumstances.", dim: "Accountability" },
];

const PEER_QUESTIONS = [
  { q: "This person listens to understand, not just to respond.", dim: "Communication" },
  { q: "They give clear direction and expectations.", dim: "Clarity" },
  { q: "I feel safe sharing problems or mistakes with this person.", dim: "Psych Safety" },
  { q: "They trust me to do my work without micromanaging.", dim: "Delegation" },
  { q: "They handle pressure without creating panic.", dim: "Resilience" },
  { q: "They credit the team for successes.", dim: "Accountability" },
  { q: "They're open to changing their mind with new information.", dim: "Adaptability" },
];

// ─── HELPER: Send WhatsApp Message ───
async function sendWhatsApp(to, body) {
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: toFormatted,
      body,
    });
  } catch (err) {
    console.error(`Failed to send to ${to}:`, err.message);
  }
}

async function sendWhatsAppWithMedia(to, body, mediaUrl) {
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_NUMBER,
      to: toFormatted,
      body,
      mediaUrl: [mediaUrl],
    });
  } catch (err) {
    console.error(`Failed to send media to ${to}:`, err.message);
  }
}

// ─── HELPER: Parse score from message ───
function parseScore(text) {
  const cleaned = text.trim();
  const num = parseInt(cleaned);
  if (num >= 1 && num <= 5) return num;
  // Handle text responses
  const lower = cleaned.toLowerCase();
  if (lower.includes('strongly disagree') || lower === '1') return 1;
  if (lower.includes('disagree') || lower === '2') return 2;
  if (lower.includes('neutral') || lower === '3') return 3;
  if (lower.includes('agree') && !lower.includes('strongly') || lower === '4') return 4;
  if (lower.includes('strongly agree') || lower === '5') return 5;
  return null;
}

// ─── HELPER: Parse peer contacts ───
function parsePeerContacts(text) {
  // Extract phone numbers from text (Indian format)
  const phoneRegex = /(?:\+?91)?[\s-]?(\d{10})/g;
  const matches = [];
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    let num = match[1];
    if (!num.startsWith('91')) num = '91' + num;
    matches.push('+' + num);
  }
  return matches;
}

// ─── MAIN FLOW: Handle Manager Messages ───
async function handleManagerMessage(from, body) {
  let session = sessions[from];

  // New user — start fresh
  if (!session) {
    session = {
      state: 'welcome',
      name: null,
      role: null,
      scores: [],
      challenge: null,
      peerContacts: [],
      peerResponses: [],
      createdAt: new Date(),
    };
    sessions[from] = session;

    await sendWhatsApp(from,
      `👋 Welcome to LightningCoach!\n\n` +
      `I'm your AI leadership assessment coach. In the next 10 minutes, I'll help you discover your leadership strengths and blind spots.\n\n` +
      `🔒 Your responses are 100% confidential.\n\n` +
      `Let's start — what's your name?`
    );
    session.state = 'ask_name';
    return;
  }

  switch (session.state) {
    case 'ask_name':
      session.name = body.trim();
      session.state = 'ask_role';
      await sendWhatsApp(from,
        `Great to meet you, ${session.name}! 🙌\n\nWhat's your current role? (e.g., Engineering Manager, Team Lead, Founder)`
      );
      break;

    case 'ask_role':
      session.role = body.trim();
      session.state = 'self_q';
      session.currentQ = 0;
      await sendWhatsApp(from,
        `Perfect! Now I'll ask you 10 questions about your leadership.\n\n` +
        `Rate yourself 1-5 for each:\n` +
        `1 = Strongly Disagree\n5 = Strongly Agree\n\n` +
        `Just reply with a number. Here's the first one 👇`
      );
      // Small delay then send first question
      setTimeout(async () => {
        await sendWhatsApp(from,
          `*Q1/10 — ${SELF_QUESTIONS[0].dim}*\n\n${SELF_QUESTIONS[0].q}\n\n(Reply 1-5)`
        );
      }, 1500);
      break;

    case 'self_q': {
      const score = parseScore(body);
      if (score === null) {
        await sendWhatsApp(from, `Please reply with a number from 1 to 5. 🙏`);
        return;
      }
      session.scores.push(score);
      session.currentQ++;

      if (session.currentQ < SELF_QUESTIONS.length) {
        const q = SELF_QUESTIONS[session.currentQ];
        await sendWhatsApp(from,
          `*Q${session.currentQ + 1}/10 — ${q.dim}*\n\n${q.q}\n\n(Reply 1-5)`
        );
      } else {
        session.state = 'ask_challenge';
        await sendWhatsApp(from,
          `Great responses, ${session.name}! 💪\n\n` +
          `One more question — in your own words:\n\n` +
          `*What is your biggest leadership challenge right now?*`
        );
      }
      break;
    }

    case 'ask_challenge':
      session.challenge = body.trim();
      session.state = 'ask_peers';
      await sendWhatsApp(from,
        `Thank you! Now for the 360° part. 🔄\n\n` +
        `Share WhatsApp numbers of 3-5 people you work with (peers, reports, or your manager).\n\n` +
        `They'll get a short anonymous survey about your leadership. They won't see your answers.\n\n` +
        `Just paste their numbers, e.g.:\n9876543210\n9123456789\n9555555555`
      );
      break;

    case 'ask_peers': {
      const peers = parsePeerContacts(body);
      if (peers.length < 1) {
        await sendWhatsApp(from,
          `I couldn't find valid phone numbers. Please share at least 3 Indian mobile numbers (10 digits each), one per line.`
        );
        return;
      }
      session.peerContacts = peers;
      session.state = 'waiting_peers';
      session.peersCompleted = 0;

      await sendWhatsApp(from,
        `✅ Got it! Sending anonymous surveys to ${peers.length} people now.\n\n` +
        `I'll notify you when responses come in. Your full report will be ready within 48 hours.\n\n` +
        `Thanks for doing this, ${session.name}! ⚡`
      );

      // Send peer surveys
      for (const peerNum of peers) {
        peerSessions[peerNum] = {
          managerPhone: from,
          managerName: session.name,
          state: 'peer_intro',
          scores: [],
          currentQ: 0,
          strength: null,
          improvement: null,
        };

        await sendWhatsApp(peerNum,
          `Hi! 👋\n\n` +
          `${session.name} is taking a leadership assessment and nominated you for anonymous feedback.\n\n` +
          `Your responses are 100% confidential — ${session.name} will only see aggregated scores, never individual responses.\n\n` +
          `It takes 3 minutes. Ready to start?\n\nReply *YES* to begin.`
        );
      }
      break;
    }

    case 'waiting_peers':
      await sendWhatsApp(from,
        `Still waiting for peer responses! ${session.peersCompleted}/${session.peerContacts.length} completed so far.\n\n` +
        `I'll send you a message as soon as your report is ready. ⏳`
      );
      break;

    case 'report_sent':
      await sendWhatsApp(from,
        `Your report was already sent! Check your chat history to find the PDF. 📄\n\n` +
        `If you'd like this for your entire team, reply TEAM and I'll share details.`
      );
      if (body.trim().toUpperCase() === 'TEAM') {
        await sendWhatsApp(from,
          `🔥 Great choice! Here's our Team Plan:\n\n` +
          `✅ Assessment for all your managers\n` +
          `✅ Company dashboard with team blind spots\n` +
          `✅ Quarterly re-assessments\n` +
          `✅ Anonymized team reports\n\n` +
          `Currently FREE during our pilot program.\n\n` +
          `Reply with your company name and number of managers, and I'll set it up!`
        );
      }
      break;

    case 'coaching_active': {
      // Handle coaching responses
      await sendWhatsApp(from,
        `Thanks for the update, ${session.name}! 💪\n\n` +
        `I've noted your progress. Keep going — small actions compound into big changes.\n\n` +
        `Your next coaching challenge arrives next Monday. ⚡`
      );
      break;
    }

    default:
      // Reset if confused
      delete sessions[from];
      await sendWhatsApp(from,
        `👋 Welcome to LightningCoach!\n\nI'm your AI leadership assessment coach. Reply *START* to begin your 10-minute assessment.`
      );
  }
}

// ─── PEER FLOW: Handle Peer Messages ───
async function handlePeerMessage(from, body) {
  const peer = peerSessions[from];
  if (!peer) return false; // Not a peer — handle as potential new manager

  switch (peer.state) {
    case 'peer_intro':
      if (body.trim().toUpperCase().includes('YES') || body.trim() === '1') {
        peer.state = 'peer_q';
        peer.currentQ = 0;
        const q = PEER_QUESTIONS[0];
        await sendWhatsApp(from,
          `Great! Rate ${peer.managerName} on each statement (1-5):\n` +
          `1 = Strongly Disagree → 5 = Strongly Agree\n\n` +
          `*Q1/7*\n${q.q}\n\n(Reply 1-5)`
        );
      } else {
        await sendWhatsApp(from, `No problem! Reply *YES* anytime if you change your mind. 🙏`);
      }
      break;

    case 'peer_q': {
      const score = parseScore(body);
      if (score === null) {
        await sendWhatsApp(from, `Please reply with a number from 1 to 5. 🙏`);
        return true;
      }
      peer.scores.push(score);
      peer.currentQ++;

      if (peer.currentQ < PEER_QUESTIONS.length) {
        const q = PEER_QUESTIONS[peer.currentQ];
        await sendWhatsApp(from,
          `*Q${peer.currentQ + 1}/7*\n${q.q}\n\n(Reply 1-5)`
        );
      } else {
        peer.state = 'peer_strength';
        await sendWhatsApp(from,
          `Almost done! Two open questions:\n\n*What is ${peer.managerName}'s greatest leadership STRENGTH?*`
        );
      }
      break;
    }

    case 'peer_strength':
      peer.strength = body.trim();
      peer.state = 'peer_improve';
      await sendWhatsApp(from,
        `*What is ONE thing ${peer.managerName} should work on?*`
      );
      break;

    case 'peer_improve':
      peer.improvement = body.trim();
      peer.state = 'done';

      await sendWhatsApp(from,
        `Thank you so much! 🙏 Your anonymous feedback will help ${peer.managerName} grow as a leader.\n\n⚡ Powered by LightningCoach`
      );

      // Update manager session
      const managerSession = sessions[peer.managerPhone];
      if (managerSession) {
        managerSession.peerResponses.push({
          scores: peer.scores,
          strength: peer.strength,
          improvement: peer.improvement,
        });
        managerSession.peersCompleted = (managerSession.peersCompleted || 0) + 1;

        // Notify manager of progress
        await sendWhatsApp(peer.managerPhone,
          `📥 ${managerSession.peersCompleted}/${managerSession.peerContacts.length} peer responses received!`
        );

        // Check if all peers responded (or minimum 3)
        if (managerSession.peersCompleted >= Math.min(3, managerSession.peerContacts.length)) {
          await generateAndSendReport(peer.managerPhone);
        }
      }
      break;

    case 'done':
      await sendWhatsApp(from, `Your feedback has already been submitted. Thank you! 🙏`);
      break;
  }

  return true;
}

// ─── AI ANALYSIS: Generate report via Claude ───
async function generateAnalysis(session) {
  // Calculate peer averages
  const peerAvgs = PEER_QUESTIONS.map((_, i) => {
    const scores = session.peerResponses.map(r => r.scores[i]).filter(s => s != null);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  });

  const peerStrengths = session.peerResponses.map(r => r.strength).filter(Boolean);
  const peerImprovements = session.peerResponses.map(r => r.improvement).filter(Boolean);

  const prompt = `You are a senior executive coach. Analyze this 360° leadership assessment and generate a structured report.

## Manager: ${session.name}
## Role: ${session.role}
## Stated Challenge: "${session.challenge}"
## Peer Respondents: ${session.peerResponses.length}

## Self-Assessment Scores (1-5):
${SELF_QUESTIONS.map((q, i) => `- ${q.dim}: ${session.scores[i]}`).join('\n')}
Self Average: ${(session.scores.reduce((a, b) => a + b, 0) / session.scores.length).toFixed(1)}

## Peer Feedback Averages:
${PEER_QUESTIONS.map((q, i) => `- ${q.dim}: ${peerAvgs[i] ? peerAvgs[i].toFixed(1) : 'N/A'}`).join('\n')}
Peer Average: ${(peerAvgs.filter(Boolean).reduce((a, b) => a + b, 0) / peerAvgs.filter(Boolean).length).toFixed(1)}

## Peer Strengths Mentioned: ${peerStrengths.join('; ')}
## Peer Improvements Mentioned: ${peerImprovements.join('; ')}

Generate a JSON response with this exact structure:
{
  "overallSelf": number,
  "overallPeer": number,
  "category": "Emerging Leader" | "Growing Leader" | "Strong Leader" | "Exceptional Leader",
  "topStrength": { "dimension": string, "score": number, "insight": string },
  "blindSpot": { "dimension": string, "selfScore": number, "peerScore": number, "insight": string },
  "hiddenStrength": { "dimension": string, "selfScore": number, "peerScore": number, "insight": string },
  "dimensions": [{ "name": string, "selfScore": number, "peerScore": number, "gap": string, "insight": string }],
  "coachingPlan": {
    "week1": { "focus": string, "actions": [string, string, string] },
    "week2": { "focus": string, "actions": [string, string, string] },
    "week3": { "focus": string, "actions": [string, string] },
    "week4": { "focus": string, "actions": [string, string] }
  },
  "start": [string, string, string],
  "stop": [string, string],
  "continue": [string]
}

Return ONLY valid JSON. No markdown, no explanation.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  return JSON.parse(text);
}

// ─── PDF GENERATION ───
function generatePDF(session, analysis) {
  return new Promise((resolve, reject) => {
    const filename = `report_${session.name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.pdf`;
    const filepath = path.join(__dirname, 'reports', filename);

    // Ensure reports directory exists
    if (!fs.existsSync(path.join(__dirname, 'reports'))) {
      fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const teal = '#0D9488';
    const dark = '#0F172A';
    const gray = '#64748B';
    const green = '#10B981';
    const amber = '#F59E0B';
    const red = '#EF4444';
    const bg = '#F0FDFA';

    // ── PAGE 1: HEADER ──
    doc.rect(0, 0, 595, 80).fill(dark);
    doc.fontSize(20).fillColor(teal).text('⚡ LightningCoach', 40, 25);
    doc.fontSize(9).fillColor('#94A3B8').text('AI-Powered Leadership Assessment', 40, 50);

    // Title
    doc.fontSize(28).fillColor(dark).text('Leadership Profile Report', 40, 110);
    doc.fontSize(11).fillColor(gray)
      .text(`Prepared for: ${session.name}`, 40, 150)
      .text(`Role: ${session.role}`, 40, 168)
      .text(`Date: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`, 40, 186)
      .text(`Peer respondents: ${session.peerResponses.length}`, 40, 204);

    // Overall scores
    doc.roundedRect(40, 235, 515, 70, 8).fill(bg);
    doc.fontSize(36).fillColor(teal).text(analysis.overallSelf.toFixed(1), 60, 248);
    doc.fontSize(10).fillColor(gray).text('Self Score', 60, 288);
    doc.fontSize(10).text(`Category: ${analysis.category}`, 140, 258);

    doc.fontSize(28).fillColor(amber).text(analysis.overallPeer.toFixed(1), 400, 252);
    doc.fontSize(10).fillColor(gray).text('Peer Average', 400, 285);

    // Key Findings
    doc.fontSize(16).fillColor(dark).text('Key Findings', 40, 330);

    // Top Strength box
    doc.roundedRect(40, 355, 165, 60, 6).fill('#D1FAE5');
    doc.fontSize(8).fillColor('#065F46').text('TOP STRENGTH', 50, 362);
    doc.fontSize(12).text(analysis.topStrength.dimension, 50, 378);
    doc.fontSize(9).text(`${analysis.topStrength.score}/5`, 50, 396);

    // Blind Spot box
    doc.roundedRect(215, 355, 165, 60, 6).fill('#FEF3C7');
    doc.fontSize(8).fillColor('#92400E').text('BLIND SPOT', 225, 362);
    doc.fontSize(12).text(analysis.blindSpot.dimension, 225, 378);
    doc.fontSize(9).text(`Self: ${analysis.blindSpot.selfScore} vs Peers: ${analysis.blindSpot.peerScore}`, 225, 396);

    // Hidden Strength box
    doc.roundedRect(390, 355, 165, 60, 6).fill('#DBEAFE');
    doc.fontSize(8).fillColor('#1E40AF').text('HIDDEN STRENGTH', 400, 362);
    doc.fontSize(12).text(analysis.hiddenStrength.dimension, 400, 378);
    doc.fontSize(9).text(`Peers: ${analysis.hiddenStrength.peerScore} (You: ${analysis.hiddenStrength.selfScore})`, 400, 396);

    // Dimension Scores
    doc.fontSize(16).fillColor(dark).text('Dimension Scores', 40, 440);

    let y = 465;
    const barWidth = 250;
    for (const dim of analysis.dimensions) {
      doc.fontSize(10).fillColor(dark).text(dim.name, 40, y);

      // Self bar background
      doc.roundedRect(180, y + 2, barWidth, 6, 3).fill('#E2E8F0');
      // Self bar fill
      const selfW = (dim.selfScore / 5) * barWidth;
      if (selfW > 0) doc.roundedRect(180, y + 2, selfW, 6, 3).fill(teal);

      // Peer bar background
      doc.roundedRect(180, y + 12, barWidth, 6, 3).fill('#E2E8F0');
      // Peer bar fill
      const peerW = dim.peerScore ? (dim.peerScore / 5) * barWidth : 0;
      if (peerW > 0) doc.roundedRect(180, y + 12, peerW, 6, 3).fill(amber);

      // Scores text
      doc.fontSize(8).fillColor(teal).text(`Self: ${dim.selfScore}`, 440, y + 1);
      doc.fillColor(amber).text(`Peer: ${dim.peerScore || 'N/A'}`, 440, y + 12);

      const gap = dim.peerScore ? Math.abs(dim.selfScore - dim.peerScore) : 0;
      if (gap >= 1.0) {
        doc.fillColor(red).text(`Gap: ${gap.toFixed(1)}`, 510, y + 6);
      }
      y += 28;
    }

    // ── PAGE 2: COACHING PLAN ──
    doc.addPage();
    doc.rect(0, 0, 595, 6).fill(teal);

    doc.fontSize(20).fillColor(dark).text('Your 30-Day Coaching Plan', 40, 30);
    doc.fontSize(10).fillColor(gray).text('Personalized based on your assessment. Delivered weekly on WhatsApp.', 40, 58);

    y = 90;
    const weeks = [
      { title: `Week 1: ${analysis.coachingPlan.week1.focus}`, actions: analysis.coachingPlan.week1.actions, bg: '#FEF3C7', color: '#92400E' },
      { title: `Week 2: ${analysis.coachingPlan.week2.focus}`, actions: analysis.coachingPlan.week2.actions, bg: '#DBEAFE', color: '#1E40AF' },
      { title: `Week 3: ${analysis.coachingPlan.week3.focus}`, actions: analysis.coachingPlan.week3.actions, bg: '#D1FAE5', color: '#065F46' },
      { title: `Week 4: ${analysis.coachingPlan.week4.focus}`, actions: analysis.coachingPlan.week4.actions, bg: '#F3E8FF', color: '#6B21A8' },
    ];

    for (const week of weeks) {
      const blockH = 24 + week.actions.length * 18;
      doc.roundedRect(40, y, 515, blockH, 6).fill(week.bg);
      doc.fontSize(11).fillColor(week.color).text(week.title, 52, y + 8);
      week.actions.forEach((action, i) => {
        doc.fontSize(9).text(`• ${action}`, 60, y + 26 + i * 18);
      });
      y += blockH + 12;
    }

    // Recommendations
    y += 10;
    doc.fontSize(14).fillColor(dark).text('Recommendations', 40, y);
    y += 24;

    doc.fontSize(10).fillColor(green).text('START doing:', 40, y);
    y += 16;
    analysis.start.forEach(item => {
      doc.fontSize(9).fillColor(dark).text(`→  ${item}`, 52, y);
      y += 16;
    });

    y += 8;
    doc.fontSize(10).fillColor(red).text('STOP doing:', 40, y);
    y += 16;
    analysis.stop.forEach(item => {
      doc.fontSize(9).fillColor(dark).text(`→  ${item}`, 52, y);
      y += 16;
    });

    y += 8;
    doc.fontSize(10).fillColor(teal).text('CONTINUE doing:', 40, y);
    y += 16;
    analysis.continue.forEach(item => {
      doc.fontSize(9).fillColor(dark).text(`→  ${item}`, 52, y);
      y += 16;
    });

    // CTA box
    y += 20;
    doc.roundedRect(40, y, 515, 60, 8).fill(bg).stroke(teal);
    doc.fontSize(13).fillColor(teal).text('Want this for your entire team?', 60, y + 12);
    doc.fontSize(9).fillColor(gray).text('Team plan available during pilot — includes company dashboard and team blind spot analysis.', 60, y + 32);

    // Footer
    doc.fontSize(7).fillColor('#94A3B8').text('⚡ LightningCoach — Confidential Leadership Assessment Report', 40, 800);

    doc.end();

    stream.on('finish', () => resolve({ filepath, filename }));
    stream.on('error', reject);
  });
}

// ─── ORCHESTRATOR: Generate analysis + PDF + send ───
async function generateAndSendReport(managerPhone) {
  const session = sessions[managerPhone];
  if (!session) return;

  await sendWhatsApp(managerPhone,
    `🧠 All peer responses received! Generating your Leadership Profile now...\n\nThis takes about 2 minutes. ⏳`
  );

  try {
    // Generate AI analysis
    const analysis = await generateAnalysis(session);
    session.analysis = analysis;

    // Generate PDF
    const { filepath, filename } = await generatePDF(session, analysis);

    // Host the PDF and send
    const pdfUrl = `${BASE_URL}/reports/${filename}`;

    // Send summary message
    await sendWhatsApp(managerPhone,
      `⚡ ${session.name}, your Leadership Profile is ready!\n\n` +
      `🏆 Top Strength: *${analysis.topStrength.dimension}* (${analysis.topStrength.score}/5)\n` +
      `⚠️ Blind Spot: *${analysis.blindSpot.dimension}* (Self: ${analysis.blindSpot.selfScore} vs Peers: ${analysis.blindSpot.peerScore})\n` +
      `💡 Hidden Strength: *${analysis.hiddenStrength.dimension}* (Peers rate you ${analysis.hiddenStrength.peerScore}!)\n\n` +
      `📊 Overall: ${analysis.overallSelf.toFixed(1)}/5 (Self) | ${analysis.overallPeer.toFixed(1)}/5 (Peers)\n` +
      `📋 Category: ${analysis.category}\n\n` +
      `Your personalized 30-day coaching plan starts Monday. I'll send you one challenge per week right here on WhatsApp.\n\n` +
      `Full report 👇`
    );

    // Send PDF
    await sendWhatsAppWithMedia(managerPhone, '📄 Your Leadership Profile Report', pdfUrl);

    // Upsell message after delay
    setTimeout(async () => {
      await sendWhatsApp(managerPhone,
        `🔥 Quick question, ${session.name} — would you like this for your entire team?\n\n` +
        `Our Team Plan includes:\n` +
        `✅ Assessment for all managers\n` +
        `✅ Company dashboard with team blind spots\n` +
        `✅ Quarterly re-assessments\n\n` +
        `Currently *FREE* during our pilot.\n\n` +
        `Reply *TEAM* if interested!`
      );
    }, 30000); // 30 seconds later

    session.state = 'report_sent';

    // Schedule coaching messages
    scheduleCoaching(managerPhone, analysis);

  } catch (err) {
    console.error('Report generation error:', err);
    await sendWhatsApp(managerPhone,
      `Sorry, there was an issue generating your report. Our team is looking into it. You'll receive it within 24 hours. 🙏`
    );
  }
}

// ─── COACHING SCHEDULER ───
function scheduleCoaching(phone, analysis) {
  const session = sessions[phone];
  if (!session) return;

  const weeks = [
    analysis.coachingPlan.week1,
    analysis.coachingPlan.week2,
    analysis.coachingPlan.week3,
    analysis.coachingPlan.week4,
  ];

  weeks.forEach((week, i) => {
    const delay = (i + 1) * 7 * 24 * 60 * 60 * 1000; // Weekly
    setTimeout(async () => {
      const weekNum = i + 1;
      const actions = week.actions.map((a, j) => `${j + 1}. ${a}`).join('\n');
      await sendWhatsApp(phone,
        `⚡ Week ${weekNum} Coaching — ${session.name}\n\n` +
        `Focus: *${week.focus}*\n\n` +
        `Your challenges this week:\n${actions}\n\n` +
        `Reply by Friday with how it went — voice note or text. 💪`
      );
      session.state = 'coaching_active';
    }, delay);
  });

  // Final message after 30 days
  setTimeout(async () => {
    await sendWhatsApp(phone,
      `🎉 ${session.name}, you've completed your 30-day coaching plan!\n\n` +
      `I'm sending a quick 3-question re-assessment to your peers to measure your growth.\n\n` +
      `You'll get a before/after comparison within 48 hours.\n\n` +
      `Amazing work! ⚡`
    );
  }, 30 * 24 * 60 * 60 * 1000);
}

// ─── WEBHOOK: Twilio incoming message ───
app.post('/webhook', async (req, res) => {
  const from = req.body.From; // whatsapp:+919958355005
  const body = req.body.Body || '';

  console.log(`[${new Date().toISOString()}] Message from ${from}: ${body}`);

  // Check if this is a peer response
  const phoneNum = from.replace('whatsapp:', '');
  const isPeer = await handlePeerMessage(phoneNum, body);

  if (!isPeer) {
    // Handle as manager
    await handleManagerMessage(from, body);
  }

  // Twilio needs a response
  res.type('text/xml').send('<Response></Response>');
});

// ─── Serve PDFs ───
app.use('/reports', express.static(path.join(__dirname, 'reports')));

// ─── Health check ───
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'LightningCoach WhatsApp Bot',
    activeSessions: Object.keys(sessions).length,
    peerSessions: Object.keys(peerSessions).length,
  });
});

// ─── START ───
app.listen(PORT, () => {
  console.log(`⚡ LightningCoach Bot running on port ${PORT}`);
  console.log(`Webhook URL: ${BASE_URL}/webhook`);
});
