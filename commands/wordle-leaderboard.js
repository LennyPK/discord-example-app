import { InteractionResponseType } from "discord-interactions"
import { findUserByMentionOrName } from "../database.js"
import { prisma } from "../prisma-client.js"
import { wordleScore } from "../wordle.js"

export async function handleWordleLeaderboardCommand(req, res) {
  const { id } = req.body

  // Interaction context
  const context = req.body.context
  // User ID is in user field for (G)DMs, and member for servers
  const userId = context === 0 ? req.body.member.user.id : req.body.user.id
  // Leaderboard type choice
  const leaderboardType = req.body.data.options[0].value

  const commandUser = await findUserByMentionOrName(userId, null)

  console.info(`Generating ${leaderboardType} leaderboard and fetching all users...`)

  const users = await prisma.user.findMany()
  console.info("Fetched users for leaderboard:", users.length)

  const leaderboard = []

  for (const user of users) {
    // Fetch wordle scores for the user based on the leaderboard type
    const now = new Date()
    let sinceDate = new Date()

    console.info("Weekly:")

    if (leaderboardType === "weekly") {
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (leaderboardType === "monthly") {
      sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else {
      sinceDate = new Date(0) // all time
    }

    const wordleScores = await prisma.wordle.findMany({
      where: {
        userId: user.id,
        date: {
          gte: sinceDate,
        },
      },
      orderBy: {
        score: "desc",
      },
    })

    console.info(
      `Fetched ${wordleScores.length} Wordle scores for user ${user.username} since ${sinceDate}`
    )

    // console.info("Wordle scores for user:", wordleScores)

    // Calculate leaderboard score
    const gamesPlayed = wordleScores.length
    const maxGames = leaderboardType === "weekly" ? 7 : 30
    const solvedGames = wordleScores.filter((w) => w.score > 0)
    const solveRate = gamesPlayed > 0 ? solvedGames.length / gamesPlayed : 0
    const avgGuesses = solvedGames.reduce((sum, w) => sum + w.score, 0) / (solvedGames.length || 1)
    const leaderboardScore = wordleScore(gamesPlayed, maxGames, solveRate, avgGuesses)

    console.info(`Leaderboard score for user ${user.username}:`, leaderboardScore)

    if (leaderboardScore > 0) {
      leaderboard.push({
        id: user.discordId,
        username: user.username,
        score: leaderboardScore,
        gamesPlayed: gamesPlayed,
        totalGames:
          leaderboardType === "weekly" ? 7 : leaderboardType === "monthly" ? 30 : gamesPlayed,
      })
    }
  }

  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: `Leaderboard for ${leaderboardType}`,
          description: leaderboard
            .sort((a, b) => b.score - a.score)
            .map((entry, index) => {
              let line = `${index + 1}. <@${entry.id}>: ${entry.score.toFixed(2)}`

              // Add conditional info based on leaderboard type
              if (leaderboardType === "weekly") {
                line += ` — Played ${entry.gamesPlayed}/${entry.totalGames} games`
              } else if (leaderboardType === "monthly") {
                line += ` — Played ${entry.gamesPlayed}/${entry.totalGames} games`
              } else if (leaderboardType === "allTime") {
                line += ` — Played ${entry.totalGames} games`
              }

              return line
            })
            .join("\n"),
          footer: {
            text: `Requested by ${commandUser.globalName} at ${new Date().toLocaleString()}`,
          },
          color: 5763719,
        },
      ],
    },
  })
}
