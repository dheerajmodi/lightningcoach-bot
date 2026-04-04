// ⚡ LIGHTNINGCOACH v3 — Situational Assessment + Archetype System
// Flow: Hi → Name → Role → 10 Scenarios (A/B/C/D) → 2 Open Text → Instant AI Archetype Report

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

// ─── SITUATIONAL QUESTIONS ───
const QUESTIONS = [
  {
    tag: "The Underperformer",
    scenario: "A team member who was once your best performer has been slipping. Work is late, quality dropped. You:",
    opts: {
      A: "Schedule a private 1:1 to ask what's going on and listen without judgment",
      B: "Review their recent work data first, then present the evidence in a conversation",
      C: "Give them a clear deadline to improve and explain the consequences",
      D: "Ask their close colleagues if they've noticed anything or know what's happening"
    },
    map: { A: "Connector", B: "Operator", C: "Strategist", D: "Shield" }
  },
  {
    tag: "The Big Opportunity",
    scenario: "Your manager offers a high-visibility project, but it would stretch your team thin during a busy quarter. You:",
    opts: {
      A: "Accept it — visibility is rare and you'll figure out capacity later",
      B: "Accept but negotiate for additional resources or a deadline extension",
      C: "Discuss with your team first and let them decide together",
      D: "Decline — quality on current commitments matters more"
    },
    map: { A: "Catalyst", B: "Strategist", C: "Connector", D: "Shield" }
  },
  {
    tag: "The Delegation Dilemma",
    scenario: "You have a task you could do in 2 hours, but delegating would take 4 hours. Deadline is tomorrow. You:",
    opts: {
      A: "Do it yourself — faster and better quality guaranteed",
      B: "Delegate anyway — the learning opportunity is worth the extra time",
      C: "Do it yourself but schedule time next week to teach someone",
      D: "Split it — do the critical parts yourself, delegate the rest"
    },
    map: { A: "Operator", B: "Builder", C: "Strategist", D: "Balanced" }
  },
  {
    tag: "The Conflict",
    scenario: "Two direct reports are in a heated disagreement about a project approach. Both have valid points. You:",
    opts: {
      A: "Listen to both privately, then make the final call yourself",
      B: "Bring them together, facilitate a discussion, help them find common ground",
      C: "Let them work it out — they're adults and need to learn",
      D: "Choose the approach that aligns better with the team's OKRs"
    },
    map: { A: "Operator", B: "Connector", C: "Builder", D: "Strategist" }
  },
  {
    tag: "The Feedback Moment",
    scenario: "You need to tell a senior team member their presentation to leadership was poorly received. You:",
    opts: {
      A: "Be direct — tell them exactly what went wrong and how to fix it",
      B: "Start with what worked, then gently address what could improve",
      C: "Ask them how they think it went first, then share your perspective",
      D: "Send written feedback so they can process it privately"
    },
    map: { A: "Catalyst", B: "Shield", C: "Connector", D: "Operator" }
  },
  {
    tag: "The Missed Deadline",
    scenario: "Your team misses an important deadline you committed to your VP. You:",
    opts: {
      A: "Take full responsibility with leadership and shield your team",
      B: "Explain honestly, including what the team could have done differently",
      C: "Analyze what went wrong systematically and present a prevention plan",
      D: "Focus on delivering ASAP and do the post-mortem later"
    },
    map: { A: "Shield", B: "Balanced", C: "Builder", D: "Operator" }
  },
  {
    tag: "The Ambitious Report",
    scenario: "A direct report tells you they want your job someday. You:",
    opts: {
      A: "Feel energized — help them create a development plan immediately",
      B: "Feel slightly threatened but don't show it — you mentor them carefully",
      C: "Tell them exactly what skills they need and where they fall short today",
      D: "Encourage them but redirect to mastering their current role first"
    },
    map: { A: "Builder", B: "Shield", C: "Catalyst", D: "Strategist" }
  },
  {
    tag: "Innovation vs Stability",
    scenario: "Your team's process has worked fine for 2 years but isn't exceptional. You:",
    opts: {
      A: "Push for a major overhaul — good enough is the enemy of great",
      B: "Introduce small experiments alongside the existing process",
      C: "If it's working, don't fix it — focus energy elsewhere",
      D: "Ask the team what they'd change if they could redesign from scratch"
    },
    map: { A: "Catalyst", B: "Builder", C: "Operator", D: "Connector" }
  },
  {
    tag: "The Personal Struggle",
    scenario: "You're going through a tough personal time. At work, you:",
    opts: {
      A: "Share with your team — vulnerability builds trust",
      B: "Keep it completely separate — your team shouldn't carry your burden",
      C: "Tell your manager and one trusted colleague, but not the full team",
      D: "Push through harder — use work as a distraction and channel"
    },
    map: { A: "Connector", B: "Shield", C: "Strategist", D: "Operator" }
  },
  {
    tag: "The Legacy",
    scenario: "If your team described your leadership in one sentence after you leave, you'd want them to say:",
    opts: {
      A: "\"They built something that outlasted them — systems and culture that still drive us\"",
      B: "\"They saw potential in me I didn't see in myself and helped me grow\"",
      C: "\"They had clear vision and courage to pursue it, even when unpopular\"",
      D: "\"They genuinely cared about every person and created a safe space for great work\""
    },
    map: { A: "Builder", B: "Connector", C: "Catalyst", D: "Shield" }
  }
];

