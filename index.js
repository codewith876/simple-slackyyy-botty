require("dotenv").config();
const axios = require("axios");
const { App } = require("@slack/bolt");
const cron = require("node-cron");
const Database = require("better-sqlite3");
const db = new Database("birthdays.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS birthdays (
    user_id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    day TEXT NOT NULL
  )
`);

function saveBirthday(userId, month, day) {
  db.prepare(`
    INSERT INTO birthdays (user_id, month, day)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET month = excluded.month, day = excluded.day
  `).run(userId, month, day);
}

function getBirthdaysForToday(month, day) {
  return db.prepare(`SELECT user_id FROM birthdays WHERE month = ? AND day = ?`).all(month, day);
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

// Add this near the top of index.js, with your other require lines:
const { startQuiz, registerQuizActions } = require("./trivia-quiz");
registerQuizActions(app);

app.command("/simple-slackyyy-botty-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});
app.command("/simple-slackyyy-botty-help", async ({ ack, respond }) => {
  await ack();
  await respond({
    text:
      `Available Commands:
      /simple-slackyyy-botty-ping - Check bot latency
      /simple-slackyyy-botty-catfact - Get a random cat fact
      /simple-slackyyy-botty-joke - Get a random joke from the internet
      /simple-slackyyy-botty-weather [city name] - Get current weather, high/low temps, air quality, and UV index
      /simple-slackyyy-botty-birthday [MM-DD] - Save your birthday so the bot can wish you
      /simple-slackyyy-botty-quiz - Take a quiz - pick a subject, difficulty, and number of questions`

  });
});
app.command("/simple-slackyyy-botty-catfact", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await fetch("https://catfact.ninja/fact");
    const data = await response.json();
    await respond({ text: `🐱 Cat Fact: ${data.fact}` });
  } catch (error) {
    await respond({ text: "Sorry, couldn't fetch a cat fact right now!" });
  }
});
app.command("/simple-slackyyy-botty-joke", async ({ ack, respond }) => {
  await ack();
  try {
    const response = await axios.get("https://official-joke-api.appspot.com/random_joke");
    await respond({
      text: `${response.data.setup}\n\n${response.data.punchline}`
    });
  } catch (err) {
    await respond({ text: "Failed to fetch a joke." });
  }
});

function getWeatherInfo(code) {
  const map = {
    0: ["☀️", "Clear sky"],
    1: ["🌤", "Mainly clear"],
    2: ["⛅", "Partly cloudy"],
    3: ["☁️", "Overcast"],
    45: ["🌫", "Fog"],
    48: ["🌫", "Depositing rime fog"],
    51: ["🌦", "Light drizzle"],
    61: ["🌧", "Slight rain"],
    63: ["🌧", "Moderate rain"],
    65: ["🌧", "Heavy rain"],
    71: ["❄️", "Slight snow"],
    73: ["❄️", "Moderate snow"],
    75: ["❄️", "Heavy snow"],
    80: ["🌦", "Rain showers"],
    95: ["⛈", "Thunderstorm"],
  };
  return map[code] || ["🌡", "Unknown conditions"];
}

function degToCompass(deg) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

function getAqiLabel(aqi) {
  if (aqi <= 50) return "Good 🟢";
  if (aqi <= 100) return "Moderate 🟡";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups 🟠";
  if (aqi <= 200) return "Unhealthy 🔴";
  if (aqi <= 300) return "Very Unhealthy 🟣";
  return "Hazardous ⚫";
}
app.command("/simple-slackyyy-botty-weather", async ({ command, ack, respond }) => {
  await ack();

  const city = command.text.trim();

  if (!city) {
    await respond({ text: "Please type a city name, like `/simple-slackyyy-botty-weather London`" });
    return;
  }

  try {
    // Step 1: Convert city name to coordinates
    const geoResponse = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );

    if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
      await respond({ text: `Couldn't find a place called "${city}". Try a different spelling?` });
      return;
    }

    const place = geoResponse.data.results[0];
    const { latitude, longitude, name, country } = place;

    // Step 2: Get current weather (temp, feels-like, humidity, wind, UV)
    const weatherResponse = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,uv_index&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    );

    // Step 3: Get air quality (AQI)
    const airResponse = await axios.get(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`
    );

    const current = weatherResponse.data.current;
    const temp = current.temperature_2m;
    const feelsLike = current.apparent_temperature;
    const humidity = current.relative_humidity_2m;
    const windSpeed = current.wind_speed_10m;
    const windDir = degToCompass(current.wind_direction_10m);
    const uvIndex = current.uv_index;
    const [emoji, description] = getWeatherInfo(current.weather_code);

    const aqi = airResponse.data.current.us_aqi;
    const aqiLabel = getAqiLabel(aqi);

    const maxTemp = weatherResponse.data.daily.temperature_2m_max[0];
    const minTemp = weatherResponse.data.daily.temperature_2m_min[0];

    // Step 4: Reply using Block Kit
    await respond({
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `${emoji} Weather in ${name}, ${country}` }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Conditions:*\n${description}` },
            { type: "mrkdwn", text: `*Temperature:*\n${temp}°C` },
            { type: "mrkdwn", text: `*High / Low:*\n${maxTemp}°C / ${minTemp}°C` },
            { type: "mrkdwn", text: `*Feels like:*\n${feelsLike}°C` },
            { type: "mrkdwn", text: `*Humidity:*\n${humidity}%` },
            { type: "mrkdwn", text: `*Wind:*\n${windSpeed} km/h ${windDir}` },
            { type: "mrkdwn", text: `*UV Index:*\n${uvIndex}` },
            { type: "mrkdwn", text: `*Air Quality:*\n${aqi} (${aqiLabel})` }
          ]
        },
        { type: "divider" }
      ]
    });
  } catch (err) {
    console.error(err);
    await respond({ text: "Sorry, couldn't fetch the weather right now!" });
  }
});

