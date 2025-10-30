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
import { handleScanUsersCommand } from "./commands/scan-users.js"
import { handleTestCommand } from "./commands/test.js"
import { handleWordleInitCommand } from "./commands/wordle-init.js"
import { handleWordleLeaderboardCommand } from "./commands/wordle-leaderboard.js"
import { handleScrapeScoresCommand } from "./commands/wordle-scrape.js"
import { handleWordleStatsCommand } from "./commands/wordle-stats.js"
import { getResult, getShuffledOptions } from "./game.js"
import { DiscordRequest, getRandomEmoji } from "./utils.js"

// Create an express app
const app = express()
// Get port, or default to 3000
const PORT = process.env.PORT || 3000
// To keep track of our active games
const activeGames = {}

// Create a map of command names to their handler functions
const commandHandlers = new Map([
  ["test", handleTestCommand],
  ["init", handleWordleInitCommand],
  ["wordle_leaderboard", handleWordleLeaderboardCommand],
  ["my_stats", handleWordleStatsCommand],
  ["scan_users", handleScanUsersCommand],
  ["scrape_scores", handleScrapeScoresCommand],
  // ... add other commands here
])

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
    const handler = commandHandlers.get(name)
    // console.info(`Received command: ${handler}`)

    if (handler) {
      await handler(req, res)
      return
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
