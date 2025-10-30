import { InteractionResponseType } from "discord-interactions"
import { findUserByMentionOrName } from "../database.js"
import { prisma } from "../prisma-client.js"
import { DiscordRequest } from "../utils.js"
import { fetchMessagesUntil } from "../wordle.js"

export async function handleScrapeScoresCommand(req, res) {
  const { token } = req.body

  // Acknowledge the command and defer the response.
  res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  })

  // User's object choice
  const scanUntil = req.body.data.options[0].value

  if (scanUntil) {
    console.info("Scrape until option selected:", scanUntil)
  }
  let untilTimestamp = new Date().getTime()

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