app.command("/simple-slackyyy-botty-birthday", async ({ command, ack, respond }) => {
  await ack();

  const input = command.text.trim();
  const match = input.match(/^(\d{2})-(\d{2})$/);

  if (!match) {
    await respond({ text: "Please use the format MM-DD, like `/simple-slackyyy-botty-birthday 09-22` for September 22nd." });
    return;
  }
  const [_, month, day] = match;
  saveBirthday(command.user_id, month, day);

  await respond({ text: `🎂 Got it! I'll remember your birthday is ${month}-${day}.` });
});

cron.schedule("0 9 * * *", async () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  const todaysBirthdays = getBirthdaysForToday(month, day);

  for (const { user_id } of todaysBirthdays) {
    await app.client.chat.postMessage({
      channel: "#bot-spam",
      text: `🎉🎂 Happy Birthday <@${user_id}>! Hope you have an amazing day! 🎈`
    });
  }
});

app.command("/simple-slackyyy-botty-quiz", async ({ command, ack, respond }) => {
  await ack();

  await respond({
    text: "Choose a subject for your quiz:",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Step 1: Choose a subject for your quiz*" }
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "Science" }, action_id: "quiz_subject_science", value: "science" },
          { type: "button", text: { type: "plain_text", text: "History" }, action_id: "quiz_subject_history", value: "history" },
          { type: "button", text: { type: "plain_text", text: "Geography" }, action_id: "quiz_subject_geography", value: "geography" },
          { type: "button", text: { type: "plain_text", text: "Maths" }, action_id: "quiz_subject_maths", value: "maths" },
          { type: "button", text: { type: "plain_text", text: "Politics" }, action_id: "quiz_subject_politics", value: "politics" },
          { type: "button", text: { type: "plain_text", text: "General Knowledge" }, action_id: "quiz_subject_general", value: "general" }
        ]
      }
    ]
  });
});

const quizSubjects = ["science", "history", "geography", "maths", "politics", "general"];

