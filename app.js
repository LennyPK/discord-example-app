import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from "discord-interactions"
import "dotenv/config"
import express from "express"
import { findUserByMentionOrName, saveMembers } from "./database.js"
import { getResult, getShuffledOptions } from "./game.js"
import { prisma } from "./prisma-client.js"
import { DiscordRequest, getRandomEmoji } from "./utils.js"
import { fetchMessagesUntil, wordleScore } from "./wordle.js"

// Create an express app
const app = express()
// Get port, or default to 3000
const PORT = process.env.PORT || 3000
// To keep track of our active games
const activeGames = {}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post("/interactions", verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type, data, and other properties
  const { id, type, data, guild_id, token } = req.body

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG })
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data

    // "test" command
    if (name === "test") {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`,
            },
          ],
        },
      })
    }

    // "challenge" command
    if (name === "challenge" && id) {
      // Interaction context
      const context = req.body.context
      // User ID is in user field for (G)DMs, and member for servers
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id
      // User's object choice
      const objectName = req.body.data.options[0].value

      // Create active game using message ID as the game ID
      activeGames[id] = {
        id: userId,
        objectName,
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `Rock papers scissors challenge from <@${userId}>`,
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.BUTTON,
                  // Append the game ID to use later on
                  custom_id: `accept_button_${req.body.id}`,
                  label: "Accept",
                  style: ButtonStyleTypes.PRIMARY,
                },
              ],
            },
          ],
        },
      })
    }

    if (name === "wordle_leaderboard" && id) {
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
        const maxGames = name === "weekly" ? 7 : 30
        const solvedGames = wordleScores.filter((w) => w.score > 0)
        const solveRate = gamesPlayed > 0 ? solvedGames.length / gamesPlayed : 0
        const avgGuesses =
          solvedGames.reduce((sum, w) => sum + w.score, 0) / (solvedGames.length || 1)
        const leaderboardScore = wordleScore(gamesPlayed, maxGames, solveRate, avgGuesses)

        console.info(`Leaderboard score for user ${user.username}:`, leaderboardScore)

        if (leaderboardScore > 0) {
          leaderboard.push({
            id: user.discordId,
            username: user.username,
            score: leaderboardScore,
            weeklyGames: gamesPlayed,
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
                    line += ` — Played ${entry.weeklyGames}/${entry.totalGames} games`
                  } else if (leaderboardType === "monthly") {
                    line += ` — Played ${entry.monthlyGames}/${entry.totalGames} games`
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

    if (name === "scan_users") {
      // Acknowledge the command and defer the response.
      // This is important for commands that may take longer than 3 seconds.
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      })

      try {
        // Fetch all members from the guild.
        // The API has a limit of 1000 members per request.
        // const endpoint = `guilds/${guild_id}/members?limit=1000`
        const endpoint = `guilds/${guild_id}/members?limit=1000`
        const membersRes = await DiscordRequest(endpoint, { method: "GET" })
        const members = await membersRes.json()

        // Extract user info and filter out bots
        const membersToSave = members.filter((member) => !member.user.bot)
        // members.map((member) => member.user).filter((user) => !user.bot)

        // Save users to the database
        const count = await saveMembers(membersToSave)

        // Edit the original deferred message with the result
        const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
        await DiscordRequest(followupEndpoint, {
          method: "PATCH",
          body: { content: `Successfully scanned and saved ${count} users.` },
        })
      } catch (err) {
        console.error("Error scanning users:", err)
      }

      return
    }

    if (name === "scrape_scores") {
      // Acknowledge the command and defer the response.
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      })

      // User's object choice
      const scanUntil = req.body.data.options[0].value

      if (scanUntil) {
        console.info("Scrape until option selected:", scanUntil)
      }
      let untilTimestamp = new Date()

      console.info("untilTimestamp now:", untilTimestamp)

      if (scanUntil === "default") {
        untilTimestamp = new Date("2025-05-01").getTime()
        console.info("Scanning all messages since:", new Date(untilTimestamp))
      } else if (scanUntil === "week") {
        const now = new Date()
        untilTimestamp = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime()
        console.info("Scanning all messages since:", new Date(untilTimestamp))
      } else if (scanUntil === "month") {
        const now = new Date()
        untilTimestamp = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).getTime()
        console.info("Scanning all messages since:", new Date(untilTimestamp))
      }

      try {
        const channelId = req.body.channel_id

        const messages = await fetchMessagesUntil(channelId, untilTimestamp)

        const scoreRegex = /(?:👑)?\s*([1-6X])\/6:\s*(.*)/
        const userRegex = /(?:<@(\d+)>|@([a-zA-Z0-9_]+))/g

        let scoresFound = 0
        const wordlePromises = []

        console.info(`Fetched ${messages.length} messages, processing...`)

        for (const message of messages) {
          // console.info(message.content)

          // We are only interested in messages from our bot that contain "results"
          if (message.author.bot && message.content.includes("Here are yesterday's results")) {
            const lines = message.content.split("\n")

            const messageDate = new Date(message.timestamp)
            console.info("Message date:", messageDate)

            for (const line of lines) {
              console.info("Processing line", line)
              const scoreMatch = line.match(scoreRegex)
              if (!scoreMatch) continue

              console.info("-----------------------")
              // console.info("Found score match:", scoreMatch)
              console.info("Full match:", scoreMatch[0])
              console.info("Score value:", scoreMatch[1])
              console.info("Users part:", scoreMatch[2])
              console.info("-----------------------")

              const scoreValue = scoreMatch[1]
              const score = scoreValue === "X" ? 0 : parseInt(scoreValue, 10) // 'X' becomes 7
              const usersPart = scoreMatch[2]

              let userMatch
              while ((userMatch = userRegex.exec(usersPart)) !== null) {
                const discordId = userMatch[1]
                const username = userMatch[2]

                // console.info("Found user match:", userMatch[1])
                console.info("Processing user:", { discordId, username })

                wordlePromises.push(
                  (async () => {
                    const dbUser = await findUserByMentionOrName(discordId, username)

                    console.info("Found DB user:", dbUser)

                    if (dbUser) {
                      await prisma.wordle.create({
                        data: {
                          userId: dbUser.id,
                          score,
                          date: messageDate,
                        },
                      })
                      scoresFound++
                    }
                  })()
                )
              }
            }
          }
        }

        await Promise.all(wordlePromises)

        const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
        await DiscordRequest(followupEndpoint, {
          method: "PATCH",
          body: { content: `Scraping complete. Found and saved ${scoresFound} scores.` },
        })
      } catch (err) {
        console.error("Error scraping scores:", err)
        const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
        await DiscordRequest(followupEndpoint, {
          method: "PATCH",
          body: { content: "Sorry, something went wrong while scraping scores." },
        }).catch(console.error)
      }
      return
    }

    if (name === "init") {
      // Acknowledge the command and defer the response.
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      })

      try {
        // 1. Fetch all members from the guild.
        const endpoint = `guilds/${guild_id}/members?limit=1000`
        const membersRes = await DiscordRequest(endpoint, { method: "GET" })
        const members = await membersRes.json()

        // Extract user info and filter out bots
        const membersToSave = members.filter((member) => !member.user.bot)

        // Save users to the database
        const count = await saveMembers(membersToSave)

        // Edit the original deferred message with the result
        const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
        await DiscordRequest(followupEndpoint, {
          method: "PATCH",
          body: { content: `Successfully scanned and saved ${count} users.` },
        })
      } catch (err) {
        console.error("Error scanning users:", err)
      }

      try {
        // 2. Scrape channel messages for scores
      } catch (err) {
        console.error("Error scraping scores:", err)
      }
    }

    if (name === "my_stats") {
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      })

      const context = req.body.context
      const userId = req.body.member.user.id

      const user = await findUserByMentionOrName(userId, null)

      console.info("Fetching stats for user:", user)

      if (user) {
        const wordleStats = await prisma.wordle.aggregate({
          where: { userId: user.id },
          _count: { score: true },
          _avg: { score: true },
          _max: { score: true },
          _min: { score: true },
        })

        console.info("Wordle stats:", wordleStats)

        const followupEndpoint = `webhooks/${process.env.APP_ID}/${token}/messages/@original`
        await DiscordRequest(followupEndpoint, {
          method: "PATCH",
          body: {
            content: `Your Wordle stats:\n- Games Played: ${
              wordleStats._count.score
            }\n- Average Score: ${wordleStats._avg.score?.toFixed(2)}\n- Best Score: ${
              wordleStats._min.score
            }\n- Worst Score: ${wordleStats._max.score}`,
          },
        })
        return
      }
    }

    console.error(`unknown command: ${name}`)
    return res.status(400).json({ error: "unknown command" })
  }

  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id

    if (componentId.startsWith("accept_button_")) {
      // get the associated game ID
      const gameId = componentId.replace("accept_button_", "")
      // Delete message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`
      try {
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: "What is your object of choice?",
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                  },
                ],
              },
            ],
          },
        })
        // Delete previous message
        await DiscordRequest(endpoint, { method: "DELETE" })
      } catch (err) {
        console.error("Error sending message:", err)
      }
    } else if (componentId.startsWith("select_choice_")) {
      // get the associated game ID
      const gameId = componentId.replace("select_choice_", "")

      if (activeGames[gameId]) {
        // Interaction context
        const context = req.body.context
        // Get user ID and object choice for responding user
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id
        const objectName = data.values[0]
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
          id: userId,
          objectName,
        })

        // Remove game from storage
        delete activeGames[gameId]
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`

        try {
          // Send results
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: resultStr,
                },
              ],
            },
          })
          // Update ephemeral message
          await DiscordRequest(endpoint, {
            method: "PATCH",
            body: {
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: "Nice choice " + getRandomEmoji(),
                },
              ],
            },
          })
        } catch (err) {
          console.error("Error sending message:", err)
        }
      }
    }

    return
  }

  console.error("unknown interaction type", type)
  return res.status(400).json({ error: "unknown interaction type" })
})

app.listen(PORT, () => {
  console.log("Listening on port", PORT)
})
