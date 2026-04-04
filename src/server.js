// ⚡ LIGHTNINGCOACH v2 — Instant Report, No Peer Requirement
// Flow: Hi → Name → Role → 10 Questions → Challenge → INSTANT AI Report on WhatsApp
// Peer feedback is optional Phase 2 upgrade

const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
  ANTHROPIC_API_KEY,
  PORT = 3000,
} = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const sessions = {};

const QUESTIONS = [
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

async function send(to, body) {
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: toFmt, body });
  } catch (err) {
    console.error(`Send failed to ${to}:`, err.message);
  }
}

function parseScore(text) {
  const num = parseInt(text.trim());
  if (num >= 1 && num <= 5) return num;
  return null;
}

async function generateAnalysis(session) {
  const dims = QUESTIONS.map((q, i) => ({ dim: q.dim, score: session.scores[i] }));
  const avg = (session.scores.reduce((a, b) => a + b, 0) / session.scores.length).toFixed(1);

  const prompt = `You are a senior executive coach. ${session.name} (${session.role}) completed a leadership self-assessment.

Scores (1-5):
${dims.map(d => `- ${d.dim}: ${d.score}/5`).join('\n')}

Average: ${avg}/5
Biggest challenge: "${session.challenge}"

Write a personalized leadership insight report formatted for WhatsApp. Use *bold* for emphasis. Keep it under 350 words.

Include:
1. Greeting + overall score + category (Emerging: 1-2.5, Growing: 2.5-3.5, Strong: 3.5-4.5, Exceptional: 4.5-5)
2. Top 2 strengths — why they matter
3. Top 2 development areas — the risk if ignored
4. ONE specific action for this week based on their lowest score and stated challenge
5. A pattern insight about their overall leadership style

End with exactly this line:
"Reply *UPGRADE* for 360° peer feedback version | Reply *TEAM* to get this for your team"

Write like a coach who genuinely cares. Direct, warm, actionable.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text.trim();
}

async function handleMessage(from, body) {
  let s = sessions[from];
  const msg = body.trim();

  if (s && s.state === 'report_sent') {
    if (msg.toUpperCase() === 'UPGRADE') {
      await send(from, `🔥 The 360° upgrade is coming soon! We'll notify you when it's ready.\n\nIn the meantime, your weekly coaching challenge starts Monday right here on WhatsApp. ⚡`);
      return;
    }
    if (msg.toUpperCase() === 'TEAM') {
      await send(from, `🔥 Great choice!\n\n*Team Plan (Free Pilot):*\n✅ Assessment for all managers\n✅ Company dashboard\n✅ Team blind spot analysis\n✅ Quarterly re-assessments\n\nReply with your *company name* and *number of managers* and I'll set it up! ⚡`);
      return;
    }
    await send(from, `Hey ${s.name}! 👋 Your report was already delivered.\n\nReply *UPGRADE* for 360° version\nReply *TEAM* for team plan\nReply *START* for a new assessment`);
    return;
  }

  if (!s || msg.toUpperCase() === 'START' || msg.toUpperCase() === 'RESTART' || msg.toUpperCase() === 'HI' || msg.toUpperCase() === 'HELLO' || msg.toUpperCase() === 'HEY') {
    sessions[from] = { state: 'ask_name', name: null, role: null, scores: [], challenge: null, currentQ: 0, createdAt: new Date() };
    await send(from, `👋 Welcome to *LightningCoach*!\n\nI'm your AI leadership coach. In 10 minutes, you'll discover your leadership strengths and blind spots.\n\n🔒 100% confidential.\n\nWhat's your name?`);
    return;
  }

  s = sessions[from];
  if (!s) return;

  switch (s.state) {
    case 'ask_name':
      s.name = msg;
      s.state = 'ask_role';
      await send(from, `Nice to meet you, ${s.name}! 🙌\n\nWhat's your current role?\n_(e.g., Engineering Manager, Team Lead, Founder)_`);
      break;

    case 'ask_role':
      s.role = msg;
      s.state = 'self_q';
      s.currentQ = 0;
      await send(from, `Let's go, ${s.name}! 🚀\n\nRate yourself *1 to 5* on each statement:\n1 = Strongly Disagree\n5 = Strongly Agree\n\nJust reply with a number.`);
      setTimeout(async () => {
        await send(from, `*Q1/10 — ${QUESTIONS[0].dim}*\n\n${QUESTIONS[0].q}\n\n_(1-5)_`);
      }, 1500);
      break;

    case 'self_q': {
      const score = parseScore(msg);
      if (score === null) {
        await send(from, `Please reply with a number *1 to 5* 🙏`);
        return;
      }
      s.scores.push(score);
      s.currentQ++;

      if (s.currentQ < QUESTIONS.length) {
        const q = QUESTIONS[s.currentQ];
        await send(from, `*Q${s.currentQ + 1}/10 — ${q.dim}*\n\n${q.q}\n\n_(1-5)_`);
      } else {
        s.state = 'ask_challenge';
        await send(from, `All 10 done! 💪\n\nFinal question — in your own words:\n\n*What is your biggest leadership challenge right now?*`);
      }
      break;
    }

    case 'ask_challenge':
      s.challenge = msg;
      s.state = 'generating';
      await send(from, `Analyzing your responses... 🧠\n\nYour Leadership Profile is being generated. Takes about 30 seconds. ⏳`);

      try {
        const report = await generateAnalysis(s);
        if (report) {
          await send(from, `⚡ *YOUR LEADERSHIP PROFILE*\n━━━━━━━━━━━━━━━━━\n\n${report}`);
          s.state = 'report_sent';
          
          setTimeout(async () => {
            await send(from, `📋 *Your coaching journey starts now!*\n\nI'll send you one leadership challenge per week right here. Small actions that compound into real change.\n\nFirst challenge arrives Monday. ⚡`);
          }, 20000);
        } else {
          await send(from, `Hmm, something went wrong. 😅 Reply *START* to try again.`);
          s.state = 'error';
        }
      } catch (err) {
        console.error('Error:', err);
        await send(from, `Something went wrong. Reply *START* to try again. 🙏`);
        s.state = 'error';
      }
      break;

    default:
      await send(from, `Reply *START* to begin your leadership assessment. ⚡`);
  }
}

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body || '';
  console.log(`[${new Date().toISOString()}] ${from}: ${body}`);
  await handleMessage(from, body);
  res.type('text/xml').send('<Response></Response>');
});

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'LightningCoach v2',
    sessions: Object.keys(sessions).length,
    reports: Object.values(sessions).filter(s => s.state === 'report_sent').length,
  });
});

app.listen(PORT, () => console.log(`⚡ LightningCoach v2 on port ${PORT}`));
