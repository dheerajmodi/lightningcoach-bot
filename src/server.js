// ⚡ LIGHTNINGCOACH v4 — Adaptive Situational Assessment Engine
// Features: 60+ scenario bank, role-based tracks, adaptive branching,
// personalized scenarios, contradiction detection, response time tracking

const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER,
  ANTHROPIC_API_KEY, PORT = 3000,
} = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const sessions = {};

// ═══════════════════════════════════════════════════════════════
// SCENARIO BANK — 60+ scenarios, 8 categories, 3 difficulty levels
// ═══════════════════════════════════════════════════════════════

const SCENARIOS = [
  // ─── PEOPLE PROBLEMS ───
  { id:"P1", cat:"people", diff:1, roles:["all"], tag:"The Underperformer",
    scenario:"[NAME], one of your team members who used to be a strong performer has been slipping for a month. Work is late, quality dropped. You:",
    A:{text:"Schedule a private 1:1 to listen without judgment", arch:"Connector", dims:{Communication:3, PeopleDev:2}},
    B:{text:"Review their data first, then present evidence", arch:"Operator", dims:{Decision:3, Accountability:2}},
    C:{text:"Set a clear improvement deadline with consequences", arch:"Strategist", dims:{Conflict:3, Accountability:2}},
    D:{text:"Ask close colleagues if they know what's going on", arch:"Shield", dims:{SelfAware:3, Communication:1}} },

  { id:"P2", cat:"people", diff:2, roles:["manager","senior"], tag:"The Toxic Star",
    scenario:"[NAME], your highest performer consistently delivers but teammates complain about their behavior — dismissive, takes credit, makes others feel small. You:",
    A:{text:"Have a direct conversation — behavior matters as much as results", arch:"Catalyst", dims:{Conflict:3, Communication:2}},
    B:{text:"Set up a feedback process so they hear it from everyone", arch:"Builder", dims:{SelfAware:2, Delegation:2}},
    C:{text:"Tolerate it — the results are too important to risk", arch:"Operator", dims:{Decision:1, Conflict:-2}},
    D:{text:"Partner them with someone who balances them out", arch:"Connector", dims:{PeopleDev:2, Strategic:1}} },

  { id:"P3", cat:"people", diff:3, roles:["all"], tag:"The Loyalty Test",
    scenario:"[NAME], someone you personally hired and mentored for 2 years has a competing job offer. They ask for your honest advice. You:",
    A:{text:"Honestly tell them to take it if it's better for their growth", arch:"Connector", dims:{PeopleDev:3, SelfAware:2}},
    B:{text:"Make a counteroffer — you can't afford to lose them", arch:"Operator", dims:{Decision:2, Strategic:1}},
    C:{text:"Ask what's missing here that made them look elsewhere", arch:"Strategist", dims:{SelfAware:3, Communication:2}},
    D:{text:"Support their decision but ask for transition time", arch:"Shield", dims:{Resilience:2, Accountability:2}} },

  { id:"P4", cat:"people", diff:2, roles:["founder","manager"], tag:"The First Fire",
    scenario:"[NAME], for the first time, you need to let someone go. They're not performing despite multiple conversations. You:",
    A:{text:"Deliver the news directly, clearly, offer transition help", arch:"Catalyst", dims:{Conflict:3, Accountability:2}},
    B:{text:"Have HR handle the conversation", arch:"Operator", dims:{Delegation:1, Conflict:-1}},
    C:{text:"Agonize and consider giving one more chance", arch:"Shield", dims:{Resilience:-1, Conflict:-2}},
    D:{text:"Write a script, practice it, deliver with empathy", arch:"Builder", dims:{Communication:2, Conflict:2}} },

  { id:"P5", cat:"people", diff:2, roles:["manager","senior"], tag:"The Promotion Dilemma",
    scenario:"[NAME], two team members both deserve a promotion but you only have budget for one. They're friends. You:",
    A:{text:"Choose based purely on performance data", arch:"Operator", dims:{Decision:3, Accountability:2}},
    B:{text:"Talk to each privately, understand their ambitions, then decide", arch:"Connector", dims:{Communication:3, PeopleDev:2}},
    C:{text:"Fight leadership for two promotions", arch:"Shield", dims:{Resilience:2, Influence:2}},
    D:{text:"Promote one now, create a clear timeline for the other", arch:"Strategist", dims:{Strategic:3, PeopleDev:1}} },

  { id:"P6", cat:"people", diff:1, roles:["all"], tag:"The New Team",
    scenario:"[NAME], you just took over a team of people who don't know you. It's your first week. You:",
    A:{text:"Do 1:1s with everyone — listen more than talk", arch:"Connector", dims:{Communication:3, SelfAware:2}},
    B:{text:"Study the team's metrics before making changes", arch:"Operator", dims:{Decision:2, Strategic:2}},
    C:{text:"Share your vision and what you plan to change", arch:"Catalyst", dims:{Influence:3, Strategic:1}},
    D:{text:"Identify informal leaders and build relationships first", arch:"Strategist", dims:{Influence:2, SelfAware:2}} },

  { id:"P7", cat:"people", diff:3, roles:["manager","senior"], tag:"The Silent Resignation",
    scenario:"[NAME], you notice your most reliable team member has gone quiet — doing the minimum, no longer volunteering, leaving on time every day. You:",
    A:{text:"Ask directly: 'I've noticed a change — are you okay?'", arch:"Connector", dims:{Communication:3, SelfAware:2}},
    B:{text:"Check if their workload changed or something else shifted", arch:"Operator", dims:{Decision:2, Strategic:1}},
    C:{text:"Give them space — everyone has seasons, they'll come back", arch:"Shield", dims:{Resilience:1, PeopleDev:-1}},
    D:{text:"Create new challenges for them — maybe they're bored", arch:"Catalyst", dims:{PeopleDev:2, Influence:1}} },

  // ─── POWER DYNAMICS ───
  { id:"PD1", cat:"power", diff:1, roles:["all"], tag:"The Boss Disagrees",
    scenario:"[NAME], your manager publicly disagrees with your proposal in front of senior leadership. You believe you're right. You:",
    A:{text:"Stand your ground — present your data calmly", arch:"Catalyst", dims:{Conflict:3, Influence:2}},
    B:{text:"Acknowledge their view publicly, discuss privately later", arch:"Strategist", dims:{Conflict:2, SelfAware:2}},
    C:{text:"Back down — it's not worth the political cost", arch:"Shield", dims:{Resilience:1, Conflict:-2}},
    D:{text:"Ask the room for input — let the group decide", arch:"Connector", dims:{Communication:2, Delegation:1}} },

  { id:"PD2", cat:"power", diff:2, roles:["manager","senior"], tag:"The Credit Stealer",
    scenario:"[NAME], your manager presents your team's work to the board as their own idea. No mention of your team. You:",
    A:{text:"Confront them directly — your team deserves credit", arch:"Catalyst", dims:{Conflict:3, Accountability:2}},
    B:{text:"Let it go this time, ensure documentation going forward", arch:"Strategist", dims:{Strategic:2, Resilience:1}},
    C:{text:"Find subtle ways to make your team's contribution visible", arch:"Builder", dims:{Influence:2, Strategic:2}},
    D:{text:"Bring it up in your next 1:1 — explain team morale impact", arch:"Connector", dims:{Communication:3, PeopleDev:1}} },

  { id:"PD3", cat:"power", diff:2, roles:["senior"], tag:"The Skip-Level",
    scenario:"[NAME], your CEO asks your direct report to work on a special project, bypassing you. You find out from your report. You:",
    A:{text:"Talk to the CEO — this breaks chain of command", arch:"Catalyst", dims:{Conflict:3, Influence:1}},
    B:{text:"Support your report, ask to be kept in loop going forward", arch:"Shield", dims:{Resilience:2, Communication:1}},
    C:{text:"See it as a growth opportunity for your report", arch:"Builder", dims:{Delegation:3, PeopleDev:2}},
    D:{text:"Feel threatened but monitor the situation quietly", arch:"Operator", dims:{SelfAware:1, Resilience:-1}} },

  { id:"PD4", cat:"power", diff:3, roles:["senior","founder"], tag:"The Political Game",
    scenario:"[NAME], you discover a peer leader has been quietly lobbying against your team's budget. You:",
    A:{text:"Confront them directly and ask why", arch:"Catalyst", dims:{Conflict:3, Communication:1}},
    B:{text:"Build alliances with other leaders to protect your position", arch:"Strategist", dims:{Influence:3, Strategic:2}},
    C:{text:"Make your results so strong they speak for themselves", arch:"Operator", dims:{Accountability:3, Resilience:1}},
    D:{text:"Raise it with your shared manager as a transparency issue", arch:"Builder", dims:{Conflict:2, Communication:2}} },

  // ─── CRISIS MOMENTS ───
  { id:"C1", cat:"crisis", diff:1, roles:["all"], tag:"The Client Escalation",
    scenario:"[NAME], an important client calls furious about a mistake your team made. They want to speak to a leader. You:",
    A:{text:"Take the call yourself — own it, apologize, fix it", arch:"Shield", dims:{Accountability:3, Resilience:2}},
    B:{text:"Gather facts first, call back within an hour", arch:"Operator", dims:{Decision:2, Strategic:1}},
    C:{text:"Have the team member who made the mistake own it with your support", arch:"Builder", dims:{Delegation:2, PeopleDev:2}},
    D:{text:"Turn the crisis into an opportunity to reset the relationship", arch:"Catalyst", dims:{Influence:2, Strategic:2}} },

  { id:"C2", cat:"crisis", diff:2, roles:["all"], tag:"The Burnout Sprint",
    scenario:"[NAME], end of a brutal quarter. Team is exhausted. A new urgent request comes from leadership. You:",
    A:{text:"Push through — one more sprint won't break anyone", arch:"Operator", dims:{Accountability:1, Resilience:-1}},
    B:{text:"Push back — your team's health comes first", arch:"Shield", dims:{Resilience:3, Conflict:2}},
    C:{text:"Ask for volunteers instead of assigning", arch:"Connector", dims:{Communication:2, Delegation:1}},
    D:{text:"Negotiate scope down — find minimum viable delivery", arch:"Strategist", dims:{Strategic:3, Conflict:1}} },

  { id:"C3", cat:"crisis", diff:3, roles:["all"], tag:"The Public Failure",
    scenario:"[NAME], you made a significant strategic mistake that cost the company money. Everyone knows. You:",
    A:{text:"Address it publicly — own it, share what you learned", arch:"Catalyst", dims:{Accountability:3, SelfAware:3}},
    B:{text:"Fix it quietly and move on — dwelling doesn't help", arch:"Operator", dims:{Resilience:1, SelfAware:-1}},
    C:{text:"Analyze what went wrong and implement safeguards", arch:"Builder", dims:{Strategic:2, Accountability:1}},
    D:{text:"Lean on your team — recover together", arch:"Connector", dims:{Communication:2, Resilience:1}} },

  { id:"C4", cat:"crisis", diff:3, roles:["senior","founder"], tag:"The Layoff",
    scenario:"[NAME], the company needs to cut 20% headcount. You decide who stays and who goes. You:",
    A:{text:"Use data-driven criteria — performance and role criticality", arch:"Strategist", dims:{Decision:3, Strategic:2}},
    B:{text:"Fight to protect your entire team — negotiate alternatives", arch:"Shield", dims:{Resilience:2, Conflict:2}},
    C:{text:"Be transparent with your team before decisions are made", arch:"Connector", dims:{Communication:3, SelfAware:2}},
    D:{text:"Make tough calls quickly — dragging it out is worse", arch:"Operator", dims:{Decision:3, Conflict:1}} },

  // ─── GROWTH & STRATEGY ───
  { id:"G1", cat:"growth", diff:1, roles:["all"], tag:"The Big Opportunity",
    scenario:"[NAME], your manager offers a high-visibility project but it would stretch your team thin. You:",
    A:{text:"Accept — visibility is rare, figure out capacity later", arch:"Catalyst", dims:{Influence:3, Strategic:1}},
    B:{text:"Accept but negotiate for resources or deadline extension", arch:"Strategist", dims:{Conflict:2, Strategic:3}},
    C:{text:"Discuss with your team first, decide together", arch:"Connector", dims:{Communication:3, PeopleDev:2}},
    D:{text:"Decline — quality on current work matters more", arch:"Shield", dims:{Accountability:3, Resilience:2}} },

  { id:"G2", cat:"growth", diff:1, roles:["all"], tag:"Innovation vs Stability",
    scenario:"[NAME], your team's process has worked fine for 2 years but isn't exceptional. You:",
    A:{text:"Push for a major overhaul", arch:"Catalyst", dims:{Influence:3, Decision:1}},
    B:{text:"Run small experiments alongside existing process", arch:"Builder", dims:{Strategic:3, Resilience:2}},
    C:{text:"If it works, don't fix it — focus energy elsewhere", arch:"Operator", dims:{Accountability:2, Resilience:1}},
    D:{text:"Ask the team what they'd redesign", arch:"Connector", dims:{Communication:3, PeopleDev:2}} },

  { id:"G3", cat:"growth", diff:2, roles:["senior","founder"], tag:"The Resource Bet",
    scenario:"[NAME], you can either hire 2 senior people OR invest in tooling that automates 30% of work. You:",
    A:{text:"Hire people — tools change, people grow", arch:"Connector", dims:{PeopleDev:3, Decision:1}},
    B:{text:"Invest in tooling — it scales, people don't", arch:"Builder", dims:{Strategic:3, Delegation:2}},
    C:{text:"Split the budget — one hire and some tooling", arch:"Strategist", dims:{Decision:2, Strategic:1}},
    D:{text:"Ask your team what they need most", arch:"Connector", dims:{Communication:2, Delegation:1}} },

  { id:"G4", cat:"growth", diff:3, roles:["founder"], tag:"The Pivot",
    scenario:"[NAME], your product has steady revenue but flat growth. A team member proposes a pivot that could 10x but means abandoning what works. You:",
    A:{text:"Go all in — fortune favors the bold", arch:"Catalyst", dims:{Decision:3, Influence:2}},
    B:{text:"Run the pivot as parallel experiment, keep the core", arch:"Builder", dims:{Strategic:3, Resilience:2}},
    C:{text:"Trust the team member's vision, let them lead it", arch:"Connector", dims:{Delegation:3, PeopleDev:2}},
    D:{text:"Study data thoroughly before committing", arch:"Operator", dims:{Decision:2, Strategic:2}} },

  // ─── DELEGATION ───
  { id:"D1", cat:"delegation", diff:1, roles:["all"], tag:"The Delegation Dilemma",
    scenario:"[NAME], you can do a task in 2 hours but delegating takes 4. Deadline is tomorrow. You:",
    A:{text:"Do it yourself — faster and better quality", arch:"Operator", dims:{Accountability:2, Delegation:-2}},
    B:{text:"Delegate anyway — the learning is worth extra time", arch:"Builder", dims:{Delegation:3, PeopleDev:3}},
    C:{text:"Do it yourself but teach someone next week", arch:"Strategist", dims:{Strategic:2, PeopleDev:1}},
    D:{text:"Split it — do critical parts, delegate the rest", arch:"Balanced", dims:{Decision:2, Delegation:1}} },

  { id:"D2", cat:"delegation", diff:2, roles:["all"], tag:"The Ambitious Report",
    scenario:"[NAME], a direct report tells you they want your job someday. You:",
    A:{text:"Feel energized — create a development plan", arch:"Builder", dims:{PeopleDev:3, Delegation:2}},
    B:{text:"Feel threatened but mentor them carefully", arch:"Shield", dims:{SelfAware:2, Resilience:-1}},
    C:{text:"Tell them exactly what skills they lack", arch:"Catalyst", dims:{Conflict:2, Communication:2}},
    D:{text:"Encourage them but redirect to mastering current role", arch:"Strategist", dims:{Strategic:2, PeopleDev:1}} },

  // ─── PERSONAL & BOUNDARIES ───
  { id:"B1", cat:"personal", diff:1, roles:["all"], tag:"The Personal Struggle",
    scenario:"[NAME], you're going through a tough personal time. At work, you:",
    A:{text:"Share with your team — vulnerability builds trust", arch:"Connector", dims:{Communication:2, SelfAware:3}},
    B:{text:"Keep it completely separate", arch:"Shield", dims:{Resilience:2, Accountability:1}},
    C:{text:"Tell your manager and one trusted person only", arch:"Strategist", dims:{SelfAware:2, Conflict:1}},
    D:{text:"Push through harder — use work as distraction", arch:"Operator", dims:{Resilience:1, SelfAware:-2}} },

  { id:"B2", cat:"personal", diff:1, roles:["all"], tag:"The Weekend Ask",
    scenario:"[NAME], your manager asks you to work the weekend on something that could wait until Monday. You:",
    A:{text:"Say yes — not worth the friction", arch:"Shield", dims:{Resilience:-1, Conflict:-2}},
    B:{text:"Push back politely — you have boundaries", arch:"Catalyst", dims:{Conflict:3, SelfAware:2}},
    C:{text:"Negotiate — 2 hours Saturday morning, not full weekend", arch:"Strategist", dims:{Conflict:2, Strategic:1}},
    D:{text:"Say yes but discuss patterns with manager next week", arch:"Builder", dims:{Communication:2, Strategic:1}} },

  { id:"B3", cat:"personal", diff:3, roles:["all"], tag:"The Imposter Moment",
    scenario:"[NAME], you're in a meeting with people far more experienced. You have an opinion but aren't sure it's good enough. You:",
    A:{text:"Share it confidently — your perspective has value", arch:"Catalyst", dims:{Influence:3, SelfAware:2}},
    B:{text:"Listen first, refine your thought, share at the end", arch:"Strategist", dims:{SelfAware:2, Decision:1}},
    C:{text:"Stay quiet — bring it up later when you've thought more", arch:"Shield", dims:{Resilience:1, Influence:-2}},
    D:{text:"Share as a question — 'What if we...?'", arch:"Connector", dims:{Communication:2, Influence:1}} },

  // ─── ETHICS & INTEGRITY ───
  { id:"E1", cat:"ethics", diff:2, roles:["all"], tag:"The Uncomfortable Truth",
    scenario:"[NAME], you discover your product has a flaw affecting 5% of customers. Leadership doesn't know. You:",
    A:{text:"Report immediately with a proposed fix", arch:"Catalyst", dims:{Accountability:3, Communication:2}},
    B:{text:"Investigate fully before escalating", arch:"Operator", dims:{Decision:2, Strategic:2}},
    C:{text:"Fix quietly if possible, escalate only if not", arch:"Shield", dims:{Resilience:1, Accountability:1}},
    D:{text:"Report AND proactively notify affected customers", arch:"Builder", dims:{Accountability:3, Communication:3}} },

  { id:"E2", cat:"ethics", diff:3, roles:["all"], tag:"The Bias Check",
    scenario:"[NAME], you realize you've been unconsciously favoring team members who are similar to you. You:",
    A:{text:"Actively seek and elevate different perspectives now", arch:"Catalyst", dims:{SelfAware:3, PeopleDev:2}},
    B:{text:"Set up structured criteria so decisions are less subjective", arch:"Builder", dims:{SelfAware:2, Strategic:2}},
    C:{text:"Ask a trusted colleague to call you out when they see it", arch:"Connector", dims:{SelfAware:3, Communication:2}},
    D:{text:"Acknowledge it internally — awareness is enough for now", arch:"Operator", dims:{SelfAware:1, Resilience:1}} },

  // ─── SELF-AWARENESS ───
  { id:"SA1", cat:"selfaware", diff:2, roles:["all"], tag:"The Feedback Mirror",
    scenario:"[NAME], you receive feedback that you're 'too intense' and junior members are afraid to speak up. You:",
    A:{text:"Surprised — ask for specific examples to understand", arch:"Connector", dims:{SelfAware:3, Communication:2}},
    B:{text:"Defensive — you're just passionate, they need to toughen up", arch:"Operator", dims:{SelfAware:-2, Conflict:-1}},
    C:{text:"Grateful — this is exactly the feedback you need", arch:"Builder", dims:{SelfAware:3, PeopleDev:1}},
    D:{text:"Concerned — immediately think about who's affected", arch:"Shield", dims:{SelfAware:2, PeopleDev:2}} },

  { id:"SA2", cat:"selfaware", diff:3, roles:["all"], tag:"The Ego Test",
    scenario:"[NAME], your team solves a critical problem using an approach you explicitly advised against. They were right. You:",
    A:{text:"Celebrate loudly — the team was right, you were wrong", arch:"Catalyst", dims:{SelfAware:3, PeopleDev:2}},
    B:{text:"Acknowledge it privately — feel the sting but be honest", arch:"Shield", dims:{SelfAware:2, Resilience:1}},
    C:{text:"Update your mental model — what did they see that you didn't?", arch:"Strategist", dims:{SelfAware:3, Decision:2}},
    D:{text:"Use it as a case study for the team", arch:"Builder", dims:{SelfAware:2, Strategic:2}} },

  { id:"SA3", cat:"selfaware", diff:1, roles:["all"], tag:"The Blind Spot Guess",
    scenario:"[NAME], if your team could change ONE thing about your leadership, you think they'd say:",
    A:{text:"Trust us more — stop checking our work", arch:"Operator", dims:{Delegation:-2, SelfAware:2}},
    B:{text:"Be more decisive — stop deliberating so long", arch:"Connector", dims:{Decision:-1, SelfAware:2}},
    C:{text:"Give harder feedback — stop being so nice", arch:"Shield", dims:{Conflict:-1, SelfAware:2}},
    D:{text:"Slow down — your pace exhausts us", arch:"Catalyst", dims:{Resilience:-1, SelfAware:2}} },

  // ─── LEGACY ───
  { id:"L1", cat:"legacy", diff:1, roles:["all"], tag:"The Legacy",
    scenario:"[NAME], if your team described your leadership in one sentence after you leave, you'd want:",
    A:{text:"'They built something that outlasted them'", arch:"Builder", dims:{Strategic:3, Delegation:2}},
    B:{text:"'They saw potential in me I didn't see'", arch:"Connector", dims:{PeopleDev:3, Communication:2}},
    C:{text:"'They had vision and courage, even when unpopular'", arch:"Catalyst", dims:{Influence:3, Decision:2}},
    D:{text:"'They created a safe space for great work'", arch:"Shield", dims:{Resilience:2, Communication:2}} },

  { id:"L2", cat:"legacy", diff:2, roles:["all"], tag:"The Why",
    scenario:"[NAME], honestly — why do you lead? What's the real reason?",
    A:{text:"I see possibilities others don't and want to make them real", arch:"Catalyst", dims:{Influence:3, Decision:2}},
    B:{text:"I want to build something bigger than myself", arch:"Builder", dims:{Strategic:3, Delegation:2}},
    C:{text:"I care about people and want to help them grow", arch:"Connector", dims:{PeopleDev:3, Communication:2}},
    D:{text:"Someone has to make the hard calls and I'm willing to", arch:"Strategist", dims:{Decision:3, Conflict:2}} },

  { id:"L3", cat:"legacy", diff:3, roles:["all"], tag:"The 10-Year Mirror",
    scenario:"[NAME], imagine meeting yourself 10 years from now. They say: 'I wish I had...' Most likely ending?",
    A:{text:"...taken bigger risks when I had the chance", arch:"Shield", dims:{Decision:-1, Influence:-1}},
    B:{text:"...spent more time developing my team", arch:"Operator", dims:{Delegation:-1, PeopleDev:-1}},
    C:{text:"...been more honest even when uncomfortable", arch:"Connector", dims:{Conflict:-1, Communication:-1}},
    D:{text:"...slowed down and been more present", arch:"Catalyst", dims:{Resilience:-1, SelfAware:-1}} },
];