quizSubjects.forEach((subject) => {
  app.action(`quiz_subject_${subject}`, async ({ ack, body, respond }) => {
    await ack();

    await respond({
      text: `Subject selected: ${subject}`,
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Subject:* ${subject}\n*Step 2: Choose a difficulty level*` }
        },
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Easy" }, action_id: `quiz_difficulty_easy_${subject}`, value: "easy" },
            { type: "button", text: { type: "plain_text", text: "Medium" }, action_id: `quiz_difficulty_medium_${subject}`, value: "medium" },
            { type: "button", text: { type: "plain_text", text: "Hard" }, action_id: `quiz_difficulty_hard_${subject}`, value: "hard" }
          ]
        }
      ]
    });
  });
});

const quizDifficulties = ["easy", "medium", "hard"];

quizSubjects.forEach((subject) => {
  quizDifficulties.forEach((difficulty) => {
    app.action(`quiz_difficulty_${difficulty}_${subject}`, async ({ ack, body, respond }) => {
      await ack();

      await respond({
        text: `Difficulty selected: ${difficulty}`,
        replace_original: true,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*Subject:* ${subject}\n*Difficulty:* ${difficulty}\n*Step 3: How many questions?*` }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Choose number of questions" },
                action_id: "quiz_open_modal",
                value: JSON.stringify({ subject, difficulty })
              }
            ]
          }
        ]
      });
    });
  });
});

app.action("quiz_open_modal", async ({ ack, body, client }) => {
  await ack();

  const { subject, difficulty } = JSON.parse(body.actions[0].value);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "quiz_question_count_modal",
      private_metadata: JSON.stringify({ subject, difficulty }),
      title: { type: "plain_text", text: "Quiz Setup" },
      submit: { type: "plain_text", text: "Start Quiz" },
      blocks: [
        {
          type: "input",
          block_id: "question_count_block",
          element: {
            type: "plain_text_input",
            action_id: "question_count_input",
            placeholder: { type: "plain_text", text: "Enter a number, e.g. 50" }
          },
          label: { type: "plain_text", text: "How many questions? (1 to 100)" }
        }
      ]
    }
  });
});

app.view("quiz_question_count_modal", async ({ ack, body, view, client }) => {
  const { subject, difficulty } = JSON.parse(view.private_metadata);
  const questionCount = parseInt(view.state.values.question_count_block.question_count_input.value, 10);

  if (isNaN(questionCount) || questionCount < 1 || questionCount > 100) {
    await ack({
      response_action: "errors",
      errors: {
        question_count_block: "Please enter a number between 1 and 100"
      }
    });
    return;
  }

  await ack();

  const userId = body.user.id;

  await client.chat.postMessage({
    channel: userId,
    text: `Quiz starting! Subject: ${subject}, Difficulty: ${difficulty}, Questions: ${questionCount}`
  });

  // Add this inside your quiz_question_count_modal handler, right after
  // your "Quiz starting!" postMessage call:
  await startQuiz(client, userId, subject, difficulty, questionCount);
});

// GitHub webhook endpoint - posts PR updates to Slack
app.receiver.router.use(require('express').json());

app.receiver.router.post('/github/webhook', async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  // Respond immediately so GitHub doesn't time out
  res.status(200).send('OK');

  // Only handle pull_request events for now
  if (event === 'pull_request') {
    const action = payload.action; // opened, closed, reopened, etc.
    const pr = payload.pull_request;
    const repo = payload.repository.full_name;

    let text;
    if (action === 'opened') {
      text = `🔀 *New PR opened* in \`${repo}\`\n<${pr.html_url}|${pr.title}> by ${pr.user.login}`;
    } else if (action === 'closed' && pr.merged) {
      text = `✅ *PR merged* in \`${repo}\`\n<${pr.html_url}|${pr.title}> by ${pr.user.login}`;
    } else if (action === 'closed') {
      text = `❌ *PR closed (not merged)* in \`${repo}\`\n<${pr.html_url}|${pr.title}>`;
    } else {
      return; // skip other actions like "synchronize", "labeled", etc.
    }

    try {
      await app.client.chat.postMessage({
        channel: 'C0P5NE354', // replace with your channel ID
        text,
      });
    } catch (err) {
      console.error('Failed to post GitHub update to Slack:', err);
    }
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);

  console.log("⚡ Simple Slacky Botty is running!");
})()