// ─── ARCHETYPE DATA ───
const ARCHETYPES = {
  Strategist: { emoji: "♟️", name: "The Strategist", strength: "Vision + Clarity", risk: "May miss human impact of decisions" },
  Shield: { emoji: "🛡️", name: "The Shield", strength: "Loyalty + Protection", risk: "Absorbs too much, may burn out" },
  Operator: { emoji: "⚙️", name: "The Operator", strength: "Execution + Reliability", risk: "Struggles to let go and develop others" },
  Connector: { emoji: "🤝", name: "The Connector", strength: "Empathy + Relationships", risk: "Avoids hard conversations for harmony" },
  Builder: { emoji: "🏗️", name: "The Builder", strength: "Systems + Scale", risk: "Over-processes, loses human element" },
  Catalyst: { emoji: "🔥", name: "The Catalyst", strength: "Energy + Change", risk: "Burns bright then fades without follow-through" },
  Balanced: { emoji: "⚖️", name: "Balanced", strength: "Adaptable", risk: "May lack a dominant strength" }
};

// ─── SEND WHATSAPP ───
async function send(to, body) {
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: toFmt, body });
  } catch (err) {
    console.error(`Send failed:`, err.message);
  }
}

// ─── PARSE ANSWER ───
function parseAnswer(text) {
  const clean = text.trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(clean)) return clean;
  if (clean.startsWith('A') || clean.includes('OPTION A') || clean === '1') return 'A';
  if (clean.startsWith('B') || clean.includes('OPTION B') || clean === '2') return 'B';
  if (clean.startsWith('C') || clean.includes('OPTION C') || clean === '3') return 'C';
  if (clean.startsWith('D') || clean.includes('OPTION D') || clean === '4') return 'D';
  return null;
}

// ─── CALCULATE ARCHETYPE ───
function calculateArchetype(answers) {
  const counts = {};
  answers.forEach((ans, i) => {
    const archetype = QUESTIONS[i].map[ans];
    if (archetype) counts[archetype] = (counts[archetype] || 0) + 1;
  });
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0] ? sorted[0][0] : "Balanced";
  const secondary = sorted[1] ? sorted[1][0] : null;
  
  return { primary, secondary, counts };
}

