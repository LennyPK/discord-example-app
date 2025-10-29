import { prisma } from "./prisma-client.js"

export async function saveMembers(members) {
  for (const member of members) {
    const { user, nick } = member

    // Defensive check
    if (!user) continue

    console.log("Found:", member)

    await prisma.user.upsert({
      where: { discordId: user.id },
      update: { username: user.username, displayName: nick || user.global_name || user.username },
      create: {
        discordId: user.id,
        username: user.username,
        displayName: user.global_name || user.username,
        nickname: nick || null,
        // Add seperate field for nickname
      },
    })
  }

  return members.length
}
