import "dotenv/config"
import { getRPSChoices } from "./game.js"
import { capitalize, InstallGlobalCommands } from "./utils.js"
import { getScanChoices } from "./wordle.js"

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices()
  const commandChoices = []

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    })
  }

  return commandChoices
}

function createScanChoices() {
  // const choices = getScanChoices()
  const choices = getScanChoices()
  const commandChoices = []

  for (let [key, choice] of choices) {
    commandChoices.push({
      // name: capitalize(choice),
      name: choice.title,
      description: choice.description,
      // value: choice.toLowerCase(),
      value: key,
    })
  }

  return commandChoices
}

// Simple test command
const TEST_COMMAND = {
  name: "test",
  description: "Basic command",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
}

// Command containing options
const CHALLENGE_COMMAND = {
  name: "challenge",
  description: "Challenge to a match of rock paper scissors",
  options: [
    {
      type: 3,
      name: "object",
      description: "Pick your object",
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
}

// const WORDLE_LEADERBOARD_COMMAND = {
//   name: "wordle_leaderboard",
//   description: "Check the Wordle Leaderboard",
//   type: 1,
//   // options: [
//   //   {
//   //     type: 2,
//   //     name: "something?",
//   //     description: "What leaderboard?",
//   //     required: false,
//   //     choices: ["daily", "weekly", "monthly"],
//   //   },
//   // ],
// }

const SCAN_USERS_COMMAND = {
  name: "scan_users",
  description: "Scan and list all users in the guild",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
}

const INIT_COMMAND = {
  name: "init",
  description: "Initialize the leaderboard and scrape the channel for users and scores",
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
}

const SCRAPE_SCORES_COMMAND = {
  name: "scrape_scores",
  description: "Scrape the channel for Wordle scores",
  options: [
    {
      type: 3,
      name: "range",
      description:
        "Scrape messages until this date (YYYY-MM-DD). Defaults to the beginning of Wordle.",
      required: true,
      choices: createScanChoices(),
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
}

// const ALL_COMMANDS = [TEST_COMMAND, CHALLENGE_COMMAND, WORDLE_LEADERBOARD_COMMAND]

const ALL_COMMANDS = [
  INIT_COMMAND,
  TEST_COMMAND,
  CHALLENGE_COMMAND,
  SCAN_USERS_COMMAND,
  SCRAPE_SCORES_COMMAND,
]

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS)