// ─── GENERATE AI REPORT ───
async function generateReport(session) {
  const { primary, secondary, counts } = calculateArchetype(session.answers);
  const primaryData = ARCHETYPES[primary];
  const secondaryData = secondary ? ARCHETYPES[secondary] : null;

  const answerDetails = session.answers.map((ans, i) => {
    const q = QUESTIONS[i];
    return `Q${i+1} (${q.tag}): Chose ${ans} — "${q.opts[ans]}" → ${q.map[ans]} pattern`;
  }).join('\n');

  const prompt = `You are a senior executive coach using the LightningCoach Leadership Archetype Framework.

${session.name} (${session.role}) completed our situational leadership assessment.

Their responses:
${answerDetails}

Archetype pattern counts: ${JSON.stringify(counts)}
Primary archetype: ${primary} (${primaryData.emoji} ${primaryData.name})
Secondary archetype: ${secondary || 'None'} ${secondaryData ? `(${secondaryData.emoji} ${secondaryData.name})` : ''}

Open text — What keeps them up at night: "${session.keepUpAtNight}"
Open text — Skill they want to improve: "${session.wantToImprove}"

Generate a WhatsApp-formatted leadership profile report. Use *bold* for emphasis. Keep under 450 words.

Structure:
1. "${primaryData.emoji} *${primaryData.name}*" as header, with secondary mentioned
2. A 2-sentence description of what this archetype means for THEM specifically (reference their role)
3. *Top 2 Strengths* — based on their answer patterns, what they naturally do well. One sentence each.
4. *Top 2 Blind Spots* — what their pattern reveals they might be missing. Be specific and honest, not generic.
5. *🔍 Contradiction Detected* — find ONE contradiction between their answers. For example, if they chose to delegate in Q7 but not in Q3. Or if their stated concern doesn't match their actual choices. This is the most powerful insight — make it sharp.
6. *🎯 This Week's Challenge* — ONE specific, concrete action they can take tomorrow. Not vague advice. Something measurable.
7. A final "mirror sentence" in italics — one line that captures their leadership essence. Make it feel like looking in a mirror. Something they'd screenshot and share.

End with exactly:
"Reply *PRO* for the full detailed PDF report (₹999)
Reply *TEAM* to assess your entire team
Reply *SHARE* to share this with a friend"

Be warm but unflinchingly honest. The value is in saying what nobody else will.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text.trim();
}

// ─── MESSAGE HANDLER ───
async function handleMessage(from, body) {
  let s = sessions[from];
  const msg = body.trim();

  // Post-report commands
  if (s && s.state === 'report_sent') {
    const upper = msg.toUpperCase();
    if (upper === 'PRO') {
      await send(from, `🔥 *Pro Report — ₹999*\n\nYou'll get:\n📄 Detailed 2000-word PDF analysis\n📊 All 10 dimensions scored\n🎯 30-day coaching plan (week by week)\n📈 Industry benchmarks\n🧠 Deep archetype analysis\n\nPay here: [Payment link coming soon]\n\nOr reply *FREE* to retake the assessment.`);
      return;
    }
    if (upper === 'TEAM') {
      await send(from, `🔥 *Team Pack — ₹4,999 for 10 assessments*\n\n✅ Pro report for each manager\n✅ Team archetype distribution\n✅ Common blind spots across your team\n✅ Recommended team development focus\n\nReply with your *company name* and *number of managers* to get started! ⚡`);
      return;
    }
    if (upper === 'SHARE') {
      await send(from, `Share this link with anyone:\n\nhttps://wa.me/919958355005?text=Hi!%20I%20want%20to%20discover%20my%20leadership%20archetype\n\nOr just forward them this message! ⚡`);
      return;
    }
    if (upper === 'START' || upper === 'RESTART') {
      delete sessions[from];
    } else {
      await send(from, `Hey ${s.name}! 👋\n\nYour ${ARCHETYPES[s.archetype]?.emoji || '⚡'} *${ARCHETYPES[s.archetype]?.name || 'Leadership'}* report was delivered above.\n\nReply *PRO* for detailed PDF (₹999)\nReply *TEAM* for team assessments\nReply *SHARE* to share with a friend\nReply *START* for a new assessment`);
      return;
    }
  }

  // New user or restart
  if (!s || ['START', 'RESTART', 'HI', 'HELLO', 'HEY'].includes(msg.toUpperCase())) {
    sessions[from] = {
      state: 'ask_name',
      name: null,
      role: null,
      answers: [],
      currentQ: 0,
      keepUpAtNight: null,
      wantToImprove: null,
      archetype: null,
      createdAt: new Date()
    };
    await send(from,
      `👋 Welcome to *LightningCoach*!\n\n` +
      `I'm going to present you with 10 real leadership scenarios. There are no right or wrong answers — only YOUR instincts.\n\n` +
      `In 10 minutes, I'll reveal your *Leadership Archetype* — whether you're a Strategist ♟️, Shield 🛡️, Operator ⚙️, Connector 🤝, Builder 🏗️, or Catalyst 🔥.\n\n` +
      `🔒 100% confidential.\n\n` +
      `Let's start — *what's your name?*`
    );
    return;
  }

  s = sessions[from];
  if (!s) return;

  switch (s.state) {
    case 'ask_name':
      s.name = msg;
      s.state = 'ask_role';
      await send(from, `${s.name}, great to have you here! 🙌\n\nWhat's your current role?\n_(e.g., Engineering Manager, Team Lead, VP Product, Founder)_`);
      break;

    case 'ask_role':
      s.role = msg;
      s.state = 'scenario';
      s.currentQ = 0;
      await send(from, `Perfect. Let's begin, ${s.name}. 🎯\n\nI'll describe a situation. You reply with *A, B, C, or D* — whichever you'd ACTUALLY do, not what sounds best.\n\nHere's your first scenario 👇`);
      setTimeout(async () => {
        const q = QUESTIONS[0];
        await send(from,
          `*Q1/10 — ${q.tag}*\n\n` +
          `${q.scenario}\n\n` +
          `A) ${q.opts.A}\n` +
          `B) ${q.opts.B}\n` +
          `C) ${q.opts.C}\n` +
          `D) ${q.opts.D}\n\n` +
          `_(Reply A, B, C, or D)_`
        );
      }, 2000);
      break;

    case 'scenario': {
      const answer = parseAnswer(msg);
      if (!answer) {
        await send(from, `Please reply with *A*, *B*, *C*, or *D* 🙏`);
        return;
      }
      s.answers.push(answer);
      s.currentQ++;

      if (s.currentQ < QUESTIONS.length) {
        const q = QUESTIONS[s.currentQ];
        await send(from,
          `*Q${s.currentQ + 1}/10 — ${q.tag}*\n\n` +
          `${q.scenario}\n\n` +
          `A) ${q.opts.A}\n` +
          `B) ${q.opts.B}\n` +
          `C) ${q.opts.C}\n` +
          `D) ${q.opts.D}\n\n` +
          `_(Reply A, B, C, or D)_`
        );
      } else {
        s.state = 'ask_keepup';
        await send(from, `All 10 scenarios done! 💪\n\nTwo quick open questions to sharpen the analysis:\n\n*What keeps you up at night as a leader?*\n_(One sentence is fine)_`);
      }
      break;
    }

    case 'ask_keepup':
      s.keepUpAtNight = msg;
      s.state = 'ask_improve';
      await send(from, `Got it.\n\n*If you could instantly become better at ONE leadership skill, what would it be?*`);
      break;

    case 'ask_improve':
      s.wantToImprove = msg;
      s.state = 'generating';

      const { primary } = calculateArchetype(s.answers);
      const archData = ARCHETYPES[primary];
      s.archetype = primary;

      await send(from,
        `Analyzing your 10 decisions... 🧠\n\n` +
        `Pattern detected: *${archData.emoji} ${archData.name}*\n\n` +
        `Generating your full Leadership Profile now. 30 seconds... ⏳`
      );

      try {
        const report = await generateReport(s);
        if (report) {
          await send(from, `⚡ *YOUR LEADERSHIP ARCHETYPE*\n━━━━━━━━━━━━━━━━━━━\n\n${report}`);
          s.state = 'report_sent';

          // Coaching follow-up scheduled
          setTimeout(async () => {
            await send(from,
              `💪 *Your coaching journey starts now, ${s.name}!*\n\n` +
              `I'll send you one leadership challenge per week based on your ${archData.emoji} ${archData.name} profile.\n\n` +
              `First challenge arrives Monday. ⚡`
            );
          }, 30000);
        } else {
          await send(from, `Something went wrong generating your report. 😅 Reply *START* to try again.`);
          s.state = 'error';
        }
      } catch (err) {
        console.error('Report error:', err.message);
        await send(from, `Something went wrong. Reply *START* to try again. 🙏`);
        s.state = 'error';
      }
      break;

    default:
      await send(from, `Reply *START* to begin your leadership archetype assessment. ⚡`);
  }
}

// ─── WEBHOOK ───
app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body || '';
  console.log(`[${new Date().toISOString()}] ${from}: ${body}`);
  await handleMessage(from, body);
  res.type('text/xml').send('<Response></Response>');
});

// ─── HEALTH ───
app.get('/', (req, res) => {
  const allSessions = Object.values(sessions);
  res.json({
    status: 'running',
    service: 'LightningCoach v3 — Archetype Engine',
    activeSessions: allSessions.length,
    reportsGenerated: allSessions.filter(s => s.state === 'report_sent').length,
    archetypeDistribution: allSessions.filter(s => s.archetype).reduce((acc, s) => {
      acc[s.archetype] = (acc[s.archetype] || 0) + 1;
      return acc;
    }, {}),
  });
});

app.listen(PORT, () => console.log(`⚡ LightningCoach v3 — Archetype Engine on port ${PORT}`));
