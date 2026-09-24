// ============================================================
// Trivia Quiz — PERSONAL / DM VERSION
// ------------------------------------------------------------
// Whoever triggers the quiz (in any channel) gets the whole
// quiz privately in their own DM with the bot. Nobody else sees
// it. No answer is revealed question-by-question — everything
// is shown only in the final summary, with an emoji breakdown
// (correct answer shown for wrong ones).
//
// Drop this file in as trivia-quiz.js, right next to index.js.
// index.js does NOT need any changes — it already calls:
//   await startQuiz(client, userId, subject, difficulty, questionCount);
// and userId is exactly what this version needs.
// ============================================================

// ---- 1. In-memory session store ----------------------------
// Keyed by userId now (not channel), since this is single-user.
// sessions[userId] = {
//   subject, difficulty, totalQuestions,
//   questions: [ { question, correct_answer, options: [...] }, ... ],
//   currentIndex: 0,
//   correct: 0,
//   answers: [ { qIndex, chosen, isCorrect } ]
// }
const sessions = {};

// ---- 2. Category map -----------------------------------------
// The Trivia API (the-trivia-api.com) uses text slugs, not numeric IDs.
// Matches your six subject buttons: Science, History, Geography,
// Maths, Politics, General Knowledge. No dedicated Maths or Politics
// category exists here either, so they map to the closest real ones.
const CATEGORY_MAP = {
  science: "science",
  history: "history",
  geography: "geography",
  maths: "science",              // closest available — no pure-maths category
  politics: "society_and_culture", // closest available — no politics category
  general: "general_knowledge",
};

// ---- 3. Helper: decode HTML entities from OpenTDB -------------
function decodeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d")
    .replace(/&rsquo;/g, "\u2019");
}

// ---- 4. Helper: shuffle an array (Fisher–Yates) ----------------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 5. Fetch questions from The Trivia API --------------------
// Docs: https://the-trivia-api.com  (different server than OpenTDB —
// use this if opentdb.com is blocked/unreachable on your network)
async function fetchQuestions(subject, difficulty, amount) {
  const category = CATEGORY_MAP[subject.toLowerCase()];
  const url = new URL("https://the-trivia-api.com/v2/questions");
  url.searchParams.set("limit", String(amount));
  if (category) url.searchParams.set("categories", category);
  if (difficulty) url.searchParams.set("difficulties", difficulty.toLowerCase());

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      "Couldn't fetch that many questions for this subject/difficulty combo. Try a smaller number."
    );
  }
  const data = await res.json();

  // The Trivia API already gives plain text (no HTML entities to decode)
  // and separate correctAnswer / incorrectAnswers fields.
  return data.map((q) => {
    const correct = q.correctAnswer;
    const incorrect = q.incorrectAnswers;
    const options = shuffle([correct, ...incorrect]);
    return {
      question: q.question.text,
      correct_answer: correct,
      options,
    };
  });
}

// ---- 6. Build the Block Kit message for one question ------------
function buildQuestionBlocks(session) {
  const q = session.questions[session.currentIndex];
  const qNum = session.currentIndex + 1;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Question ${qNum}/${session.totalQuestions}*\n${q.question}`,
      },
    },
    {
      type: "actions",
      block_id: `quiz_answer_block_${session.currentIndex}`,
      elements: q.options.map((opt, i) => ({
        type: "button",
        text: { type: "plain_text", text: opt },
        action_id: `quiz_answer_${session.currentIndex}_${i}`,
        value: JSON.stringify({ qIndex: session.currentIndex, chosen: opt }),
      })),
    },
  ];
}

// ---- 7. Post the current question, DMed to the user --------------
async function postCurrentQuestion(client, userId) {
  const session = sessions[userId];
  await client.chat.postMessage({
    channel: userId, // DM — Slack opens/uses the user's DM channel with the bot
    text: `Question ${session.currentIndex + 1}`,
    blocks: buildQuestionBlocks(session),
  });
}

// ---- 8. Kick off the quiz -----------------------------------------
// Called from index.js as:
//   await startQuiz(client, userId, subject, difficulty, questionCount);
async function startQuiz(client, userId, subject, difficulty, questionCount) {
  const questions = await fetchQuestions(subject, difficulty, questionCount);

  sessions[userId] = {
    subject,
    difficulty,
    totalQuestions: questionCount,
    questions,
    currentIndex: 0,
    correct: 0,
    answers: [],
  };

  await postCurrentQuestion(client, userId);
}

// ---- 9. Handle a button click on any quiz answer ------------------
function registerQuizActions(app) {
  app.action(/^quiz_answer_\d+_\d+$/, async ({ ack, body, client }) => {
    await ack();

    const userId = body.user.id;
    const session = sessions[userId];
    if (!session) return; // stale button / no active session

    const { qIndex, chosen } = JSON.parse(body.actions[0].value);

    // Only accept an answer for the question currently being shown,
    // and only once.
    if (qIndex !== session.currentIndex) return;
    const alreadyAnswered = session.answers.some((a) => a.qIndex === qIndex);
    if (alreadyAnswered) return;

    const q = session.questions[qIndex];
    const isCorrect = chosen === q.correct_answer;

    session.answers.push({ qIndex, chosen, isCorrect });
    if (isCorrect) session.correct += 1;

    // No reveal here on purpose — silently recorded.

    const isLastQuestion = session.currentIndex === session.totalQuestions - 1;

    if (!isLastQuestion) {
      session.currentIndex += 1;
      await postCurrentQuestion(client, userId);
    } else {
      await postFinalSummary(client, userId);
      delete sessions[userId]; // clean up
    }
  });
}

// ---- 10. Final summary with emoji breakdown -----------------------
async function postFinalSummary(client, userId) {
  const session = sessions[userId];

  const breakdownLines = session.answers
    .sort((a, b) => a.qIndex - b.qIndex)
    .map(({ qIndex, chosen, isCorrect }) => {
      const q = session.questions[qIndex];
      const emoji = isCorrect ? "\u2705" : "\u274c";
      let line = `${emoji} *Q${qIndex + 1}:* ${q.question}\nYour answer: ${chosen}`;
      if (!isCorrect) line += `\nCorrect answer: *${q.correct_answer}*`;
      return line;
    })
    .join("\n\n");

  await client.chat.postMessage({
    channel: userId,
    text: `You scored ${session.correct}/${session.totalQuestions}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Your score: ${session.correct}/${session.totalQuestions}*`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: breakdownLines },
      },
    ],
  });
}

module.exports = { startQuiz, registerQuizActions };