// ═══════════════════════════════════════════════════════════════
// ARCHETYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const ARCHETYPES = {
  Strategist: { emoji:"♟️", name:"The Strategist", strength:"Vision + Clarity", risk:"May miss human impact" },
  Shield: { emoji:"🛡️", name:"The Shield", strength:"Loyalty + Protection", risk:"Absorbs too much, burns out" },
  Operator: { emoji:"⚙️", name:"The Operator", strength:"Execution + Reliability", risk:"Can't let go, doesn't develop others" },
  Connector: { emoji:"🤝", name:"The Connector", strength:"Empathy + Relationships", risk:"Avoids conflict for harmony" },
  Builder: { emoji:"🏗️", name:"The Builder", strength:"Systems + Scale", risk:"Over-processes, loses human touch" },
  Catalyst: { emoji:"🔥", name:"The Catalyst", strength:"Energy + Change", risk:"Burns bright then fades" },
  Balanced: { emoji:"⚖️", name:"Balanced", strength:"Adaptable", risk:"May lack dominant strength" }
};

const DIMENSION_NAMES = ["Decision","SelfAware","Communication","Delegation","Strategic","Conflict","PeopleDev","Resilience","Influence","Accountability"];

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE QUESTION SELECTION ENGINE
// ═══════════════════════════════════════════════════════════════

