import { InteractionResponseType } from "discord-interactions"
import { findUserByMentionOrName } from "../database.js"
import { prisma } from "../prisma-client.js"
import { DiscordRequest } from "../utils.js"

export async function handleWordleStatsCommand(req, res) {
  const { token } = req.body

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
