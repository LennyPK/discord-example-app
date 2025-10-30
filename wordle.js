import { DiscordRequest, wait } from "./utils.js"

export const scanChoices = {
  default: {
    title: "All Messages",
    description: "Scan all messages in the channel (Since May 2025)",
  },
  week: {
    title: "Last 7 Days",
    description: "Scan messages from the last 7 days",
  },
  month: {
    title: "Last Month",
    description: "Scan messages from the last 30 days",
  },
}

export function getScanChoices() {
  return Object.entries(scanChoices)
}

export const leaderboardChoices = {
  allTime: {
    title: "All Time",
    description: "View the all-time Wordle leaderboard",
  },
  weekly: {
    title: "Weekly",
    description: "View the weekly Wordle leaderboard",
  },
  monthly: {
    title: "Monthly",
    description: "View the monthly Wordle leaderboard",
  },
}

export function getLeaderboardChoices() {
  return Object.entries(leaderboardChoices)
}

export async function fetchMessagesUntil(channelId, timestamp) {
  let allMessages = []
  let beforeId = undefined
  const limit = 100
  const untilDate = new Date(timestamp)

  while (true) {
    let endpoint = `channels/${channelId}/messages?limit=${limit}`
    if (beforeId) endpoint += `&before=${beforeId}`

    const messagesRes = await DiscordRequest(endpoint, { method: "GET" })
    const messages = await messagesRes.json()

    if (!messages.length) break

    let reachedUntil = false

    for (const message of messages) {
      const messageDate = new Date(message.timestamp)
      if (messageDate < untilDate) {
        // return allMessages
        reachedUntil = true
        break
      }
      allMessages.push(message)
    }

    if (reachedUntil) break
    // allMessages.push(...messages)
    beforeId = messages[messages.length - 1].id

    await wait(500)

    console.log("Next batch, total messages so far:", allMessages.length)
  }

  return allMessages
}

/**
 * Calculate a Wordle leaderboard score for a player.
 *
 * @param {number} gamesPlayed - Number of Wordles the player has completed.
 * @param {number} maxGames - Total number of Wordles possible (e.g., days in the period).
 * @param {number} solveRate - Fraction of games solved successfully (0 to 1).
 * @param {number} avgGuesses - Average number of guesses (only for solved games).
 * @returns {number} Player's leaderboard score (0–100 scale).
 */

export function wordleScore(gamesPlayed, maxGames, solveRate, avgGuesses) {
  /** CHATGPT
  if (maxGames === 0 || avgGuesses <= 0) return 0;

  // Step 1: Skill-based efficiency (normalized out of 100)
  const efficiency = 100 * ((solveRate * (6 - avgGuesses)) / 6);

  // Step 2: Participation multiplier (weights frequency at 30%)
  const participationMultiplier = 0.7 + 0.3 * (gamesPlayed / maxGames);

  // Step 3: Final composite score
  const finalScore = efficiency * participationMultiplier;

  // Keep it in a 0–100 range
  return Math.max(0, Math.min(100, finalScore));
	*/

  /** CLAUDE CODE */
  if (maxGames === 0 || gamesPlayed === 0) return 0
  if (solveRate === 0) return 0 // No solved games = 0 score
  if (avgGuesses < 1 || avgGuesses > 6) return 0 // Invalid avg

  // Solve rate component (0-50 points)
  const solveBonus = solveRate * 50

  // Guess efficiency component (0-50 points, only counts solved games)
  const guessEfficiency = ((6 - avgGuesses) / 5) * 50

  // Combined skill score (0-100 points)
  const skillScore = solveBonus + guessEfficiency

  // Participation multiplier (70% baseline + 30% for consistency)
  const participationMultiplier = 0.7 + 0.3 * (gamesPlayed / maxGames)
  // const participationMultiplier = Math.max(0.5, 0.7 + 0.3 * (gamesPlayed / maxGames))

  return skillScore * participationMultiplier
}

// Example usage:
// console.log(wordleScore(30, 30, 1.0, 3.8)) // Alice → ~43.5
// console.log(wordleScore(20, 30, 0.95, 3.4)) // Bob → ~42.9
// console.log(wordleScore(10, 30, 1.0, 3.1)) // Dan → ~35.7