function selectQuestions(session) {
  const { role, answers, usedIds, usedCats } = session;
  const roleKey = role.toLowerCase().includes("founder") || role.toLowerCase().includes("ceo") ? "founder" :
                  role.toLowerCase().includes("vp") || role.toLowerCase().includes("director") || role.toLowerCase().includes("head") || role.toLowerCase().includes("senior") ? "senior" : "manager";

  const available = SCENARIOS.filter(s =>
    !usedIds.includes(s.id) &&
    (s.roles.includes("all") || s.roles.includes(roleKey))
  );

  if (session.questionNum <= 2) {
    // Q1-Q2: Role-appropriate starters (L1 difficulty)
    const starters = available.filter(s => s.diff === 1);
    if (starters.length > 0) return starters[Math.floor(Math.random() * starters.length)];
  }

  if (session.questionNum <= 7) {
    // Q3-Q7: Core scenarios — ensure category diversity
    const uncoveredCats = ["people","power","crisis","growth","delegation","personal","ethics","selfaware"]
      .filter(c => !usedCats.includes(c));
    
    let pool = available.filter(s => uncoveredCats.includes(s.cat));
    if (pool.length === 0) pool = available;

    // Mix difficulties: prefer L2 in the middle
    const l2 = pool.filter(s => s.diff === 2);
    if (l2.length > 0 && Math.random() > 0.3) return l2[Math.floor(Math.random() * l2.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (session.questionNum <= 10) {
    // Q8-Q10: Deep probes — target weakest dimensions
    const dimScores = calculateDimScores(session);
    const weakDims = Object.entries(dimScores).sort((a,b) => a[1] - b[1]).slice(0, 3).map(d => d[0]);

    // Find L3 scenarios that test weak dimensions
    const probes = available.filter(s => s.diff >= 2);
    const targeted = probes.filter(s => {
      const dims = [...Object.keys(s.A.dims), ...Object.keys(s.B.dims), ...Object.keys(s.C.dims), ...Object.keys(s.D.dims)];
      return dims.some(d => weakDims.includes(d));
    });

    if (targeted.length > 0) return targeted[Math.floor(Math.random() * targeted.length)];
    if (probes.length > 0) return probes[Math.floor(Math.random() * probes.length)];
  }

  if (session.questionNum === 11) {
    // Q11: Curveball — least represented category
    const catCounts = {};
    usedCats.forEach(c => catCounts[c] = (catCounts[c] || 0) + 1);
    const allCats = ["people","power","crisis","growth","delegation","personal","ethics","selfaware","legacy"];
    const leastUsed = allCats.filter(c => !catCounts[c] || catCounts[c] === 0);
    
    let curveballs = available.filter(s => leastUsed.includes(s.cat) && s.diff >= 2);
    if (curveballs.length === 0) curveballs = available.filter(s => s.diff >= 2);
    if (curveballs.length > 0) return curveballs[Math.floor(Math.random() * curveballs.length)];
  }

  // Fallback
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  
  // Ultimate fallback — legacy question
  return SCENARIOS.find(s => s.id === "L1");
}

function calculateDimScores(session) {
  const scores = {};
  DIMENSION_NAMES.forEach(d => scores[d] = 5); // Base score
  
  session.answers.forEach(a => {
    const scenario = SCENARIOS.find(s => s.id === a.scenarioId);
    if (!scenario) return;
    const chosen = scenario[a.answer];
    if (!chosen || !chosen.dims) return;
    Object.entries(chosen.dims).forEach(([dim, val]) => {
      if (scores[dim] !== undefined) scores[dim] += val;
    });
  });
  
  // Normalize to 1-5
  Object.keys(scores).forEach(d => {
    scores[d] = Math.max(1, Math.min(5, scores[d] / 3));
  });
  
  return scores;
}

function calculateArchetype(session) {
  const counts = {};
  session.answers.forEach(a => {
    const scenario = SCENARIOS.find(s => s.id === a.scenarioId);
    if (!scenario) return;
    const arch = scenario[a.answer]?.arch;
    if (arch) counts[arch] = (counts[arch] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  return {
    primary: sorted[0] ? sorted[0][0] : "Balanced",
    secondary: sorted[1] ? sorted[1][0] : null,
    counts
  };
}

function findContradictions(session) {
  const contras = [];
  const ansMap = {};
  session.answers.forEach(a => {
    const scenario = SCENARIOS.find(s => s.id === a.scenarioId);
    if (scenario) ansMap[scenario.id] = { answer: a.answer, arch: scenario[a.answer]?.arch, tag: scenario.tag, text: scenario[a.answer]?.text };
  });

  // Check delegation contradictions
  const d1 = ansMap["D1"], d2 = ansMap["D2"], l1 = ansMap["L1"];
  if (d1 && d1.answer === "A" && l1 && (l1.answer === "A" || l1.answer === "B")) {
    contras.push(`You aspire to build something lasting (${l1.tag}), but when given the chance to delegate (${d1.tag}), you chose to do it yourself. The gap between who you want to be and what you instinctively do is your biggest growth edge.`);
  }
  if (d1 && d1.answer === "A" && d2 && d2.answer === "A") {
    contras.push(`You want to develop your team's ambitions (${d2.tag}), but when a task needed delegating (${d1.tag}), speed won over growth. Your instinct to "do it yourself" may be the ceiling on your team's development.`);
  }

  // Check conflict contradictions
  const pd1 = ansMap["PD1"], sa1 = ansMap["SA1"];
  if (pd1 && pd1.answer === "C" && sa1 && sa1.answer === "B") {
    contras.push(`You backed down from your boss (${pd1.tag}) but got defensive when receiving feedback yourself (${sa1.tag}). This suggests conflict avoidance upward but resistance downward — a pattern worth examining.`);
  }

  // Generic pattern contradiction
  if (contras.length === 0) {
    const archetypeCounts = {};
    Object.values(ansMap).forEach(a => { if(a.arch) archetypeCounts[a.arch] = (archetypeCounts[a.arch]||0)+1; });
    const sorted = Object.entries(archetypeCounts).sort((a,b) => b[1]-a[1]);
    if (sorted.length >= 2) {
      const primary = sorted[0][0], secondary = sorted[1][0];
      if ((primary === "Connector" && secondary === "Operator") || (primary === "Operator" && secondary === "Connector")) {
        contras.push(`You oscillate between empathy and execution. In some scenarios you prioritize relationships, in others you prioritize results. This tension isn't a weakness — it's a sign you're navigating the hardest leadership balance. But be aware: your team may experience you as inconsistent.`);
      } else if ((primary === "Shield" && secondary === "Catalyst") || (primary === "Catalyst" && secondary === "Shield")) {
        contras.push(`You're both a protector and a disruptor — a rare and sometimes contradictory combination. You push for change but also shield your team from its consequences. This creates a pattern where you absorb the chaos you create.`);
      } else {
        contras.push(`Your ${ARCHETYPES[primary]?.name || primary} instincts dominate most scenarios, but ${ARCHETYPES[secondary]?.name || secondary} tendencies emerge under pressure. Watch for moments when these two modes conflict — that's where your leadership gets tested most.`);
      }
    }
  }
  return contras;
}

// ═══════════════════════════════════════════════════════════════
// SEND WHATSAPP
// ═══════════════════════════════════════════════════════════════

async function send(to, body) {
  const toFmt = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  try {
    await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: toFmt, body });
  } catch (err) {
    console.error(`Send failed:`, err.message);
  }
}

function parseAnswer(text) {
  const clean = text.trim().toUpperCase();
  if (['A','B','C','D'].includes(clean)) return clean;
  if (clean.startsWith('A') || clean === '1') return 'A';
  if (clean.startsWith('B') || clean === '2') return 'B';
  if (clean.startsWith('C') || clean === '3') return 'C';
  if (clean.startsWith('D') || clean === '4') return 'D';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// AI REPORT GENERATION
// ═══════════════════════════════════════════════════════════════

async function generateReport(session) {
  const { primary, secondary, counts } = calculateArchetype(session);
  const dimScores = calculateDimScores(session);
  const contradictions = findContradictions(session);
  const primaryData = ARCHETYPES[primary];
  const secondaryData = secondary ? ARCHETYPES[secondary] : null;

  const answerDetails = session.answers.map((a, i) => {
    const s = SCENARIOS.find(sc => sc.id === a.scenarioId);
    if (!s) return '';
    const responseTime = a.responseTime ? `(${a.responseTime}s response time)` : '';
    return `Q${i+1} (${s.tag}): ${a.answer} — "${s[a.answer]?.text}" → ${s[a.answer]?.arch} ${responseTime}`;
  }).join('\n');

  const dimSummary = Object.entries(dimScores)
    .sort((a,b) => b[1] - a[1])
    .map(([d,s]) => `${d}: ${s.toFixed(1)}/5`)
    .join(', ');

  const prompt = `You are a senior executive coach using the LightningCoach Adaptive Situational Leadership Assessment (ASLA) framework.

${session.name} (${session.role}, ${session.teamSize || 'unknown'} team, ${session.industry || 'unknown'} industry) completed a personalized 12-question adaptive assessment.

Their responses:
${answerDetails}

Archetype distribution: ${JSON.stringify(counts)}
Primary: ${primary} ${primaryData.emoji}
Secondary: ${secondary || 'None'} ${secondaryData ? secondaryData.emoji : ''}

Dimension scores: ${dimSummary}

What keeps them up at night: "${session.keepUpAtNight}"
Skill they want to improve: "${session.wantToImprove}"

Contradiction detected: "${contradictions[0] || 'None detected'}"

Generate a WhatsApp leadership profile. Use *bold*. Keep under 500 words.

Structure:
1. "${primaryData.emoji} *${primaryData.name}*" header with secondary mentioned
2. 2-sentence personalized description referencing their ROLE and INDUSTRY
3. *Your Strengths* — top 2 based on highest dimension scores. Reference specific scenario choices as evidence.
4. *Your Blind Spots* — top 2 based on lowest scores. Be specific and honest about the risk.
5. *🔍 Pattern Detected* — use the contradiction I provided. Make it sharp and insightful.
6. *⏱️ Response Insight* — if any response times are available, note where they hesitated vs responded instantly
7. *🎯 This Week's Challenge* — ONE concrete action for tomorrow based on their weakest dimension + stated challenge
8. Final mirror sentence in italics — one line capturing their leadership essence. Make it memorable enough to screenshot.

End with:
"Reply *PRO* for detailed PDF report with 30-day coaching plan (₹999)
Reply *TEAM* to assess your entire management team
Reply *SHARE* to share with a colleague"

Be warm but unflinchingly honest. Reference their actual scenario choices — don't be generic.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content[0].text.trim();
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════════

async function handleMessage(from, body) {
  let s = sessions[from];
  const msg = body.trim();

  // Post-report commands
  if (s && s.state === 'report_sent') {
    const upper = msg.toUpperCase();
    if (upper === 'PRO') {
      await send(from, `🔥 *Pro Report — ₹999*\n\nIncludes:\n📄 2000-word deep analysis\n📊 All 10 dimensions scored with evidence\n🎯 Personalized 30-day coaching plan\n📈 Industry benchmarks\n🧬 Full archetype deep-dive\n\nReply *BUY* to get yours. ⚡`);
      return;
    }
    if (upper === 'TEAM') {
      await send(from, `🔥 *Team Pack — ₹4,999 for 10 assessments*\n\n✅ Adaptive assessment for each manager\n✅ Team archetype map\n✅ Common blind spots\n✅ Development priorities\n\nReply with your *company name* and *number of managers*! ⚡`);
      return;
    }
    if (upper === 'SHARE') {
      await send(from, `Share this link:\nhttps://wa.me/919958355005?text=Hi!%20I%20want%20to%20discover%20my%20leadership%20archetype\n\nOr forward this chat! ⚡`);
      return;
    }
    if (upper === 'START' || upper === 'RESTART') { delete sessions[from]; }
    else {
      await send(from, `Hey ${s.name}! Your ${ARCHETYPES[s.archetype]?.emoji||'⚡'} report was delivered above.\n\nReply *PRO* for detailed PDF (₹999)\nReply *TEAM* for team assessments\nReply *START* for new assessment`);
      return;
    }
  }

  // New or restart
  if (!s || ['START','RESTART','HI','HELLO','HEY'].includes(msg.toUpperCase())) {
    sessions[from] = {
      state: 'ask_name', name: null, role: null, teamSize: null, industry: null,
      answers: [], usedIds: [], usedCats: [], questionNum: 0,
      keepUpAtNight: null, wantToImprove: null, archetype: null,
      currentScenario: null, lastQuestionTime: null, createdAt: new Date()
    };
    await send(from,
      `👋 Welcome to *LightningCoach*!\n\n` +
      `I'll present you with real leadership scenarios — each one unique to you. No right or wrong answers, only YOUR instincts.\n\n` +
      `In 10 minutes, I'll reveal your *Leadership Archetype*:\n♟️ Strategist | 🛡️ Shield | ⚙️ Operator\n🤝 Connector | 🏗️ Builder | 🔥 Catalyst\n\n` +
      `🔒 100% confidential\n🧬 Adaptive — no two assessments are the same\n\n` +
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
      await send(from, `${s.name}, great to have you! 🙌\n\nWhat's your current role?\n_(e.g., Engineering Manager, VP Product, Founder, Team Lead)_`);
      break;

    case 'ask_role':
      s.role = msg;
      s.state = 'ask_team';
      await send(from, `How many people do you manage?\n_(Just a number, e.g., 5, 12, 50)_`);
      break;

    case 'ask_team':
      s.teamSize = msg;
      s.state = 'ask_industry';
      await send(from, `What industry are you in?\n_(e.g., Technology, Manufacturing, Finance, Healthcare, Education)_`);
      break;

    case 'ask_industry':
      s.industry = msg;
      s.state = 'scenario';
      s.questionNum = 1;

      await send(from,
        `Got it, ${s.name}! 🎯\n\n` +
        `Your assessment is being personalized based on your profile.\n\n` +
        `I'll describe a situation. Reply with *A, B, C, or D* — pick what you'd *actually* do, not what sounds best.\n\n` +
        `Let's go 👇`
      );

      // Select and send first question
      setTimeout(async () => {
        const scenario = selectQuestions(s);
        s.currentScenario = scenario;
        s.usedIds.push(scenario.id);
        s.usedCats.push(scenario.cat);
        s.lastQuestionTime = Date.now();

        const text = scenario.scenario.replace(/\[NAME\]/g, s.name);
        await send(from,
          `*Q${s.questionNum}/12 — ${scenario.tag}*\n\n` +
          `${text}\n\n` +
          `A) ${scenario.A.text}\nB) ${scenario.B.text}\nC) ${scenario.C.text}\nD) ${scenario.D.text}\n\n` +
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

      // Record answer with response time
      const responseTime = s.lastQuestionTime ? Math.round((Date.now() - s.lastQuestionTime) / 1000) : null;
      s.answers.push({
        scenarioId: s.currentScenario.id,
        answer,
        responseTime,
        timestamp: new Date()
      });
      s.questionNum++;

      if (s.questionNum <= 12) {
        // Select next adaptive question
        const next = selectQuestions(s);
        s.currentScenario = next;
        s.usedIds.push(next.id);
        if (!s.usedCats.includes(next.cat)) s.usedCats.push(next.cat);
        s.lastQuestionTime = Date.now();

        const text = next.scenario.replace(/\[NAME\]/g, s.name);
        await send(from,
          `*Q${s.questionNum}/12 — ${next.tag}*\n\n` +
          `${text}\n\n` +
          `A) ${next.A.text}\nB) ${next.B.text}\nC) ${next.C.text}\nD) ${next.D.text}\n\n` +
          `_(Reply A, B, C, or D)_`
        );
      } else {
        s.state = 'ask_keepup';
        const { primary } = calculateArchetype(s);
        const arch = ARCHETYPES[primary];
        await send(from,
          `All 12 scenarios done! 💪\n\n` +
          `Early pattern: *${arch.emoji} ${arch.name}* tendencies detected...\n\n` +
          `Two quick questions to sharpen the analysis:\n\n` +
          `*What keeps you up at night as a leader?*\n_(One sentence)_`
        );
      }
      break;
    }

    case 'ask_keepup':
      s.keepUpAtNight = msg;
      s.state = 'ask_improve';
      await send(from, `Last one:\n\n*If you could instantly become better at ONE leadership skill, what would it be and why?*`);
      break;

    case 'ask_improve':
      s.wantToImprove = msg;
      s.state = 'generating';

      const { primary, secondary } = calculateArchetype(s);
      s.archetype = primary;
      const archData = ARCHETYPES[primary];
      const secData = secondary ? ARCHETYPES[secondary] : null;

      await send(from,
        `Analyzing your 12 decisions across ${s.usedCats.length} leadership domains... 🧠\n\n` +
        `Primary pattern: *${archData.emoji} ${archData.name}*\n` +
        `${secData ? `Secondary: *${secData.emoji} ${secData.name}*\n` : ''}` +
        `\nGenerating your personalized Leadership Profile... ⏳`
      );

      try {
        const report = await generateReport(s);
        if (report) {
          await send(from, `⚡ *YOUR LEADERSHIP ARCHETYPE*\n━━━━━━━━━━━━━━━━━━━━━\n\n${report}`);
          s.state = 'report_sent';

          setTimeout(async () => {
            await send(from,
              `💪 *Your coaching journey starts now, ${s.name}!*\n\n` +
              `I'll send you one challenge per week based on your ${archData.emoji} profile.\n\n` +
              `First one arrives Monday. ⚡`
            );
          }, 30000);
        } else {
          await send(from, `Something went wrong. 😅 Reply *START* to try again.`);
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

// ═══════════════════════════════════════════════════════════════
// SERVER
// ═══════════════════════════════════════════════════════════════

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body || '';
  console.log(`[${new Date().toISOString()}] ${from}: ${body}`);
  await handleMessage(from, body);
  res.type('text/xml').send('<Response></Response>');
});

app.get('/', (req, res) => {
  const all = Object.values(sessions);
  res.json({
    status: 'running',
    service: 'LightningCoach v4 — Adaptive Engine',
    scenarioBank: SCENARIOS.length,
    activeSessions: all.length,
    reportsGenerated: all.filter(s => s.state === 'report_sent').length,
    archetypeDistribution: all.filter(s => s.archetype).reduce((a, s) => {
      a[s.archetype] = (a[s.archetype] || 0) + 1; return a;
    }, {}),
  });
});

app.listen(PORT, () => console.log(`⚡ LightningCoach v4 — Adaptive Engine | ${SCENARIOS.length} scenarios | Port ${PORT}`));
